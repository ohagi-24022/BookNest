import AsyncStorage from '@react-native-async-storage/async-storage';
import { useScrollToTop } from '@react-navigation/native';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  FlatList,
  NativeScrollEvent,
  NativeSyntheticEvent,
  StyleSheet,
  View,
} from 'react-native';

import { BookRow } from '../../src/components/home/BookRow';
import { EmptyLibraryState } from '../../src/components/home/EmptyLibraryState';
import { HomeToolbar } from '../../src/components/home/HomeToolbar';
import { OptionSheet } from '../../src/components/home/OptionSheet';
import { SeriesCard } from '../../src/components/home/SeriesCard';
import {
  lookupLatestSeriesPublication,
  SeriesPublicationInfo,
} from '../../src/lib/bookApis';
import { getMissingVolumes, normalizeSeriesKey } from '../../src/lib/series';
import { SeriesGroup } from '../../src/lib/seriesSelectors';
import { useAppSettings } from '../../src/store/AppSettingsContext';
import { useLibrary } from '../../src/store/LibraryContext';
import { useAppTheme } from '../../src/store/ThemeContext';
import { Book, ReadingStatus } from '../../src/types';

type HomeFilter =
  | ReadingStatus
  | 'all'
  | 'missing'
  | 'favorite'
  | `author:${string}`
  | `publisher:${string}`;
type SeriesSort =
  | 'title'
  | 'recent'
  | 'missing'
  | 'unread'
  | 'completion'
  | 'favorite'
  | 'author'
  | 'publisher';
type BookSort =
  | 'recent'
  | 'title'
  | 'series'
  | 'volume'
  | 'status'
  | 'favorite'
  | 'author'
  | 'publisher';
type SeriesPublicationCache = Record<string, SeriesPublicationInfo>;

const SERIES_PUBLICATION_STORAGE_KEY = 'booknest.series-publication.v1';

const filters: Array<{ label: string; value: HomeFilter }> = [
  { label: 'すべて', value: 'all' },
  { label: '未読', value: 'unread' },
  { label: '読書中', value: 'reading' },
  { label: '読了', value: 'read' },
  { label: '巻抜け', value: 'missing' },
  { label: 'お気に入り', value: 'favorite' },
];
const filterCategoryOptions = [
  ...filters,
  { label: '作者で絞る', value: 'select-author' },
  { label: '出版社で絞る', value: 'select-publisher' },
];

const seriesSortOptions: Array<{ label: string; value: SeriesSort }> = [
  { label: '名前順', value: 'title' },
  { label: '最近追加', value: 'recent' },
  { label: '巻抜け優先', value: 'missing' },
  { label: '積読優先', value: 'unread' },
  { label: '所持率順', value: 'completion' },
  { label: 'お気に入り優先', value: 'favorite' },
  { label: '著者順', value: 'author' },
  { label: '出版社順', value: 'publisher' },
];

const bookSortOptions: Array<{ label: string; value: BookSort }> = [
  { label: '最近追加', value: 'recent' },
  { label: 'タイトル順', value: 'title' },
  { label: 'シリーズ順', value: 'series' },
  { label: '巻数順', value: 'volume' },
  { label: '読書状態順', value: 'status' },
  { label: 'お気に入り優先', value: 'favorite' },
  { label: '著者順', value: 'author' },
  { label: '出版社順', value: 'publisher' },
];

const readingStatusOrder: Record<ReadingStatus, number> = {
  reading: 0,
  unread: 1,
  read: 2,
};

function getMetadataFilter(filter: HomeFilter) {
  if (filter.startsWith('author:')) {
    return { field: 'author' as const, value: decodeURIComponent(filter.slice('author:'.length)) };
  }
  if (filter.startsWith('publisher:')) {
    return {
      field: 'publisher' as const,
      value: decodeURIComponent(filter.slice('publisher:'.length)),
    };
  }
  return null;
}

function getTrailingUnownedVolumes(ownedLatestVolume?: number, publishedLatestVolume?: number) {
  if (!ownedLatestVolume || !publishedLatestVolume || publishedLatestVolume <= ownedLatestVolume) {
    return [];
  }

  return Array.from(
    { length: publishedLatestVolume - ownedLatestVolume },
    (_, index) => ownedLatestVolume + index + 1,
  );
}

