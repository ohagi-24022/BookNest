import { Link } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { SeriesPublicationInfo } from '../../lib/bookApis';
import { SeriesGroup } from '../../lib/seriesSelectors';
import { useAppTheme } from '../../store/ThemeContext';
import { BookCover } from '../BookCover';

type SeriesCardProps = {
  group: SeriesGroup;
  missingVolumes: number[];
  completionRate: number;
  favorite: boolean;
  showPublishedLatestVolume: boolean;
  publicationInfo?: SeriesPublicationInfo;
  refreshing: boolean;
  refreshDisabled: boolean;
  onToggleFavorite: () => void;
  onRefresh: () => void;
};

function formatMissingVolumes(volumes: number[]) {
  const visible = volumes.slice(0, 5);
  const remainder = volumes.length - visible.length;
  return `不足: ${visible.join(', ')}巻${remainder > 0 ? ` ほか${remainder}巻` : ''}`;
}

export function SeriesCard({
  group,
  missingVolumes,
  completionRate,
  favorite,
  showPublishedLatestVolume,
  publicationInfo,
  refreshing,
  refreshDisabled,
  onToggleFavorite,
  onRefresh,
}: SeriesCardProps) {
  const { colors } = useAppTheme();

  return (
    <Link href={`/series/${encodeURIComponent(group.title)}`} asChild>
      <Pressable style={[styles.row, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <BookCover
          thumbnailUrl={group.representative.thumbnailUrl}
          isbn={group.representative.isbn}
          style={styles.cover}
        />
        <View style={styles.body}>
          <View style={styles.headingRow}>
            <Text numberOfLines={2} style={[styles.title, { color: colors.text }]}>
              {group.title}
            </Text>
            <View style={styles.actions}>
              <Pressable
                onPress={(event) => {
                  event.stopPropagation();
                  onToggleFavorite();
                }}
                style={[styles.favoriteButton, { borderColor: colors.border }]}
                accessibilityLabel={
                  favorite
                    ? `${group.title}のお気に入りを解除`
                    : `${group.title}をお気に入りに追加`
                }
              >
                <Text
                  style={[
                    styles.favoriteButtonText,
                    { color: favorite ? '#c58b00' : colors.muted },
                  ]}
                >
                  {favorite ? '★' : '☆'}
                </Text>
              </Pressable>
              {showPublishedLatestVolume && (
                <Pressable
                  disabled={refreshDisabled}
                  onPress={(event) => {
                    event.stopPropagation();
                    onRefresh();
                  }}
                  style={[
                    styles.refreshButton,
                    { borderColor: colors.border },
                    refreshDisabled && styles.disabled,
                  ]}
                >
                  <Text style={[styles.refreshText, { color: colors.text }]}>
                    {refreshing ? '更新中' : '更新'}
                  </Text>
                </Pressable>
              )}
            </View>
          </View>
          <Text style={[styles.meta, { color: colors.muted }]}>
            {group.ownedCount} 冊所持
            {showPublishedLatestVolume
              ? publicationInfo
                ? ` / 刊行 ${publicationInfo.latestVolume}巻まで`
                : ' / 刊行巻数 未取得'
              : group.latestVolume
                ? ` / ${group.latestVolume}巻まで`
                : ''}
          </Text>
          <View style={[styles.progressTrack, { backgroundColor: colors.elevated }]}>
            <View
              style={[
                styles.progressFill,
                {
                  backgroundColor: missingVolumes.length > 0 ? '#765100' : colors.success,
                  width: `${Math.min(completionRate, 100)}%`,
                },
              ]}
            />
          </View>
          <View style={styles.statusRow}>
            {group.unreadCount > 0 && <Text style={styles.unreadBadge}>積読 {group.unreadCount}</Text>}
            {missingVolumes.length > 0 && (
              <Text style={styles.missingBadge}>{formatMissingVolumes(missingVolumes)}</Text>
            )}
            {group.readCount === group.ownedCount && <Text style={styles.readBadge}>読了</Text>}
          </View>
        </View>
      </Pressable>
    </Link>
  );
}

const styles = StyleSheet.create({
  row: {
    alignItems: 'center',
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 12,
    marginBottom: 10,
    padding: 10,
  },
  cover: { backgroundColor: '#e5e5e5', borderRadius: 4, height: 120, width: 82 },
  body: { flex: 1 },
  headingRow: { alignItems: 'flex-start', flexDirection: 'row', gap: 8 },
  title: { flex: 1, fontSize: 15, fontWeight: '800', lineHeight: 19 },
  actions: { alignItems: 'center', flexDirection: 'row', gap: 6 },
  favoriteButton: {
    alignItems: 'center',
    borderRadius: 6,
    borderWidth: 1,
    height: 30,
    justifyContent: 'center',
    width: 34,
  },
  favoriteButtonText: { fontSize: 18, lineHeight: 21 },
  refreshButton: {
    alignItems: 'center',
    borderRadius: 6,
    borderWidth: 1,
    height: 30,
    justifyContent: 'center',
    minWidth: 48,
    paddingHorizontal: 8,
  },
  disabled: { opacity: 0.4 },
  refreshText: { fontSize: 11, fontWeight: '800' },
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
    flexShrink: 1,
    fontSize: 11,
    fontWeight: '700',
    paddingHorizontal: 7,
    paddingVertical: 4,
  },
});
