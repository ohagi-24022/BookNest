import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { useAppTheme } from '../src/store/ThemeContext';

const helpCategories = [
  {
    icon: 'barcode-outline' as const,
    title: '登録',
    sections: [
      {
        title: '本を登録する',
        body:
          '登録タブではISBNバーコードを読み取って、タイトル、作者、出版社、表紙、シリーズ名、巻数を自動取得します。候補が見つかったら確認画面で内容を見直し、「追加」で本棚へ登録します。',
      },
      {
        title: '連続登録を使う',
        body:
          '連続登録にすると、スキャン後に画面を移動せず次の本を読み取れます。大量に登録したい時に便利です。誤登録があった場合は、本棚やシリーズ詳細から削除、再取得、編集を行えます。',
      },
      {
        title: '手動登録',
        body:
          'バーコードがない本や取得に失敗した本は、手動登録から追加できます。タイトル、シリーズ名、巻数を入力しておくと、シリーズ整理や巻抜け検出に使えます。',
      },
    ],
  },
  {
    icon: 'library-outline' as const,
    title: '本棚',
    sections: [
      {
        title: 'シリーズで見る',
        body:
          '本棚では同じシリーズの本がまとまります。表示条件で未読、読書中、読了、巻抜け、お気に入り、作者、出版社などを絞り込めます。',
      },
      {
        title: '巻抜けを確認する',
        body:
          '途中の巻が抜けている場合は「不足」として表示されます。シリーズ詳細では未所持巻がグレー表示され、購入候補を開いたり、すでに買った巻として追加したりできます。',
      },
      {
        title: 'シリーズ名を直す',
        body:
          'APIの表記揺れで同じ作品が別シリーズになった場合は、シリーズ詳細の「シリーズ名変更」を使います。同じ名前に変更するとシリーズがまとめられます。',
      },
    ],
  },
  {
    icon: 'albums-outline' as const,
    title: 'シリーズ詳細',
    sections: [
      {
        title: '読書ステータスを変える',
        body:
          '本のカードを押すと選択状態になります。選択中だけステータス変更ボタンが表示され、未読、読書中、読了へまとめて変更できます。',
      },
      {
        title: '巻の詳細を見る',
        body:
          '「詳細」ボタンを押すと、その巻の表紙、タイトル、作者、出版社、ISBN、紹介文を確認できます。紹介文は押した時に取得するため、API側に説明がない本では表示されない場合があります。',
      },
      {
        title: 'お気に入り',
        body:
          'しおりアイコンでシリーズをお気に入りにできます。お気に入りは表示条件や並び替えにも反映されるため、集めている途中の作品を見つけやすくなります。',
      },
    ],
  },
  {
    icon: 'notifications-outline' as const,
    title: '通知',
    sections: [
      {
        title: '新刊通知',
        body:
          '設定画面で新刊通知をONにすると、本棚のシリーズカードにあるベルでシリーズごとの通知を選べます。黄色のベルは「このシリーズの新刊を通知」、グレーのベルは「このシリーズは通知しない」という意味です。',
      },
      {
        title: '通知の詳細',
        body:
          '通知本文にはシリーズ名を出さず、詳細はユーザーページで確認します。新しく追加されたシリーズは最初は通知OFFです。',
      },
    ],
  },
  {
    icon: 'cart-outline' as const,
    title: '欲しい漫画',
    sections: [
      {
        title: '欲しい漫画リスト',
        body:
          '欲しいタブでは、まだ持っていない漫画や集めたいシリーズを優先度付きで保存できます。最優先、気になる、いつか欲しいから選んで追加し、あとから上下ボタンで点数を調整できます。',
      },
      {
        title: 'ランキング',
        body:
          'ランキングタブでは、利用者が欲しい漫画に追加した作品を集計して表示します。ログイン中に追加した欲しい漫画は、集計ランキングにも反映されます。',
      },
    ],
  },
  {
    icon: 'settings-outline' as const,
    title: '設定',
    sections: [
      {
        title: 'クラウド同期',
        body:
          'ログインしていない場合も端末内に保存できます。アカウント作成後は設定画面からローカル蔵書をクラウドへ移行できます。',
      },
      {
        title: 'バックアップ',
        body:
          'バックアップ欄ではCSVまたはJSONとして蔵書データを共有できます。機種変更前や大きな編集前の控えとして使えます。',
      },
    ],
  },
];

export default function HelpScreen() {
  const { colors } = useAppTheme();
  const [selectedIndex, setSelectedIndex] = useState(0);
  const selectedCategory = helpCategories[selectedIndex];

  return (
    <ScrollView
      style={[styles.screen, { backgroundColor: colors.background }]}
      contentContainerStyle={styles.content}
    >
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.text }]}>BookNestの使い方</Text>
        <Text style={[styles.copy, { color: colors.muted }]}>
          知りたい項目を選ぶと、その機能の操作方法を確認できます。
        </Text>
      </View>

      <View style={styles.categoryGrid}>
        {helpCategories.map((category, index) => {
          const selected = index === selectedIndex;
          return (
            <Pressable
              key={category.title}
              onPress={() => setSelectedIndex(index)}
              style={[
                styles.categoryButton,
                { borderColor: selected ? colors.text : colors.border },
                selected && { backgroundColor: colors.text },
              ]}
            >
              <Ionicons color={selected ? colors.background : colors.text} name={category.icon} size={19} />
              <Text style={[styles.categoryText, { color: selected ? colors.background : colors.text }]}>
                {category.title}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <View style={styles.sectionHeader}>
        <Ionicons color={colors.text} name={selectedCategory.icon} size={22} />
        <Text style={[styles.sectionTitle, { color: colors.text }]}>{selectedCategory.title}</Text>
      </View>

      {selectedCategory.sections.map((section) => (
        <View key={section.title} style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.cardTitle, { color: colors.text }]}>{section.title}</Text>
          <Text style={[styles.cardCopy, { color: colors.muted }]}>{section.body}</Text>
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { gap: 14, padding: 18, paddingBottom: 34 },
  header: { paddingBottom: 2 },
  title: { fontSize: 24, fontWeight: '900' },
  copy: { fontSize: 14, lineHeight: 21, marginTop: 8 },
  categoryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  categoryButton: {
    alignItems: 'center',
    borderRadius: 8,
    borderWidth: 1,
    flexBasis: '31%',
    flexDirection: 'row',
    gap: 5,
    height: 40,
    justifyContent: 'center',
    minWidth: 96,
  },
  categoryText: { fontSize: 13, fontWeight: '800' },
  sectionHeader: { alignItems: 'center', flexDirection: 'row', gap: 8, marginTop: 4 },
  sectionTitle: { fontSize: 19, fontWeight: '900' },
  card: {
    borderRadius: 8,
    borderWidth: 1,
    padding: 14,
  },
  cardTitle: { fontSize: 16, fontWeight: '800' },
  cardCopy: { fontSize: 13, lineHeight: 20, marginTop: 8 },
});
