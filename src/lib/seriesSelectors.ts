import { Book, MissingBook, ShelfItem } from '../types';
import { getMissingVolumes } from './series';

export type SeriesGroup = {
  id: string;
  title: string;
  representative: Book;
  ownedCount: number;
  unreadCount: number;
  readingCount: number;
  readCount: number;
  latestVolume?: number;
  latestAddedAt: string;
};

export function buildSeriesGroups(books: Book[]): SeriesGroup[] {
  const bySeries = new Map<string, Book[]>();
  books.forEach((book) => {
    const group = bySeries.get(book.seriesTitle) ?? [];
    group.push(book);
    bySeries.set(book.seriesTitle, group);
  });

  return [...bySeries.entries()]
    .map(([title, groupedBooks]) => {
      const sortedBooks = [...groupedBooks].sort(
        (left, right) => (right.volumeNumber ?? 0) - (left.volumeNumber ?? 0),
      );
      const representative = sortedBooks.find((book) => !!book.thumbnailUrl) ?? sortedBooks[0];

      return {
        id: encodeURIComponent(title),
        title,
        representative,
        ownedCount: groupedBooks.length,
        unreadCount: groupedBooks.filter((book) => book.status === 'unread').length,
        readingCount: groupedBooks.filter((book) => book.status === 'reading').length,
        readCount: groupedBooks.filter((book) => book.status === 'read').length,
        latestVolume: sortedBooks[0]?.volumeNumber,
        latestAddedAt: groupedBooks.reduce(
          (latest, book) => (book.createdAt > latest ? book.createdAt : latest),
          groupedBooks[0]?.createdAt ?? '',
        ),
      };
    })
    .sort((left, right) => left.title.localeCompare(right.title));
}

export function buildSeriesItems(
  books: Book[],
  seriesTitle: string,
  missingUserId: string,
): ShelfItem[] {
  const owned = books
    .filter((book) => book.seriesTitle === seriesTitle)
    .sort((left, right) => (left.volumeNumber ?? 0) - (right.volumeNumber ?? 0));
  const missingVolumes = getMissingVolumes(
    owned.map((book) => book.volumeNumber).filter((volume): volume is number => !!volume),
  );
  const createdAt = new Date().toISOString();
  const missing: MissingBook[] = missingVolumes.map((volumeNumber) => ({
    id: `missing-${seriesTitle}-${volumeNumber}`,
    userId: missingUserId,
    title: `${seriesTitle} ${volumeNumber}`,
    seriesTitle,
    volumeNumber,
    status: 'missing',
    createdAt,
    isMissing: true,
  }));

  return [...owned, ...missing].sort(
    (left, right) => (left.volumeNumber ?? 0) - (right.volumeNumber ?? 0),
  );
}
