import { Animated, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { useAppTheme } from '../../store/ThemeContext';

type HomeToolbarProps = {
  translateY: Animated.Value;
  viewMode: 'series' | 'books';
  visibleCount: number;
  totalCount: number;
  requiresAuth: boolean;
  loading: boolean;
  error: string | null;
  query: string;
  filterLabel: string;
  sortLabel: string;
  onHeightChange: (height: number) => void;
  onQueryChange: (query: string) => void;
  onViewModeChange: (mode: 'series' | 'books') => void;
  onOpenFilter: () => void;
  onOpenSort: () => void;
};

export function HomeToolbar({
  translateY,
  viewMode,
  visibleCount,
  totalCount,
  requiresAuth,
  loading,
  error,
  query,
  filterLabel,
  sortLabel,
  onHeightChange,
  onQueryChange,
  onViewModeChange,
  onOpenFilter,
  onOpenSort,
}: HomeToolbarProps) {
  const { colors } = useAppTheme();

  return (
    <Animated.View
      onLayout={(event) => onHeightChange(Math.ceil(event.nativeEvent.layout.height))}
      style={[
        styles.toolbar,
        {
          backgroundColor: colors.background,
          borderBottomColor: colors.border,
          transform: [{ translateY }],
        },
      ]}
    >
      <Text style={[styles.title, { color: colors.text }]}>BookNest</Text>
      <Text style={[styles.subtitle, { color: colors.muted }]}>
        {requiresAuth
          ? '設定からログインしてください'
          : visibleCount === totalCount
            ? viewMode === 'series'
              ? `全${totalCount}シリーズ`
              : `全${totalCount}冊`
            : viewMode === 'series'
              ? `${visibleCount}シリーズを表示`
              : `${visibleCount}冊を表示`}
      </Text>

      {loading && (
        <View style={[styles.notice, { backgroundColor: colors.elevated }]}>
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
        onChangeText={onQueryChange}
        placeholder="本棚を検索"
        placeholderTextColor={colors.muted}
        style={[styles.search, { backgroundColor: colors.input, color: colors.text }]}
      />

      <View style={styles.controlRow}>
        <View style={[styles.modeSwitch, { backgroundColor: colors.elevated }]}>
          {([
            ['series', 'シリーズ'],
            ['books', '全冊'],
          ] as const).map(([value, label]) => (
            <Pressable
              key={value}
              onPress={() => onViewModeChange(value)}
              style={[styles.modeButton, viewMode === value && { backgroundColor: colors.text }]}
            >
              <Text
                style={[
                  styles.modeText,
                  { color: viewMode === value ? colors.background : colors.muted },
                ]}
              >
                {label}
              </Text>
            </Pressable>
          ))}
        </View>
        <Pressable
          onPress={onOpenFilter}
          style={[styles.menuButton, { borderColor: colors.border }]}
        >
          <Text numberOfLines={1} style={[styles.menuButtonText, { color: colors.text }]}>
            条件: {filterLabel}
          </Text>
          <Text style={[styles.menuChevron, { color: colors.muted }]}>▼</Text>
        </Pressable>
        <Pressable
          onPress={onOpenSort}
          style={[styles.menuButton, { borderColor: colors.border }]}
        >
          <Text numberOfLines={1} style={[styles.menuButtonText, { color: colors.text }]}>
            並び: {sortLabel}
          </Text>
          <Text style={[styles.menuChevron, { color: colors.muted }]}>▼</Text>
        </Pressable>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
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
  title: { fontSize: 24, fontWeight: '800', letterSpacing: 0 },
  subtitle: { fontSize: 12, marginTop: 1 },
  notice: {
    borderRadius: 8,
    marginTop: 8,
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  noticeText: { fontSize: 13, fontWeight: '700' },
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
  modeButton: {
    alignItems: 'center',
    borderRadius: 6,
    flex: 1,
    height: 32,
    justifyContent: 'center',
  },
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
});
