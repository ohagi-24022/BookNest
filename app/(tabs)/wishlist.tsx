import Ionicons from '@expo/vector-icons/Ionicons';
import * as WebBrowser from 'expo-web-browser';
import { useMemo, useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { buildPurchaseUrl } from '../../src/lib/bookApis';
import { useAppTheme } from '../../src/store/ThemeContext';
import { useWishlist, WishlistItem } from '../../src/store/WishlistContext';

const priorityOptions = [
  { key: 'high', label: '最優先', score: 95, icon: 'flame-outline' as const },
  { key: 'normal', label: '気になる', score: 75, icon: 'sparkles-outline' as const },
  { key: 'later', label: 'いつか', score: 50, icon: 'time-outline' as const },
];

function priorityLabel(score: number) {
  if (score >= 90) return '最優先';
  if (score >= 70) return '気になる';
  return 'いつか欲しい';
}

export default function WishlistScreen() {
  const { colors } = useAppTheme();
  const { addItem, deleteItem, items, updateItem } = useWishlist();
  const [title, setTitle] = useState('');
  const [note, setNote] = useState('');
  const [selectedPriority, setSelectedPriority] = useState(priorityOptions[1]);
  const [memoOpen, setMemoOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState('');
  const [editingNote, setEditingNote] = useState('');
  const [lastDeleted, setLastDeleted] = useState<WishlistItem | null>(null);

  const trimmedTitle = title.trim();
  const topItems = useMemo(() => items.slice(0, 3), [items]);

  const submit = () => {
    if (!trimmedTitle) {
      Alert.alert('BookNest', '欲しい漫画のタイトルを入力してください。');
      return;
    }
    addItem({
      title: trimmedTitle,
      score: selectedPriority.score,
      note,
      purchaseUrl: buildPurchaseUrl(trimmedTitle),
    });
    setTitle('');
    setNote('');
    setMemoOpen(false);
    setSelectedPriority(priorityOptions[1]);
  };

  const startEditing = (item: WishlistItem) => {
    setEditingId(item.id);
    setEditingTitle(item.title);
    setEditingNote(item.note ?? '');
  };

  const submitEdit = (item: WishlistItem) => {
    updateItem(item.id, {
      title: editingTitle,
      note: editingNote,
    });
    setEditingId(null);
    setEditingTitle('');
    setEditingNote('');
  };

  const removeItem = (item: WishlistItem) => {
    deleteItem(item.id);
    setLastDeleted(item);
  };

  const undoDelete = () => {
    if (!lastDeleted) return;
    addItem({
      title: lastDeleted.title,
      score: lastDeleted.score,
      note: lastDeleted.note,
      purchaseUrl: lastDeleted.purchaseUrl,
    });
    setLastDeleted(null);
  };

  return (
    <ScrollView
      style={[styles.screen, { backgroundColor: colors.background }]}
      contentContainerStyle={styles.content}
    >
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.text }]}>欲しい漫画</Text>
        <Text style={[styles.copy, { color: colors.muted }]}>
          タイトルを入れて優先度を選ぶだけで、購入候補として残せます。
        </Text>
      </View>

      <View style={[styles.quickAdd, { backgroundColor: colors.elevated }]}>
        <View style={styles.inputRow}>
          <TextInput
            onChangeText={setTitle}
            placeholder="作品名、シリーズ名"
            placeholderTextColor={colors.muted}
            returnKeyType="done"
            style={[styles.titleInput, { backgroundColor: colors.input, color: colors.text }]}
            value={title}
            onSubmitEditing={submit}
          />
          <Pressable
            accessibilityLabel="欲しい漫画に追加"
            onPress={submit}
            style={[styles.addButton, { backgroundColor: colors.text }, !trimmedTitle && styles.disabledButton]}
          >
            <Ionicons color={colors.background} name="add" size={22} />
          </Pressable>
        </View>

        <View style={styles.priorityRow}>
          {priorityOptions.map((option) => {
            const selected = option.key === selectedPriority.key;
            return (
              <Pressable
                key={option.key}
                onPress={() => setSelectedPriority(option)}
                style={[
                  styles.priorityChip,
                  { borderColor: selected ? colors.text : colors.border },
                  selected && { backgroundColor: colors.text },
                ]}
              >
                <Ionicons color={selected ? colors.background : colors.text} name={option.icon} size={16} />
                <Text style={[styles.priorityText, { color: selected ? colors.background : colors.text }]}>
                  {option.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <Pressable onPress={() => setMemoOpen((current) => !current)} style={styles.memoToggle}>
          <Ionicons color={colors.muted} name={memoOpen ? 'chevron-up' : 'create-outline'} size={16} />
          <Text style={[styles.copyStrong, { color: colors.muted }]}>
            {memoOpen ? 'メモを閉じる' : 'メモを追加'}
          </Text>
        </Pressable>

        {memoOpen ? (
          <TextInput
            multiline
            onChangeText={setNote}
            placeholder="例: セール時に買う、紙で集めたい"
            placeholderTextColor={colors.muted}
            style={[styles.noteInput, { backgroundColor: colors.input, color: colors.text }]}
            value={note}
          />
        ) : null}
      </View>

      {lastDeleted ? (
        <View style={[styles.undoBar, { backgroundColor: colors.elevated, borderColor: colors.border }]}>
          <Text style={[styles.copyStrong, { color: colors.text }]} numberOfLines={1}>
            {lastDeleted.title}を削除しました
          </Text>
          <Pressable onPress={undoDelete} style={[styles.undoButton, { borderColor: colors.border }]}>
            <Text style={[styles.smallButtonText, { color: colors.text }]}>元に戻す</Text>
          </Pressable>
        </View>
      ) : null}

      {topItems.length > 0 ? (
        <View style={[styles.summary, { borderColor: colors.border }]}>
          <Text style={[styles.summaryTitle, { color: colors.text }]}>今の上位候補</Text>
          <View style={styles.summaryList}>
            {topItems.map((item, index) => (
              <Text key={item.id} style={[styles.summaryText, { color: colors.muted }]}>
                {index + 1}. {item.title}
              </Text>
            ))}
          </View>
        </View>
      ) : null}

      {items.length === 0 ? (
        <View style={[styles.emptyBox, { borderColor: colors.border }]}>
          <Ionicons color={colors.muted} name="cart-outline" size={30} />
          <Text style={[styles.emptyTitle, { color: colors.text }]}>購入候補はまだありません</Text>
          <Text style={[styles.copy, { color: colors.muted }]}>
            気になった作品をここに置いておくと、あとで優先順位と購入先をすぐ確認できます。
          </Text>
        </View>
      ) : (
        <View style={styles.list}>
          {items.map((item, index) => (
            <View key={item.id} style={[styles.card, { borderColor: colors.border }]}>
              <View style={styles.cardHeader}>
                <Text style={[styles.rankText, { color: colors.text }]}>#{index + 1}</Text>
                <View style={styles.cardBody}>
                  <Text style={[styles.cardTitle, { color: colors.text }]}>{item.title}</Text>
                  <View style={styles.metaRow}>
                    <Text style={[styles.scorePill, { backgroundColor: colors.elevated, color: colors.text }]}>
                      {priorityLabel(item.score)}
                    </Text>
                    <Text style={[styles.copy, { color: colors.muted }]}>{item.score}点</Text>
                  </View>
                  {item.note ? <Text style={[styles.copy, { color: colors.muted }]}>{item.note}</Text> : null}
                </View>
              </View>

              {editingId === item.id ? (
                <View style={styles.editBox}>
                  <TextInput
                    onChangeText={setEditingTitle}
                    placeholder="作品名"
                    placeholderTextColor={colors.muted}
                    style={[styles.editInput, { backgroundColor: colors.input, color: colors.text }]}
                    value={editingTitle}
                  />
                  <TextInput
                    multiline
                    onChangeText={setEditingNote}
                    placeholder="メモ"
                    placeholderTextColor={colors.muted}
                    style={[styles.editNoteInput, { backgroundColor: colors.input, color: colors.text }]}
                    value={editingNote}
                  />
                  <View style={styles.editActions}>
                    <Pressable
                      onPress={() => setEditingId(null)}
                      style={[styles.smallButton, { borderColor: colors.border }]}
                    >
                      <Text style={[styles.smallButtonText, { color: colors.text }]}>キャンセル</Text>
                    </Pressable>
                    <Pressable
                      onPress={() => submitEdit(item)}
                      style={[styles.smallButton, { backgroundColor: colors.text, borderColor: colors.text }]}
                    >
                      <Text style={[styles.smallButtonText, { color: colors.background }]}>保存</Text>
                    </Pressable>
                  </View>
                </View>
              ) : null}

              <View style={styles.actions}>
                <Pressable
                  onPress={() => void WebBrowser.openBrowserAsync(item.purchaseUrl ?? buildPurchaseUrl(item.title))}
                  style={[styles.smallButton, { borderColor: colors.border }]}
                >
                  <Ionicons color={colors.text} name="open-outline" size={16} />
                  <Text style={[styles.smallButtonText, { color: colors.text }]}>購入候補</Text>
                </Pressable>
                <Pressable
                  accessibilityLabel={`${item.title}を編集`}
                  onPress={() => startEditing(item)}
                  style={[styles.iconButton, { borderColor: colors.border }]}
                >
                  <Ionicons color={colors.text} name="create-outline" size={16} />
                </Pressable>
                <Pressable
                  accessibilityLabel={`${item.title}の優先度を上げる`}
                  onPress={() => updateItem(item.id, { score: item.score + 5 })}
                  style={[styles.iconButton, { borderColor: colors.border }]}
                >
                  <Ionicons color={colors.text} name="arrow-up" size={16} />
                </Pressable>
                <Pressable
                  accessibilityLabel={`${item.title}の優先度を下げる`}
                  onPress={() => updateItem(item.id, { score: item.score - 5 })}
                  style={[styles.iconButton, { borderColor: colors.border }]}
                >
                  <Ionicons color={colors.text} name="arrow-down" size={16} />
                </Pressable>
                <Pressable
                  accessibilityLabel={`${item.title}を削除`}
                  onPress={() => removeItem(item)}
                  style={[styles.iconButton, { borderColor: colors.danger }]}
                >
                  <Ionicons color={colors.danger} name="trash-outline" size={16} />
                </Pressable>
              </View>
            </View>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { gap: 16, padding: 18, paddingBottom: 40 },
  header: { gap: 4 },
  title: { fontSize: 24, fontWeight: '900' },
  copy: { fontSize: 13, lineHeight: 18 },
  copyStrong: { fontSize: 13, fontWeight: '800', lineHeight: 18 },
  quickAdd: { borderRadius: 8, gap: 12, padding: 12 },
  inputRow: { alignItems: 'center', flexDirection: 'row', gap: 8 },
  titleInput: { borderRadius: 8, flex: 1, fontSize: 16, height: 46, paddingHorizontal: 12 },
  addButton: {
    alignItems: 'center',
    borderRadius: 8,
    height: 46,
    justifyContent: 'center',
    width: 48,
  },
  disabledButton: { opacity: 0.45 },
  priorityRow: { flexDirection: 'row', gap: 8 },
  priorityChip: {
    alignItems: 'center',
    borderRadius: 8,
    borderWidth: 1,
    flex: 1,
    flexDirection: 'row',
    gap: 5,
    height: 38,
    justifyContent: 'center',
  },
  priorityText: { fontSize: 13, fontWeight: '800' },
  memoToggle: { alignItems: 'center', flexDirection: 'row', gap: 5 },
  noteInput: {
    borderRadius: 8,
    fontSize: 14,
    minHeight: 64,
    paddingHorizontal: 12,
    paddingTop: 10,
    textAlignVertical: 'top',
  },
  summary: { borderRadius: 8, borderWidth: 1, gap: 8, padding: 12 },
  summaryTitle: { fontSize: 15, fontWeight: '900' },
  summaryList: { gap: 4 },
  summaryText: { fontSize: 13, lineHeight: 18 },
  emptyBox: { alignItems: 'center', borderRadius: 8, borderWidth: 1, gap: 6, padding: 18 },
  emptyTitle: { fontSize: 16, fontWeight: '800' },
  list: { gap: 10 },
  card: { borderRadius: 8, borderWidth: 1, gap: 10, padding: 12 },
  cardHeader: { alignItems: 'flex-start', flexDirection: 'row', gap: 12 },
  rankText: { fontSize: 14, fontWeight: '900', minWidth: 34, paddingTop: 2 },
  cardBody: { flex: 1, gap: 5 },
  cardTitle: { fontSize: 16, fontWeight: '900' },
  metaRow: { alignItems: 'center', flexDirection: 'row', gap: 8 },
  scorePill: {
    borderRadius: 999,
    fontSize: 12,
    fontWeight: '800',
    overflow: 'hidden',
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  undoBar: {
    alignItems: 'center',
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  undoButton: {
    alignItems: 'center',
    borderRadius: 8,
    borderWidth: 1,
    height: 34,
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  editBox: { gap: 8, marginLeft: 46 },
  editInput: { borderRadius: 8, fontSize: 15, height: 42, paddingHorizontal: 12 },
  editNoteInput: {
    borderRadius: 8,
    fontSize: 14,
    minHeight: 58,
    paddingHorizontal: 12,
    paddingTop: 10,
    textAlignVertical: 'top',
  },
  editActions: { flexDirection: 'row', gap: 8, justifyContent: 'flex-end' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginLeft: 46 },
  smallButton: {
    alignItems: 'center',
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 5,
    height: 36,
    paddingHorizontal: 10,
  },
  smallButtonText: { fontSize: 13, fontWeight: '800' },
  iconButton: {
    alignItems: 'center',
    borderRadius: 8,
    borderWidth: 1,
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
});
