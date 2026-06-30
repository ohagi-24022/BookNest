import { BookInput } from '../types';
import { env } from './env';
import { parseSeriesTitle } from './series';

type GoogleBooksResponse = {
  items?: Array<{
    id?: string;
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

type OpenBdResponse = Array<{
  summary?: {
    isbn?: string;
    title?: string;
    author?: string;
    cover?: string;
  };
  onix?: {
    DescriptiveDetail?: {
      Collection?: {
        TitleDetail?: {
          TitleElement?: {
            TitleText?: {
              content?: string;
            };
          };
        };
      };
    };
  };
} | null>;

type RakutenBooksResponse = {
  Items?: Array<{
    Item?: {
      title?: string;
      author?: string;
      isbn?: string;
      largeImageUrl?: string;
      mediumImageUrl?: string;
      smallImageUrl?: string;
    };
  }>;
};

function normalizeIsbn(isbn: string) {
  return isbn.replace(/[^0-9X]/gi, '').toUpperCase();
}

function isSameIsbn(left?: string, right?: string) {
  if (!left || !right) return false;
  return normalizeIsbn(left) === normalizeIsbn(right);
}

function normalizeImageUrl(url?: string) {
  if (!url) return undefined;
  return url.replace(/^http:\/\//i, 'https://');
}

function buildGoogleVolumeCoverUrl(volumeId?: string) {
  if (!volumeId) return undefined;
  return `https://books.google.com/books/content?id=${encodeURIComponent(volumeId)}&printsec=frontcover&img=1&zoom=1&source=gbs_api`;
}

function buildGoogleIsbnCoverUrl(isbn?: string) {
  if (!isbn) return undefined;
  return `https://books.google.com/books/content?vid=ISBN${encodeURIComponent(normalizeIsbn(isbn))}&printsec=frontcover&img=1&zoom=1&source=gbs_api`;
}

function firstCoverUrl(...urls: Array<string | undefined>) {
  return urls.map(normalizeImageUrl).find((url): url is string => !!url);
}

function normalizeComparableText(value?: string) {
  return value
    ?.toLowerCase()
    .replace(/[ \t\r\n　]/g, '')
    .replace(/[!！?？:：;；,，.．。'"“”‘’「」『』（）()[\]【】〈〉<>]/g, '');
}

function hasMatchingIndustryIdentifier(
  identifiers: Array<{ type?: string; identifier?: string }> | undefined,
  isbn: string,
) {
  return identifiers?.some((identifier) => isSameIsbn(identifier.identifier, isbn)) ?? false;
}

function mergeBookMetadata(primary: BookInput, fallback: BookInput | null): BookInput {
  if (!fallback) return primary;

  return {
    ...primary,
    seriesTitle: primary.seriesTitle || fallback.seriesTitle,
    volumeNumber: primary.volumeNumber ?? fallback.volumeNumber,
    author: primary.author ?? fallback.author,
    thumbnailUrl: primary.thumbnailUrl ?? fallback.thumbnailUrl,
  };
}

function mergeBookMetadataList(primary: BookInput, fallbacks: Array<BookInput | null>): BookInput {
  return fallbacks.reduce<BookInput>((current, fallback) => mergeBookMetadata(current, fallback), primary);
}

function isSameSeriesTitle(left?: string, right?: string) {
  const normalizedLeft = normalizeComparableText(left);
  const normalizedRight = normalizeComparableText(right);
  if (!normalizedLeft || !normalizedRight) return false;
  return normalizedLeft.includes(normalizedRight) || normalizedRight.includes(normalizedLeft);
}

function keepThumbnailOnlyForSafeMatch(
  book: BookInput | null,
  isbn: string,
  expected?: Pick<BookInput, 'seriesTitle' | 'volumeNumber'>,
): BookInput | null {
  if (!book || isSameIsbn(book.isbn, isbn)) return book;
  const hasSameVolume =
    !!expected?.volumeNumber &&
    !!book.volumeNumber &&
    expected.volumeNumber === book.volumeNumber;
  const hasSameSeries = isSameSeriesTitle(book.seriesTitle, expected?.seriesTitle);
  if (hasSameVolume && hasSameSeries) return book;
  return { ...book, thumbnailUrl: undefined };
}

function buildTitleQueries(title: string) {
  const parsed = parseSeriesTitle(title);
  const seriesVolumeQuery = parsed.volumeNumber
    ? `${parsed.seriesTitle} ${parsed.volumeNumber}`
    : parsed.seriesTitle;

  return [...new Set([seriesVolumeQuery, title, parsed.seriesTitle].filter(Boolean))];
}

export function isBookIsbnBarcode(value: string) {
  const normalized = normalizeIsbn(value);
  if (normalized.length === 10) return isValidIsbn10(normalized);
  if (normalized.length === 13) {
    return (normalized.startsWith('978') || normalized.startsWith('979')) && isValidIsbn13(normalized);
  }
  return false;
}

function isValidIsbn10(isbn: string) {
  if (!/^[0-9]{9}[0-9X]$/.test(isbn)) return false;

  const sum = isbn.split('').reduce((total, character, index) => {
    const value = character === 'X' ? 10 : Number.parseInt(character, 10);
    return total + value * (10 - index);
  }, 0);

  return sum % 11 === 0;
}

function isValidIsbn13(isbn: string) {
  if (!/^[0-9]{13}$/.test(isbn)) return false;

  const sum = isbn
    .slice(0, 12)
    .split('')
    .reduce((total, character, index) => {
      const value = Number.parseInt(character, 10);
      return total + value * (index % 2 === 0 ? 1 : 3);
    }, 0);
  const checkDigit = (10 - (sum % 10)) % 10;

  return checkDigit === Number.parseInt(isbn[12], 10);
}

async function lookupOpenBd(isbn: string): Promise<BookInput | null> {
  const response = await fetchWithTimeout(
    `https://api.openbd.jp/v1/get?isbn=${encodeURIComponent(isbn)}`,
  );
  if (!response.ok) throw new Error(`OpenBD responded with ${response.status}`);

  const payload = (await response.json()) as OpenBdResponse;
  const item = payload[0];
  const title = item?.summary?.title;
  if (!title) return null;

  const collectionTitle =
    item?.onix?.DescriptiveDetail?.Collection?.TitleDetail?.TitleElement?.TitleText?.content;
  const parsed = parseSeriesTitle(title);

  return {
    isbn: item.summary?.isbn ?? isbn,
    title,
    seriesTitle: collectionTitle ?? parsed.seriesTitle,
    volumeNumber: parsed.volumeNumber,
    author: item.summary?.author,
    thumbnailUrl: normalizeImageUrl(item.summary?.cover),
    status: 'unread',
  };
}

async function lookupRakutenBooksByIsbn(isbn: string): Promise<BookInput | null> {
  return lookupRakutenBooks({ isbn });
}

async function lookupRakutenBooksByTitle(title: string): Promise<BookInput | null> {
  return lookupRakutenBooks({ title });
}

async function lookupRakutenBooks(params: { isbn?: string; title?: string }): Promise<BookInput | null> {
  if (!env.rakutenAppId) return null;

  const searchParams = new URLSearchParams({
    applicationId: env.rakutenAppId,
    format: 'json',
  });
  if (params.isbn) searchParams.set('isbn', normalizeIsbn(params.isbn));
  if (params.title) searchParams.set('title', params.title);

  const response = await fetchWithTimeout(
    `https://app.rakuten.co.jp/services/api/BooksBook/Search/20170404?${searchParams.toString()}`,
  );

  if (!response.ok) return null;

  const payload = (await response.json()) as RakutenBooksResponse;
  const item = payload.Items?.[0]?.Item;
  if (!item?.title) return null;

  const parsed = parseSeriesTitle(item.title);

  return {
    isbn: item.isbn ?? params.isbn,
    title: item.title,
    seriesTitle: parsed.seriesTitle,
    volumeNumber: parsed.volumeNumber,
    author: item.author,
    thumbnailUrl: firstCoverUrl(item.largeImageUrl, item.mediumImageUrl, item.smallImageUrl),
    status: 'unread',
  };
}

async function lookupGoogleBooks(isbn: string): Promise<BookInput | null> {
  return lookupGoogleBooksByQuery(`isbn:${isbn}`, isbn, { trustFirstResultThumbnail: true });
}

async function lookupGoogleBooksByQuery(
  query: string,
  isbn: string,
  options: { expectedSeriesTitle?: string; expectedVolumeNumber?: number; trustFirstResultThumbnail?: boolean } = {},
): Promise<BookInput | null> {
  const params = new URLSearchParams({ q: query });
  if (env.googleBooksApiKey) params.set('key', env.googleBooksApiKey);

  const response = await fetchWithTimeout(
    `https://www.googleapis.com/books/v1/volumes?${params.toString()}`,
  );

  if (!response.ok) {
    if (response.status === 403 || response.status === 429) {
      throw new Error(
        env.googleBooksApiKey
          ? 'Google Books APIが拒否しました。APIキーの有効化、制限、割り当てを確認してください。'
          : 'Google Books APIキーがアプリに読み込まれていません。EXPO_PUBLIC_GOOGLE_BOOKS_API_KEYを設定して再起動してください。',
      );
    }
    return null;
  }

  const payload = (await response.json()) as GoogleBooksResponse;
  const normalizedIsbn = normalizeIsbn(isbn);
  const matchingItem = normalizedIsbn
    ? payload.items?.find((item) =>
        hasMatchingIndustryIdentifier(item.volumeInfo?.industryIdentifiers, normalizedIsbn),
      )
    : undefined;
  const matchingVolumeItem = payload.items?.find((item) => {
    const title = item.volumeInfo?.title;
    if (!title || !options.expectedVolumeNumber || !options.expectedSeriesTitle) return false;
    const parsed = parseSeriesTitle(title);
    return (
      parsed.volumeNumber === options.expectedVolumeNumber &&
      isSameSeriesTitle(parsed.seriesTitle, options.expectedSeriesTitle)
    );
  });
  const selectedItem = matchingItem ?? matchingVolumeItem ?? payload.items?.[0];
  const volume = selectedItem?.volumeInfo;
  if (!volume?.title) return null;

  const parsed = parseSeriesTitle(volume.title);
  const isbnMatched = normalizedIsbn
    ? hasMatchingIndustryIdentifier(volume.industryIdentifiers, normalizedIsbn)
    : false;
  const canUseThumbnail = !normalizedIsbn || isbnMatched || !!options.trustFirstResultThumbnail;
  const isbnFromApi =
    volume.industryIdentifiers?.find((item) => item.type === 'ISBN_13')?.identifier ?? isbn;
  const fallbackCoverUrl = canUseThumbnail
    ? firstCoverUrl(
        volume.imageLinks?.thumbnail,
        volume.imageLinks?.smallThumbnail,
        buildGoogleVolumeCoverUrl(selectedItem?.id),
        buildGoogleIsbnCoverUrl(isbnFromApi),
      )
    : undefined;

  return {
    isbn: isbnFromApi,
    title: volume.title,
    seriesTitle: parsed.seriesTitle,
    volumeNumber: parsed.volumeNumber,
    author: volume.authors?.join(', '),
    thumbnailUrl: fallbackCoverUrl,
    status: 'unread',
  };
}

export async function lookupBookByTitle(title: string, fallbackIsbn?: string): Promise<BookInput | null> {
  const trimmedTitle = title.trim();
  if (!trimmedTitle) return null;
  let firstResult: BookInput | null = null;

  for (const query of buildTitleQueries(trimmedTitle)) {
    const parsed = parseSeriesTitle(trimmedTitle);
    const rakutenResult = keepThumbnailOnlyForSafeMatch(
      await lookupRakutenBooksByTitle(query),
      fallbackIsbn ?? '',
      parsed,
    );
    if (rakutenResult?.thumbnailUrl) return rakutenResult;
    if (rakutenResult && !firstResult) firstResult = rakutenResult;

    const titleResult = await lookupGoogleBooksByQuery(`intitle:${query}`, fallbackIsbn ?? '', {
      expectedSeriesTitle: parsed.seriesTitle,
      expectedVolumeNumber: parsed.volumeNumber,
    });
    if (titleResult?.thumbnailUrl) return titleResult;
    if (titleResult && !firstResult) firstResult = titleResult;
  }

  return firstResult ?? lookupGoogleBooksByQuery(trimmedTitle, fallbackIsbn ?? '');
}

export async function lookupBookByIsbn(isbn: string): Promise<BookInput | null> {
  const normalizedIsbn = normalizeIsbn(isbn);
  if (!isBookIsbnBarcode(normalizedIsbn)) return null;

  const openBdResult = await tryLookup('OpenBD', () => lookupOpenBd(normalizedIsbn));
  const rakutenResult = await tryLookup('Rakuten Books', () => lookupRakutenBooksByIsbn(normalizedIsbn));
  const strictGoogleResult = await lookupGoogleBooks(normalizedIsbn);
  if (rakutenResult?.thumbnailUrl && rakutenResult.volumeNumber) return rakutenResult;

  if (openBdResult) {
    if (openBdResult.thumbnailUrl && openBdResult.volumeNumber) return openBdResult;

    const titleFallback = keepThumbnailOnlyForSafeMatch(
      await lookupBookByTitle(openBdResult.title, normalizedIsbn),
      normalizedIsbn,
      openBdResult,
    );
    return mergeBookMetadataList(openBdResult, [rakutenResult, strictGoogleResult, titleFallback]);
  }

  if (rakutenResult?.thumbnailUrl) return rakutenResult;
  if (rakutenResult) {
    const titleFallback = keepThumbnailOnlyForSafeMatch(
      await lookupBookByTitle(rakutenResult.title, normalizedIsbn),
      normalizedIsbn,
      rakutenResult,
    );
    return mergeBookMetadata(rakutenResult, titleFallback);
  }

  if (strictGoogleResult?.thumbnailUrl) return strictGoogleResult;
  if (strictGoogleResult) {
    const titleFallback = keepThumbnailOnlyForSafeMatch(
      await lookupBookByTitle(strictGoogleResult.title, normalizedIsbn),
      normalizedIsbn,
      strictGoogleResult,
    );
    return mergeBookMetadata(strictGoogleResult, titleFallback);
  }

  return lookupGoogleBooksByQuery(normalizedIsbn, normalizedIsbn);
}

async function tryLookup(providerName: string, lookup: () => Promise<BookInput | null>) {
  try {
    return await lookup();
  } catch (error) {
    console.warn(`${providerName} lookup failed`, error);
    return null;
  }
}

async function fetchWithTimeout(url: string, timeoutMs = 12000) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
  }
}

export function buildPurchaseUrl(seriesTitle: string, volumeNumber?: number) {
  const query = [seriesTitle, volumeNumber ? `${volumeNumber}巻` : undefined, '本'].filter(Boolean);
  return `https://books.rakuten.co.jp/search?sitem=${encodeURIComponent(query.join(' '))}`;
}
