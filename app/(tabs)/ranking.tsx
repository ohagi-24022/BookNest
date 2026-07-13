import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { supabase } from '../../src/lib/supabase';
import { useAppTheme } from '../../src/store/ThemeContext';
import { useWishlist } from '../../src/store/WishlistContext';

type GlobalRankingRow = {
  average_score: number | string | null;
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

  const loadRankings = async () => {
    if (!supabase) {
      setError('Supabaseが未設定のため、利用者ランキングを取得できません。');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const { data, error: rpcError } = await supabase.rpc('get_wanted_manga_rankings', { limit_count: 20 });
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
          利用者が欲しい漫画に追加した作品を集計して表示します。
        </Text>
      </View>

      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>みんなの欲しい漫画</Text>
        {error ? (
          <View style={[styles.emptyBox, { borderColor: colors.border }]}>
            <Ionicons color={colors.muted} name="cloud-offline-outline" size={24} />
            <Text style={[styles.copy, { color: colors.muted }]}>{error}</Text>
          </View>
        ) : globalRows.length === 0 && !loading ? (
          <View style={[styles.emptyBox, { borderColor: colors.border }]}>
            <Ionicons color={colors.muted} name="podium-outline" size={24} />
            <Text style={[styles.copy, { color: colors.muted }]}>
              まだ集計できるデータがありません。欲しいタブで作品を追加すると、ログイン中はランキング集計に反映されます。
            </Text>
          </View>
        ) : (
          <View style={styles.list}>
            {globalRows.map((row, index) => (
              <View key={`${row.title}-${index}`} style={[styles.row, { borderColor: colors.border }]}>
                <Text style={[styles.rank, { color: colors.text }]}>#{index + 1}</Text>
                <View style={styles.rowBody}>
                  <Text style={[styles.rowTitle, { color: colors.text }]}>{row.title}</Text>
                  <Text style={[styles.copy, { color: colors.muted }]}>
                    {row.want_count}人が候補に追加 / 平均{Number(row.average_score ?? 0).toFixed(1)}点
                  </Text>
                </View>
              </View>
            ))}
          </View>
        )}
      </View>

      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>自分の優先候補</Text>
        {items.length === 0 ? (
          <View style={[styles.emptyBox, { borderColor: colors.border }]}>
            <Ionicons color={colors.muted} name="cart-outline" size={24} />
            <Text style={[styles.copy, { color: colors.muted }]}>
              欲しいタブに追加すると、自分用の上位候補もここに表示されます。
            </Text>
          </View>
        ) : (
          <View style={styles.list}>
            {items.slice(0, 10).map((item, index) => (
              <View key={item.id} style={[styles.row, { borderColor: colors.border }]}>
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
  row: { alignItems: 'center', borderRadius: 8, borderWidth: 1, flexDirection: 'row', gap: 12, padding: 12 },
  rank: { fontSize: 14, fontWeight: '900', width: 38 },
  rowBody: { flex: 1 },
  rowTitle: { fontSize: 15, fontWeight: '900' },
});
