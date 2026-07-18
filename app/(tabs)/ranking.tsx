import Ionicons from '@expo/vector-icons/Ionicons';
import { useScrollToTop } from '@react-navigation/native';
import { router } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import { RankingCard } from '../../src/components/RankingCard';
import { buildPurchaseUrl } from '../../src/lib/bookApis';
import {
  buildRankingRows,
  GlobalRankingRow,
  RankingCategory,
  rankingCategories,
  rankingCategoryLabels,
} from '../../src/lib/rankings';
import { buildSeriesGroups } from '../../src/lib/seriesSelectors';
import { normalizeSeriesKey } from '../../src/lib/series';
import { supabase } from '../../src/lib/supabase';
import { isMissingSupabaseFunctionError } from '../../src/lib/supabaseErrors';
import { useAuth } from '../../src/store/AuthContext';
import { useLibrary } from '../../src/store/LibraryContext';
import { useAppTheme } from '../../src/store/ThemeContext';
import { useWishlist } from '../../src/store/WishlistContext';

type LocalSeriesCover = {
  coverUrl?: string;
  isbn?: string;
};

export default function RankingScreen() {
  const { colors } = useAppTheme();
  const { user } = useAuth();
  const { books } = useLibrary();
  const { addItem, items } = useWishlist();
  const [globalRows, setGlobalRows] = useState<GlobalRankingRow[]>([]);
  const [globalFavoriteRows, setGlobalFavoriteRows] = useState<GlobalRankingRow[]>([]);
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<ScrollView>(null);
  const tabScrollToTopRef = useRef({
    scrollToTop: () => scrollRef.current?.scrollTo({ y: 0, animated: true }),
  });
  const addedTitles = useMemo(() => new Set(items.map((item) => normalizeRankingTitle(item.title))), [items]);
  const localSeriesCoverByKey = useMemo(
    () =>
      new Map(
        buildSeriesGroups(books)
          .filter((group) => !!group.representative.thumbnailUrl || !!group.representative.isbn)
          .map((group) => [
            normalizeLooseSeriesKey(group.title),
            {
              coverUrl: group.representative.thumbnailUrl,
              isbn: group.representative.isbn,
            } satisfies LocalSeriesCover,
          ]),
      ),
    [books],
  );
  useScrollToTop(tabScrollToTopRef);
  const sections = useMemo(
    () =>
      rankingCategories.map((category) => ({
        category,
        rows: buildRankingRows(category, category === 'favorite' ? globalFavoriteRows : globalRows, items).map((row) => {
          const localCover = resolveLocalSeriesCover(row.title, localSeriesCoverByKey);
          return {
            ...row,
            ...localCover,
            coverUrl: localCover?.coverUrl ?? row.coverUrl,
            preferIsbnCover: !!localCover?.isbn && !localCover.coverUrl,
          };
        }),
        ...rankingCategoryLabels[category],
      })),
    [globalFavoriteRows, globalRows, items, localSeriesCoverByKey],
  );

  const loadRankings = async () => {
    if (!user) {
      setError('ランキングはログイン後に確認できます。');
      setGlobalRows([]);
      setGlobalFavoriteRows([]);
      return;
    }
    if (!supabase) {
      setError('Supabaseが未設定のため、ランキングを取得できません。');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const { data, error: rpcError } = await supabase.rpc('get_wanted_manga_rankings', { limit_count: 50 });
      if (rpcError) throw rpcError;
      setGlobalRows((data ?? []) as GlobalRankingRow[]);
      const { data: favoriteData, error: favoriteRpcError } = await supabase.rpc('get_favorite_series_rankings', {
        limit_count: 50,
      });
      if (favoriteRpcError) {
        if (!isMissingSupabaseFunctionError(favoriteRpcError)) {
          console.warn('Failed to load favorite rankings', favoriteRpcError);
        }
        setGlobalFavoriteRows([]);
      } else {
        setGlobalFavoriteRows((favoriteData ?? []) as GlobalRankingRow[]);
      }
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'ランキングを取得できませんでした。');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadRankings();
  }, [user]);

  return (
    <ScrollView
      ref={scrollRef}
      style={[styles.screen, { backgroundColor: colors.background }]}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl refreshing={loading} onRefresh={() => void loadRankings()} tintColor={colors.text} />
      }
    >
      <Pressable onPress={() => setExpandedKey(null)} style={styles.header}>
        <View style={styles.titleRow}>
          <Text style={[styles.title, { color: colors.text }]}>ランキング</Text>
        </View>
        <Text style={[styles.copy, { color: colors.muted }]}>
          カテゴリごとに上位10件を表示します。画面上部から下に引くと最新のランキングに更新できます。
        </Text>
      </Pressable>

      {error ? <EmptyState icon="cloud-offline-outline" text={error} /> : null}

      {sections.map((section) => (
        <RankingShelf
          key={section.category}
          category={section.category}
          addedTitles={addedTitles}
          description={section.description}
          expandedKey={expandedKey}
          onAddWishlist={
            section.category === 'personal'
              ? undefined
              : (row) =>
                  addItem({
                    title: row.title,
                    score: row.score ?? 75,
                    coverUrl: row.coverUrl,
                    purchaseUrl: buildPurchaseUrl(row.title),
                  })
          }
          onClearExpanded={() => setExpandedKey(null)}
          onToggleExpanded={(key) => setExpandedKey((current) => (current === key ? null : key))}
          rows={section.rows}
          title={section.title}
        />
      ))}
    </ScrollView>
  );
}

