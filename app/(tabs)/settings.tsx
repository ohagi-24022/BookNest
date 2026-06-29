import * as Notifications from 'expo-notifications';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';

import { supabase } from '../../src/lib/supabase';

export default function SettingsScreen() {
  const [openExternalApp, setOpenExternalApp] = useState(false);
  const [newReleaseNotifications, setNewReleaseNotifications] = useState(false);
  const [theme, setTheme] = useState<'system' | 'light' | 'dark'>('system');

  const toggleNotifications = async (value: boolean) => {
    if (value) {
      const permission = await Notifications.requestPermissionsAsync();
      setNewReleaseNotifications(permission.granted);
      return;
    }

    setNewReleaseNotifications(false);
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>アカウント</Text>
        <View style={styles.row}>
          <View>
            <Text style={styles.rowTitle}>プロフィール</Text>
            <Text style={styles.rowCopy}>
              {supabase ? 'Supabase Auth が設定済みです。' : 'Supabase の環境変数を追加すると認証が有効になります。'}
            </Text>
          </View>
        </View>
        <Pressable style={styles.neutralButton}>
          <Text style={styles.neutralButtonText}>パスワード変更</Text>
        </Pressable>
        <Pressable style={styles.neutralButton}>
          <Text style={styles.neutralButtonText}>ログアウト</Text>
        </Pressable>
        <Pressable style={styles.dangerButton}>
          <Text style={styles.dangerButtonText}>アカウント削除</Text>
        </Pressable>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>外部EC</Text>
        <View style={styles.row}>
          <View style={styles.rowText}>
            <Text style={styles.rowTitle}>外部アプリで直接開く</Text>
            <Text style={styles.rowCopy}>
              ONは購入アプリへ直接遷移、OFFはBookNest内ブラウザで開きます。
            </Text>
          </View>
          <Switch
            onValueChange={setOpenExternalApp}
            thumbColor="#ffffff"
            trackColor={{ false: '#d4d4d4', true: '#31c759' }}
            value={openExternalApp}
          />
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>通知</Text>
        <View style={styles.row}>
          <View style={styles.rowText}>
            <Text style={styles.rowTitle}>新刊通知</Text>
            <Text style={styles.rowCopy}>
              Supabase Cronで登録シリーズを監視し、Expoプッシュ通知を送れます。
            </Text>
          </View>
          <Switch
            onValueChange={toggleNotifications}
            thumbColor="#ffffff"
            trackColor={{ false: '#d4d4d4', true: '#31c759' }}
            value={newReleaseNotifications}
          />
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>表示</Text>
        <View style={styles.segmented}>
          {(['system', 'light', 'dark'] as const).map((option) => (
            <Pressable
              key={option}
              onPress={() => setTheme(option)}
              style={[styles.segment, theme === option && styles.segmentActive]}
            >
              <Text style={[styles.segmentText, theme === option && styles.segmentTextActive]}>
                {option === 'system' ? 'システム' : option === 'light' ? 'ライト' : 'ダーク'}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { backgroundColor: '#ffffff', flex: 1 },
  content: { gap: 18, padding: 18, paddingBottom: 40 },
  section: { borderBottomColor: '#e5e5e5', borderBottomWidth: 1, paddingBottom: 18 },
  sectionTitle: { color: '#111111', fontSize: 18, fontWeight: '800', marginBottom: 12 },
  row: { alignItems: 'center', flexDirection: 'row', gap: 12, minHeight: 56 },
  rowText: { flex: 1 },
  rowTitle: { color: '#111111', fontSize: 15, fontWeight: '800' },
  rowCopy: { color: '#666666', fontSize: 13, lineHeight: 18, marginTop: 3 },
  neutralButton: {
    alignItems: 'center',
    borderColor: '#d4d4d4',
    borderRadius: 8,
    borderWidth: 1,
    height: 44,
    justifyContent: 'center',
    marginTop: 10,
  },
  neutralButtonText: { color: '#111111', fontSize: 14, fontWeight: '800' },
  dangerButton: {
    alignItems: 'center',
    borderColor: '#ff3b30',
    borderRadius: 8,
    borderWidth: 1,
    height: 44,
    justifyContent: 'center',
    marginTop: 10,
  },
  dangerButtonText: { color: '#ff3b30', fontSize: 14, fontWeight: '800' },
  segmented: {
    backgroundColor: '#f3f3f3',
    borderRadius: 8,
    flexDirection: 'row',
    padding: 4,
  },
  segment: { alignItems: 'center', borderRadius: 6, flex: 1, height: 38, justifyContent: 'center' },
  segmentActive: { backgroundColor: '#111111' },
  segmentText: { color: '#555555', fontSize: 13, fontWeight: '800' },
  segmentTextActive: { color: '#ffffff' },
});
