import * as WebBrowser from 'expo-web-browser';
import { useLocalSearchParams, useNavigation } from 'expo-router';
import { useLayoutEffect, useMemo, useState } from 'react';
import {
  FlatList,
  Image,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { buildPurchaseUrl } from '../../src/lib/bookApis';
import { useLibrary } from '../../src/store/LibraryContext';
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
  const { getSeriesItems, bulkUpdateStatus, updateBook } = useLibrary();
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftSeries, setDraftSeries] = useState('');
  const [draftVolume, setDraftVolume] = useState('');

  const items = useMemo(() => getSeriesItems(seriesTitle), [getSeriesItems, seriesTitle]);
  const selectedCount = selectedIds.length;

  useLayoutEffect(() => {
    navigation.setOptions({ title: seriesTitle });
  }, [navigation, seriesTitle]);

  const toggleSelected = (item: ShelfItem) => {
    if (!isOwnedBook(item)) {
      WebBrowser.openBrowserAsync(buildPurchaseUrl(item.seriesTitle, item.volumeNumber));
      return;
    }

    setSelectedIds((current) =>
      current.includes(item.id) ? current.filter((id) => id !== item.id) : [...current, item.id],
    );
  };

  const updateSelected = async (status: ReadingStatus) => {
    await bulkUpdateStatus(selectedIds, status);
    setSelectedIds([]);
  };

  const startEditing = (book: Book) => {
    setEditingId(book.id);
    setDraftSeries(book.seriesTitle);
    setDraftVolume(book.volumeNumber ? String(book.volumeNumber) : '');
  };

  const submitEdit = async (book: Book) => {
    await updateBook(book.id, {
      seriesTitle: draftSeries.trim() || book.seriesTitle,
      volumeNumber: draftVolume ? Number.parseInt(draftVolume, 10) : undefined,
    });
    setEditingId(null);
  };

  return (
    <View style={styles.screen}>
      <View style={styles.bulkBar}>
        <Text style={styles.bulkText}>{selectedCount} 冊選択中</Text>
        <Pressable
          disabled={selectedCount === 0}
          onPress={() => updateSelected('unread')}
          style={[styles.bulkButton, selectedCount === 0 && styles.disabledButton]}
        >
          <Text style={styles.bulkButtonText}>積読に戻す</Text>
        </Pressable>
        <Pressable
          disabled={selectedCount === 0}
          onPress={() => updateSelected('read')}
          style={[styles.bulkButton, styles.readButton, selectedCount === 0 && styles.disabledButton]}
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
            <Pressable
              onLongPress={() => isOwnedBook(item) && startEditing(item)}
              onPress={() => toggleSelected(item)}
              style={[styles.row, selected && styles.selectedRow, missing && styles.missingRow]}
            >
              <View style={styles.checkbox}>
                <Text style={styles.checkboxText}>{selected ? '✓' : missing ? '+' : ''}</Text>
              </View>
              {item.thumbnailUrl ? (
                <Image
                  source={{ uri: item.thumbnailUrl }}
                  style={[styles.cover, missing && styles.missingCover]}
                />
              ) : (
                <View style={[styles.cover, styles.coverFallback, missing && styles.missingCover]}>
                  <Text style={styles.coverFallbackText}>No.{item.volumeNumber}</Text>
                </View>
              )}
              <View style={styles.rowBody}>
                <Text style={[styles.bookTitle, missing && styles.missingText]} numberOfLines={2}>
                  {item.title}
                </Text>
                <Text style={[styles.meta, missing && styles.missingText]}>
                  {item.volumeNumber ? `${item.volumeNumber}巻` : '巻数なし'} /{' '}
                  {missing ? '未所持' : statusLabels[item.status]}
                </Text>
                {isOwnedBook(item) && editingId === item.id && (
                  <View style={styles.editBox}>
                    <TextInput
                      value={draftSeries}
                      onChangeText={setDraftSeries}
                      placeholder="シリーズ名"
                      style={styles.editInput}
                    />
                    <TextInput
                      value={draftVolume}
                      onChangeText={setDraftVolume}
                      keyboardType="number-pad"
                      placeholder="巻"
                      style={styles.editInput}
                    />
                    <Pressable onPress={() => submitEdit(item)} style={styles.saveButton}>
                      <Text style={styles.saveButtonText}>保存</Text>
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
  screen: { flex: 1, backgroundColor: '#ffffff' },
  bulkBar: {
    alignItems: 'center',
    borderBottomColor: '#e5e5e5',
    borderBottomWidth: 1,
    flexDirection: 'row',
    gap: 8,
    padding: 12,
  },
  bulkText: { color: '#555555', flex: 1, fontSize: 13, fontWeight: '700' },
  bulkButton: {
    backgroundColor: '#111111',
    borderRadius: 8,
    height: 38,
    justifyContent: 'center',
    paddingHorizontal: 10,
  },
  readButton: { backgroundColor: '#138a3d' },
  disabledButton: { opacity: 0.35 },
  bulkButtonText: { color: '#ffffff', fontSize: 12, fontWeight: '800' },
  list: { padding: 14 },
  row: {
    alignItems: 'center',
    borderColor: '#e5e5e5',
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 12,
    marginBottom: 10,
    padding: 10,
  },
  selectedRow: { borderColor: '#0a84ff', borderWidth: 2 },
  missingRow: { backgroundColor: '#f2f2f2' },
  checkbox: {
    alignItems: 'center',
    borderColor: '#bdbdbd',
    borderRadius: 4,
    borderWidth: 1,
    height: 24,
    justifyContent: 'center',
    width: 24,
  },
  checkboxText: { color: '#111111', fontSize: 14, fontWeight: '900' },
  cover: { backgroundColor: '#e5e5e5', borderRadius: 4, height: 88, width: 60 },
  missingCover: { opacity: 0.35 },
  coverFallback: { alignItems: 'center', justifyContent: 'center' },
  coverFallbackText: { color: '#555555', fontSize: 11, fontWeight: '800' },
  rowBody: { flex: 1 },
  bookTitle: { color: '#111111', fontSize: 16, fontWeight: '800', lineHeight: 21 },
  meta: { color: '#666666', fontSize: 13, marginTop: 6 },
  missingText: { color: '#777777' },
  editBox: { gap: 8, marginTop: 10 },
  editInput: {
    backgroundColor: '#f4f4f4',
    borderRadius: 8,
    color: '#111111',
    height: 40,
    paddingHorizontal: 10,
  },
  saveButton: {
    alignItems: 'center',
    backgroundColor: '#111111',
    borderRadius: 8,
    height: 38,
    justifyContent: 'center',
  },
  saveButtonText: { color: '#ffffff', fontSize: 13, fontWeight: '800' },
});
