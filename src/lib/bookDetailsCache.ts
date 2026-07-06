import AsyncStorage from '@react-native-async-storage/async-storage';

import { Book } from '../types';
import { BookVolumeDetails, lookupBookVolumeDetails } from './bookApis';

const CACHE_PREFIX = 'booknest.book-details.v3';
const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;

type CacheEntry = {
  fetchedAt: number;
  details: BookVolumeDetails | null;
};

function cacheKey(book: Pick<Book, 'id' | 'isbn'>) {
  const identity = book.isbn?.replace(/[^0-9X]/gi, '').toUpperCase() || book.id;
  return `${CACHE_PREFIX}:${identity}`;
}

export async function getBookVolumeDetails(
  book: Book,
  options: { forceRefresh?: boolean } = {},
) {
  const key = cacheKey(book);

  if (!options.forceRefresh) {
    try {
      const cached = await AsyncStorage.getItem(key);
      if (cached) {
        const entry = JSON.parse(cached) as CacheEntry;
        if (Date.now() - entry.fetchedAt < CACHE_TTL_MS) return entry.details;
      }
    } catch (error) {
      console.warn('Failed to read book details cache', error);
    }
  }

  const details = await lookupBookVolumeDetails(book);
  const entry: CacheEntry = { fetchedAt: Date.now(), details };
  try {
    await AsyncStorage.setItem(key, JSON.stringify(entry));
  } catch (error) {
    console.warn('Failed to save book details cache', error);
  }
  return details;
}
