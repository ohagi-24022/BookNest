import { BookInput } from '../types';
import { env } from './env';
import { parseSeriesTitle } from './series';
import { supabase } from './supabase';

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

type RakutenBooksTotalResponse = RakutenBooksResponse;

type RakutenItem = NonNullable<NonNullable<RakutenBooksResponse['Items']>[number]['Item']>;

type ExpectedBook = Partial<Pick<BookInput, 'seriesTitle' | 'volumeNumber'>> & {
  isbn?: string;
};

const RAKUTEN_APP_REFERER = 'https://github.com/ohagi-24022/BookNest';

type RakutenProxyRequest = {
  path: string;
  params: Record<string, string>;
};

type FetchLikeResponse = {
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
  text: () => Promise<string>;
};

export type BookLookupDebugEntry = {
  provider: string;
  query: string;
  status: 'hit' | 'miss' | 'error';
  title?: string;
  isbn?: string;
  seriesTitle?: string;
  volumeNumber?: number;
  coverUrl?: string;
  reason?: string;
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

function isKnownUnavailableCoverUrl(url?: string) {
  return !!url && /imagenotavailable|no[_-]?image|noimage/i.test(url);
}

function firstCoverUrl(...urls: Array<string | undefined>) {
  return urls
    .map(normalizeImageUrl)
    .find((url): url is string => !!url && !isKnownUnavailableCoverUrl(url));
}

function withIsbnCoverFallback(book: BookInput | null, isbn?: string): BookInput | null {
  return book;
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

function hasExpectedVolumeAndSeries(book: Pick<BookInput, 'seriesTitle' | 'volumeNumber'>, expected?: ExpectedBook) {
  if (!expected?.volumeNumber || !expected.seriesTitle) return false;
  return book.volumeNumber === expected.volumeNumber && isSameSeriesTitle(book.seriesTitle, expected.seriesTitle);
}

function rakutenItemHasCover(item?: RakutenItem) {
  return !!firstCoverUrl(item?.largeImageUrl, item?.mediumImageUrl, item?.smallImageUrl);
}

function rakutenItemMatchesExpected(item: RakutenItem, expected?: ExpectedBook) {
  const parsed = parseSeriesTitle(item.title ?? '');
  if (expected?.isbn && isSameIsbn(item.isbn, expected.isbn)) return true;
  return hasExpectedVolumeAndSeries(parsed, expected);
}

function selectRakutenItem(items: RakutenBooksResponse['Items'], expected?: ExpectedBook) {
  const candidates = items?.map((entry) => entry.Item).filter((item): item is RakutenItem => !!item?.title) ?? [];
  if (candidates.length === 0) return undefined;

  return (
    candidates.find((item) => rakutenItemHasCover(item) && expected?.isbn && isSameIsbn(item.isbn, expected.isbn)) ??
    candidates.find((item) => rakutenItemHasCover(item) && rakutenItemMatchesExpected(item, expected)) ??
    candidates.find((item) => expected?.isbn && isSameIsbn(item.isbn, expected.isbn)) ??
    candidates.find((item) => rakutenItemMatchesExpected(item, expected)) ??
    candidates.find(rakutenItemHasCover) ??
    candidates[0]
  );
}

function rakutenItemToBookInput(item: RakutenItem, fallbackIsbn?: string): BookInput {
  const parsed = parseSeriesTitle(item.title ?? '');

  return {
    isbn: item.isbn ?? fallbackIsbn,
    title: item.title ?? '',
    seriesTitle: parsed.seriesTitle,
    volumeNumber: parsed.volumeNumber,
    author: item.author,
    thumbnailUrl: firstCoverUrl(item.largeImageUrl, item.mediumImageUrl, item.smallImageUrl),
    status: 'unread',
  };
}

function rakutenItemToDebugEntry(provider: string, query: string, item: RakutenItem): BookLookupDebugEntry {
  const parsed = parseSeriesTitle(item.title ?? '');

  return {
    provider,
    query,
    status: 'hit',
    title: item.title,
    isbn: item.isbn,
    seriesTitle: parsed.seriesTitle,
    volumeNumber: parsed.volumeNumber,
    coverUrl: firstCoverUrl(item.largeImageUrl, item.mediumImageUrl, item.smallImageUrl),
  };
}

function bookToDebugEntry(provider: string, query: string, book: BookInput | null): BookLookupDebugEntry {
  if (!book) {
    return {
      provider,
      query,
      status: 'miss',
      reason: '候補なし',
    };
  }

  return {
    provider,
    query,
    status: 'hit',
    title: book.title,
    isbn: book.isbn,
    seriesTitle: book.seriesTitle,
    volumeNumber: book.volumeNumber,
    coverUrl: book.thumbnailUrl,
  };
}

function getRakutenConfigDebugEntry(query: string): BookLookupDebugEntry {
  const appId = env.rakutenAppId ?? '';
  const accessKey = env.rakutenAccessKey ?? '';

  return {
    provider: 'Rakuten Config',
    query,
    status: appId && accessKey ? 'hit' : 'error',
    reason: [
      `APP ID: ${appId ? `${appId.length}文字` : 'なし'}`,
      `Access Key: ${accessKey ? `${accessKey.length}文字` : 'なし'}`,
    ]
      .filter(Boolean)
      .join(' / '),
  };
}

function buildTitleQueries(title: string) {
  const parsed = parseSeriesTitle(title);
  const seriesVolumeQuery = parsed.volumeNumber
    ? `${parsed.seriesTitle} ${parsed.volumeNumber}`
    : parsed.seriesTitle;
  const seriesVolumeWithSuffixQuery = parsed.volumeNumber
    ? `${parsed.seriesTitle} ${parsed.volumeNumber}巻`
    : undefined;
  const seriesVolumeWithPrefixQuery = parsed.volumeNumber
    ? `${parsed.seriesTitle} 第${parsed.volumeNumber}巻`
    : undefined;

  const queries = [
    ...new Set(
      [
        seriesVolumeWithSuffixQuery,
        seriesVolumeWithPrefixQuery,
        seriesVolumeQuery,
        title,
        parsed.seriesTitle,
      ].filter((query): query is string => !!query),
    ),
  ];

  return queries;
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
  return lookupRakutenBooks({ isbn }, { isbn });
}

async function lookupRakutenBooksByTitle(title: string, expected?: ExpectedBook): Promise<BookInput | null> {
  return (await lookupRakutenBooks({ title }, expected)) ?? lookupRakutenBooksTotal(title, expected);
}

async function lookupRakutenBooks(
  params: { isbn?: string; title?: string },
  expected?: ExpectedBook,
): Promise<BookInput | null> {
  if (!env.rakutenAppId || !env.rakutenAccessKey) return null;

  const searchParams = new URLSearchParams({
    applicationId: env.rakutenAppId,
    accessKey: env.rakutenAccessKey,
    format: 'json',
  });
  if (params.isbn) searchParams.set('isbn', normalizeIsbn(params.isbn));
  if (params.title) searchParams.set('title', params.title);

  const path = 'BooksBook/Search/20170404';
  const response = await fetchRakutenWithTimeout(
    `https://openapi.rakuten.co.jp/services/api/BooksBook/Search/20170404?${searchParams.toString()}`,
    { path, params: Object.fromEntries(searchParams.entries()) },
  );

  if (!response.ok) return null;

  const payload = (await response.json()) as RakutenBooksResponse;
  const item = selectRakutenItem(payload.Items, { ...expected, isbn: params.isbn ?? expected?.isbn });
  if (!item?.title) return null;

  return rakutenItemToBookInput(item, params.isbn);
}

async function lookupRakutenBooksTotal(keyword: string, expected?: ExpectedBook): Promise<BookInput | null> {
  if (!env.rakutenAppId || !env.rakutenAccessKey || !keyword.trim()) return null;

  const searchParams = new URLSearchParams({
    applicationId: env.rakutenAppId,
    accessKey: env.rakutenAccessKey,
    format: 'json',
    keyword,
  });

  const path = 'BooksTotal/Search/20170404';
  const response = await fetchRakutenWithTimeout(
    `https://openapi.rakuten.co.jp/services/api/BooksTotal/Search/20170404?${searchParams.toString()}`,
    { path, params: Object.fromEntries(searchParams.entries()) },
  );

  if (!response.ok) return null;

  const payload = (await response.json()) as RakutenBooksTotalResponse;
  const item = selectRakutenItem(payload.Items, expected);
  if (!item?.title) return null;

  return rakutenItemToBookInput(item);
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
  const expected = parseSeriesTitle(trimmedTitle);

  for (const query of buildTitleQueries(trimmedTitle)) {
    const rakutenResult = keepThumbnailOnlyForSafeMatch(
      await lookupRakutenBooksByTitle(query, expected),
      fallbackIsbn ?? '',
      expected,
    );
    if (rakutenResult?.thumbnailUrl) return rakutenResult;
    if (rakutenResult && !firstResult) firstResult = rakutenResult;

    const titleResult = await tryLookup(
      'Google Books',
      () =>
        lookupGoogleBooksByQuery(`intitle:${query}`, fallbackIsbn ?? '', {
          expectedSeriesTitle: expected.seriesTitle,
          expectedVolumeNumber: expected.volumeNumber,
        }),
      { silent: true },
    );
    const titleResultWithFallback = withIsbnCoverFallback(titleResult, fallbackIsbn);
    if (titleResultWithFallback?.thumbnailUrl) return titleResultWithFallback;
    if (titleResultWithFallback && !firstResult) firstResult = titleResultWithFallback;
  }

  return (
    withIsbnCoverFallback(firstResult, fallbackIsbn) ??
    withIsbnCoverFallback(
      await tryLookup('Google Books', () => lookupGoogleBooksByQuery(trimmedTitle, fallbackIsbn ?? ''), { silent: true }),
      fallbackIsbn,
    )
  );
}

export async function lookupBookDebugInfo(params: {
  isbn?: string;
  title: string;
}): Promise<BookLookupDebugEntry[]> {
  const entries: BookLookupDebugEntry[] = [];
  const trimmedTitle = params.title.trim();
  const normalizedIsbn = params.isbn ? normalizeIsbn(params.isbn) : '';
  const expected = parseSeriesTitle(trimmedTitle);
  const titleQueries = buildTitleQueries(trimmedTitle).slice(0, 1);

  entries.push(getRakutenConfigDebugEntry(trimmedTitle || normalizedIsbn));

  if (normalizedIsbn) {
    entries.push(await debugLookup('OpenBD', normalizedIsbn, () => lookupOpenBd(normalizedIsbn)));
    entries.push(await debugLookup('Rakuten ISBN', normalizedIsbn, () => lookupRakutenBooksByIsbn(normalizedIsbn)));
    entries.push(await debugLookup('Google ISBN', normalizedIsbn, () => lookupGoogleBooks(normalizedIsbn)));
  }

  for (const query of titleQueries) {
    entries.push(...(await debugRakutenTitleCandidates(query, expected)));
    entries.push(
      await debugLookup('Google Title', query, () =>
        lookupGoogleBooksByQuery(`intitle:${query}`, normalizedIsbn, {
          expectedSeriesTitle: expected.seriesTitle,
          expectedVolumeNumber: expected.volumeNumber,
        }),
      ),
    );
  }

  return entries.slice(0, 8);
}

async function debugLookup(
  provider: string,
  query: string,
  lookup: () => Promise<BookInput | null>,
): Promise<BookLookupDebugEntry> {
  try {
    return bookToDebugEntry(provider, query, await lookup());
  } catch (error) {
    return {
      provider,
      query,
      status: 'error',
      reason: error instanceof Error ? error.message : '不明なエラー',
    };
  }
}

async function debugRakutenTitleCandidates(
  query: string,
  expected: ExpectedBook,
): Promise<BookLookupDebugEntry[]> {
  if (!env.rakutenAppId) {
    return [
      {
        provider: 'Rakuten Title',
        query,
        status: 'miss',
        reason: '楽天APP IDなし',
      },
    ];
  }

  if (!env.rakutenAccessKey) {
    return [
      {
        provider: 'Rakuten Title',
        query,
        status: 'miss',
        reason: '楽天Access Keyなし',
      },
    ];
  }

  const booksCandidates = await debugRakutenEndpoint('Rakuten BooksBook', query, 'title', expected);
  const totalCandidates = await debugRakutenEndpoint('Rakuten BooksTotal', query, 'keyword', expected);
  return [...booksCandidates, ...totalCandidates].slice(0, 4);
}

async function debugRakutenEndpoint(
  provider: string,
  query: string,
  queryParamName: 'title' | 'keyword',
  expected: ExpectedBook,
): Promise<BookLookupDebugEntry[]> {
  try {
    const searchParams = new URLSearchParams({
      applicationId: env.rakutenAppId ?? '',
      accessKey: env.rakutenAccessKey ?? '',
      format: 'json',
    });
    searchParams.set(queryParamName, query);
    const path =
      queryParamName === 'title'
        ? 'BooksBook/Search/20170404'
        : 'BooksTotal/Search/20170404';
    const response = await fetchRakutenWithTimeout(
      `https://openapi.rakuten.co.jp/services/api/${path}?${searchParams.toString()}`,
      { path, params: Object.fromEntries(searchParams.entries()) },
    );

    if (!response.ok) {
      const errorBody = await response.text();
      const reason = errorBody.includes('specify valid applicationId')
        ? '楽天APP IDが無効扱いです。.envのEXPO_PUBLIC_RAKUTEN_APP_IDに楽天画面のアプリケーションIDを入れて、Expoを再起動してください。'
        : errorBody.slice(0, 120);
      return [
        {
          provider,
          query,
          status: 'error',
          reason: [`HTTP ${response.status}`, reason].filter(Boolean).join(': '),
        },
      ];
    }

    const payload = (await response.json()) as RakutenBooksResponse;
    const candidates = payload.Items?.map((entry) => entry.Item).filter((item): item is RakutenItem => !!item?.title) ?? [];
    const sortedCandidates = [...candidates].sort((left, right) => {
      const leftScore =
        (rakutenItemMatchesExpected(left, expected) ? 2 : 0) + (rakutenItemHasCover(left) ? 1 : 0);
      const rightScore =
        (rakutenItemMatchesExpected(right, expected) ? 2 : 0) + (rakutenItemHasCover(right) ? 1 : 0);
      return rightScore - leftScore;
    });

    if (sortedCandidates.length === 0) {
      return [
        {
          provider,
          query,
          status: 'miss',
          reason: '候補なし',
        },
      ];
    }

    return sortedCandidates.slice(0, 2).map((item) => rakutenItemToDebugEntry(provider, query, item));
  } catch (error) {
    return [
      {
        provider,
        query,
        status: 'error',
        reason: error instanceof Error ? error.message : '不明なエラー',
      },
    ];
  }
}

export async function lookupBookByIsbn(isbn: string): Promise<BookInput | null> {
  const normalizedIsbn = normalizeIsbn(isbn);
  if (!isBookIsbnBarcode(normalizedIsbn)) return null;

  const openBdResult = await tryLookup('OpenBD', () => lookupOpenBd(normalizedIsbn));
  const rakutenResult = await tryLookup('Rakuten Books', () => lookupRakutenBooksByIsbn(normalizedIsbn));
  const strictGoogleResult = await tryLookup('Google Books', () => lookupGoogleBooks(normalizedIsbn), {
    silent: true,
  });
  if (rakutenResult?.thumbnailUrl && rakutenResult.volumeNumber) return rakutenResult;

  if (openBdResult) {
    const openBdWithFallback = withIsbnCoverFallback(openBdResult, normalizedIsbn);
    if (openBdWithFallback?.thumbnailUrl && openBdWithFallback.volumeNumber) return openBdWithFallback;

    const titleFallback = keepThumbnailOnlyForSafeMatch(
      await lookupBookByTitle(openBdResult.title, normalizedIsbn),
      normalizedIsbn,
      openBdResult,
    );
    return withIsbnCoverFallback(
      mergeBookMetadataList(openBdResult, [rakutenResult, strictGoogleResult, titleFallback]),
      normalizedIsbn,
    );
  }

  if (rakutenResult?.thumbnailUrl) return rakutenResult;
  if (rakutenResult) {
    const titleFallback = keepThumbnailOnlyForSafeMatch(
      await lookupBookByTitle(rakutenResult.title, normalizedIsbn),
      normalizedIsbn,
      rakutenResult,
    );
    return withIsbnCoverFallback(mergeBookMetadata(rakutenResult, titleFallback), normalizedIsbn);
  }

  if (strictGoogleResult?.thumbnailUrl) return strictGoogleResult;
  if (strictGoogleResult) {
    const titleFallback = keepThumbnailOnlyForSafeMatch(
      await lookupBookByTitle(strictGoogleResult.title, normalizedIsbn),
      normalizedIsbn,
      strictGoogleResult,
    );
    return withIsbnCoverFallback(mergeBookMetadata(strictGoogleResult, titleFallback), normalizedIsbn);
  }

  return withIsbnCoverFallback(
    await tryLookup('Google Books', () => lookupGoogleBooksByQuery(normalizedIsbn, normalizedIsbn), {
      silent: true,
    }),
    normalizedIsbn,
  );
}

async function tryLookup(
  providerName: string,
  lookup: () => Promise<BookInput | null>,
  options: { silent?: boolean } = {},
) {
  try {
    return await lookup();
  } catch (error) {
    if (!options.silent) {
      console.warn(`${providerName} lookup failed`, error);
    }
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

async function fetchRakutenWithTimeout(
  url: string,
  proxyRequest?: RakutenProxyRequest,
  timeoutMs = 12000,
): Promise<FetchLikeResponse> {
  const response = await fetchRakutenProxy(proxyRequest);
  if (!response) {
    return createJsonResponse(503, {
      error: 'RAKUTEN_PROXY_UNAVAILABLE',
      message: 'Supabase Edge Function rakuten-books is not available. Deploy it and set Supabase secrets.',
    });
  }
  if (response.status !== 429) return response;

  await new Promise((resolve) => setTimeout(resolve, 1200));
  return (
    (await fetchRakutenProxy(proxyRequest)) ??
    createJsonResponse(503, {
      error: 'RAKUTEN_PROXY_UNAVAILABLE',
      message: 'Supabase Edge Function rakuten-books is not available after retry.',
    })
  );
}

async function fetchRakutenProxy(proxyRequest?: RakutenProxyRequest): Promise<FetchLikeResponse | null> {
  if (!supabase || !proxyRequest) return null;

  try {
    const { data, error } = await supabase.functions.invoke<{
      ok: boolean;
      status: number;
      body: unknown;
    }>('rakuten-books', {
      body: proxyRequest,
    });
    if (error || !data) return null;

    return {
      ok: data.ok,
      status: data.status,
      json: async () => data.body,
      text: async () => JSON.stringify(data.body),
    };
  } catch (error) {
    console.warn('Rakuten proxy lookup failed', error);
    return null;
  }
}

function createJsonResponse(status: number, body: unknown): FetchLikeResponse {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  };
}

export function buildPurchaseUrl(seriesTitle: string, volumeNumber?: number) {
  const query = [seriesTitle, volumeNumber ? `${volumeNumber}巻` : undefined, '本'].filter(Boolean);
  return `https://books.rakuten.co.jp/search?sitem=${encodeURIComponent(query.join(' '))}`;
}
