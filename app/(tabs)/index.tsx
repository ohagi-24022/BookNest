import AsyncStorage from '@react-native-async-storage/async-storage';
import { Link } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  FlatList,
  Modal,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { BookCover } from '../../src/components/BookCover';
import {
  lookupLatestSeriesPublication,
  SeriesPublicationInfo,
} from '../../src/lib/bookApis';
import { getMissingVolumes, normalizeSeriesKey } from '../../src/lib/series';
import { useAppSettings } from '../../src/store/AppSettingsContext';
import { useLibrary } from '../../src/store/LibraryContext';
import { useAppTheme } from '../../src/store/ThemeContext';
import { Book, ReadingStatus } from '../../src/types';

type HomeFilter = ReadingStatus | 'all' | 'missing';
type SeriesSort = 'title' | 'recent' | 'missing' | 'unread' | 'completion';
type SeriesPublicationCache = Record<string, SeriesPublicationInfo>;

const SERIES_PUBLICATION_STORAGE_KEY = 'booknest.series-publication.v1';

const filters: Array<{ label: string; value: HomeFilter }> = [
  { label: 'すべて', value: 'all' },
  { label: '未読', value: 'unread' },
  { label: '読書中', value: 'reading' },
  { label: '読了', value: 'read' },
  { label: '巻抜け', value: 'missing' },
];

const seriesSortOptions: Array<{ label: string; value: SeriesSort }> = [
  { label: '名前順', value: 'title' },
  { label: '最近追加', value: 'recent' },
  { label: '巻抜け優先', value: 'missing' },
  { label: '積読優先', value: 'unread' },
  { label: '所持率順', value: 'completion' },
];

