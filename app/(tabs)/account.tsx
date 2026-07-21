import Ionicons from '@expo/vector-icons/Ionicons';
import { Link, router, useLocalSearchParams, useNavigation } from 'expo-router';
import { useCallback, useEffect, useLayoutEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { EdgeSwipeBack } from '../../src/components/EdgeSwipeBack';
import { HeaderBackButton } from '../../src/components/HeaderBackButton';
import { deleteCurrentAccount } from '../../src/lib/account';
import {
  getNewReleaseNotificationLogs,
  NewReleaseNotificationLog,
} from '../../src/lib/newReleaseNotifications';
import { useAppSettings } from '../../src/store/AppSettingsContext';
import { useAuth } from '../../src/store/AuthContext';
import { useLibrary } from '../../src/store/LibraryContext';
import { useAppTheme } from '../../src/store/ThemeContext';

const ESTIMATED_BOOK_PRICE = 600;

export default function AccountScreen() {
  const params = useLocalSearchParams<{ from?: string }>();
  const navigation = useNavigation();
  const { user } = useAuth();
  const { setNewReleaseNotifications } = useAppSettings();
  const { books, seriesGroups } = useLibrary();
  const { colors } = useAppTheme();
  const [logs, setLogs] = useState<NewReleaseNotificationLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [accountDeleting, setAccountDeleting] = useState(false);
  const goBack = useCallback(() => {
    router.replace(params.from === 'home' ? '/(tabs)' : '/(tabs)/settings');
  }, [params.from]);

  useLayoutEffect(() => {
    navigation.setOptions({
      headerLeft: () => (
        <HeaderBackButton
          accessibilityLabel={params.from === 'home' ? '本棚に戻る' : '設定に戻る'}
          onPress={goBack}
        />
      ),
    });
  }, [goBack, navigation, params.from]);

  const expenseSummary = useMemo(() => {
    const totalBooks = books.length;
    const estimatedTotal = totalBooks * ESTIMATED_BOOK_PRICE;
    const now = new Date();
    const thisMonthBooks = books.filter((book) => {
      const createdAt = new Date(book.createdAt);
      return (
        !Number.isNaN(createdAt.getTime()) &&
        createdAt.getFullYear() === now.getFullYear() &&
        createdAt.getMonth() === now.getMonth()
      );
    }).length;
    const mostCollectedSeries = [...seriesGroups].sort((left, right) => right.ownedCount - left.ownedCount)[0];

    return {
      estimatedTotal,
      mostCollectedSeries,
      thisMonthBooks,
      totalBooks,
    };
  }, [books, seriesGroups]);

  const loadLogs = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      setLogs(await getNewReleaseNotificationLogs(user.id, 50));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : '通知履歴を取得できませんでした。');
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    void loadLogs();
  }, [loadLogs]);

  const submitAccountDeletion = () => {
    Alert.alert(
      'アカウントを削除しますか？',
      'クラウド本棚、通知トークン、新刊通知設定、通知ログ、ログイン情報を削除します。この操作は元に戻せません。',
      [
        { text: 'キャンセル', style: 'cancel' },
        {
          text: '削除する',
          style: 'destructive',
          onPress: () => {
            setAccountDeleting(true);
            void deleteCurrentAccount()
              .then(() => {
                setNewReleaseNotifications(false);
                Alert.alert('削除しました', 'アカウントとクラウド上のデータを削除しました。');
              })
              .catch((deleteError) => {
                Alert.alert(
                  'アカウント削除に失敗しました',
                  deleteError instanceof Error ? deleteError.message : 'しばらくしてからもう一度お試しください。',
                );
              })
              .finally(() => setAccountDeleting(false));
          },
        },
      ],
    );
  };

  if (!user) {
    return (
      <EdgeSwipeBack onBack={goBack} style={{ backgroundColor: colors.background }}>
        <View style={[styles.centerScreen, { backgroundColor: colors.background }]}>
          <Ionicons color={colors.muted} name="person-circle-outline" size={42} />
          <Text style={[styles.emptyTitle, { color: colors.text }]}>ログインが必要です</Text>
          <Text style={[styles.emptyCopy, { color: colors.muted }]}>
            新刊通知の詳細は、ログイン後に確認できます。
          </Text>
          <Link href="/(tabs)/settings" asChild>
            <Pressable style={[styles.button, { borderColor: colors.border }]}>
              <Text style={[styles.buttonText, { color: colors.text }]}>設定へ移動</Text>
            </Pressable>
          </Link>
        </View>
      </EdgeSwipeBack>
    );
  }

  return (
    <EdgeSwipeBack onBack={goBack} style={{ backgroundColor: colors.background }}>
      <ScrollView
        refreshControl={<RefreshControl refreshing={loading} onRefresh={() => void loadLogs()} />}
        style={[styles.screen, { backgroundColor: colors.background }]}
        contentContainerStyle={styles.content}
      >
      <View style={[styles.section, { borderBottomColor: colors.border }]}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>マイページ</Text>
        <Text style={[styles.email, { color: colors.text }]}>{user.email}</Text>
        <Text style={[styles.copy, { color: colors.muted }]}>
          通知は正午ごろにまとめて届きます。どのシリーズの新刊かは、この画面で確認できます。
        </Text>
      </View>

      <View style={[styles.expenseSection, { backgroundColor: colors.elevated }]}>
        <View style={[styles.expenseIcon, { backgroundColor: colors.text }]}>
          <Ionicons color={colors.background} name="wallet-outline" size={21} />
        </View>
        <View style={styles.expenseHeader}>
          <View style={styles.expenseText}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>購入・支出サマリー</Text>
            <Text style={[styles.copy, { color: colors.muted }]}>
              価格記録を追加するまで、1冊{formatCurrency(ESTIMATED_BOOK_PRICE)}換算の概算です。
            </Text>
          </View>
        </View>
        <Text style={[styles.expenseAmount, { color: colors.text }]}>
          {formatCurrency(expenseSummary.estimatedTotal)}
        </Text>
        <View style={styles.summaryGrid}>
          <SummaryTile label="所持冊数" value={`${expenseSummary.totalBooks}冊`} />
          <SummaryTile label="今月追加" value={`${expenseSummary.thisMonthBooks}冊`} />
          <SummaryTile label="シリーズ" value={`${seriesGroups.length}件`} />
        </View>
        {expenseSummary.mostCollectedSeries ? (
          <Text style={[styles.copy, { color: colors.muted }]}>
            一番多いシリーズ: {expenseSummary.mostCollectedSeries.title} / {expenseSummary.mostCollectedSeries.ownedCount}冊
          </Text>
        ) : null}
      </View>

      <View style={styles.headerRow}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>新刊通知</Text>
        <Pressable onPress={() => void loadLogs()} style={[styles.iconButton, { borderColor: colors.border }]}>
          {loading ? (
            <ActivityIndicator color={colors.text} size="small" />
          ) : (
            <Ionicons color={colors.text} name="refresh" size={17} />
          )}
        </Pressable>
      </View>

      {error && <Text style={[styles.errorText, { color: colors.danger }]}>{error}</Text>}

      {logs.length === 0 && !loading ? (
        <View style={[styles.emptyBox, { backgroundColor: colors.elevated }]}>
          <Ionicons color={colors.muted} name="notifications-outline" size={28} />
          <Text style={[styles.emptyTitle, { color: colors.text }]}>通知はまだありません</Text>
          <Text style={[styles.emptyCopy, { color: colors.muted }]}>
            通知ONのシリーズに新刊候補が見つかると、ここに詳細が表示されます。
          </Text>
        </View>
      ) : (
        <View style={styles.logList}>
          {logs.map((log) => (
            <View key={log.id ?? `${log.seriesTitle}-${log.volumeNumber}-${log.createdAt}`} style={[styles.logCard, { borderColor: colors.border }]}>
              <View style={styles.logIcon}>
                <Ionicons color="#facc15" name="notifications" size={18} />
              </View>
              <View style={styles.logBody}>
                <Text style={[styles.logTitle, { color: colors.text }]}>{log.seriesTitle}</Text>
                <Text style={[styles.copy, { color: colors.muted }]}>
                  {log.volumeNumber ? `${log.volumeNumber}巻の新刊候補` : '新刊候補'}
                </Text>
                <Text style={[styles.meta, { color: colors.muted }]}>
                  {formatDate(log.createdAt)} / {formatStatus(log.status)}
                </Text>
              </View>
            </View>
          ))}
        </View>
      )}

      <View style={[styles.dangerSection, { borderTopColor: colors.border }]}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>アカウント管理</Text>
        <Text style={[styles.copy, { color: colors.muted }]}>
          アカウントを削除すると、クラウド本棚、通知設定、通知履歴、ログイン情報が削除されます。
        </Text>
        <Pressable
          disabled={accountDeleting}
          onPress={submitAccountDeletion}
          style={[
            styles.dangerButton,
            { borderColor: colors.danger },
            accountDeleting && styles.disabledButton,
          ]}
        >
          <Text style={[styles.dangerButtonText, { color: colors.danger }]}>
            {accountDeleting ? '削除中' : 'アカウントを削除'}
          </Text>
        </Pressable>
      </View>
      </ScrollView>
    </EdgeSwipeBack>
  );
}

