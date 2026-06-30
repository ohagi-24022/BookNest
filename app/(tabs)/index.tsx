import { Link } from 'expo-router';
import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { BookCover } from '../../src/components/BookCover';
import { getMissingVolumes } from '../../src/lib/series';
import { useLibrary } from '../../src/store/LibraryContext';
import { useAppTheme } from '../../src/store/ThemeContext';
import { Book, ReadingStatus } from '../../src/types';

type HomeFilter = ReadingStatus | 'all' | 'missing';

const filters: Array<{ label: string; value: HomeFilter }> = [
  { label: 'すべて', value: 'all' },
  { label: '未読', value: 'unread' },
  { label: '読書中', value: 'reading' },
  { label: '読了', value: 'read' },
  { label: '巻抜け', value: 'missing' },
];

export default function HomeScreen() {
  const { colors } = useAppTheme();
  const { books, error, loading, requiresAuth, seriesGroups } = useLibrary();
  const [filter, setFilter] = useState<HomeFilter>('all');
  const [viewMode, setViewMode] = useState<'series' | 'books'>('series');
  const [query, setQuery] = useState('');
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
  const totalMissingCount = useMemo(
    () => [...seriesStats.values()].reduce((total, stats) => total + stats.missingVolumes.length, 0),
    [seriesStats],
  );

  const visibleGroups = useMemo(
    () =>
      seriesGroups.filter((group) => {
        const matchesFilter =
          filter === 'all' ||
          filter === 'unread' ||
          filter === 'read' ||
          filter === 'reading' ||
          (filter === 'missing' && (seriesStats.get(group.title)?.missingVolumes.length ?? 0) > 0);
        const matchesQuery = group.title.toLowerCase().includes(query.toLowerCase());
        return matchesFilter && matchesQuery;
      }),
    [filter, query, seriesGroups, seriesStats],
  );
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

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.text }]}>BookNest</Text>
        <Text style={[styles.subtitle, { color: colors.muted }]}>
          {requiresAuth
            ? '設定からログインしてください'
            : `${seriesGroups.length} シリーズ / ${books.length} 冊`}
        </Text>
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

      <View style={[styles.summaryRow, { backgroundColor: colors.elevated }]}>
        <View style={styles.summaryItem}>
          <Text style={[styles.summaryValue, { color: colors.text }]}>{books.length}</Text>
          <Text style={[styles.summaryLabel, { color: colors.muted }]}>冊</Text>
        </View>
        <View style={styles.summaryItem}>
          <Text style={[styles.summaryValue, { color: colors.text }]}>
            {books.filter((book) => book.status === 'unread').length}
          </Text>
          <Text style={[styles.summaryLabel, { color: colors.muted }]}>積読</Text>
        </View>
        <View style={styles.summaryItem}>
          <Text style={[styles.summaryValue, { color: totalMissingCount > 0 ? '#765100' : colors.text }]}>
            {totalMissingCount}
          </Text>
          <Text style={[styles.summaryLabel, { color: colors.muted }]}>巻抜け</Text>
        </View>
      </View>

      <TextInput
        value={query}
        onChangeText={setQuery}
        placeholder="シリーズを検索"
        placeholderTextColor={colors.muted}
        style={[styles.search, { backgroundColor: colors.input, color: colors.text }]}
      />

      <View style={[styles.modeSwitch, { backgroundColor: colors.elevated }]}>
        {[
          ['series', 'シリーズ'],
          ['books', '全冊'],
        ].map(([value, label]) => (
          <Pressable
            key={value}
            onPress={() => setViewMode(value as 'series' | 'books')}
            style={[styles.modeButton, viewMode === value && { backgroundColor: colors.text }]}
          >
            <Text style={[styles.modeText, { color: viewMode === value ? colors.background : colors.muted }]}>
              {label}
            </Text>
          </Pressable>
        ))}
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.filterScroller}
        contentContainerStyle={styles.filterRow}
      >
        {filters.map((item) => (
            <Pressable
              key={item.value}
              onPress={() => setFilter(item.value)}
              style={[
                styles.filterButton,
                { borderColor: colors.border },
                filter === item.value && { backgroundColor: colors.text, borderColor: colors.text },
              ]}
            >
              <Text style={[styles.filterText, { color: filter === item.value ? colors.background : colors.muted }]}>
                {item.label}
              </Text>
            </Pressable>
          ))}
      </ScrollView>

      <Text style={[styles.visibleCount, { color: colors.muted }]}>
        {viewMode === 'series'
          ? `${visibleGroups.length} / ${seriesGroups.length} シリーズ表示`
          : `${visibleBooks.length} / ${books.length} 冊表示`}
      </Text>

      {viewMode === 'series' ? (
        <ScrollView
          key={`series-grid-${listVersion}`}
          style={styles.list}
          contentContainerStyle={styles.grid}
          showsVerticalScrollIndicator={false}
        >
          {visibleGroups.map((item) => (
            <Link key={item.id} href={`/series/${encodeURIComponent(item.title)}`} asChild>
              <Pressable style={[styles.seriesRow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                {renderCover(item.representative)}
                <View style={styles.seriesRowBody}>
                  <Text numberOfLines={2} style={[styles.seriesTitle, { color: colors.text }]}>
                    {item.title}
                  </Text>
                  <Text style={[styles.meta, { color: colors.muted }]}>
                    {item.ownedCount} 冊所持
                    {item.latestVolume ? ` / ${item.latestVolume}巻まで` : ''}
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
          contentContainerStyle={styles.bookList}
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
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, paddingHorizontal: 18 },
  header: { paddingTop: 18, paddingBottom: 16 },
  title: { fontSize: 30, fontWeight: '800', letterSpacing: 0 },
  subtitle: { fontSize: 14, marginTop: 4 },
  search: {
    borderRadius: 8,
    fontSize: 16,
    height: 44,
    paddingHorizontal: 14,
  },
  modeSwitch: {
    borderRadius: 8,
    flexDirection: 'row',
    marginTop: 12,
    padding: 4,
  },
  modeButton: { alignItems: 'center', borderRadius: 6, flex: 1, height: 36, justifyContent: 'center' },
  modeText: { fontSize: 13, fontWeight: '800' },
  notice: {
    alignItems: 'center',
    borderRadius: 8,
    flexDirection: 'row',
    gap: 10,
    marginBottom: 12,
    minHeight: 44,
    paddingHorizontal: 12,
  },
  noticeText: { flex: 1, fontSize: 13, fontWeight: '700' },
  summaryRow: {
    borderRadius: 8,
    flexDirection: 'row',
    marginBottom: 12,
    padding: 12,
  },
  summaryItem: { alignItems: 'center', flex: 1 },
  summaryValue: { fontSize: 20, fontWeight: '900' },
  summaryLabel: { fontSize: 12, fontWeight: '700', marginTop: 2 },
  filterScroller: { flexGrow: 0 },
  filterRow: { flexDirection: 'row', gap: 8, paddingVertical: 14 },
  filterButton: {
    borderRadius: 8,
    borderWidth: 1,
    height: 36,
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  filterText: { fontSize: 13, fontWeight: '700' },
  visibleCount: { fontSize: 12, fontWeight: '700', marginBottom: 8 },
  list: { flex: 1 },
  grid: { paddingBottom: 110 },
  bookList: { paddingBottom: 110 },
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
  cover: { backgroundColor: '#e5e5e5', borderRadius: 4, height: 120, width: 82 },
  coverFallback: { alignItems: 'center', justifyContent: 'center' },
  coverFallbackText: { color: '#777777', fontSize: 12, fontWeight: '800' },
  rowCover: { backgroundColor: '#e5e5e5', borderRadius: 4, height: 96, width: 66 },
  cardBody: { minHeight: 100, padding: 10 },
  seriesTitle: { fontSize: 15, fontWeight: '800', lineHeight: 19 },
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
});
