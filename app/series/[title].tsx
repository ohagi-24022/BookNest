import Ionicons from '@expo/vector-icons/Ionicons';
import * as WebBrowser from 'expo-web-browser';
import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { useLayoutEffect, useMemo, useState } from 'react';
import {
  Alert,
  FlatList,
  Linking,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { BookCover } from '../../src/components/BookCover';
import { buildPurchaseUrl, lookupBookByTitle } from '../../src/lib/bookApis';
import { useAppSettings } from '../../src/store/AppSettingsContext';
import { useLibrary } from '../../src/store/LibraryContext';
import { useAppTheme } from '../../src/store/ThemeContext';
import { Book, ReadingStatus, ShelfItem } from '../../src/types';

const statusLabels: Record<ReadingStatus, string> = {
  unread: '未読',
  reading: '読書中',
  read: '読了',
};

function isOwnedBook(item: ShelfItem): item is Book {
  return !item.isMissing;
}

export default function SeriesScreen() {
  const params = useLocalSearchParams<{ title: string }>();
  const navigation = useNavigation();
  const router = useRouter();
  const seriesTitle = decodeURIComponent(params.title ?? '');
  const { addBook, getSeriesItems, bulkUpdateStatus, updateBook, renameSeries, deleteBook, repairBookMetadata } =
    useLibrary();
  const {
    isFavoriteSeries,
    openExternalPurchaseLinks,
    toggleFavoriteSeries,
  } = useAppSettings();
  const { colors } = useAppTheme();
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [refreshingId, setRefreshingId] = useState<string | null>(null);
  const [draftSeries, setDraftSeries] = useState('');
  const [draftVolume, setDraftVolume] = useState('');
  const [renameOpen, setRenameOpen] = useState(false);
  const [draftSeriesTitle, setDraftSeriesTitle] = useState(seriesTitle);

  const items = useMemo(() => getSeriesItems(seriesTitle), [getSeriesItems, seriesTitle]);
  const ownedItems = useMemo(() => items.filter(isOwnedBook), [items]);
  const selectedCount = selectedIds.length;
  const allSelected = ownedItems.length > 0 && selectedCount === ownedItems.length;
  const favorite = isFavoriteSeries(seriesTitle);

  useLayoutEffect(() => {
    navigation.setOptions({
      title: seriesTitle,
      headerRight: () => (
        <Pressable
          accessibilityLabel={favorite ? 'お気に入りを解除' : 'お気に入りに追加'}
          hitSlop={10}
          onPress={() => toggleFavoriteSeries(seriesTitle)}
          style={styles.headerFavoriteButton}
        >
          <Ionicons
            color={favorite ? colors.primary : colors.muted}
            name={favorite ? 'bookmark' : 'bookmark-outline'}
            size={21}
          />
        </Pressable>
      ),
    });
  }, [colors.muted, favorite, navigation, seriesTitle, toggleFavoriteSeries]);

  const toggleSelected = (item: ShelfItem) => {
    if (!isOwnedBook(item)) {
      return;
    }

    setSelectedIds((current) =>
      current.includes(item.id) ? current.filter((id) => id !== item.id) : [...current, item.id],
    );
  };

  const openPurchaseCandidates = async (item: ShelfItem) => {
    const purchaseUrl = buildPurchaseUrl(item.seriesTitle, item.volumeNumber);
    if (openExternalPurchaseLinks) {
      await Linking.openURL(purchaseUrl);
    } else {
      await WebBrowser.openBrowserAsync(purchaseUrl);
    }
  };

  const addMissingAsOwned = async (item: ShelfItem) => {
    if (isOwnedBook(item) || refreshingId) return;
    setRefreshingId(item.id);
    try {
      const metadata = await lookupBookByTitle(`${item.seriesTitle} ${item.volumeNumber}巻`);
      await addBook({
        isbn: metadata?.isbn,
        title: metadata?.title ?? item.title,
        seriesTitle: item.seriesTitle,
        volumeNumber: item.volumeNumber,
        author: metadata?.author,
        publisher: metadata?.publisher,
        thumbnailUrl: metadata?.thumbnailUrl,
        status: 'unread',
      });
    } catch (error) {
      Alert.alert('追加できませんでした', error instanceof Error ? error.message : 'もう一度お試しください。');
    } finally {
      setRefreshingId(null);
    }
  };

  const updateSelected = async (status: ReadingStatus) => {
    try {
      await bulkUpdateStatus(selectedIds, status);
      setSelectedIds([]);
    } catch (error) {
      Alert.alert('BookNest', error instanceof Error ? error.message : '更新に失敗しました。');
    }
  };

  const toggleAllSelected = () => {
    setSelectedIds(allSelected ? [] : ownedItems.map((book) => book.id));
  };

  const startEditing = (book: Book) => {
    setEditingId(book.id);
    setDraftSeries(book.seriesTitle);
    setDraftVolume(book.volumeNumber ? String(book.volumeNumber) : '');
  };

  const submitEdit = async (book: Book) => {
    try {
      await updateBook(book.id, {
        seriesTitle: draftSeries.trim() || book.seriesTitle,
        volumeNumber: draftVolume ? Number.parseInt(draftVolume, 10) : undefined,
      });
      setEditingId(null);
    } catch (error) {
      Alert.alert('BookNest', error instanceof Error ? error.message : '保存に失敗しました。');
    }
  };

  const submitSeriesRename = async () => {
    try {
      const updatedCount = await renameSeries(seriesTitle, draftSeriesTitle);
      setRenameOpen(false);
      Alert.alert(
        'シリーズ名を更新しました',
        `${updatedCount}冊を「${draftSeriesTitle.trim()}」へ移しました。`,
      );
      router.replace(`/series/${encodeURIComponent(draftSeriesTitle.trim())}`);
    } catch (error) {
      Alert.alert('BookNest', error instanceof Error ? error.message : 'シリーズ名の更新に失敗しました。');
    }
  };

  const confirmDelete = (book: Book) => {
    Alert.alert('BookNest', `${book.title} を削除しますか？`, [
      { text: 'キャンセル', style: 'cancel' },
      {
        text: '削除',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteBook(book.id);
            setSelectedIds((current) => current.filter((id) => id !== book.id));
          } catch (error) {
            Alert.alert('BookNest', error instanceof Error ? error.message : '削除に失敗しました。');
          }
        },
      },
    ]);
  };

  const refreshMetadata = async (book: Book) => {
    if (refreshingId) return;
    setRefreshingId(book.id);
    try {
      const result = await repairBookMetadata(book.id);
      const beforeCover = result.beforeThumbnailUrl ? 'あり' : 'なし';
      const afterCover = result.afterThumbnailUrl ? 'あり' : 'なし';
      if (!__DEV__) {
        Alert.alert(
          '書籍情報を更新しました',
          `表紙: ${beforeCover} → ${afterCover}\n出版社: ${result.publisher ?? '未取得'}`,
        );
        return;
      }
      Alert.alert(
        '再取得デバッグ',
        [
          `対象: ${book.title}`,
          `検索語: ${result.lookupTitle}`,
          `取得タイトル: ${result.title}`,
          `シリーズ: ${result.seriesTitle ?? 'なし'}`,
          `巻数: ${result.volumeNumber ?? 'なし'}`,
          `出版社: ${result.publisher ?? 'なし'}`,
          `表紙: ${beforeCover} → ${afterCover}`,
          result.afterThumbnailUrl ? `表紙URL: ${result.afterThumbnailUrl}` : '表紙URL: なし',
          ...(result.debugEntries?.length
            ? [
                '',
                'API候補:',
                ...result.debugEntries.map((entry, index) =>
                  [
                    `${index + 1}. ${entry.provider} / ${entry.status}`,
                    `検索: ${entry.query}`,
                    entry.title ? `題名: ${entry.title}` : undefined,
                    entry.volumeNumber ? `巻数: ${entry.volumeNumber}` : undefined,
                    entry.coverUrl ? '表紙URL: あり' : '表紙URL: なし',
                    entry.reason ? `理由: ${entry.reason}` : undefined,
                  ]
                    .filter(Boolean)
                    .join(' / '),
                ),
              ]
            : []),
        ].join('\n'),
      );
    } catch (error) {
      Alert.alert('BookNest', error instanceof Error ? error.message : '再取得に失敗しました。');
    } finally {
      setRefreshingId(null);
    }
  };

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <View style={[styles.bulkBar, { borderBottomColor: colors.border }]}>
        <Text style={[styles.bulkText, { color: colors.muted }]}>{selectedCount} 冊選択中</Text>
        <Pressable
          onPress={() => {
            setDraftSeriesTitle(seriesTitle);
            setRenameOpen((current) => !current);
          }}
          style={[styles.bulkButton, { borderColor: colors.border, borderWidth: 1 }]}
        >
          <Text style={[styles.bulkButtonText, { color: colors.text }]}>シリーズ名変更</Text>
        </Pressable>
        <Pressable
          disabled={ownedItems.length === 0}
          onPress={toggleAllSelected}
          style={[styles.bulkButton, { borderColor: colors.border, borderWidth: 1 }, ownedItems.length === 0 && styles.disabledButton]}
        >
          <Text style={[styles.bulkButtonText, { color: colors.text }]}>
            {allSelected ? '全解除' : '全選択'}
          </Text>
        </Pressable>
      </View>
      <View style={[styles.statusSlot, { borderBottomColor: colors.border }]}>
        {selectedCount > 0 ? (
          <View
            style={[
              styles.statusBar,
              {
                backgroundColor: colors.surface,
                borderColor: colors.border,
                shadowColor: '#000000',
              },
            ]}
          >
            <Pressable
              onPress={() => updateSelected('unread')}
              style={[styles.statusButton, { borderColor: colors.border }]}
            >
              <Text style={[styles.statusButtonText, { color: colors.text }]}>未読にする</Text>
            </Pressable>
            <Pressable
              onPress={() => updateSelected('reading')}
              style={[styles.statusButton, { borderColor: colors.border }]}
            >
              <Text style={[styles.statusButtonText, { color: colors.text }]}>読書中にする</Text>
            </Pressable>
            <Pressable
              onPress={() => updateSelected('read')}
              style={[styles.statusButton, { backgroundColor: colors.success, borderColor: colors.success }]}
            >
              <Text style={styles.statusButtonText}>読了にする</Text>
            </Pressable>
          </View>
        ) : (
          <Text style={[styles.statusHint, { color: colors.muted }]}>
            本を選択するとステータスをまとめて変更できます
          </Text>
        )}
      </View>
      {renameOpen && (
        <View style={[styles.renameBox, { borderBottomColor: colors.border }]}>
          <Text style={[styles.rowTitle, { color: colors.text }]}>シリーズ名の一括変更</Text>
          <Text style={[styles.renameCopy, { color: colors.muted }]}>
            既存のシリーズ名を入力すると、そのシリーズへ統合します。
          </Text>
          <View style={styles.renameRow}>
            <TextInput
              value={draftSeriesTitle}
              onChangeText={setDraftSeriesTitle}
              placeholder="シリーズ名"
              placeholderTextColor={colors.muted}
              style={[styles.renameInput, { backgroundColor: colors.input, color: colors.text }]}
            />
            <Pressable
              onPress={() => void submitSeriesRename()}
              style={[styles.saveButton, styles.renameSaveButton, { backgroundColor: colors.text }]}
            >
              <Text style={[styles.saveButtonText, { color: colors.background }]}>反映</Text>
            </Pressable>
          </View>
        </View>
      )}

      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => {
          const selected = selectedIds.includes(item.id);
          const missing = item.isMissing;

          return (
            <Pressable
              onPress={() => (missing ? void addMissingAsOwned(item) : toggleSelected(item))}
              onLongPress={() => isOwnedBook(item) && startEditing(item)}
              style={[
                styles.row,
                { backgroundColor: missing ? colors.elevated : colors.surface, borderColor: colors.border },
                selected && { borderColor: colors.primary, borderWidth: 2 },
              ]}
            >
              <Pressable
                onPress={(event) => {
                  event.stopPropagation();
                  if (missing) void addMissingAsOwned(item);
                  else toggleSelected(item);
                }}
                style={[styles.checkbox, { borderColor: colors.border }]}
              >
                <Text style={[styles.checkboxText, { color: colors.text }]}>{selected ? '✓' : missing ? '+' : ''}</Text>
              </Pressable>
              <BookCover
                thumbnailUrl={item.thumbnailUrl}
                isbn={isOwnedBook(item) ? item.isbn : undefined}
                style={styles.cover}
                missing={missing}
                placeholderText={`No.${item.volumeNumber ?? '-'}`}
              />
              <View style={styles.rowBody}>
                <View>
                  <Text
                    style={[styles.bookTitle, { color: missing ? colors.muted : colors.text }]}
                    numberOfLines={2}
                  >
                    {item.title}
                  </Text>
                  <View style={styles.metaRow}>
                    <Text style={[styles.meta, { color: colors.muted }]}>
                      {item.volumeNumber ? `${item.volumeNumber}巻` : '巻数なし'}
                      {missing ? ' / 未所持' : ''}
                    </Text>
                    {isOwnedBook(item) && (
                      <View style={[styles.statusPill, { backgroundColor: colors.elevated }]}>
                        <Text style={[styles.statusPillText, { color: colors.text }]}>
                          {statusLabels[item.status]}
                        </Text>
                      </View>
                    )}
                  </View>
                  {isOwnedBook(item) && (item.author || item.publisher) && (
                    <Text style={[styles.credits, { color: colors.muted }]} numberOfLines={2}>
                      {[item.author, item.publisher].filter(Boolean).join(' / ')}
                    </Text>
                  )}
                </View>
                {missing && (
                  <View style={styles.actionRow}>
                    <Pressable
                      onPress={(event) => {
                        event.stopPropagation();
                        void openPurchaseCandidates(item);
                      }}
                      style={[styles.smallButton, { borderColor: colors.primary }]}
                    >
                      <Text style={[styles.smallButtonText, { color: colors.primary }]}>購入候補</Text>
                    </Pressable>
                    <Pressable
                      disabled={refreshingId === item.id}
                      onPress={(event) => {
                        event.stopPropagation();
                        void addMissingAsOwned(item);
                      }}
                      style={[
                        styles.smallButton,
                        { backgroundColor: colors.text, borderColor: colors.text },
                        refreshingId === item.id && styles.disabledButton,
                      ]}
                    >
                      <Text style={[styles.smallButtonText, { color: colors.background }]}>
                        {refreshingId === item.id ? '検索中' : '所持に追加'}
                      </Text>
                    </Pressable>
                  </View>
                )}
                {isOwnedBook(item) && editingId === item.id && (
                  <Pressable
                    onPress={(event) => event.stopPropagation()}
                    style={styles.editBox}
                  >
                    <TextInput
                      value={draftSeries}
                      onChangeText={setDraftSeries}
                      placeholder="シリーズ名"
                      placeholderTextColor={colors.muted}
                      style={[styles.editInput, { backgroundColor: colors.input, color: colors.text }]}
                    />
                    <TextInput
                      value={draftVolume}
                      onChangeText={setDraftVolume}
                      keyboardType="number-pad"
                      placeholder="巻"
                      placeholderTextColor={colors.muted}
                      style={[styles.editInput, { backgroundColor: colors.input, color: colors.text }]}
                    />
                    <Pressable onPress={() => submitEdit(item)} style={[styles.saveButton, { backgroundColor: colors.text }]}>
                      <Text style={[styles.saveButtonText, { color: colors.background }]}>保存</Text>
                    </Pressable>
                  </Pressable>
                )}
                {isOwnedBook(item) && (
                  <View style={styles.actionRow}>
                    <Pressable
                      onPress={(event) => {
                        event.stopPropagation();
                        router.push(`/book/${encodeURIComponent(item.id)}`);
                      }}
                      style={[styles.smallButton, { borderColor: colors.primary }]}
                    >
                      <Text style={[styles.smallButtonText, { color: colors.primary }]}>詳細を見る</Text>
                    </Pressable>
                    <Pressable
                      disabled={refreshingId === item.id}
                      onPress={(event) => {
                        event.stopPropagation();
                        refreshMetadata(item);
                      }}
                      style={[
                        styles.smallButton,
                        { borderColor: colors.border },
                        refreshingId === item.id && styles.disabledButton,
                      ]}
                    >
                      <Text style={[styles.smallButtonText, { color: colors.text }]}>
                        {refreshingId === item.id ? '再取得中' : '再取得'}
                      </Text>
                    </Pressable>
                    <Pressable
                      onPress={(event) => {
                        event.stopPropagation();
                        confirmDelete(item);
                      }}
                      style={[styles.smallButton, { borderColor: colors.danger }]}
                    >
                      <Text style={[styles.smallButtonText, { color: colors.danger }]}>削除</Text>
                    </Pressable>
                  </View>
                )}
              </View>
            </Pressable>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  bulkBar: {
    alignItems: 'center',
    borderBottomWidth: 1,
    flexDirection: 'row',
    gap: 8,
    padding: 12,
  },
  bulkText: { flex: 1, fontSize: 13, fontWeight: '700' },
  bulkButton: {
    borderRadius: 8,
    height: 38,
    justifyContent: 'center',
    paddingHorizontal: 10,
  },
  disabledButton: { opacity: 0.35 },
  bulkButtonText: { color: '#ffffff', fontSize: 12, fontWeight: '800' },
  statusSlot: {
    borderBottomWidth: 1,
    minHeight: 58,
    justifyContent: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  statusHint: { fontSize: 12, fontWeight: '700', textAlign: 'center' },
  statusBar: {
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    shadowOffset: { height: 3, width: 0 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
  },
  statusButton: {
    alignItems: 'center',
    borderRadius: 8,
    borderWidth: 1,
    flex: 1,
    height: 36,
    justifyContent: 'center',
  },
  statusButtonText: { color: '#ffffff', fontSize: 12, fontWeight: '800' },
  renameBox: { borderBottomWidth: 1, gap: 8, padding: 12 },
  rowTitle: { fontSize: 14, fontWeight: '800' },
  renameCopy: { fontSize: 12, lineHeight: 17 },
  renameRow: { flexDirection: 'row', gap: 8 },
  renameInput: {
    borderRadius: 8,
    flex: 1,
    fontSize: 15,
    height: 40,
    paddingHorizontal: 10,
  },
  renameSaveButton: { height: 40, marginTop: 0, paddingHorizontal: 16 },
  list: { padding: 14, paddingBottom: 28 },
  row: {
    alignItems: 'center',
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 12,
    marginBottom: 10,
    padding: 10,
  },
  checkbox: {
    alignItems: 'center',
    borderRadius: 4,
    borderWidth: 1,
    height: 24,
    justifyContent: 'center',
    width: 24,
  },
  checkboxText: { fontSize: 14, fontWeight: '900' },
  cover: { backgroundColor: '#e5e5e5', borderRadius: 4, height: 88, width: 60 },
  missingCover: { opacity: 0.35 },
  coverFallback: { alignItems: 'center', justifyContent: 'center' },
  coverFallbackText: { color: '#555555', fontSize: 11, fontWeight: '800' },
  rowBody: { flex: 1 },
  bookTitle: { fontSize: 16, fontWeight: '800', lineHeight: 21 },
  meta: { fontSize: 13, marginTop: 6 },
  metaRow: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  statusPill: {
    borderRadius: 999,
    marginTop: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  statusPillText: { fontSize: 11, fontWeight: '800' },
  credits: { fontSize: 12, lineHeight: 17, marginTop: 4 },
  editBox: { gap: 8, marginTop: 10 },
  editInput: {
    borderRadius: 8,
    height: 40,
    paddingHorizontal: 10,
  },
  saveButton: {
    alignItems: 'center',
    borderRadius: 8,
    height: 38,
    justifyContent: 'center',
  },
  saveButtonText: { fontSize: 13, fontWeight: '800' },
  actionRow: { flexDirection: 'row', gap: 8, marginTop: 10 },
  smallButton: {
    alignItems: 'center',
    borderRadius: 8,
    borderWidth: 1,
    height: 34,
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  smallButtonText: { fontSize: 12, fontWeight: '800' },
  headerFavoriteButton: {
    alignItems: 'center',
    height: 36,
    justifyContent: 'center',
    width: 40,
  },
});
