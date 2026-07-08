import Ionicons from '@expo/vector-icons/Ionicons';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { useAppTheme } from '../src/store/ThemeContext';

const helpSections = [
  {
    icon: 'barcode-outline' as const,
    title: '本を登録する',
    body:
      '登録タブで本の裏表紙にあるISBNバーコードを読み取ると、タイトル、作者、出版社、表紙、シリーズ名、巻数を自動で取得します。候補が見つかったら確認画面で内容を見直し、「追加」で本棚に登録します。バーコードがない本や取得に失敗した本は、下の手動登録からタイトルや巻数を入力して追加できます。',
  },
  {
    icon: 'repeat-outline' as const,
    title: '連続登録を使う',
    body:
      '登録画面のモードを連続登録にすると、スキャン後に画面を移動せず次の本を読み取れます。同じシリーズをまとめて入れるときに便利です。誤登録があった場合は、本棚やシリーズ詳細から削除、または再取得で情報を更新できます。',
  },
  {
    icon: 'library-outline' as const,
    title: '本棚を見る',
    body:
      '本棚ではシリーズごとに本がまとまります。上部の表示条件で未読、読書中、読了、巻抜け、お気に入りを切り替えられます。作者や出版社で絞り込む場合は、表示条件から「作者で絞る」「出版社で絞る」を選んでください。並び替えでは最近追加、名前順、巻抜け優先、所持率順などを選べます。',
  },
  {
    icon: 'albums-outline' as const,
    title: '巻抜けと未所持巻',
    body:
      '途中の巻が抜けている場合は「不足」として表示されます。刊行最新巻の表示を有効にして更新すると、持っている最新巻より先に出版済みの巻は「未所持」として分けて表示されます。シリーズ詳細の未所持巻では購入候補を開いたり、所持に追加したりできます。',
  },
  {
    icon: 'checkmark-done-outline' as const,
    title: 'シリーズ詳細でまとめて変更する',
    body:
      'シリーズ詳細では、本のカード全体を押すと選択できます。1冊以上選ぶと画面下部にステータス変更ボタンが表示され、未読、読書中、読了へまとめて変更できます。「全選択」「全解除」を使うと、シリーズ内の本をまとめて選び直せます。',
  },
  {
    icon: 'book-outline' as const,
    title: '巻の詳細を見る',
    body:
      'シリーズ詳細で「詳細を見る」を押すと、その巻の表紙、タイトル、作者、出版社、ISBN、紹介文を確認できます。古い本やAPI側に紹介文がない本は説明が取れないことがあります。その場合でも再取得で表紙や出版社が補完されることがあります。',
  },
  {
    icon: 'git-compare-outline' as const,
    title: 'シリーズ名を直す',
    body:
      'APIの表記揺れで同じ作品が別シリーズに分かれた場合は、シリーズ詳細の「シリーズ名変更」を使います。既存のシリーズ名と同じ名前を入力すると、そのシリーズへまとめられます。巻数がずれている場合は、各巻を長押ししてシリーズ名や巻数を個別に編集できます。',
  },
  {
    icon: 'bookmark-outline' as const,
    title: 'お気に入り',
    body:
      'シリーズ画面やシリーズ詳細のしおりアイコンで、お気に入りを付けられます。本棚の表示条件や並び替えにも反映されるので、集めている途中の作品やよく確認する作品を上に出しやすくなります。',
  },
  {
    icon: 'cloud-upload-outline' as const,
    title: '保存とバックアップ',
    body:
      'ログインしなくても端末内に保存できます。アカウント作成後は、設定画面からローカル蔵書をクラウドへ移行できます。バックアップ欄ではCSVまたはJSONとして蔵書データを共有できるため、機種変更前や控えを残したいときに使えます。',
  },
];

export default function HelpScreen() {
  const { colors } = useAppTheme();

  return (
    <ScrollView
      style={[styles.screen, { backgroundColor: colors.background }]}
      contentContainerStyle={styles.content}
    >
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.text }]}>BookNestの使い方</Text>
        <Text style={[styles.copy, { color: colors.muted }]}>
          迷いやすい操作をまとめました。登録した本が増えてきたら、本棚の絞り込みとシリーズ詳細のまとめ操作が便利です。
        </Text>
      </View>

      {helpSections.map((section) => (
        <View key={section.title} style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={styles.cardHeading}>
            <View style={[styles.iconBox, { backgroundColor: colors.elevated }]}>
              <Ionicons color={colors.text} name={section.icon} size={20} />
            </View>
            <Text style={[styles.cardTitle, { color: colors.text }]}>{section.title}</Text>
          </View>
          <Text style={[styles.cardCopy, { color: colors.muted }]}>{section.body}</Text>
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { gap: 12, padding: 18, paddingBottom: 34 },
  header: { paddingBottom: 6 },
  title: { fontSize: 24, fontWeight: '900' },
  copy: { fontSize: 14, lineHeight: 21, marginTop: 8 },
  card: {
    borderRadius: 8,
    borderWidth: 1,
    padding: 14,
  },
  cardHeading: { alignItems: 'center', flexDirection: 'row', gap: 10 },
  iconBox: {
    alignItems: 'center',
    borderRadius: 8,
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  cardTitle: { flex: 1, fontSize: 16, fontWeight: '800' },
  cardCopy: { fontSize: 13, lineHeight: 20, marginTop: 10 },
});
