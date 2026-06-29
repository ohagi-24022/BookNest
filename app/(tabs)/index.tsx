import { Link } from 'expo-router';
import { useMemo, useState } from 'react';
import {
  FlatList,
  Image,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  useColorScheme,
  View,
} from 'react-native';

import { useLibrary } from '../../src/store/LibraryContext';
import { ReadingStatus } from '../../src/types';

const filters: Array<{ label: string; value: ReadingStatus | 'all' }> = [
  { label: 'すべて', value: 'all' },
  { label: '未読', value: 'unread' },
  { label: '読書中', value: 'reading' },
  { label: '読了', value: 'read' },
];

export default function HomeScreen() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const { seriesGroups } = useLibrary();
  const [filter, setFilter] = useState<ReadingStatus | 'all'>('all');
  const [query, setQuery] = useState('');

  const visibleGroups = useMemo(
    () =>
      seriesGroups.filter((group) => {
        const matchesFilter =
          filter === 'all' ||
          (filter === 'unread' && group.unreadCount > 0) ||
          (filter === 'read' && group.readCount === group.ownedCount) ||
          (filter === 'reading' && group.representative.status === 'reading');
        const matchesQuery = group.title.toLowerCase().includes(query.toLowerCase());
        return matchesFilter && matchesQuery;
      }),
    [filter, query, seriesGroups],
  );

  return (
    <View style={[styles.screen, isDark && styles.screenDark]}>
      <View style={styles.header}>
        <Text style={[styles.title, isDark && styles.textLight]}>BookNest</Text>
        <Text style={[styles.subtitle, isDark && styles.textMutedDark]}>
          {seriesGroups.length} シリーズを管理中
        </Text>
      </View>

      <TextInput
        value={query}
        onChangeText={setQuery}
        placeholder="シリーズを検索"
        placeholderTextColor="#8a8a8a"
        style={[styles.search, isDark && styles.searchDark]}
      />

      <View style={styles.filterRow}>
        {filters.map((item) => (
          <Pressable
            key={item.value}
            onPress={() => setFilter(item.value)}
            style={[styles.filterButton, filter === item.value && styles.filterButtonActive]}
          >
            <Text style={[styles.filterText, filter === item.value && styles.filterTextActive]}>
              {item.label}
            </Text>
          </Pressable>
        ))}
      </View>

      <FlatList
        data={visibleGroups}
        keyExtractor={(item) => item.id}
        numColumns={2}
        columnWrapperStyle={styles.gridRow}
        contentContainerStyle={styles.grid}
        renderItem={({ item }) => (
          <Link href={`/series/${encodeURIComponent(item.title)}`} asChild>
            <Pressable style={[styles.seriesCard, isDark && styles.seriesCardDark]}>
              <Image source={{ uri: item.representative.thumbnailUrl }} style={styles.cover} />
              <View style={styles.cardBody}>
                <Text numberOfLines={2} style={[styles.seriesTitle, isDark && styles.textLight]}>
                  {item.title}
                </Text>
                <Text style={[styles.meta, isDark && styles.textMutedDark]}>
                  {item.ownedCount} 冊所持
                  {item.latestVolume ? ` / Vol. ${item.latestVolume}` : ''}
                </Text>
                <View style={styles.statusRow}>
                  {item.unreadCount > 0 && <Text style={styles.unreadBadge}>積読 {item.unreadCount}</Text>}
                  {item.readCount === item.ownedCount && <Text style={styles.readBadge}>読了</Text>}
                </View>
              </View>
            </Pressable>
          </Link>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#ffffff', paddingHorizontal: 18 },
  screenDark: { backgroundColor: '#050505' },
  header: { paddingTop: 18, paddingBottom: 16 },
  title: { color: '#050505', fontSize: 30, fontWeight: '800', letterSpacing: 0 },
  subtitle: { color: '#666666', fontSize: 14, marginTop: 4 },
  textLight: { color: '#f5f5f5' },
  textMutedDark: { color: '#a3a3a3' },
  search: {
    backgroundColor: '#f3f3f3',
    borderRadius: 8,
    color: '#111111',
    fontSize: 16,
    height: 44,
    paddingHorizontal: 14,
  },
  searchDark: { backgroundColor: '#171717', color: '#f5f5f5' },
  filterRow: { flexDirection: 'row', gap: 8, paddingVertical: 14 },
  filterButton: {
    borderColor: '#d4d4d4',
    borderRadius: 8,
    borderWidth: 1,
    height: 36,
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  filterButtonActive: { backgroundColor: '#111111', borderColor: '#111111' },
  filterText: { color: '#444444', fontSize: 13, fontWeight: '700' },
  filterTextActive: { color: '#ffffff' },
  grid: { paddingBottom: 24 },
  gridRow: { gap: 14 },
  seriesCard: {
    backgroundColor: '#ffffff',
    borderColor: '#e5e5e5',
    borderRadius: 8,
    borderWidth: 1,
    flex: 1,
    marginBottom: 14,
    overflow: 'hidden',
  },
  seriesCardDark: { backgroundColor: '#111111', borderColor: '#262626' },
  cover: { aspectRatio: 0.68, backgroundColor: '#e5e5e5', width: '100%' },
  cardBody: { minHeight: 100, padding: 10 },
  seriesTitle: { color: '#111111', fontSize: 15, fontWeight: '800', lineHeight: 19 },
  meta: { color: '#666666', fontSize: 12, marginTop: 6 },
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
});
