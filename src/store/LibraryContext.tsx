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
import { getMissingVolumes, parseSeriesTitle } from '../lib/series';
import { supabase } from '../lib/supabase';
import { Book, BookInput, MissingBook, ReadingStatus, ShelfItem } from '../types';
import { useAuth } from './AuthContext';

type SupabaseClient = NonNullable<typeof supabase>;

const STORAGE_KEY = 'booknest.library.v1';
const DEMO_USER_ID = 'local-user';

type BookRow = {
  id: string;
  user_id: string;
  isbn: string | null;
  title: string;
  series_title: string;
  volume_number: number | null;
  author: string | null;
  thumbnail_url: string | null;
  status: ReadingStatus;
  created_at: string;
};

type SupabaseLikeError = {
  message?: string;
  details?: string;
  hint?: string;
  code?: string;
};

type SeriesGroup = {
  id: string;
  title: string;
  representative: Book;
  ownedCount: number;
  unreadCount: number;
  readCount: number;
  latestVolume?: number;
};

type MetadataRepairResult = {
  title: string;
  lookupTitle: string;
  beforeThumbnailUrl?: string;
  afterThumbnailUrl?: string;
  seriesTitle?: string;
  volumeNumber?: number;
  author?: string;
  debugEntries?: BookLookupDebugEntry[];
};

type LibraryContextValue = {
  books: Book[];
  loading: boolean;
  error: string | null;
  requiresAuth: boolean;
  seriesGroups: SeriesGroup[];
  addBook: (book: BookInput) => Promise<Book>;
  addBookByIsbn: (isbn: string) => Promise<Book | null>;
  updateBook: (bookId: string, updates: Partial<BookInput>) => Promise<void>;
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
    author: row.author ?? undefined,
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
    thumbnail_url: bookInput.thumbnailUrl?.replace(/^http:\/\//i, 'https://') ?? null,
    status: bookInput.status,
  };
}

