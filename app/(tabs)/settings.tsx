import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';

import { envStatus } from '../../src/lib/env';
import { useAppSettings } from '../../src/store/AppSettingsContext';
import { useAuth } from '../../src/store/AuthContext';
import { ThemeMode, useAppTheme } from '../../src/store/ThemeContext';

const themeOptions: Array<{ label: string; value: ThemeMode }> = [
  { label: 'システム', value: 'system' },
  { label: 'ライト', value: 'light' },
  { label: 'ダーク', value: 'dark' },
];

export default function SettingsScreen() {
  const { configured, initializing, user, signIn, signOut, signUp } = useAuth();
  const { openExternalPurchaseLinks, setOpenExternalPurchaseLinks } = useAppSettings();
  const { colors, mode, setMode } = useAppTheme();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authSubmitting, setAuthSubmitting] = useState(false);

  const submitAuth = async (authMode: 'signIn' | 'signUp') => {
    if (!email.trim() || !password) {
      Alert.alert('BookNest', 'メールアドレスとパスワードを入力してください。');
      return;
    }

    setAuthSubmitting(true);
    try {
      if (authMode === 'signIn') {
        await signIn(email.trim(), password);
      } else {
        await signUp(email.trim(), password);
        Alert.alert('BookNest', '確認メールが有効な場合は、メールを確認してください。');
      }
      setPassword('');
    } catch (error) {
      Alert.alert('BookNest', error instanceof Error ? error.message : '認証に失敗しました。');
    } finally {
      setAuthSubmitting(false);
    }
  };

  const submitSignOut = async () => {
    setAuthSubmitting(true);
    try {
      await signOut();
    } catch (error) {
      Alert.alert('BookNest', error instanceof Error ? error.message : 'ログアウトに失敗しました。');
    } finally {
      setAuthSubmitting(false);
    }
  };

  return (
    <ScrollView style={[styles.screen, { backgroundColor: colors.background }]} contentContainerStyle={styles.content}>
      <View style={[styles.section, { borderBottomColor: colors.border }]}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>アカウント</Text>
        {initializing ? (
          <View style={styles.loadingRow}>
            <ActivityIndicator color={colors.text} />
          </View>
        ) : user ? (
          <>
            <View style={styles.row}>
              <View style={styles.rowText}>
                <Text style={[styles.rowTitle, { color: colors.text }]}>ログイン中</Text>
                <Text style={[styles.rowCopy, { color: colors.muted }]}>{user.email}</Text>
              </View>
            </View>
            <Pressable disabled={authSubmitting} style={[styles.neutralButton, { borderColor: colors.border }]} onPress={submitSignOut}>
              <Text style={[styles.neutralButtonText, { color: colors.text }]}>ログアウト</Text>
            </Pressable>
            <View style={[styles.pendingBox, { backgroundColor: colors.elevated }]}>
              <Text style={[styles.rowTitle, { color: colors.text }]}>アカウント削除</Text>
              <Text style={[styles.rowCopy, { color: colors.muted }]}>
                データ削除の設計を固めるまで、操作ボタンは非表示にしています。
              </Text>
            </View>
          </>
        ) : (
          <View>
            <Text style={[styles.rowTitle, { color: colors.text }]}>プロフィール</Text>
            <Text style={[styles.rowCopy, { color: colors.muted }]}>
              {configured
                ? 'Supabase Auth にログインすると蔵書がクラウド保存されます。'
                : 'Supabase の環境変数を追加すると認証が有効になります。'}
            </Text>
            <TextInput
              autoCapitalize="none"
              keyboardType="email-address"
              onChangeText={setEmail}
              placeholder="メールアドレス"
              placeholderTextColor={colors.muted}
              style={[styles.input, { backgroundColor: colors.input, color: colors.text }]}
              value={email}
            />
            <TextInput
              onChangeText={setPassword}
              placeholder="パスワード"
              placeholderTextColor={colors.muted}
              secureTextEntry
              style={[styles.input, { backgroundColor: colors.input, color: colors.text }]}
              value={password}
            />
            <View style={styles.authButtons}>
              <Pressable
                disabled={!configured || authSubmitting}
                style={[
                  styles.neutralButton,
                  styles.authButton,
                  { borderColor: colors.border },
                  (!configured || authSubmitting) && styles.disabledButton,
                ]}
                onPress={() => submitAuth('signIn')}
              >
                <Text style={[styles.neutralButtonText, { color: colors.text }]}>ログイン</Text>
              </Pressable>
              <Pressable
                disabled={!configured || authSubmitting}
                style={[
                  styles.neutralButton,
                  styles.authButton,
                  { borderColor: colors.border },
                  (!configured || authSubmitting) && styles.disabledButton,
                ]}
                onPress={() => submitAuth('signUp')}
              >
                <Text style={[styles.neutralButtonText, { color: colors.text }]}>新規登録</Text>
              </Pressable>
            </View>
          </View>
        )}
      </View>

      <View style={[styles.section, { borderBottomColor: colors.border }]}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>連携設定</Text>
        <Text style={[styles.rowCopy, { color: colors.muted }]}>
          Supabase URL: {envStatus.hasSupabaseUrl ? '設定済み' : '未設定'}
        </Text>
        <Text style={[styles.rowCopy, { color: colors.muted }]}>
          Supabase Anon Key: {envStatus.hasSupabaseAnonKey ? '設定済み' : '未設定'}
        </Text>
        <Text style={[styles.rowCopy, { color: colors.muted }]}>
          Google Books API Key: {envStatus.hasGoogleBooksApiKey ? '設定済み' : '未設定'}
        </Text>
        <Text style={[styles.rowCopy, { color: colors.muted }]}>
          Rakuten App ID: {envStatus.hasRakutenAppId ? '設定済み' : '未設定'}
        </Text>
      </View>

      <View style={[styles.section, { borderBottomColor: colors.border }]}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>外部EC</Text>
        <View style={styles.row}>
          <View style={styles.rowText}>
            <Text style={[styles.rowTitle, { color: colors.text }]}>外部アプリで直接開く</Text>
            <Text style={[styles.rowCopy, { color: colors.muted }]}>
              ONは購入アプリへ直接遷移、OFFはBookNest内ブラウザで開きます。
            </Text>
          </View>
          <Switch
            onValueChange={setOpenExternalPurchaseLinks}
            thumbColor="#ffffff"
            trackColor={{ false: '#d4d4d4', true: '#31c759' }}
            value={openExternalPurchaseLinks}
          />
        </View>
      </View>

      <View style={[styles.section, { borderBottomColor: colors.border }]}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>通知</Text>
        <View style={[styles.pendingBox, { backgroundColor: colors.elevated }]}>
          <View style={styles.rowText}>
            <Text style={[styles.rowTitle, { color: colors.text }]}>新刊通知</Text>
            <Text style={[styles.rowCopy, { color: colors.muted }]}>
              Push Token保存と通知済み管理が必要なため、今は準備中にしています。
            </Text>
          </View>
        </View>
      </View>

      <View style={[styles.section, { borderBottomColor: colors.border }]}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>表示</Text>
        <View style={[styles.segmented, { backgroundColor: colors.elevated }]}>
          {themeOptions.map((option) => (
            <Pressable
              key={option.value}
              onPress={() => setMode(option.value)}
              style={[styles.segment, mode === option.value && { backgroundColor: colors.text }]}
            >
              <Text style={[styles.segmentText, { color: mode === option.value ? colors.background : colors.muted }]}>
                {option.label}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { gap: 18, padding: 18, paddingBottom: 40 },
  section: { borderBottomWidth: 1, paddingBottom: 18 },
  sectionTitle: { fontSize: 18, fontWeight: '800', marginBottom: 12 },
  row: { alignItems: 'center', flexDirection: 'row', gap: 12, minHeight: 56 },
  rowText: { flex: 1 },
  rowTitle: { fontSize: 15, fontWeight: '800' },
  rowCopy: { fontSize: 13, lineHeight: 18, marginTop: 3 },
  loadingRow: { alignItems: 'center', height: 56, justifyContent: 'center' },
  input: {
    borderRadius: 8,
    fontSize: 16,
    height: 44,
    marginTop: 10,
    paddingHorizontal: 12,
  },
  authButtons: { flexDirection: 'row', gap: 10, marginTop: 10 },
  authButton: { flex: 1, marginTop: 0 },
  disabledButton: { opacity: 0.35 },
  neutralButton: {
    alignItems: 'center',
    borderRadius: 8,
    borderWidth: 1,
    height: 44,
    justifyContent: 'center',
    marginTop: 10,
  },
  neutralButtonText: { fontSize: 14, fontWeight: '800' },
  dangerButton: {
    alignItems: 'center',
    borderRadius: 8,
    borderWidth: 1,
    height: 44,
    justifyContent: 'center',
    marginTop: 10,
  },
  dangerButtonText: { fontSize: 14, fontWeight: '800' },
  pendingBox: {
    borderRadius: 8,
    padding: 12,
  },
  segmented: {
    borderRadius: 8,
    flexDirection: 'row',
    padding: 4,
  },
  segment: { alignItems: 'center', borderRadius: 6, flex: 1, height: 38, justifyContent: 'center' },
  segmentText: { fontSize: 13, fontWeight: '800' },
});
