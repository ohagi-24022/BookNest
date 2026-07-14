import Ionicons from '@expo/vector-icons/Ionicons';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { RankingCard } from '../../src/components/RankingCard';
import { buildPurchaseUrl } from '../../src/lib/bookApis';
import {
  buildRankingRows,
  GlobalRankingRow,
  RankingCategory,
  rankingCategoryLabels,
} from '../../src/lib/rankings';
import { supabase } from '../../src/lib/supabase';
import { useAuth } from '../../src/store/AuthContext';
import { useAppTheme } from '../../src/store/ThemeContext';
import { useWishlist } from '../../src/store/WishlistContext';

function parseCategory(value: string | string[] | undefined): RankingCategory {
  const category = Array.isArray(value) ? value[0] : value;
  if (category === 'wanted' || category === 'owned' || category === 'personal') return category;
  return 'overall';
}

export default function RankingCategoryScreen() {
  const { category: rawCategory } = useLocalSearchParams();
  const category = parseCategory(rawCategory);
  const { colors } = useAppTheme();
  const { user } = useAuth();
  const { addItem, items } = useWishlist();
  const [globalRows, setGlobalRows] = useState<GlobalRankingRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const label = rankingCategoryLabels[category];

  const rows = useMemo(() => buildRankingRows(category, globalRows, items), [category, globalRows, items]);
  const addedTitles = useMemo(() => new Set(items.map((item) => normalizeRankingTitle(item.title))), [items]);

  const loadRankings = async () => {
    if (category === 'personal') {
      setGlobalRows([]);
      setError(null);
      return;
    }
    if (!user) {
      setError('ランキングはログイン後に確認できます。');
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
  }, [category, user]);

  return (
    <>
      <Stack.Screen options={{ title: label.title }} />
      <ScrollView
        style={[styles.screen, { backgroundColor: colors.background }]}
        contentContainerStyle={styles.content}
      >
        <View style={styles.header}>
          <View style={styles.titleRow}>
            <View style={styles.titleBlock}>
              <Text style={[styles.title, { color: colors.text }]}>{label.title}</Text>
              <Text style={[styles.copy, { color: colors.muted }]}>{label.description}</Text>
            </View>
            <Pressable
              accessibilityLabel={`${label.title}を更新`}
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
        </View>

        {error ? (
          <EmptyState icon="cloud-offline-outline" text={error} />
        ) : rows.length === 0 ? (
          <EmptyState icon="podium-outline" text="まだ表示できるデータがありません。" />
        ) : (
          <View style={styles.list}>
            {rows.map((row, index) => (
              <RankingCard
                key={`${category}-${row.title}-${index}`}
                added={addedTitles.has(normalizeRankingTitle(row.title))}
                index={index}
                onAddWishlist={
                  category === 'personal'
                    ? undefined
                    : () =>
                        addItem({
                          title: row.title,
                          score: row.score ?? 75,
                          coverUrl: row.coverUrl,
                          purchaseUrl: buildPurchaseUrl(row.title),
                        })
                }
                row={row}
              />
            ))}
          </View>
        )}
      </ScrollView>
    </>
  );
}

function normalizeRankingTitle(value: string) {
  return value.normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim();
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
  content: { gap: 16, padding: 18, paddingBottom: 40 },
  header: { gap: 6 },
  titleRow: { alignItems: 'flex-start', flexDirection: 'row', gap: 12 },
  titleBlock: { flex: 1, gap: 4 },
  title: { fontSize: 24, fontWeight: '900' },
  copy: { fontSize: 13, lineHeight: 18 },
  refreshButton: {
    alignItems: 'center',
    borderRadius: 8,
    borderWidth: 1,
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  list: { gap: 8 },
  emptyBox: { alignItems: 'center', borderRadius: 8, borderWidth: 1, gap: 6, padding: 18 },
});
