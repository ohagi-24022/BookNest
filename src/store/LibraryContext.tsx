import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  createContext,
  PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import { BookLookupDebugEntry, lookupBookByIsbn, lookupBookByTitle, lookupBookDebugInfo } from '../lib/bookApis';
import { normalizeAuthor } from '../lib/bookMetadata';
import {
  findDuplicateBook as findDuplicate,
  normalizeBookInput,
} from '../lib/duplicate';
import { parseSeriesTitle } from '../lib/series';
import {
  buildSeriesGroups,
  buildSeriesItems,
  SeriesGroup,
} from '../lib/seriesSelectors';
import { supabase } from '../lib/supabase';
import { Book, BookInput, ReadingStatus, ShelfItem } from '../types';
import { useAuth } from './AuthContext';

type SupabaseClient = NonNullable<typeof supabase>;

const STORAGE_KEY = 'booknest.library.v1';
const DEMO_USER_ID = 'local-user';
const BOOKS_FETCH_PAGE_SIZE = 1000;

type BookRow = {
  id: string;
  user_id: string;
  isbn: string | null;
  title: string;
  series_title: string;
  volume_number: number | null;
  author: string | null;
  publisher: string | null;
  thumbnail_url: string | null;
  status: ReadingStatus;
  created_at: string;
};

const BOOK_SELECT_COLUMNS =
  'id,user_id,isbn,title,series_title,volume_number,author,publisher,thumbnail_url,status,created_at';

type SupabaseLikeError = {
  message?: string;
  details?: string;
  hint?: string;
  code?: string;
};

type AddBookOptions = {
  allowDuplicate?: boolean;
};

type MetadataRepairResult = {
  title: string;
  lookupTitle: string;
  beforeThumbnailUrl?: string;
  afterThumbnailUrl?: string;
  seriesTitle?: string;
  volumeNumber?: number;
  author?: string;
  publisher?: string;
  debugEntries?: BookLookupDebugEntry[];
};

type LibraryContextValue = {
  books: Book[];
  loading: boolean;
  error: string | null;
  requiresAuth: boolean;
  localImportCount: number;
  seriesGroups: SeriesGroup[];
  addBook: (book: BookInput, options?: AddBookOptions) => Promise<Book>;
  addBookByIsbn: (isbn: string) => Promise<Book | null>;
  findDuplicateBook: (book: BookInput) => Book | undefined;
  migrateLocalBooks: () => Promise<number>;
  updateBook: (bookId: string, updates: Partial<BookInput>) => Promise<void>;
  renameSeries: (fromSeriesTitle: string, toSeriesTitle: string) => Promise<number>;
  deleteBook: (bookId: string) => Promise<void>;
  repairBookMetadata: (bookId: string) => Promise<MetadataRepairResult>;
  bulkUpdateStatus: (bookIds: string[], status: ReadingStatus) => Promise<void>;
  getSeriesItems: (seriesTitle: string) => ShelfItem[];
};

const LibraryContext = createContext<LibraryContextValue | null>(null);

const now = () => new Date().toISOString();

async function safeLookupBookByIsbn(isbn: string) {
  try {
    return await lookupBookByIsbn(isbn);
  } catch (error) {
    console.warn('ISBN metadata lookup failed', error);
    return null;
  }
}