function RankingShelf({
  addedTitles,
  category,
  description,
  expandedKey,
  onAddWishlist,
  onClearExpanded,
  onToggleExpanded,
  rows,
  title,
}: {
  addedTitles: Set<string>;
  category: RankingCategory;
  description: string;
  expandedKey: string | null;
  onAddWishlist?: (row: ReturnType<typeof buildRankingRows>[number]) => void;
  onClearExpanded: () => void;
  onToggleExpanded: (key: string) => void;
  rows: ReturnType<typeof buildRankingRows>;
  title: string;
}) {
  const { colors } = useAppTheme();
  const topRows = rows.slice(0, 10);

  return (
    <View style={styles.section}>
      <Pressable onPress={onClearExpanded} style={styles.sectionHeader}>
        <View style={styles.sectionTitleBlock}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>{title}</Text>
          <Text style={[styles.copy, { color: colors.muted }]}>{description}</Text>
        </View>
      </Pressable>

      {topRows.length === 0 ? (
        <EmptyState icon="podium-outline" text="まだ表示できるデータがありません。" />
      ) : (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.horizontalList}
        >
          {topRows.map((row, index) => {
            const key = `${category}-${row.title}-${index}`;
            return (
              <RankingCard
                key={key}
                added={addedTitles.has(normalizeRankingTitle(row.title))}
                expanded={expandedKey === key}
                index={index}
                onAddWishlist={onAddWishlist ? () => onAddWishlist(row) : undefined}
                onPress={onAddWishlist ? () => onToggleExpanded(key) : undefined}
                row={row}
                variant="compact"
              />
            );
          })}
          {rows.length > 10 ? (
            <Pressable
              accessibilityLabel={`${title}をもっと見る`}
              onPress={() => router.push(`/(tabs)/ranking/${category}`)}
              style={[styles.moreTailCard, { borderColor: colors.border }]}
            >
              <Ionicons color={colors.text} name="chevron-forward-circle-outline" size={24} />
              <Text style={[styles.moreTailText, { color: colors.text }]}>もっと見る</Text>
              <Text style={[styles.moreTailSubText, { color: colors.muted }]}>11位以降</Text>
            </Pressable>
          ) : null}
        </ScrollView>
      )}
    </View>
  );
}

function normalizeRankingTitle(value: string) {
  return value.normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim();
}

function normalizeLooseSeriesKey(value: string) {
  return normalizeSeriesKey(value).replace(/[!！?？。．.・･]/g, '');
}

function resolveLocalSeriesCover(title: string, covers: Map<string, LocalSeriesCover>) {
  const key = normalizeLooseSeriesKey(title);
  const exact = covers.get(key);
  if (exact) return exact;
  return [...covers.entries()].find(([candidateKey]) => candidateKey.includes(key) || key.includes(candidateKey))?.[1];
}

function EmptyState({
  icon,
  text,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  text: string;
}) {
  const { colors } = useAppTheme();

  return (
    <View style={[styles.emptyBox, { borderColor: colors.border }]}>
      <Ionicons color={colors.muted} name={icon} size={24} />
      <Text style={[styles.copy, { color: colors.muted }]}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { gap: 30, padding: 18, paddingBottom: 40 },
  header: { gap: 5 },
  titleRow: { alignItems: 'center', flexDirection: 'row', gap: 10 },
  title: { flex: 1, fontSize: 24, fontWeight: '900' },
  copy: { fontSize: 13, lineHeight: 18 },
  section: { gap: 12 },
  sectionHeader: { alignItems: 'flex-start', flexDirection: 'row', gap: 12 },
  sectionTitleBlock: { flex: 1, gap: 3 },
  sectionTitle: { fontSize: 18, fontWeight: '900' },
  moreTailCard: {
    alignItems: 'center',
    borderRadius: 8,
    borderWidth: 1,
    gap: 6,
    height: 196,
    justifyContent: 'center',
    padding: 10,
    width: 136,
  },
  moreTailText: { fontSize: 13, fontWeight: '900' },
  moreTailSubText: { fontSize: 11, fontWeight: '800' },
  horizontalList: { alignItems: 'flex-start', gap: 10, minHeight: 250, paddingRight: 8 },
  emptyBox: { alignItems: 'center', borderRadius: 8, borderWidth: 1, gap: 6, padding: 18 },
});
