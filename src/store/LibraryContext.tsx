import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  createContext,
  PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';

import { lookupBookByIsbn } from '../lib/bookApis';
import { getMissingVolumes } from '../lib/series';
import { Book, BookInput, MissingBook, ReadingStatus, ShelfItem } from '../types';

const STORAGE_KEY = 'booknest.library.v1';
const DEMO_USER_ID = 'local-user';

type SeriesGroup = {
  id: string;
  title: string;
  representative: Book;
  ownedCount: number;
  unreadCount: number;
  readCount: number;
  latestVolume?: number;
};

type LibraryContextValue = {
  books: Book[];
  seriesGroups: SeriesGroup[];
  addBook: (book: BookInput) => Promise<Book>;
  addBookByIsbn: (isbn: string) => Promise<Book | null>;
  updateBook: (bookId: string, updates: Partial<BookInput>) => Promise<void>;
  bulkUpdateStatus: (bookIds: string[], status: ReadingStatus) => Promise<void>;
  getSeriesItems: (seriesTitle: string) => ShelfItem[];
};

const LibraryContext = createContext<LibraryContextValue | null>(null);

const now = () => new Date().toISOString();

function createId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
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
  const [books, setBooks] = useState<Book[]>(initialBooks);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((storedBooks) => {
        if (storedBooks) setBooks(JSON.parse(storedBooks) as Book[]);
      })
      .finally(() => setHydrated(true));
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(books));
  }, [books, hydrated]);

  const addBook = useCallback(async (bookInput: BookInput) => {
    const book: Book = {
      ...bookInput,
      id: createId('book'),
      userId: DEMO_USER_ID,
      createdAt: now(),
    };

    setBooks((currentBooks) => [book, ...currentBooks]);
    return book;
  }, []);

  const addBookByIsbn = useCallback(
    async (isbn: string) => {
      const bookInput = await lookupBookByIsbn(isbn);
      if (!bookInput) return null;
      return addBook(bookInput);
    },
    [addBook],
  );

  const updateBook = useCallback(async (bookId: string, updates: Partial<BookInput>) => {
    setBooks((currentBooks) =>
      currentBooks.map((book) => (book.id === bookId ? { ...book, ...updates } : book)),
    );
  }, []);

  const bulkUpdateStatus = useCallback(async (bookIds: string[], status: ReadingStatus) => {
    const selected = new Set(bookIds);
    setBooks((currentBooks) =>
      currentBooks.map((book) => (selected.has(book.id) ? { ...book, status } : book)),
    );
  }, []);

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
        const latestVolume = sortedBooks[0]?.volumeNumber;

        return {
          id: encodeURIComponent(title),
          title,
          representative: sortedBooks[0],
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
      seriesGroups,
      addBook,
      addBookByIsbn,
      updateBook,
      bulkUpdateStatus,
      getSeriesItems,
    }),
    [addBook, addBookByIsbn, books, bulkUpdateStatus, getSeriesItems, seriesGroups, updateBook],
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
