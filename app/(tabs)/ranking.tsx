import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { RankingCard } from '../../src/components/RankingCard';
import {
  buildRankingRows,
  GlobalRankingRow,
  RankingCategory,
  rankingCategories,
  rankingCategoryLabels,
} from '../../src/lib/rankings';
import { supabase } from '../../src/lib/supabase';
import { useAuth } from '../../src/store/AuthContext';
import { useAppTheme } from '../../src/store/ThemeContext';
import { useWishlist } from '../../src/store/WishlistContext';

export default function RankingScreen() {
  const { colors } = useAppTheme();
  const { user } = useAuth();
  const { items } = useWishlist();
  const [globalRows, setGlobalRows] = useState<GlobalRankingRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sections = useMemo(
    () =>
      rankingCategories.map((category) => ({
        category,
        rows: buildRankingRows(category, globalRows, items),
        ...rankingCategoryLabels[category],
      })),
    [globalRows, items],
  );

  const loadRankings = async () => {
    if (!user) {
      setError('ランキングはログイン後に確認できます。');
      setGlobalRows([]);
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
      style={[styles.screen, { backgroundColor: colors.background }]}
      contentContainerStyle={styles.content}
    >
      <View style={styles.header}>
        <View style={styles.titleRow}>
          <Text style={[styles.title, { color: colors.text }]}>ランキング</Text>
          <Pressable
            accessibilityLabel="ランキングを更新"
            onPress={() => void loadRankings()}
            style={[styles.refreshButton, { borderColor: colors.border }]}
          >
            {loading ? (
              <ActivityIndicator color={colors.text} size="small" />
            ) : (
              <Ionicons color={colors.text} name="refresh" size={17} />
            )}
          </Pressable>
        </View>
        <Text style={[styles.copy, { color: colors.muted }]}>
          カテゴリごとに上位10件を表示します。もっと見るから各ランキングをまとめて確認できます。
        </Text>
      </View>

      {error ? <EmptyState icon="cloud-offline-outline" text={error} /> : null}

      {sections.map((section) => (
        <RankingShelf
          key={section.category}
          category={section.category}
          description={section.description}
          rows={section.rows}
          title={section.title}
        />
      ))}
    </ScrollView>
  );
}

function RankingShelf({
  category,
  description,
  rows,
  title,
}: {
  category: RankingCategory;
  description: string;
  rows: ReturnType<typeof buildRankingRows>;
  title: string;
}) {
  const { colors } = useAppTheme();
  const topRows = rows.slice(0, 10);

  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <View style={styles.sectionTitleBlock}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>{title}</Text>
          <Text style={[styles.copy, { color: colors.muted }]}>{description}</Text>
        </View>
        {rows.length > 10 ? (
          <Pressable
            accessibilityLabel={`${title}をもっと見る`}
            onPress={() => router.push(`/ranking/${category}`)}
            style={[styles.moreButton, { borderColor: colors.border }]}
          >
            <Text style={[styles.moreText, { color: colors.text }]}>もっと見る</Text>
            <Ionicons color={colors.text} name="chevron-forward" size={15} />
          </Pressable>
        ) : null}
      </View>

      {topRows.length === 0 ? (
        <EmptyState icon="podium-outline" text="まだ表示できるデータがありません。" />
      ) : (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.horizontalList}
        >
          {topRows.map((row, index) => (
            <RankingCard key={`${category}-${row.title}-${index}`} index={index} row={row} variant="compact" />
          ))}
        </ScrollView>
      )}
    </View>
  );
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
  content: { gap: 22, padding: 18, paddingBottom: 40 },
  header: { gap: 5 },
  titleRow: { alignItems: 'center', flexDirection: 'row', gap: 10 },
  title: { flex: 1, fontSize: 24, fontWeight: '900' },
  refreshButton: {
    alignItems: 'center',
    borderRadius: 8,
    borderWidth: 1,
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  copy: { fontSize: 13, lineHeight: 18 },
  section: { gap: 10 },
  sectionHeader: { alignItems: 'flex-start', flexDirection: 'row', gap: 12 },
  sectionTitleBlock: { flex: 1, gap: 3 },
  sectionTitle: { fontSize: 18, fontWeight: '900' },
  moreButton: {
    alignItems: 'center',
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 3,
    minHeight: 34,
    paddingHorizontal: 10,
  },
  moreText: { fontSize: 12, fontWeight: '800' },
  horizontalList: { gap: 10, paddingRight: 8 },
  emptyBox: { alignItems: 'center', borderRadius: 8, borderWidth: 1, gap: 6, padding: 18 },
});
