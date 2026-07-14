import Ionicons from '@expo/vector-icons/Ionicons';
import { GestureResponderEvent, Pressable, StyleSheet, Text, View } from 'react-native';

import { RankingDisplayRow } from '../lib/rankings';
import { useAppTheme } from '../store/ThemeContext';
import { BookCover } from './BookCover';

type RankingCardProps = {
  added?: boolean;
  expanded?: boolean;
  index: number;
  onAddWishlist?: () => void;
  onPress?: () => void;
  row: RankingDisplayRow;
  variant?: 'compact' | 'wide';
};

export function RankingCard({
  added = false,
  expanded = false,
  index,
  onAddWishlist,
  onPress,
  row,
  variant = 'wide',
}: RankingCardProps) {
  const { colors } = useAppTheme();
  const compact = variant === 'compact';
  const Container = onPress ? Pressable : View;
  const handleAddWishlist = (event: GestureResponderEvent) => {
    event.stopPropagation();
    onAddWishlist?.();
  };

  return (
    <Container
      accessibilityRole={onPress ? 'button' : undefined}
      onPress={onPress}
      style={[
        compact ? styles.compactCard : styles.wideCard,
        { backgroundColor: colors.surface, borderColor: colors.border },
      ]}
    >
      <Text style={[styles.rank, { color: colors.text }]}>#{index + 1}</Text>
      <BookCover
        thumbnailUrl={row.coverUrl}
        style={compact ? styles.compactCover : styles.wideCover}
        placeholderText="No Cover"
      />
      <View style={[styles.body, compact ? styles.compactBody : null]}>
        <Text style={[styles.title, { color: colors.text }]} numberOfLines={compact ? 2 : 3}>
          {row.title}
        </Text>
        {compact && row.score !== undefined ? (
          <Text style={[styles.compactScore, { color: colors.muted }]}>{row.score}点</Text>
        ) : null}
        {!compact ? (
          <View style={styles.wideMetrics}>
            {row.wantCount !== undefined ? (
              <Metric icon="heart-outline" label="欲しい" value={`${row.wantCount}人`} />
            ) : null}
            {row.ownerCount !== undefined ? (
              <Metric icon="people-outline" label="所持" value={`${row.ownerCount}人`} />
            ) : null}
            {row.ownedVolumeCount !== undefined ? (
              <Metric icon="albums-outline" label="登録" value={`${row.ownedVolumeCount}冊`} />
            ) : null}
            {row.score !== undefined ? <Metric icon="star-outline" label="優先度" value={`${row.score}点`} /> : null}
          </View>
        ) : null}
        {!compact && (row.averageScore !== undefined || row.popularityScore !== undefined) ? (
          <Text style={[styles.subText, { color: colors.muted }]} numberOfLines={1}>
            {row.averageScore !== undefined ? `平均 ${row.averageScore.toFixed(1)}点` : ''}
            {row.popularityScore !== undefined ? ` / 人気度 ${row.popularityScore.toFixed(1)}` : ''}
          </Text>
        ) : null}
      </View>
      {compact && expanded && onAddWishlist ? (
        <Pressable
          accessibilityLabel={`${row.title}を欲しいに追加`}
          disabled={added}
          onPress={handleAddWishlist}
          style={[
            styles.compactAddButton,
            { backgroundColor: added ? colors.elevated : colors.text, borderColor: colors.border },
          ]}
        >
          <Ionicons color={added ? colors.muted : colors.background} name={added ? 'checkmark' : 'add'} size={15} />
          <Text style={[styles.compactAddText, { color: added ? colors.muted : colors.background }]}>
            {added ? '追加済み' : '欲しいに追加'}
          </Text>
        </Pressable>
      ) : null}
      {!compact && onAddWishlist ? (
        <Pressable
          accessibilityLabel={`${row.title}を欲しいに追加`}
          disabled={added}
          onPress={handleAddWishlist}
          style={[
            styles.wideAddButton,
            { backgroundColor: added ? colors.elevated : colors.text, borderColor: colors.border },
          ]}
        >
          <Ionicons color={added ? colors.muted : colors.background} name={added ? 'checkmark' : 'add'} size={16} />
          <Text style={[styles.wideAddText, { color: added ? colors.muted : colors.background }]}>
            {added ? '追加済み' : '欲しいに追加'}
          </Text>
        </Pressable>
      ) : null}
    </Container>
  );
}

function Metric({
  icon,
  label,
  value,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
}) {
  const { colors } = useAppTheme();

  return (
    <View style={[styles.metric, { backgroundColor: colors.elevated }]}>
      <Ionicons color={colors.text} name={icon} size={12} />
      <Text style={[styles.metricValue, { color: colors.text }]}>{value}</Text>
      <Text style={[styles.metricLabel, { color: colors.muted }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  compactCard: {
    alignItems: 'center',
    borderRadius: 8,
    borderWidth: 1,
    gap: 8,
    minHeight: 196,
    padding: 10,
    width: 136,
  },
  wideCard: {
    alignItems: 'center',
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 10,
    padding: 10,
  },
  rank: { fontSize: 14, fontWeight: '900' },
  compactCover: { borderRadius: 6, height: 112, width: 76 },
  wideCover: { borderRadius: 6, height: 84, width: 56 },
  body: { flex: 1, gap: 7 },
  compactBody: { alignSelf: 'stretch', flex: 0 },
  title: { fontSize: 15, fontWeight: '900', lineHeight: 20, minHeight: 40 },
  compactScore: { fontSize: 12, fontWeight: '800', lineHeight: 16 },
  wideMetrics: { flexDirection: 'row', gap: 6 },
  metric: {
    alignItems: 'center',
    borderRadius: 6,
    flex: 1,
    gap: 1,
    minHeight: 44,
    paddingHorizontal: 4,
    paddingVertical: 5,
  },
  metricValue: { fontSize: 12, fontWeight: '900' },
  metricLabel: { fontSize: 10, fontWeight: '700' },
  subText: { fontSize: 12, lineHeight: 16 },
  compactAddButton: {
    alignItems: 'center',
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 4,
    height: 34,
    justifyContent: 'center',
    width: '100%',
  },
  compactAddText: { fontSize: 12, fontWeight: '900' },
  wideAddButton: {
    alignItems: 'center',
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 5,
    height: 38,
    paddingHorizontal: 12,
  },
  wideAddText: { fontSize: 13, fontWeight: '900' },
});
