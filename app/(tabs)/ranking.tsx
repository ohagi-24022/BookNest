import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { BookCover } from '../../src/components/BookCover';
import { supabase } from '../../src/lib/supabase';
import { useAppTheme } from '../../src/store/ThemeContext';
import { useWishlist } from '../../src/store/WishlistContext';

type GlobalRankingRow = {
  average_score: number | string | null;
  cover_url: string | null;
  owned_volume_count: number;
  owner_count: number;
  popularity_score: number | string | null;
  title: string;
  top_score: number | null;
  want_count: number;
};

export default function RankingScreen() {
  const { colors } = useAppTheme();
  const { items } = useWishlist();
  const [globalRows, setGlobalRows] = useState<GlobalRankingRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ownedHeavyRows = useMemo(
    () =>
      [...globalRows]
        .filter((row) => Number(row.owner_count) > 0)
        .sort(
          (left, right) =>
            Number(right.owner_count) - Number(left.owner_count) ||
            Number(right.owned_volume_count) - Number(left.owned_volume_count) ||
            left.title.localeCompare(right.title),
        )
        .slice(0, 5),
    [globalRows],
  );

  const loadRankings = async () => {
    if (!supabase) {
      setError('Supabaseが未設定のため、利用者ランキングを取得できません。');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const { data, error: rpcError } = await supabase.rpc('get_wanted_manga_rankings', { limit_count: 30 });
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
  }, []);

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
          欲しい数、所持人数、登録冊数をまとめて集計します。表紙は保存済みの本棚データから再利用します。
        </Text>
      </View>

      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>総合人気</Text>
        {error ? (
          <EmptyState colors={colors} icon="cloud-offline-outline" text={error} />
        ) : globalRows.length === 0 && !loading ? (
          <EmptyState
            colors={colors}
            icon="podium-outline"
            text="まだ集計できるデータがありません。欲しいタブで追加した作品やクラウド本棚のデータが反映されると表示されます。"
          />
        ) : (
          <View style={styles.list}>
            {globalRows.slice(0, 15).map((row, index) => (
              <RankingCard
                key={`${row.title}-${index}`}
                colors={colors}
                index={index}
                row={row}
                showPopularity
              />
            ))}
          </View>
        )}
      </View>

      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>所持されている漫画</Text>
        {ownedHeavyRows.length === 0 ? (
          <EmptyState
            colors={colors}
            icon="library-outline"
            text="クラウド本棚に登録された作品が増えると、所持人数の多い漫画がここに表示されます。"
          />
        ) : (
          <View style={styles.list}>
            {ownedHeavyRows.map((row, index) => (
              <RankingCard key={`${row.title}-owned-${index}`} colors={colors} index={index} row={row} />
            ))}
          </View>
        )}
      </View>

      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>自分の優先候補</Text>
        {items.length === 0 ? (
          <EmptyState
            colors={colors}
            icon="cart-outline"
            text="欲しいタブに追加すると、自分用の上位候補もここに表示されます。"
          />
        ) : (
          <View style={styles.list}>
            {items.slice(0, 10).map((item, index) => (
              <View key={item.id} style={[styles.selfRow, { borderColor: colors.border }]}>
                <Text style={[styles.rank, { color: colors.text }]}>#{index + 1}</Text>
                <View style={styles.rowBody}>
                  <Text style={[styles.rowTitle, { color: colors.text }]}>{item.title}</Text>
                  <Text style={[styles.copy, { color: colors.muted }]}>{item.score}点</Text>
                </View>
              </View>
            ))}
          </View>
        )}
      </View>
    </ScrollView>
  );
}

function RankingCard({
  colors,
  index,
  row,
  showPopularity = false,
}: {
  colors: ReturnType<typeof useAppTheme>['colors'];
  index: number;
  row: GlobalRankingRow;
  showPopularity?: boolean;
}) {
  return (
    <View style={[styles.card, { borderColor: colors.border }]}>
      <Text style={[styles.rank, { color: colors.text }]}>#{index + 1}</Text>
      <BookCover
        thumbnailUrl={row.cover_url ?? undefined}
        style={styles.cover}
        placeholderText="No Cover"
      />
      <View style={styles.cardBody}>
        <Text style={[styles.rowTitle, { color: colors.text }]} numberOfLines={2}>
          {row.title}
        </Text>
        <View style={styles.metricGrid}>
          <Metric colors={colors} icon="heart-outline" label="欲しい" value={`${Number(row.want_count)}人`} />
          <Metric colors={colors} icon="people-outline" label="所持" value={`${Number(row.owner_count)}人`} />
          <Metric colors={colors} icon="albums-outline" label="登録" value={`${Number(row.owned_volume_count)}冊`} />
        </View>
        <Text style={[styles.copy, { color: colors.muted }]}>
          平均優先度 {Number(row.average_score ?? 0).toFixed(1)}点
          {showPopularity ? ` / 人気度 ${Number(row.popularity_score ?? 0).toFixed(1)}` : ''}
        </Text>
      </View>
    </View>
  );
}

function Metric({
  colors,
  icon,
  label,
  value,
}: {
  colors: ReturnType<typeof useAppTheme>['colors'];
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
}) {
  return (
    <View style={[styles.metric, { backgroundColor: colors.elevated }]}>
      <Ionicons color={colors.text} name={icon} size={13} />
      <Text style={[styles.metricText, { color: colors.text }]}>{value}</Text>
      <Text style={[styles.metricLabel, { color: colors.muted }]}>{label}</Text>
    </View>
  );
}

function EmptyState({
  colors,
  icon,
  text,
}: {
  colors: ReturnType<typeof useAppTheme>['colors'];
  icon: keyof typeof Ionicons.glyphMap;
  text: string;
}) {
  return (
    <View style={[styles.emptyBox, { borderColor: colors.border }]}>
      <Ionicons color={colors.muted} name={icon} size={24} />
      <Text style={[styles.copy, { color: colors.muted }]}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { gap: 20, padding: 18, paddingBottom: 40 },
  header: { gap: 4 },
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
  sectionTitle: { fontSize: 18, fontWeight: '900' },
  emptyBox: { alignItems: 'center', borderRadius: 8, borderWidth: 1, gap: 6, padding: 18 },
  list: { gap: 8 },
  card: {
    alignItems: 'center',
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 10,
    padding: 10,
  },
  selfRow: { alignItems: 'center', borderRadius: 8, borderWidth: 1, flexDirection: 'row', gap: 12, padding: 12 },
  rank: { fontSize: 14, fontWeight: '900', width: 34 },
  cover: { borderRadius: 6, height: 78, width: 52 },
  cardBody: { flex: 1, gap: 7 },
  rowBody: { flex: 1 },
  rowTitle: { fontSize: 15, fontWeight: '900' },
  metricGrid: { flexDirection: 'row', gap: 6 },
  metric: {
    alignItems: 'center',
    borderRadius: 6,
    flex: 1,
    gap: 1,
    minHeight: 48,
    paddingHorizontal: 4,
    paddingVertical: 5,
  },
  metricText: { fontSize: 12, fontWeight: '900' },
  metricLabel: { fontSize: 10, fontWeight: '700' },
});