function formatStatus(status: string) {
  if (status === 'sent') return '通知済み';
  if (status === 'pending') return '通知待ち';
  if (status === 'error') return '通知失敗';
  return status;
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return `${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()}`;
}

function formatCurrency(value: number) {
  return `¥${Math.max(0, Math.round(value)).toLocaleString('ja-JP')}`;
}

function SummaryTile({ label, value }: { label: string; value: string }) {
  const { colors } = useAppTheme();
  return (
    <View style={[styles.summaryTile, { backgroundColor: colors.background }]}>
      <Text style={[styles.summaryValue, { color: colors.text }]}>{value}</Text>
      <Text style={[styles.summaryLabel, { color: colors.muted }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { gap: 18, padding: 18, paddingBottom: 40 },
  centerScreen: { alignItems: 'center', flex: 1, justifyContent: 'center', padding: 24 },
  section: { borderBottomWidth: 1, paddingBottom: 18 },
  sectionTitle: { fontSize: 18, fontWeight: '800' },
  email: { fontSize: 16, fontWeight: '800', marginTop: 10 },
  copy: { fontSize: 13, lineHeight: 18, marginTop: 4 },
  expenseSection: { borderRadius: 8, gap: 12, padding: 14, position: 'relative' },
  expenseHeader: { paddingRight: 54 },
  expenseText: { maxWidth: '100%' },
  expenseIcon: {
    alignItems: 'center',
    borderRadius: 8,
    height: 42,
    justifyContent: 'center',
    position: 'absolute',
    right: 14,
    top: 14,
    width: 42,
    zIndex: 1,
  },
  expenseAmount: { fontSize: 30, fontWeight: '900', letterSpacing: 0 },
  summaryGrid: { flexDirection: 'row', gap: 8 },
  summaryTile: { alignItems: 'center', borderRadius: 8, flex: 1, gap: 3, minHeight: 58, justifyContent: 'center' },
  summaryValue: { fontSize: 16, fontWeight: '900' },
  summaryLabel: { fontSize: 11, fontWeight: '800' },
  headerRow: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  iconButton: {
    alignItems: 'center',
    borderRadius: 8,
    borderWidth: 1,
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  button: {
    alignItems: 'center',
    borderRadius: 8,
    borderWidth: 1,
    height: 44,
    justifyContent: 'center',
    marginTop: 16,
    paddingHorizontal: 18,
  },
  buttonText: { fontSize: 14, fontWeight: '800' },
  disabledButton: { opacity: 0.35 },
  errorText: { fontSize: 13, lineHeight: 18 },
  emptyBox: { alignItems: 'center', borderRadius: 8, gap: 6, padding: 18 },
  emptyTitle: { fontSize: 16, fontWeight: '800', marginTop: 8, textAlign: 'center' },
  emptyCopy: { fontSize: 13, lineHeight: 18, marginTop: 4, textAlign: 'center' },
  logList: { gap: 10 },
  logCard: {
    alignItems: 'center',
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 12,
    padding: 12,
  },
  logIcon: { alignItems: 'center', height: 28, justifyContent: 'center', width: 28 },
  logBody: { flex: 1 },
  logTitle: { fontSize: 15, fontWeight: '800' },
  meta: { fontSize: 12, lineHeight: 16, marginTop: 6 },
  dangerSection: { borderTopWidth: 1, marginTop: 8, paddingTop: 18 },
  dangerButton: {
    alignItems: 'center',
    borderRadius: 8,
    borderWidth: 1,
    height: 44,
    justifyContent: 'center',
    marginTop: 12,
  },
  dangerButtonText: { fontSize: 14, fontWeight: '800' },
});