export default function HomeScreen() {
  const { colors } = useAppTheme();
  const {
    favoriteSeriesKeys,
    showPublishedLatestVolume,
    toggleFavoriteSeries,
  } = useAppSettings();
  const { books, error, loading, requiresAuth, seriesGroups } = useLibrary();
  const [filter, setFilter] = useState<HomeFilter>('all');
  const [viewMode, setViewMode] = useState<'series' | 'books'>('series');
  const [seriesSort, setSeriesSort] = useState<SeriesSort>('title');
  const [bookSort, setBookSort] = useState<BookSort>('recent');
  const [query, setQuery] = useState('');
  const [openMenu, setOpenMenu] = useState<
    'filter' | 'sort' | 'author' | 'publisher' | null
  >(null);
  const [toolbarHeight, setToolbarHeight] = useState(152);
  const [publicationCache, setPublicationCache] = useState<SeriesPublicationCache>({});
  const [refreshingSeriesTitle, setRefreshingSeriesTitle] = useState<string | null>(null);
  const toolbarTranslateY = useRef(new Animated.Value(0)).current;
  const seriesListRef = useRef<FlatList<SeriesGroup>>(null);
  const booksListRef = useRef<FlatList<Book>>(null);
  const activeViewModeRef = useRef(viewMode);
  const tabScrollToTopRef = useRef({ scrollToTop: () => {} });
  const toolbarVisibleRef = useRef(true);
  const lastScrollYRef = useRef(0);
  const directionDistanceRef = useRef(0);
  const lastDirectionRef = useRef<1 | -1>(1);
  const favoriteSeriesKeySet = useMemo(
    () => new Set(favoriteSeriesKeys),
    [favoriteSeriesKeys],
  );
  activeViewModeRef.current = viewMode;

  useEffect(() => {
    AsyncStorage.getItem(SERIES_PUBLICATION_STORAGE_KEY)
      .then((storedCache) => {
        if (storedCache) setPublicationCache(JSON.parse(storedCache) as SeriesPublicationCache);
      })
      .catch((cacheError) => {
        console.warn('Failed to load series publication cache', cacheError);
      });
  }, []);
  const metadataFilterOptions = useMemo(() => {
    const authors = [...new Set(seriesGroups.flatMap((group) => group.authors))]
      .sort((left, right) => left.localeCompare(right))
      .map((author) => ({
        label: author,
        value: `author:${encodeURIComponent(author)}` as HomeFilter,
      }));
    const publishers = [...new Set(seriesGroups.flatMap((group) => group.publishers))]
      .sort((left, right) => left.localeCompare(right))
      .map((publisher) => ({
        label: publisher,
        value: `publisher:${encodeURIComponent(publisher)}` as HomeFilter,
      }));

    return { authors, publishers };
  }, [seriesGroups]);
  const seriesStats = useMemo(() => {
    const bySeries = new Map<string, Book[]>();
    books.forEach((book) => {
      const group = bySeries.get(book.seriesTitle) ?? [];
      group.push(book);
      bySeries.set(book.seriesTitle, group);
    });

    return new Map(
      [...bySeries.entries()].map(([title, groupedBooks]) => {
        const volumes = groupedBooks
          .map((book) => book.volumeNumber)
          .filter((volume): volume is number => !!volume);
        const missingVolumes = getMissingVolumes(volumes);
        const latestVolume = volumes.length > 0 ? Math.max(...volumes) : undefined;
        const completionRate =
          latestVolume && latestVolume > 0 ? Math.round((groupedBooks.length / latestVolume) * 100) : 100;

        return [title, { missingVolumes, completionRate }] as const;
      }),
    );
  }, [books]);
  const visibleGroups = useMemo(() => {
    const metadataFilter = getMetadataFilter(filter);
    const filtered = seriesGroups.filter((group) => {
      const stats = seriesStats.get(group.title);
      const matchesFilter =
        metadataFilter?.field === 'author'
          ? group.authors.includes(metadataFilter.value)
          : metadataFilter?.field === 'publisher'
            ? group.publishers.includes(metadataFilter.value)
            : filter === 'all' ||
              (filter === 'unread' && group.unreadCount > 0) ||
              (filter === 'reading' && group.readingCount > 0) ||
              (filter === 'read' && group.readCount === group.ownedCount) ||
              (filter === 'missing' && (stats?.missingVolumes.length ?? 0) > 0) ||
              (filter === 'favorite' &&
                favoriteSeriesKeySet.has(normalizeSeriesKey(group.title)));
      const keyword = query.toLowerCase();
      const matchesQuery =
        group.title.toLowerCase().includes(keyword) ||
        group.authors.some((author) => author.toLowerCase().includes(keyword)) ||
        group.publishers.some((publisher) => publisher.toLowerCase().includes(keyword));
      return matchesFilter && matchesQuery;
    });

    return filtered.sort((left, right) => {
      if (seriesSort === 'recent') return right.latestAddedAt.localeCompare(left.latestAddedAt);
      if (seriesSort === 'missing') {
        return (
          (seriesStats.get(right.title)?.missingVolumes.length ?? 0) -
            (seriesStats.get(left.title)?.missingVolumes.length ?? 0) ||
          left.title.localeCompare(right.title)
        );
      }
      if (seriesSort === 'unread') {
        return right.unreadCount - left.unreadCount || left.title.localeCompare(right.title);
      }
      if (seriesSort === 'completion') {
        return (
          (seriesStats.get(right.title)?.completionRate ?? 100) -
            (seriesStats.get(left.title)?.completionRate ?? 100) ||
          left.title.localeCompare(right.title)
        );
      }
      if (seriesSort === 'favorite') {
        const favoriteDifference =
          Number(favoriteSeriesKeySet.has(normalizeSeriesKey(right.title))) -
          Number(favoriteSeriesKeySet.has(normalizeSeriesKey(left.title)));
        return favoriteDifference || left.title.localeCompare(right.title);
      }
      if (seriesSort === 'author') {
        return (
          (left.authors[0] ?? '\uffff').localeCompare(right.authors[0] ?? '\uffff') ||
          left.title.localeCompare(right.title)
        );
      }
      if (seriesSort === 'publisher') {
        return (
          (left.publishers[0] ?? '\uffff').localeCompare(right.publishers[0] ?? '\uffff') ||
          left.title.localeCompare(right.title)
        );
      }
      return left.title.localeCompare(right.title);
    });
  }, [favoriteSeriesKeySet, filter, query, seriesGroups, seriesSort, seriesStats]);
  const visibleBooks = useMemo(() => {
    const metadataFilter = getMetadataFilter(filter);
    const filtered = books.filter((book) => {
        const matchesFilter =
          metadataFilter?.field === 'author'
            ? book.author === metadataFilter.value
            : metadataFilter?.field === 'publisher'
              ? book.publisher === metadataFilter.value
              : filter === 'all' ||
                (filter === 'missing'
                  ? (seriesStats.get(book.seriesTitle)?.missingVolumes.length ?? 0) > 0
                  : filter === 'favorite'
                    ? favoriteSeriesKeySet.has(normalizeSeriesKey(book.seriesTitle))
                    : book.status === filter);
        const keyword = query.toLowerCase();
        const matchesQuery =
          book.title.toLowerCase().includes(keyword) ||
          book.seriesTitle.toLowerCase().includes(keyword) ||
          (book.author?.toLowerCase().includes(keyword) ?? false) ||
          (book.publisher?.toLowerCase().includes(keyword) ?? false);
        return matchesFilter && matchesQuery;
      });

    return filtered.sort((left, right) => {
      if (bookSort === 'title') return left.title.localeCompare(right.title);
      if (bookSort === 'series') {
        return (
          left.seriesTitle.localeCompare(right.seriesTitle) ||
          (left.volumeNumber ?? Number.MAX_SAFE_INTEGER) -
            (right.volumeNumber ?? Number.MAX_SAFE_INTEGER)
        );
      }
      if (bookSort === 'volume') {
        return (
          (left.volumeNumber ?? Number.MAX_SAFE_INTEGER) -
            (right.volumeNumber ?? Number.MAX_SAFE_INTEGER) ||
          left.seriesTitle.localeCompare(right.seriesTitle)
        );
      }
      if (bookSort === 'status') {
        return (
          readingStatusOrder[left.status] - readingStatusOrder[right.status] ||
          left.title.localeCompare(right.title)
        );
      }
      if (bookSort === 'favorite') {
        const favoriteDifference =
          Number(favoriteSeriesKeySet.has(normalizeSeriesKey(right.seriesTitle))) -
          Number(favoriteSeriesKeySet.has(normalizeSeriesKey(left.seriesTitle)));
        return favoriteDifference || right.createdAt.localeCompare(left.createdAt);
      }
      if (bookSort === 'author') {
        return (
          (left.author ?? '\uffff').localeCompare(right.author ?? '\uffff') ||
          left.title.localeCompare(right.title)
        );
      }
      if (bookSort === 'publisher') {
        return (
          (left.publisher ?? '\uffff').localeCompare(right.publisher ?? '\uffff') ||
          left.title.localeCompare(right.title)
        );
      }
      return right.createdAt.localeCompare(left.createdAt);
    });
  }, [bookSort, books, favoriteSeriesKeySet, filter, query, seriesStats]);
  const listVersion = `${books.length}-${seriesGroups.length}-${filter}-${query}`;
  const selectedMetadataFilter = getMetadataFilter(filter);
  const selectedFilterLabel = selectedMetadataFilter
    ? `${selectedMetadataFilter.field === 'author' ? '著者' : '出版社'}: ${selectedMetadataFilter.value}`
    : filters.find((option) => option.value === filter)?.label ?? 'すべて';
  const selectedSortLabel =
    viewMode === 'series'
      ? seriesSortOptions.find((option) => option.value === seriesSort)?.label ?? '名前順'
      : bookSortOptions.find((option) => option.value === bookSort)?.label ?? '最近追加';

  const setToolbarVisible = useCallback(
    (visible: boolean) => {
      if (toolbarVisibleRef.current === visible) return;
      toolbarVisibleRef.current = visible;
      Animated.timing(toolbarTranslateY, {
        toValue: visible ? 0 : -toolbarHeight,
        duration: 180,
        useNativeDriver: true,
      }).start();
    },
    [toolbarHeight, toolbarTranslateY],
  );

  tabScrollToTopRef.current.scrollToTop = () => {
    setToolbarVisible(true);
    lastScrollYRef.current = 0;
    directionDistanceRef.current = 0;
    if (activeViewModeRef.current === 'series') {
      seriesListRef.current?.scrollToOffset({ offset: 0, animated: true });
    } else {
      booksListRef.current?.scrollToOffset({ offset: 0, animated: true });
    }
  };
  useScrollToTop(tabScrollToTopRef);

  const handleScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const nextY = Math.max(0, event.nativeEvent.contentOffset.y);
      const delta = nextY - lastScrollYRef.current;
      lastScrollYRef.current = nextY;

      if (nextY < 8) {
        directionDistanceRef.current = 0;
        setToolbarVisible(true);
        return;
      }
      if (Math.abs(delta) < 1) return;

      const direction: 1 | -1 = delta > 0 ? 1 : -1;
      if (lastDirectionRef.current !== direction) {
        lastDirectionRef.current = direction;
        directionDistanceRef.current = 0;
      }
      directionDistanceRef.current += Math.abs(delta);

      if (directionDistanceRef.current >= 14) {
        setToolbarVisible(direction < 0);
        directionDistanceRef.current = 0;
      }
    },
    [setToolbarVisible],
  );

  const selectViewMode = (nextMode: 'series' | 'books') => {
    setViewMode(nextMode);
    lastScrollYRef.current = 0;
    directionDistanceRef.current = 0;
    setToolbarVisible(true);
  };

  const closeMenu = () => setOpenMenu(null);
  const listTopPadding = toolbarHeight + 10;

  const refreshSeriesPublication = async (seriesTitle: string, ownedLatestVolume?: number) => {
    if (refreshingSeriesTitle) return;
    setRefreshingSeriesTitle(seriesTitle);

    try {
      const result = await lookupLatestSeriesPublication(seriesTitle);
      if (!result) {
        Alert.alert(
          '刊行巻数を取得できませんでした',
          '書籍APIに同じシリーズの巻数情報が見つかりませんでした。',
        );
        return;
      }

      const safeResult = {
        ...result,
        latestVolume: Math.max(result.latestVolume, ownedLatestVolume ?? 0),
      };
      const cacheKey = normalizeSeriesKey(seriesTitle);
      setPublicationCache((current) => {
        const next = { ...current, [cacheKey]: safeResult };
        void AsyncStorage.setItem(SERIES_PUBLICATION_STORAGE_KEY, JSON.stringify(next));
        return next;
      });
    } catch (refreshError) {
      Alert.alert(
        '更新できませんでした',
        refreshError instanceof Error
          ? refreshError.message
          : '通信状態を確認して、もう一度お試しください。',
      );
    } finally {
      setRefreshingSeriesTitle(null);
    }
  };

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <HomeToolbar
        translateY={toolbarTranslateY}
        viewMode={viewMode}
        visibleCount={viewMode === 'series' ? visibleGroups.length : visibleBooks.length}
        totalCount={viewMode === 'series' ? seriesGroups.length : books.length}
        requiresAuth={requiresAuth}
        loading={loading}
        error={error}
        query={query}
        filterLabel={selectedFilterLabel}
        sortLabel={selectedSortLabel}
        onHeightChange={(nextHeight) => {
          if (nextHeight === toolbarHeight) return;
          setToolbarHeight(nextHeight);
          if (!toolbarVisibleRef.current) toolbarTranslateY.setValue(-nextHeight);
        }}
        onQueryChange={setQuery}
        onViewModeChange={selectViewMode}
        onOpenFilter={() => setOpenMenu('filter')}
        onOpenSort={() => setOpenMenu('sort')}
      />

      {viewMode === 'series' ? (
        <FlatList
          key="series-list"
          ref={seriesListRef}
          style={styles.list}
          data={visibleGroups}
          extraData={`${listVersion}-${refreshingSeriesTitle}-${showPublishedLatestVolume}`}
          keyExtractor={(item) => item.id}
          contentContainerStyle={[styles.grid, { paddingTop: listTopPadding }]}
          showsVerticalScrollIndicator={false}
          onScroll={handleScroll}
          scrollEventThrottle={16}
          renderItem={({ item }) => {
            const stats = seriesStats.get(item.title);
            const cacheKey = normalizeSeriesKey(item.title);
            const publicationInfo = publicationCache[cacheKey];
            return (
              <SeriesCard
                key={item.id}
                group={item}
                missingVolumes={stats?.missingVolumes ?? []}
                unownedVolumes={
                  showPublishedLatestVolume
                    ? getTrailingUnownedVolumes(item.latestVolume, publicationInfo?.latestVolume)
                    : []
                }
                completionRate={stats?.completionRate ?? 100}
                favorite={favoriteSeriesKeySet.has(cacheKey)}
                showPublishedLatestVolume={showPublishedLatestVolume}
                publicationInfo={publicationInfo}
                refreshing={refreshingSeriesTitle === item.title}
                refreshDisabled={refreshingSeriesTitle !== null}
                onToggleFavorite={() => toggleFavoriteSeries(item.title)}
                onRefresh={() => void refreshSeriesPublication(item.title, item.latestVolume)}
              />
            );
          }}
          ListEmptyComponent={
            !loading ? (
              <EmptyLibraryState requiresAuth={requiresAuth} libraryIsEmpty={books.length === 0} />
            ) : null
          }
        />
      ) : (
        <FlatList
          key="books-list"
          ref={booksListRef}
          style={styles.list}
          data={visibleBooks}
          extraData={listVersion}
          keyExtractor={(item) => item.id}
          contentContainerStyle={[styles.bookList, { paddingTop: listTopPadding }]}
          onScroll={handleScroll}
          scrollEventThrottle={16}
          renderItem={({ item }) => <BookRow book={item} />}
          ListEmptyComponent={
            !loading ? (
              <EmptyLibraryState requiresAuth={requiresAuth} libraryIsEmpty={books.length === 0} />
            ) : null
          }
        />
      )}

      <OptionSheet
        visible={openMenu !== null}
        title={
          openMenu === 'sort'
            ? '並び替え'
            : openMenu === 'author'
              ? '作者で絞る'
              : openMenu === 'publisher'
                ? '出版社で絞る'
                : '表示条件'
        }
        options={
          openMenu === 'sort'
            ? viewMode === 'series'
              ? seriesSortOptions
              : bookSortOptions
            : openMenu === 'author'
              ? [{ label: '作者指定を解除', value: 'all' }, ...metadataFilterOptions.authors]
              : openMenu === 'publisher'
                ? [
                    { label: '出版社指定を解除', value: 'all' },
                    ...metadataFilterOptions.publishers,
                  ]
                : filterCategoryOptions
        }
        selectedValue={
          openMenu === 'sort'
            ? viewMode === 'series'
              ? seriesSort
              : bookSort
            : openMenu === 'author'
              ? selectedMetadataFilter?.field === 'author'
                ? filter
                : 'all'
              : openMenu === 'publisher'
                ? selectedMetadataFilter?.field === 'publisher'
                  ? filter
                  : 'all'
                : selectedMetadataFilter?.field === 'author'
                  ? 'select-author'
                  : selectedMetadataFilter?.field === 'publisher'
                    ? 'select-publisher'
                    : filter
        }
        onBack={
          openMenu === 'author' || openMenu === 'publisher'
            ? () => setOpenMenu('filter')
            : undefined
        }
        onSelect={(value) => {
          if (openMenu === 'sort') {
            if (viewMode === 'series') setSeriesSort(value as SeriesSort);
            else setBookSort(value as BookSort);
          } else if (openMenu === 'filter' && value === 'select-author') {
            setOpenMenu('author');
            return;
          } else if (openMenu === 'filter' && value === 'select-publisher') {
            setOpenMenu('publisher');
            return;
          } else {
            setFilter(value as HomeFilter);
          }
          closeMenu();
        }}
        onClose={closeMenu}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  list: { flex: 1 },
  grid: { paddingBottom: 110, paddingHorizontal: 18 },
  bookList: { paddingBottom: 110, paddingHorizontal: 18 },
});