function fromBookRow(row: BookRow): Book {
  const parsedTitle = parseSeriesTitle(row.title);
  const parsedSeries = parseSeriesTitle(row.series_title || row.title);
  const shouldRepairSeriesTitle =
    !row.series_title ||
    row.series_title.trim() === row.title.trim() ||
    !!parsedSeries.volumeNumber;

  return {
    id: row.id,
    userId: row.user_id,
    isbn: row.isbn ?? undefined,
    title: row.title,
    seriesTitle: shouldRepairSeriesTitle ? parsedSeries.seriesTitle || parsedTitle.seriesTitle : row.series_title,
    volumeNumber: row.volume_number ?? parsedTitle.volumeNumber ?? parsedSeries.volumeNumber,
    author: normalizeAuthor(row.author ?? undefined),
    publisher: row.publisher ?? undefined,
    thumbnailUrl: row.thumbnail_url?.replace(/^http:\/\//i, 'https://') ?? undefined,
    status: row.status,
    createdAt: row.created_at,
  };
}

function toBookInsert(bookInput: BookInput, userId: string, bookId: string) {
  const parsed = parseSeriesTitle(bookInput.title);
  const seriesTitle = bookInput.seriesTitle || parsed.seriesTitle;
  const volumeNumber = bookInput.volumeNumber ?? parsed.volumeNumber ?? null;

  return {
    id: bookId,
    user_id: userId,
    isbn: bookInput.isbn ?? null,
    title: bookInput.title,
    series_title: seriesTitle,
    volume_number: volumeNumber,
    author: bookInput.author ?? null,
    publisher: bookInput.publisher ?? null,
    thumbnail_url: bookInput.thumbnailUrl?.replace(/^http:\/\//i, 'https://') ?? null,
    status: bookInput.status,
  };
}

function toBookUpdate(updates: Partial<BookInput>) {
  return {
    ...(updates.isbn !== undefined ? { isbn: updates.isbn || null } : {}),
    ...(updates.title !== undefined ? { title: updates.title } : {}),
    ...(updates.seriesTitle !== undefined ? { series_title: updates.seriesTitle } : {}),
    ...(updates.volumeNumber !== undefined ? { volume_number: updates.volumeNumber ?? null } : {}),
    ...(updates.author !== undefined ? { author: updates.author || null } : {}),
    ...(updates.publisher !== undefined ? { publisher: updates.publisher || null } : {}),
    ...(updates.thumbnailUrl !== undefined ? { thumbnail_url: updates.thumbnailUrl || null } : {}),
    ...(updates.status !== undefined ? { status: updates.status } : {}),
  };
}

function formatSupabaseError(error: unknown, fallback: string) {
  const supabaseError = error as SupabaseLikeError;
  if (supabaseError.code === '42501') {
    return '蔵書データへのアクセス権限がありません。Supabaseの権限設定を確認してください。';
  }
  if (supabaseError.code === '23505') {
    return '同じISBNの本がすでに登録されています。';
  }
  if (/fetch|network|timeout/i.test(supabaseError.message ?? '')) {
    return '通信できませんでした。接続を確認して、もう一度お試しください。';
  }
  return fallback;
}

function createId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function createUuid() {
  const randomUuid = globalThis.crypto?.randomUUID?.();
  if (randomUuid) return randomUuid;

  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (character) => {
    const random = Math.floor(Math.random() * 16);
    const value = character === 'x' ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function isKnownUnavailableCoverUrl(url?: string) {
  return !!url && /imagenotavailable|no[_-]?image|noimage/i.test(url);
}

function buildMetadataLookupTitle(book: Pick<Book, 'title' | 'seriesTitle' | 'volumeNumber'>) {
  return book.volumeNumber ? `${book.seriesTitle} ${book.volumeNumber}巻` : book.title;
}

const initialBooks: Book[] = [
  {
    id: 'demo-1',
    userId: DEMO_USER_ID,
    isbn: '9784088820118',
    title: 'SPY x FAMILY 1',
    seriesTitle: 'SPY x FAMILY',
    volumeNumber: 1,
    author: 'Tatsuya Endo',
    thumbnailUrl: 'https://books.google.com/books/content?id=KqTNDwAAQBAJ&printsec=frontcover&img=1&zoom=1',
    status: 'read',
    createdAt: now(),
  },
  {
    id: 'demo-2',
    userId: DEMO_USER_ID,
    isbn: '9784088821207',
    title: 'SPY x FAMILY 2',
    seriesTitle: 'SPY x FAMILY',
    volumeNumber: 2,
    author: 'Tatsuya Endo',
    thumbnailUrl: 'https://books.google.com/books/content?id=0rLNDwAAQBAJ&printsec=frontcover&img=1&zoom=1',
    status: 'read',
    createdAt: now(),
  },
  {
    id: 'demo-3',
    userId: DEMO_USER_ID,
    isbn: '9784088825458',
    title: 'SPY x FAMILY 4',
    seriesTitle: 'SPY x FAMILY',
    volumeNumber: 4,
    author: 'Tatsuya Endo',
    thumbnailUrl: 'https://books.google.com/books/content?id=q5QLEAAAQBAJ&printsec=frontcover&img=1&zoom=1',
    status: 'unread',
    createdAt: now(),
  },
  {
    id: 'demo-4',
    userId: DEMO_USER_ID,
    isbn: '9784065214827',
    title: 'Blue Period 8',
    seriesTitle: 'Blue Period',
    volumeNumber: 8,
    author: 'Tsubasa Yamaguchi',
    thumbnailUrl: 'https://books.google.com/books/content?id=zMYPEAAAQBAJ&printsec=frontcover&img=1&zoom=1',
    status: 'reading',
    createdAt: now(),
  },
];

export function LibraryProvider({ children }: PropsWithChildren) {
  const { configured, initializing, user } = useAuth();
  const [books, setBooks] = useState<Book[]>(configured ? [] : initialBooks);
  const [hydrated, setHydrated] = useState(false);
  const [pendingLocalBooks, setPendingLocalBooks] = useState<Book[]>([]);
  const [loading, setLoading] = useState(configured);
  const [error, setError] = useState<string | null>(null);
  const enrichedIsbnsRef = useRef(new Set<string>());
  const requiresAuth = false;

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((storedBooks) => {
        if (!storedBooks) return;
        const parsedBooks = JSON.parse(storedBooks) as Book[];
        if (configured) {
          const localBooks = parsedBooks.filter((book) => !book.id.startsWith('demo-'));
          setPendingLocalBooks(localBooks);
          if (!user) setBooks(localBooks);
        } else {
          setBooks(parsedBooks);
        }
      })
      .finally(() => setHydrated(true));
  }, [configured, user]);

  useEffect(() => {
    if ((configured && user) || !hydrated) return;
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(books));
  }, [books, configured, hydrated, user]);

  useEffect(() => {
    if (!configured || initializing) return;
    const client = supabase;
    if (!client || !user) {
      setBooks(pendingLocalBooks);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    const userId = user.id;

    async function loadBooks(client: SupabaseClient) {
      try {
        const rows: BookRow[] = [];
        let page = 0;

        while (true) {
          const from = page * BOOKS_FETCH_PAGE_SIZE;
          const to = from + BOOKS_FETCH_PAGE_SIZE - 1;
          const { data, error: fetchError } = await client
            .from('books')
            .select(BOOK_SELECT_COLUMNS)
            .order('created_at', { ascending: false })
            .range(from, to);

          if (fetchError) {
            throw new Error(formatSupabaseError(fetchError, 'Failed to load books.'));
          }

          const pageRows = (data ?? []) as BookRow[];
          rows.push(...pageRows);
          if (pageRows.length < BOOKS_FETCH_PAGE_SIZE) break;
          page += 1;
        }

        const cloudBooks = rows.map(fromBookRow);
        const comparisonBooks = [...cloudBooks];
        const booksToImport: Book[] = [];

        for (const localBook of pendingLocalBooks) {
          const input = normalizeBookInput({
            isbn: localBook.isbn,
            title: localBook.title,
            seriesTitle: localBook.seriesTitle,
            volumeNumber: localBook.volumeNumber,
            author: localBook.author,
            publisher: localBook.publisher,
            thumbnailUrl: localBook.thumbnailUrl,
            status: localBook.status,
          });
          if (findDuplicate(comparisonBooks, input)) continue;

          const importedBook: Book = {
            ...input,
            id: createUuid(),
            userId,
            createdAt: localBook.createdAt || now(),
          };
          booksToImport.push(importedBook);
          comparisonBooks.push(importedBook);
        }

        if (booksToImport.length > 0) {
          const { error: insertError } = await client
            .from('books')
            .insert(booksToImport.map((book) => toBookInsert(book, userId, book.id)));
          if (insertError) {
            throw new Error(formatSupabaseError(insertError, 'ローカル蔵書を自動移行できませんでした。'));
          }
        }

        if (pendingLocalBooks.length > 0) {
          await AsyncStorage.removeItem(STORAGE_KEY);
          setPendingLocalBooks([]);
        }
        setBooks([...booksToImport, ...cloudBooks]);
      } catch (fetchError) {
        setError(fetchError instanceof Error ? fetchError.message : 'Failed to load books.');
      } finally {
        setLoading(false);
      }
    }

    loadBooks(client);
  }, [configured, initializing, pendingLocalBooks, user]);

  useEffect(() => {
    if (!configured || !user || !supabase) return;
    const client = supabase;
    const userId = user.id;

    const booksNeedingMetadata = books
      .filter(
        (book) =>
          book.isbn &&
          (
            !book.thumbnailUrl ||
            isKnownUnavailableCoverUrl(book.thumbnailUrl) ||
            !book.volumeNumber ||
            !book.publisher ||
            book.seriesTitle.trim() === book.title.trim()
          ) &&
          !enrichedIsbnsRef.current.has(book.isbn),
      )
      .slice(0, 10);

    if (booksNeedingMetadata.length === 0) return;

    booksNeedingMetadata.forEach((book) => {
      if (book.isbn) enrichedIsbnsRef.current.add(book.isbn);
    });

    async function enrichBooks() {
      for (const book of booksNeedingMetadata) {
        if (!book.isbn) continue;

        try {
          const lookupTitle = buildMetadataLookupTitle(book);
          const metadata =
            (await safeLookupBookByIsbn(book.isbn)) ??
            (await lookupBookByTitle(lookupTitle, book.isbn)) ??
            (lookupTitle === book.title ? null : await lookupBookByTitle(book.title, book.isbn));
          if (!metadata) continue;

          const updates: Partial<BookInput> = {
            thumbnailUrl: metadata.thumbnailUrl ?? (isKnownUnavailableCoverUrl(book.thumbnailUrl) ? '' : book.thumbnailUrl),
            volumeNumber: book.volumeNumber ?? metadata.volumeNumber,
            author: metadata.author ?? book.author,
            publisher: metadata.publisher ?? book.publisher,
            seriesTitle:
              book.seriesTitle.trim() === book.title.trim() || parseSeriesTitle(book.seriesTitle).volumeNumber
                ? metadata.seriesTitle
                : book.seriesTitle,
          };

          const query = client
            .from('books')
            .update(toBookUpdate(updates))
            .eq('user_id', userId);
          const { error: updateError } =
            isUuid(book.id) || !book.isbn ? await query.eq('id', book.id) : await query.eq('isbn', book.isbn);

          if (updateError) {
            throw new Error(formatSupabaseError(updateError, 'Supabaseの更新に失敗しました。'));
          }

          setBooks((currentBooks) =>
            currentBooks.map((currentBook) =>
              currentBook.id === book.id ? { ...currentBook, ...updates } : currentBook,
            ),
          );
        } catch (metadataError) {
          console.warn('Failed to enrich book metadata', metadataError);
        }
      }
    }

    enrichBooks();
  }, [books, configured, user]);

  const findDuplicateBook = useCallback(
    (bookInput: BookInput) => findDuplicate(books, bookInput),
    [books],
  );

  const addBook = useCallback(async (bookInput: BookInput, options: AddBookOptions = {}) => {
    const normalizedBookInput = normalizeBookInput(bookInput);
    if (!options.allowDuplicate && findDuplicate(books, normalizedBookInput)) {
      throw new Error('同じISBN、または同じシリーズ・巻数の本がすでに登録されています。');
    }

    if (configured) {
      if (!supabase || !user) {
        const book: Book = {
          ...normalizedBookInput,
          id: createId('book'),
          userId: DEMO_USER_ID,
          createdAt: now(),
        };
        setBooks((currentBooks) => [book, ...currentBooks]);
        setPendingLocalBooks((currentBooks) => [book, ...currentBooks]);
        return book;
      }
      const bookId = createUuid();

      const { error: insertError } = await supabase
        .from('books')
        .insert(toBookInsert(normalizedBookInput, user.id, bookId));

      if (insertError) {
        if (insertError.code === '23505') {
          throw new Error('同じISBNの本がすでに登録されています。');
        }
        throw new Error(formatSupabaseError(insertError, 'Supabaseへの登録に失敗しました。'));
      }

      const book: Book = {
        ...normalizedBookInput,
        id: bookId,
        userId: user.id,
        createdAt: now(),
      };
      setBooks((currentBooks) => [book, ...currentBooks]);
      return book;
    }

    const book: Book = {
      ...normalizedBookInput,
      id: createId('book'),
      userId: DEMO_USER_ID,
      createdAt: now(),
    };

    setBooks((currentBooks) => [book, ...currentBooks]);
    return book;
  }, [books, configured, user]);

  const addBookByIsbn = useCallback(
    async (isbn: string) => {
      const bookInput = await lookupBookByIsbn(isbn);
      if (!bookInput) return null;
      return addBook(bookInput);
    },
    [addBook],
  );

  const migrateLocalBooks = useCallback(async () => {
    if (!supabase || !user) {
      throw new Error('ローカル蔵書を移行するにはログインしてください。');
    }

    const comparisonBooks = [...books];
    const booksToImport: Book[] = [];

    for (const localBook of pendingLocalBooks) {
      const input = normalizeBookInput({
        isbn: localBook.isbn,
        title: localBook.title,
        seriesTitle: localBook.seriesTitle,
        volumeNumber: localBook.volumeNumber,
        author: localBook.author,
        publisher: localBook.publisher,
        thumbnailUrl: localBook.thumbnailUrl,
        status: localBook.status,
      });
      if (findDuplicate(comparisonBooks, input)) continue;

      const importedBook: Book = {
        ...input,
        id: createUuid(),
        userId: user.id,
        createdAt: localBook.createdAt || now(),
      };
      booksToImport.push(importedBook);
      comparisonBooks.push(importedBook);
    }

    if (booksToImport.length > 0) {
      const { error: insertError } = await supabase
        .from('books')
        .insert(booksToImport.map((book) => toBookInsert(book, user.id, book.id)));
      if (insertError) {
        throw new Error(formatSupabaseError(insertError, 'ローカル蔵書を移行できませんでした。'));
      }
      setBooks((currentBooks) => [...booksToImport, ...currentBooks]);
    }

    await AsyncStorage.removeItem(STORAGE_KEY);
    setPendingLocalBooks([]);
    return booksToImport.length;
  }, [books, pendingLocalBooks, user]);

  const updateBook = useCallback(async (bookId: string, updates: Partial<BookInput>) => {
    const book = books.find((candidate) => candidate.id === bookId);
    const changesIdentity =
      updates.isbn !== undefined ||
      updates.seriesTitle !== undefined ||
      updates.volumeNumber !== undefined;

    if (book && changesIdentity) {
      const duplicate = findDuplicate(
        books.filter((candidate) => candidate.id !== bookId),
        normalizeBookInput({ ...book, ...updates }),
      );
      if (duplicate) {
        throw new Error(`${duplicate.title} と同じシリーズ・巻数、またはISBNになっています。`);
      }
    }

    if (configured) {
      if (supabase && user) {
        const query = supabase.from('books').update(toBookUpdate(updates)).eq('user_id', user.id);
        const { error: updateError } =
          isUuid(bookId) || !book?.isbn ? await query.eq('id', bookId) : await query.eq('isbn', book.isbn);

        if (updateError) {
          throw new Error(formatSupabaseError(updateError, 'Supabaseの更新に失敗しました。'));
        }
      }
    }

    setBooks((currentBooks) =>
      currentBooks.map((book) => (book.id === bookId ? { ...book, ...updates } : book)),
    );
    if (configured && !user) {
      setPendingLocalBooks((currentBooks) =>
        currentBooks.map((book) => (book.id === bookId ? { ...book, ...updates } : book)),
      );
    }
  }, [books, configured, user]);

  const deleteBook = useCallback(async (bookId: string) => {
    const book = books.find((candidate) => candidate.id === bookId);

    if (configured) {
      if (supabase && user) {
        const query = supabase.from('books').delete().eq('user_id', user.id);
        const { error: deleteError } =
          isUuid(bookId) || !book?.isbn ? await query.eq('id', bookId) : await query.eq('isbn', book.isbn);

        if (deleteError) {
          throw new Error(formatSupabaseError(deleteError, 'Supabaseの削除に失敗しました。'));
        }
      }
    }

    setBooks((currentBooks) => currentBooks.filter((book) => book.id !== bookId));
    if (configured && !user) {
      setPendingLocalBooks((currentBooks) => currentBooks.filter((book) => book.id !== bookId));
    }
  }, [books, configured, user]);

  const renameSeries = useCallback(async (fromSeriesTitle: string, toSeriesTitle: string) => {
    const nextSeriesTitle = toSeriesTitle.trim();
    if (!nextSeriesTitle) throw new Error('シリーズ名を入力してください。');
    if (fromSeriesTitle === nextSeriesTitle) return 0;

    const targetBooks = books.filter((book) => book.seriesTitle === fromSeriesTitle);
    if (targetBooks.length === 0) throw new Error('対象のシリーズが見つかりません。');

    if (configured && supabase && user) {
      const { error: updateError } = await supabase
        .from('books')
        .update({ series_title: nextSeriesTitle })
        .eq('user_id', user.id)
        .eq('series_title', fromSeriesTitle);

      if (updateError) {
        throw new Error(formatSupabaseError(updateError, 'シリーズ名の更新に失敗しました。'));
      }
    }

    setBooks((currentBooks) =>
      currentBooks.map((book) =>
        book.seriesTitle === fromSeriesTitle ? { ...book, seriesTitle: nextSeriesTitle } : book,
      ),
    );
    if (configured && !user) {
      setPendingLocalBooks((currentBooks) =>
        currentBooks.map((book) =>
          book.seriesTitle === fromSeriesTitle ? { ...book, seriesTitle: nextSeriesTitle } : book,
        ),
      );
    }
    return targetBooks.length;
  }, [books, configured, user]);

  const repairBookMetadata = useCallback(async (bookId: string) => {
    const book = books.find((candidate) => candidate.id === bookId);
    if (!book) throw new Error('対象の本が見つかりません。');

    const lookupTitle = buildMetadataLookupTitle(book);
    const metadata =
      (book.isbn ? await safeLookupBookByIsbn(book.isbn) : null) ??
      (await lookupBookByTitle(lookupTitle, book.isbn)) ??
      (lookupTitle === book.title ? null : await lookupBookByTitle(book.title, book.isbn));
    if (!metadata) throw new Error('書籍情報を再取得できませんでした。');

    const updates = {
      seriesTitle: metadata.seriesTitle,
      volumeNumber: metadata.volumeNumber,
      author: metadata.author ?? book.author,
      publisher: metadata.publisher ?? book.publisher,
      thumbnailUrl: metadata.thumbnailUrl ?? book.thumbnailUrl,
    };
    const debugEntries = metadata.thumbnailUrl
      ? []
      : await lookupBookDebugInfo({ isbn: book.isbn, title: lookupTitle });

    await updateBook(book.id, updates);

    return {
      title: metadata.title,
      lookupTitle,
      beforeThumbnailUrl: book.thumbnailUrl,
      afterThumbnailUrl: updates.thumbnailUrl,
      seriesTitle: updates.seriesTitle,
      volumeNumber: updates.volumeNumber,
      author: updates.author,
      publisher: updates.publisher,
      debugEntries,
    };
  }, [books, updateBook]);

  const bulkUpdateStatus = useCallback(async (bookIds: string[], status: ReadingStatus) => {
    if (configured) {
      if (supabase && user) {
        const { error: updateError } = await supabase
          .from('books')
          .update({ status })
          .in('id', bookIds)
          .eq('user_id', user.id);

        if (updateError) {
          throw new Error(formatSupabaseError(updateError, 'Supabaseの一括更新に失敗しました。'));
        }
      }
    }

    const selected = new Set(bookIds);
    setBooks((currentBooks) =>
      currentBooks.map((book) => (selected.has(book.id) ? { ...book, status } : book)),
    );
    if (configured && !user) {
      setPendingLocalBooks((currentBooks) =>
        currentBooks.map((book) => (selected.has(book.id) ? { ...book, status } : book)),
      );
    }
  }, [configured, user]);

  const seriesGroups = useMemo(() => buildSeriesGroups(books), [books]);

  const getSeriesItems = useCallback(
    (seriesTitle: string) => buildSeriesItems(books, seriesTitle, DEMO_USER_ID),
    [books],
  );

  const value = useMemo(
    () => ({
      books,
      loading,
      error,
      requiresAuth,
      localImportCount: pendingLocalBooks.length,
      seriesGroups,
      addBook,
      addBookByIsbn,
      findDuplicateBook,
      migrateLocalBooks,
      updateBook,
      renameSeries,
      deleteBook,
      repairBookMetadata,
      bulkUpdateStatus,
      getSeriesItems,
    }),
    [
      addBook,
      addBookByIsbn,
      books,
      bulkUpdateStatus,
      deleteBook,
      error,
      findDuplicateBook,
      getSeriesItems,
      loading,
      migrateLocalBooks,
      pendingLocalBooks.length,
      repairBookMetadata,
      renameSeries,
      requiresAuth,
      seriesGroups,
      updateBook,
    ],
  );

  return <LibraryContext.Provider value={value}>{children}</LibraryContext.Provider>;
}

export function useLibrary() {
  const context = useContext(LibraryContext);
  if (!context) {
    throw new Error('useLibrary must be used inside LibraryProvider');
  }

  return context;
}
