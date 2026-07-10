import Ionicons from '@expo/vector-icons/Ionicons';
import { Link } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
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

import { deleteCurrentAccount } from '../src/lib/account';
import {
  getNewReleaseNotificationLogs,
  NewReleaseNotificationLog,
} from '../src/lib/newReleaseNotifications';
import { useAppSettings } from '../src/store/AppSettingsContext';
import { useAuth } from '../src/store/AuthContext';
import { useAppTheme } from '../src/store/ThemeContext';

export default function AccountScreen() {
  const { user } = useAuth();
  const { setNewReleaseNotifications } = useAppSettings();
  const { colors } = useAppTheme();
  const [logs, setLogs] = useState<NewReleaseNotificationLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [accountDeleting, setAccountDeleting] = useState(false);

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
    );
  }

  return (
    <ScrollView
      refreshControl={<RefreshControl refreshing={loading} onRefresh={() => void loadLogs()} />}
      style={[styles.screen, { backgroundColor: colors.background }]}
      contentContainerStyle={styles.content}
    >
      <View style={[styles.section, { borderBottomColor: colors.border }]}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>ユーザー</Text>
        <Text style={[styles.email, { color: colors.text }]}>{user.email}</Text>
        <Text style={[styles.copy, { color: colors.muted }]}>
          通知は正午ごろにまとめて届きます。どのシリーズの新刊かは、この画面で確認できます。
        </Text>
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

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { gap: 18, padding: 18, paddingBottom: 40 },
  centerScreen: { alignItems: 'center', flex: 1, justifyContent: 'center', padding: 24 },
  section: { borderBottomWidth: 1, paddingBottom: 18 },
  sectionTitle: { fontSize: 18, fontWeight: '800' },
  email: { fontSize: 16, fontWeight: '800', marginTop: 10 },
  copy: { fontSize: 13, lineHeight: 18, marginTop: 4 },
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
