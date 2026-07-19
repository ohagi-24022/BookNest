import Ionicons from '@expo/vector-icons/Ionicons';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { useAppTheme } from '../../src/store/ThemeContext';

const sections = [
  {
    title: '取得する情報',
    body:
      'BookNestは、アカウント情報、蔵書情報、欲しい漫画情報、通知情報、ランキング集計に必要な匿名集計値、アプリ設定を保存または利用する場合があります。',
  },
  {
    title: '利用目的',
    body:
      '蔵書・シリーズ・巻抜けの管理、ISBN検索、表紙画像URLの取得、欲しい漫画リスト、新刊通知、ランキング表示、アカウント管理、不具合調査のために利用します。',
  },
  {
    title: 'ランキング',
    body:
      'ランキングでは、個々のユーザー名やメールアドレスは表示しません。作品ごとの欲しい人数、平均優先度、所持人数、登録冊数などの集計値のみを表示し、少人数のデータは除外する場合があります。',
  },
  {
    title: '外部サービス',
    body:
      'Supabase、Expo Push Notifications、OpenBD、Google Books API、Rakuten Books API、外部ECサイトまたはブラウザを利用する場合があります。',
  },
  {
    title: '削除',
    body:
      'アカウント削除を行うと、クラウド上の蔵書情報、欲しい漫画情報、通知トークン、シリーズ通知設定、通知ログ、認証アカウントが削除されます。',
  },
  {
    title: '安全管理',
    body:
      '運用ログなど管理用の情報は一般ユーザーから閲覧できないよう制限し、アクセス制御、認証、通信の暗号化など合理的な安全管理措置を講じます。',
  },
];

export default function PrivacyScreen() {
  const { colors } = useAppTheme();

  return (
    <ScrollView
      style={[styles.screen, { backgroundColor: colors.background }]}
      contentContainerStyle={styles.content}
    >
      <View style={styles.header}>
        <View style={[styles.iconBox, { backgroundColor: colors.elevated }]}>
          <Ionicons color={colors.text} name="shield-checkmark-outline" size={28} />
        </View>
        <Text style={[styles.title, { color: colors.text }]}>プライバシーポリシー</Text>
        <Text style={[styles.copy, { color: colors.muted }]}>
          最終更新日: 2026年7月13日
        </Text>
        <Text style={[styles.copy, { color: colors.muted }]}>
          この画面は公開前の雛形です。公開時には運営者名、問い合わせ先、公開URL、適用される法令やストア要件に合わせて確認してください。
        </Text>
      </View>

      {sections.map((section) => (
        <View key={section.title} style={[styles.card, { borderColor: colors.border }]}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>{section.title}</Text>
          <Text style={[styles.body, { color: colors.muted }]}>{section.body}</Text>
        </View>
      ))}

      <View style={[styles.card, { borderColor: colors.border }]}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>問い合わせ先</Text>
        <Text style={[styles.body, { color: colors.muted }]}>
          運営者: TODO: 運営者名を記載{'\n'}
          問い合わせ先: TODO: メールアドレスまたは問い合わせフォームURLを記載
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { gap: 12, padding: 18, paddingBottom: 40 },
  header: { gap: 8, marginBottom: 4 },
  iconBox: {
    alignItems: 'center',
    borderRadius: 8,
    height: 48,
    justifyContent: 'center',
    width: 48,
  },
  title: { fontSize: 24, fontWeight: '900' },
  copy: { fontSize: 13, lineHeight: 19 },
  card: { borderRadius: 8, borderWidth: 1, gap: 7, padding: 14 },
  sectionTitle: { fontSize: 16, fontWeight: '900' },
  body: { fontSize: 14, lineHeight: 21 },
});