export default function HomeScreen() {
  const { colors } = useAppTheme();
  const { showPublishedLatestVolume } = useAppSettings();
  const { books, error, loading, requiresAuth, seriesGroups } = useLibrary();
  const [filter, setFilter] = useState<HomeFilter>('all');
  const [viewMode, setViewMode] = useState<'series' | 'books'>('series');
  const [seriesSort, setSeriesSort] = useState<SeriesSort>('title');
  const [query, setQuery] = useState('');
  const [openMenu, setOpenMenu] = useState<'filter' | 'sort' | null>(null);
  const [toolbarHeight, setToolbarHeight] = useState(152);
  const [publicationCache, setPublicationCache] = useState<SeriesPublicationCache>({});
  const [refreshingSeriesTitle, setRefreshingSeriesTitle] = useState<string | null>(null);
  const toolbarTranslateY = useRef(new Animated.Value(0)).current;
  const toolbarVisibleRef = useRef(true);
  const lastScrollYRef = useRef(0);
  const directionDistanceRef = useRef(0);
  const lastDirectionRef = useRef<1 | -1>(1);

  useEffect(() => {
    AsyncStorage.getItem(SERIES_PUBLICATION_STORAGE_KEY)
      .then((storedCache) => {
        if (storedCache) setPublicationCache(JSON.parse(storedCache) as SeriesPublicationCache);
      })
      .catch((cacheError) => {
        console.warn('Failed to load series publication cache', cacheError);
      });
  }, []);
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
    const filtered = seriesGroups.filter((group) => {
      const stats = seriesStats.get(group.title);
      const matchesFilter =
        filter === 'all' ||
        (filter === 'unread' && group.unreadCount > 0) ||
        (filter === 'reading' && group.readingCount > 0) ||
        (filter === 'read' && group.readCount === group.ownedCount) ||
        (filter === 'missing' && (stats?.missingVolumes.length ?? 0) > 0);
      const matchesQuery = group.title.toLowerCase().includes(query.toLowerCase());
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
      return left.title.localeCompare(right.title);
    });
  }, [filter, query, seriesGroups, seriesSort, seriesStats]);
  const visibleBooks = useMemo(
    () =>
      books.filter((book) => {
        const matchesFilter =
          filter === 'all' ||
          (filter === 'missing'
            ? (seriesStats.get(book.seriesTitle)?.missingVolumes.length ?? 0) > 0
            : book.status === filter);
        const keyword = query.toLowerCase();
        const matchesQuery =
          book.title.toLowerCase().includes(keyword) ||
          book.seriesTitle.toLowerCase().includes(keyword) ||
          (book.author?.toLowerCase().includes(keyword) ?? false);
        return matchesFilter && matchesQuery;
      }),
    [books, filter, query, seriesStats],
  );
  const renderCover = (book: Book) => (
    <BookCover thumbnailUrl={book.thumbnailUrl} isbn={book.isbn} style={styles.cover} />
  );
  const listVersion = `${books.length}-${seriesGroups.length}-${filter}-${query}`;
  const selectedFilterLabel = filters.find((option) => option.value === filter)?.label ?? 'すべて';
  const selectedSortLabel =
    seriesSortOptions.find((option) => option.value === seriesSort)?.label ?? '名前順';

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
      <Animated.View
        onLayout={(event) => {
          const nextHeight = Math.ceil(event.nativeEvent.layout.height);
          if (nextHeight === toolbarHeight) return;
          setToolbarHeight(nextHeight);
          if (!toolbarVisibleRef.current) toolbarTranslateY.setValue(-nextHeight);
        }}
        style={[
          styles.toolbar,
          {
            backgroundColor: colors.background,
            borderBottomColor: colors.border,
            transform: [{ translateY: toolbarTranslateY }],
          },
        ]}
      >
        <View style={styles.titleRow}>
          <View style={styles.titleBlock}>
            <Text style={[styles.title, { color: colors.text }]}>BookNest</Text>
            <Text style={[styles.subtitle, { color: colors.muted }]}>
              {requiresAuth
                ? '設定からログインしてください'
                : viewMode === 'series'
                  ? `${visibleGroups.length}/${seriesGroups.length} シリーズ`
                  : `${visibleBooks.length}/${books.length} 冊`}
            </Text>
          </View>
        </View>

        {loading && (
          <View style={[styles.notice, { backgroundColor: colors.elevated }]}>
            <ActivityIndicator color={colors.text} />
            <Text style={[styles.noticeText, { color: colors.text }]}>蔵書を読み込んでいます</Text>
          </View>
        )}

        {!!error && (
          <View style={[styles.notice, { backgroundColor: '#ffeceb' }]}>
            <Text style={[styles.noticeText, { color: colors.danger }]}>{error}</Text>
          </View>
        )}

        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="本棚を検索"
          placeholderTextColor={colors.muted}
          style={[styles.search, { backgroundColor: colors.input, color: colors.text }]}
        />

        <View style={styles.controlRow}>
          <View style={[styles.modeSwitch, { backgroundColor: colors.elevated }]}>
            {[
              ['series', 'シリーズ'],
              ['books', '全冊'],
            ].map(([value, label]) => (
              <Pressable
                key={value}
                onPress={() => selectViewMode(value as 'series' | 'books')}
                style={[styles.modeButton, viewMode === value && { backgroundColor: colors.text }]}
              >
                <Text style={[styles.modeText, { color: viewMode === value ? colors.background : colors.muted }]}>
                  {label}
                </Text>
              </Pressable>
            ))}
          </View>
          <Pressable
            onPress={() => setOpenMenu('filter')}
            style={[styles.menuButton, { borderColor: colors.border }]}
          >
            <Text numberOfLines={1} style={[styles.menuButtonText, { color: colors.text }]}>
              条件: {selectedFilterLabel}
            </Text>
            <Text style={[styles.menuChevron, { color: colors.muted }]}>▼</Text>
          </Pressable>
          {viewMode === 'series' && (
            <Pressable
              onPress={() => setOpenMenu('sort')}
              style={[styles.menuButton, { borderColor: colors.border }]}
            >
              <Text numberOfLines={1} style={[styles.menuButtonText, { color: colors.text }]}>
                並び: {selectedSortLabel}
              </Text>
              <Text style={[styles.menuChevron, { color: colors.muted }]}>▼</Text>
            </Pressable>
          )}
        </View>
      </Animated.View>

      {viewMode === 'series' ? (
        <ScrollView
          key={`series-grid-${listVersion}`}
          style={styles.list}
          contentContainerStyle={[styles.grid, { paddingTop: listTopPadding }]}
          showsVerticalScrollIndicator={false}
          onScroll={handleScroll}
          scrollEventThrottle={16}
        >
          {visibleGroups.map((item) => (
            <Link key={item.id} href={`/series/${encodeURIComponent(item.title)}`} asChild>
              <Pressable style={[styles.seriesRow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                {renderCover(item.representative)}
                <View style={styles.seriesRowBody}>
                  <View style={styles.seriesHeadingRow}>
                    <Text numberOfLines={2} style={[styles.seriesTitle, { color: colors.text }]}>
                      {item.title}
                    </Text>
                    {showPublishedLatestVolume && (
                      <Pressable
                        disabled={refreshingSeriesTitle !== null}
                        onPress={(event) => {
                          event.stopPropagation();
                          void refreshSeriesPublication(item.title, item.latestVolume);
                        }}
                        style={[
                          styles.refreshButton,
                          { borderColor: colors.border },
                          refreshingSeriesTitle !== null && styles.refreshButtonDisabled,
                        ]}
                      >
                        <Text style={[styles.refreshButtonText, { color: colors.text }]}>
                          {refreshingSeriesTitle === item.title ? '更新中' : '更新'}
                        </Text>
                      </Pressable>
                    )}
                  </View>
                  <Text style={[styles.meta, { color: colors.muted }]}>
                    {item.ownedCount} 冊所持
                    {showPublishedLatestVolume
                      ? publicationCache[normalizeSeriesKey(item.title)]
                        ? ` / 刊行 ${publicationCache[normalizeSeriesKey(item.title)].latestVolume}巻まで`
                        : ' / 刊行巻数 未取得'
                      : item.latestVolume
                        ? ` / ${item.latestVolume}巻まで`
                        : ''}
                  </Text>
                  <View style={[styles.progressTrack, { backgroundColor: colors.elevated }]}>
                    <View
                      style={[
                        styles.progressFill,
                        {
                          backgroundColor:
                            (seriesStats.get(item.title)?.missingVolumes.length ?? 0) > 0
                              ? '#765100'
                              : colors.success,
                          width: `${Math.min(seriesStats.get(item.title)?.completionRate ?? 100, 100)}%`,
                        },
                      ]}
                    />
                  </View>
                  <View style={styles.statusRow}>
                    {item.unreadCount > 0 && <Text style={styles.unreadBadge}>積読 {item.unreadCount}</Text>}
                    {(seriesStats.get(item.title)?.missingVolumes.length ?? 0) > 0 && (
                      <Text style={styles.missingBadge}>
                        不足 {seriesStats.get(item.title)?.missingVolumes.length}
                      </Text>
                    )}
                    {item.readCount === item.ownedCount && <Text style={styles.readBadge}>読了</Text>}
                  </View>
                </View>
              </Pressable>
            </Link>
          ))}
          {visibleGroups.length === 0 && !loading ? (
            <View style={styles.empty}>
              <Text style={[styles.emptyTitle, { color: colors.text }]}>
                {requiresAuth ? 'ログイン待ちです' : 'まだ本がありません'}
              </Text>
              <Text style={[styles.emptyCopy, { color: colors.muted }]}>
                {requiresAuth
                  ? '設定タブでSupabase Authにログインすると、本棚が同期されます。'
                  : '中央タブからISBNをスキャンするか、手動登録してください。'}
              </Text>
            </View>
          ) : null}
        </ScrollView>
      ) : (
        <FlatList
          key="books-list"
          style={styles.list}
          data={visibleBooks}
          extraData={listVersion}
          keyExtractor={(item) => item.id}
          contentContainerStyle={[styles.bookList, { paddingTop: listTopPadding }]}
          onScroll={handleScroll}
          scrollEventThrottle={16}
          renderItem={({ item }) => (
            <Link href={`/series/${encodeURIComponent(item.seriesTitle)}`} asChild>
              <Pressable style={[styles.bookRow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <BookCover thumbnailUrl={item.thumbnailUrl} isbn={item.isbn} style={styles.rowCover} />
                <View style={styles.bookRowBody}>
                  <Text numberOfLines={2} style={[styles.bookTitle, { color: colors.text }]}>
                    {item.title}
                  </Text>
                  <Text style={[styles.meta, { color: colors.muted }]} numberOfLines={2}>
                    {item.seriesTitle}
                    {item.volumeNumber ? ` / ${item.volumeNumber}巻` : ''}
                  </Text>
                </View>
              </Pressable>
            </Link>
          )}
          ListEmptyComponent={
          !loading ? (
            <View style={styles.empty}>
              <Text style={[styles.emptyTitle, { color: colors.text }]}>表示できる本がありません</Text>
            </View>
          ) : null
        }
        />
      )}

      <Modal
        animationType="fade"
        onRequestClose={closeMenu}
        transparent
        visible={openMenu !== null}
      >
        <Pressable onPress={closeMenu} style={styles.modalBackdrop}>
          <Pressable
            onPress={(event) => event.stopPropagation()}
            style={[styles.optionSheet, { backgroundColor: colors.surface }]}
          >
            <Text style={[styles.optionTitle, { color: colors.text }]}>
              {openMenu === 'sort' ? '並び替え' : '表示条件'}
            </Text>
            {(openMenu === 'sort' ? seriesSortOptions : filters).map((option) => {
              const selected =
                openMenu === 'sort' ? option.value === seriesSort : option.value === filter;
              return (
                <Pressable
                  key={option.value}
                  onPress={() => {
                    if (openMenu === 'sort') {
                      setSeriesSort(option.value as SeriesSort);
                    } else {
                      setFilter(option.value as HomeFilter);
                    }
                    closeMenu();
                  }}
                  style={[styles.optionRow, { borderBottomColor: colors.border }]}
                >
                  <View
                    style={[
                      styles.checkbox,
                      { borderColor: selected ? colors.text : colors.border },
                      selected && { backgroundColor: colors.text },
                    ]}
                  >
                    <Text style={[styles.checkmark, { color: colors.background }]}>
                      {selected ? '✓' : ''}
                    </Text>
                  </View>
                  <Text style={[styles.optionText, { color: colors.text }]}>{option.label}</Text>
                </Pressable>
              );
            })}
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  toolbar: {
    borderBottomWidth: 1,
    left: 0,
    paddingBottom: 10,
    paddingHorizontal: 18,
    paddingTop: 12,
    position: 'absolute',
    right: 0,
    top: 0,
    zIndex: 20,
  },
  titleRow: { alignItems: 'center', flexDirection: 'row', minHeight: 38 },
  titleBlock: { flex: 1 },
  title: { fontSize: 24, fontWeight: '800', letterSpacing: 0 },
  subtitle: { fontSize: 12, marginTop: 1 },
  search: {
    borderRadius: 8,
    fontSize: 14,
    height: 38,
    marginTop: 8,
    paddingHorizontal: 12,
  },
  controlRow: { flexDirection: 'row', gap: 6, marginTop: 8 },
  modeSwitch: {
    borderRadius: 8,
    flex: 1.2,
    flexDirection: 'row',
    padding: 3,
  },
  modeButton: { alignItems: 'center', borderRadius: 6, flex: 1, height: 32, justifyContent: 'center' },
  modeText: { fontSize: 12, fontWeight: '800' },
  menuButton: {
    alignItems: 'center',
    borderRadius: 8,
    borderWidth: 1,
    flex: 1,
    flexDirection: 'row',
    height: 38,
    justifyContent: 'center',
    minWidth: 0,
    paddingHorizontal: 8,
  },
  menuButtonText: { flexShrink: 1, fontSize: 11, fontWeight: '800' },
  menuChevron: { fontSize: 8, marginLeft: 4 },
  notice: {
    alignItems: 'center',
    borderRadius: 8,
    flexDirection: 'row',
    gap: 10,
    marginTop: 8,
    minHeight: 44,
    paddingHorizontal: 12,
  },
  noticeText: { flex: 1, fontSize: 13, fontWeight: '700' },
  list: { flex: 1 },
  grid: { paddingBottom: 110, paddingHorizontal: 18 },
  bookList: { paddingBottom: 110, paddingHorizontal: 18 },
  seriesCard: {
    borderRadius: 8,
    borderWidth: 1,
    flex: 1,
    marginBottom: 14,
    overflow: 'hidden',
  },
  seriesRow: {
    alignItems: 'center',
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 12,
    marginBottom: 10,
    padding: 10,
  },
  seriesRowBody: { flex: 1 },
  seriesHeadingRow: { alignItems: 'flex-start', flexDirection: 'row', gap: 8 },
  cover: { backgroundColor: '#e5e5e5', borderRadius: 4, height: 120, width: 82 },
  coverFallback: { alignItems: 'center', justifyContent: 'center' },
  coverFallbackText: { color: '#777777', fontSize: 12, fontWeight: '800' },
  rowCover: { backgroundColor: '#e5e5e5', borderRadius: 4, height: 96, width: 66 },
  cardBody: { minHeight: 100, padding: 10 },
  seriesTitle: { flex: 1, fontSize: 15, fontWeight: '800', lineHeight: 19 },
  refreshButton: {
    alignItems: 'center',
    borderRadius: 6,
    borderWidth: 1,
    height: 30,
    justifyContent: 'center',
    minWidth: 48,
    paddingHorizontal: 8,
  },
  refreshButtonDisabled: { opacity: 0.4 },
  refreshButtonText: { fontSize: 11, fontWeight: '800' },
  bookRow: {
    alignItems: 'center',
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 12,
    marginBottom: 10,
    padding: 10,
  },
  bookRowBody: { flex: 1 },
  bookTitle: { fontSize: 16, fontWeight: '800', lineHeight: 21 },
  meta: { fontSize: 12, marginTop: 6 },
  progressTrack: {
    borderRadius: 999,
    height: 5,
    marginTop: 10,
    overflow: 'hidden',
  },
  progressFill: { height: '100%' },
  statusRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 },
  unreadBadge: {
    backgroundColor: '#f5f5f5',
    borderRadius: 6,
    color: '#333333',
    fontSize: 11,
    fontWeight: '700',
    paddingHorizontal: 7,
    paddingVertical: 4,
  },
  readBadge: {
    backgroundColor: '#e8f7ee',
    borderRadius: 6,
    color: '#128a3f',
    fontSize: 11,
    fontWeight: '700',
    paddingHorizontal: 7,
    paddingVertical: 4,
  },
  missingBadge: {
    backgroundColor: '#fff7df',
    borderRadius: 6,
    color: '#765100',
    fontSize: 11,
    fontWeight: '700',
    paddingHorizontal: 7,
    paddingVertical: 4,
  },
  empty: { alignItems: 'center', paddingHorizontal: 20, paddingTop: 64 },
  emptyTitle: { fontSize: 18, fontWeight: '800' },
  emptyCopy: { fontSize: 14, lineHeight: 20, marginTop: 8, textAlign: 'center' },
  modalBackdrop: {
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.35)',
    flex: 1,
    justifyContent: 'center',
    padding: 24,
  },
  optionSheet: {
    borderRadius: 8,
    maxWidth: 360,
    overflow: 'hidden',
    paddingHorizontal: 16,
    paddingTop: 16,
    width: '100%',
  },
  optionTitle: { fontSize: 17, fontWeight: '900', marginBottom: 6 },
  optionRow: {
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    minHeight: 50,
  },
  checkbox: {
    alignItems: 'center',
    borderRadius: 4,
    borderWidth: 1,
    height: 22,
    justifyContent: 'center',
    marginRight: 12,
    width: 22,
  },
  checkmark: { fontSize: 14, fontWeight: '900' },
  optionText: { fontSize: 15, fontWeight: '700' },
});
