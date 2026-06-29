import { BookInput } from '../types';
import { parseSeriesTitle } from './series';

type GoogleBooksResponse = {
  items?: Array<{
    volumeInfo?: {
      title?: string;
      authors?: string[];
      imageLinks?: {
        thumbnail?: string;
        smallThumbnail?: string;
      };
      industryIdentifiers?: Array<{
        type?: string;
        identifier?: string;
      }>;
    };
  }>;
};

export async function lookupBookByIsbn(isbn: string): Promise<BookInput | null> {
  const normalizedIsbn = isbn.replace(/[^0-9X]/gi, '');
  const response = await fetch(
    `https://www.googleapis.com/books/v1/volumes?q=isbn:${encodeURIComponent(normalizedIsbn)}`,
  );

  if (!response.ok) {
    throw new Error('Google Books API request failed');
  }

  const payload = (await response.json()) as GoogleBooksResponse;
  const volume = payload.items?.[0]?.volumeInfo;
  if (!volume?.title) return null;

  const parsed = parseSeriesTitle(volume.title);
  const isbnFromApi =
    volume.industryIdentifiers?.find((item) => item.type === 'ISBN_13')?.identifier ??
    normalizedIsbn;

  return {
    isbn: isbnFromApi,
    title: volume.title,
    seriesTitle: parsed.seriesTitle,
    volumeNumber: parsed.volumeNumber,
    author: volume.authors?.join(', '),
    thumbnailUrl: volume.imageLinks?.thumbnail ?? volume.imageLinks?.smallThumbnail,
    status: 'unread',
  };
}

export function buildPurchaseUrl(seriesTitle: string, volumeNumber?: number) {
  const query = [seriesTitle, volumeNumber ? `${volumeNumber}巻` : undefined, '本'].filter(Boolean);
  return `https://books.rakuten.co.jp/search?sitem=${encodeURIComponent(query.join(' '))}`;
}