function normalizeBookInput(bookInput: BookInput): BookInput {
  const parsed = parseSeriesTitle(bookInput.title);

  return {
    ...bookInput,
    seriesTitle: bookInput.seriesTitle || parsed.seriesTitle,
    volumeNumber: bookInput.volumeNumber ?? parsed.volumeNumber,
    thumbnailUrl: bookInput.thumbnailUrl?.replace(/^http:\/\//i, 'https://'),
  };
}

function toBookUpdate(updates: Partial<BookInput>) {
  return {
    ...(updates.isbn !== undefined ? { isbn: updates.isbn || null } : {}),
    ...(updates.title !== undefined ? { title: updates.title } : {}),
    ...(updates.seriesTitle !== undefined ? { series_title: updates.seriesTitle } : {}),
    ...(updates.volumeNumber !== undefined ? { volume_number: updates.volumeNumber ?? null } : {}),
    ...(updates.author !== undefined ? { author: updates.author || null } : {}),
    ...(updates.thumbnailUrl !== undefined ? { thumbnail_url: updates.thumbnailUrl || null } : {}),
    ...(updates.status !== undefined ? { status: updates.status } : {}),
  };
}

function formatSupabaseError(error: unknown, fallback: string) {
  const supabaseError = error as SupabaseLikeError;
  const parts = [
    supabaseError.message,
    supabaseError.details,
    supabaseError.hint,
    supabaseError.code ? `code: ${supabaseError.code}` : undefined,
  ].filter(Boolean);

  return parts.length > 0 ? parts.join(' / ') : fallback;
}

function createId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function createUuid() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (character) => {
    const random = Math.floor(Math.random() * 16);
    const value = character === 'x' ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function normalizeIsbn(value?: string) {
  return value?.replace(/[^0-9X]/gi, '').toUpperCase();
}

function isKnownUnavailableCoverUrl(url?: string) {
  return !!url && /imagenotavailable|no[_-]?image|noimage/i.test(url);
}

function buildMetadataLookupTitle(book: Pick<Book, 'title' | 'seriesTitle' | 'volumeNumber'>) {
  return book.volumeNumber ? `${book.seriesTitle} ${book.volumeNumber}巻` : book.title;
}

function isDuplicateIsbn(currentBooks: Book[], bookInput: BookInput) {
  const incomingIsbn = normalizeIsbn(bookInput.isbn);
  if (!incomingIsbn) return false;
  return currentBooks.some((book) => normalizeIsbn(book.isbn) === incomingIsbn);
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
  const [loading, setLoading] = useState(configured);
  const [error, setError] = useState<string | null>(null);
  const enrichedIsbnsRef = useRef(new Set<string>());
  const requiresAuth = configured && !user;

  useEffect(() => {
    if (configured) {
      setHydrated(true);
      return;
    }

    AsyncStorage.getItem(STORAGE_KEY)
      .then((storedBooks) => {
        if (storedBooks) setBooks(JSON.parse(storedBooks) as Book[]);
      })
      .finally(() => setHydrated(true));
  }, [configured]);

  useEffect(() => {
    if (configured || !hydrated) return;
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(books));
  }, [books, configured, hydrated]);

  useEffect(() => {
    if (!configured || initializing) return;
    const client = supabase;
    if (!client || !user) {
      setBooks([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    async function loadBooks(client: SupabaseClient) {
      try {
        const { data, error: fetchError } = await client
          .from('books')
          .select(
            'id,user_id,isbn,title,series_title,volume_number,author,thumbnail_url,status,created_at',
          )
          .order('created_at', { ascending: false });

        if (fetchError) {
          throw new Error(formatSupabaseError(fetchError, 'Failed to load books.'));
        }
        setBooks(((data ?? []) as BookRow[]).map(fromBookRow));
      } catch (fetchError) {
        setError(fetchError instanceof Error ? fetchError.message : 'Failed to load books.');
      } finally {
        setLoading(false);
      }
    }

    loadBooks(client);
  }, [configured, initializing, user]);

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
            book.seriesTitle.trim() === book.title.trim()
          ) &&
          !enrichedIsbnsRef.current.has(book.isbn),
      )
      .slice(0, 5);

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

  const addBook = useCallback(async (bookInput: BookInput) => {
    const normalizedBookInput = normalizeBookInput(bookInput);
    if (isDuplicateIsbn(books, normalizedBookInput)) {
      throw new Error('この本はすでに登録されています。');
    }

    if (configured) {
      if (!supabase || !user) throw new Error('ログインすると蔵書を登録できます。');
      const bookId = createUuid();

      const { error: insertError } = await supabase
        .from('books')
        .insert(toBookInsert(normalizedBookInput, user.id, bookId));

      if (insertError) {
        if (insertError.code === '23505') {
          throw new Error('この本はすでに登録されています。');
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

  const updateBook = useCallback(async (bookId: string, updates: Partial<BookInput>) => {
    const book = books.find((candidate) => candidate.id === bookId);

    if (configured) {
      if (!supabase || !user) throw new Error('ログインすると蔵書を編集できます。');
      const query = supabase.from('books').update(toBookUpdate(updates)).eq('user_id', user.id);
      const { error: updateError } =
        isUuid(bookId) || !book?.isbn ? await query.eq('id', bookId) : await query.eq('isbn', book.isbn);

      if (updateError) {
        throw new Error(formatSupabaseError(updateError, 'Supabaseの更新に失敗しました。'));
      }
    }

    setBooks((currentBooks) =>
      currentBooks.map((book) => (book.id === bookId ? { ...book, ...updates } : book)),
    );
  }, [books, configured, user]);

  const deleteBook = useCallback(async (bookId: string) => {
    const book = books.find((candidate) => candidate.id === bookId);

    if (configured) {
      if (!supabase || !user) throw new Error('ログインすると蔵書を削除できます。');
      const query = supabase.from('books').delete().eq('user_id', user.id);
      const { error: deleteError } =
        isUuid(bookId) || !book?.isbn ? await query.eq('id', bookId) : await query.eq('isbn', book.isbn);

      if (deleteError) {
        throw new Error(formatSupabaseError(deleteError, 'Supabaseの削除に失敗しました。'));
      }
    }

    setBooks((currentBooks) => currentBooks.filter((book) => book.id !== bookId));
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
      thumbnailUrl: metadata.thumbnailUrl ?? '',
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
      debugEntries,
    };
  }, [books, updateBook]);

  const bulkUpdateStatus = useCallback(async (bookIds: string[], status: ReadingStatus) => {
    if (configured) {
      if (!supabase || !user) throw new Error('ログインするとステータスを更新できます。');
      const { error: updateError } = await supabase
        .from('books')
        .update({ status })
        .in('id', bookIds)
        .eq('user_id', user.id);

      if (updateError) {
        throw new Error(formatSupabaseError(updateError, 'Supabaseの一括更新に失敗しました。'));
      }
    }

    const selected = new Set(bookIds);
    setBooks((currentBooks) =>
      currentBooks.map((book) => (selected.has(book.id) ? { ...book, status } : book)),
    );
  }, [configured, user]);

  const seriesGroups = useMemo(() => {
    const bySeries = new Map<string, Book[]>();
    books.forEach((book) => {
      const group = bySeries.get(book.seriesTitle) ?? [];
      group.push(book);
      bySeries.set(book.seriesTitle, group);
    });

    return [...bySeries.entries()]
      .map(([title, groupedBooks]) => {
        const sortedBooks = [...groupedBooks].sort(
          (a, b) => (b.volumeNumber ?? 0) - (a.volumeNumber ?? 0),
        );
        const representative =
          sortedBooks.find((book) => !!book.thumbnailUrl) ?? sortedBooks[0];
        const latestVolume = sortedBooks[0]?.volumeNumber;

        return {
          id: encodeURIComponent(title),
          title,
          representative,
          ownedCount: groupedBooks.length,
          unreadCount: groupedBooks.filter((book) => book.status === 'unread').length,
          readCount: groupedBooks.filter((book) => book.status === 'read').length,
          latestVolume,
        };
      })
      .sort((a, b) => a.title.localeCompare(b.title));
  }, [books]);

  const getSeriesItems = useCallback(
    (seriesTitle: string) => {
      const owned = books
        .filter((book) => book.seriesTitle === seriesTitle)
        .sort((a, b) => (a.volumeNumber ?? 0) - (b.volumeNumber ?? 0));
      const missingVolumes = getMissingVolumes(
        owned.map((book) => book.volumeNumber).filter((volume): volume is number => !!volume),
      );
      const missing: MissingBook[] = missingVolumes.map((volumeNumber) => ({
        id: `missing-${seriesTitle}-${volumeNumber}`,
        userId: DEMO_USER_ID,
        title: `${seriesTitle} ${volumeNumber}`,
        seriesTitle,
        volumeNumber,
        status: 'missing',
        createdAt: now(),
        isMissing: true,
      }));

      return [...owned, ...missing].sort(
        (a, b) => (a.volumeNumber ?? 0) - (b.volumeNumber ?? 0),
      );
    },
    [books],
  );

  const value = useMemo(
    () => ({
      books,
      loading,
      error,
      requiresAuth,
      seriesGroups,
      addBook,
      addBookByIsbn,
      updateBook,
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
      getSeriesItems,
      loading,
      repairBookMetadata,
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
