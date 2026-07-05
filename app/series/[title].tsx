import * as WebBrowser from 'expo-web-browser';
import { useLocalSearchParams, useNavigation } from 'expo-router';
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
  const seriesTitle = decodeURIComponent(params.title ?? '');
  const { addBook, getSeriesItems, bulkUpdateStatus, updateBook, deleteBook, repairBookMetadata } =
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

  const items = useMemo(() => getSeriesItems(seriesTitle), [getSeriesItems, seriesTitle]);
  const selectedCount = selectedIds.length;
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
          <Text style={[styles.headerFavoriteText, { color: favorite ? '#c58b00' : colors.muted }]}>
            {favorite ? '★' : '☆'}
          </Text>
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
      Alert.alert(
        '再取得デバッグ',
        [
          `対象: ${book.title}`,
          `検索語: ${result.lookupTitle}`,
          `取得タイトル: ${result.title}`,
          `シリーズ: ${result.seriesTitle ?? 'なし'}`,
          `巻数: ${result.volumeNumber ?? 'なし'}`,
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
          disabled={selectedCount === 0}
          onPress={() => updateSelected('unread')}
          style={[styles.bulkButton, { backgroundColor: colors.text }, selectedCount === 0 && styles.disabledButton]}
        >
          <Text style={[styles.bulkButtonText, { color: colors.background }]}>積読に戻す</Text>
        </Pressable>
        <Pressable
          disabled={selectedCount === 0}
          onPress={() => updateSelected('read')}
          style={[styles.bulkButton, { backgroundColor: colors.success }, selectedCount === 0 && styles.disabledButton]}
        >
          <Text style={styles.bulkButtonText}>読了にする</Text>
        </Pressable>
      </View>

      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => {
          const selected = selectedIds.includes(item.id);
          const missing = item.isMissing;

          return (
            <View
              style={[
                styles.row,
                { backgroundColor: missing ? colors.elevated : colors.surface, borderColor: colors.border },
                selected && { borderColor: colors.primary, borderWidth: 2 },
              ]}
            >
              <Pressable
                onPress={() => (missing ? void addMissingAsOwned(item) : toggleSelected(item))}
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
              <Pressable
                onLongPress={() => isOwnedBook(item) && startEditing(item)}
                style={styles.rowBody}
              >
                <Text style={[styles.bookTitle, { color: missing ? colors.muted : colors.text }]} numberOfLines={2}>
                  {item.title}
                </Text>
                <Text style={[styles.meta, { color: colors.muted }]}>
                  {item.volumeNumber ? `${item.volumeNumber}巻` : '巻数なし'} /{' '}
                  {missing ? '未所持' : statusLabels[item.status]}
                </Text>
                {missing && (
                  <View style={styles.actionRow}>
                    <Pressable
                      onPress={() => void openPurchaseCandidates(item)}
                      style={[styles.smallButton, { borderColor: colors.primary }]}
                    >
                      <Text style={[styles.smallButtonText, { color: colors.primary }]}>購入候補</Text>
                    </Pressable>
                    <Pressable
                      disabled={refreshingId === item.id}
                      onPress={() => void addMissingAsOwned(item)}
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
                  <View style={styles.editBox}>
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
                  </View>
                )}
                {isOwnedBook(item) && (
                  <View style={styles.actionRow}>
                    <Pressable
                      disabled={refreshingId === item.id}
                      onPress={() => refreshMetadata(item)}
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
                      onPress={() => confirmDelete(item)}
                      style={[styles.smallButton, { borderColor: colors.danger }]}
                    >
                      <Text style={[styles.smallButtonText, { color: colors.danger }]}>削除</Text>
                    </Pressable>
                  </View>
                )}
              </Pressable>
            </View>
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
  list: { padding: 14 },
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
  headerFavoriteText: { fontSize: 22, lineHeight: 26 },
});
