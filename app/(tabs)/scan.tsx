import { CameraView, useCameraPermissions } from 'expo-camera';
import { useCallback, useRef, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  ToastAndroid,
  View,
} from 'react-native';

import { parseSeriesTitle } from '../../src/lib/series';
import { useLibrary } from '../../src/store/LibraryContext';
import { ReadingStatus } from '../../src/types';

const statusOptions: Array<{ label: string; value: ReadingStatus }> = [
  { label: '未読', value: 'unread' },
  { label: '読書中', value: 'reading' },
  { label: '読了', value: 'read' },
];

function notify(message: string) {
  if (Platform.OS === 'android') {
    ToastAndroid.show(message, ToastAndroid.SHORT);
  } else {
    Alert.alert('BookNest', message);
  }
}

export default function ScanScreen() {
  const [permission, requestPermission] = useCameraPermissions();
  const { addBook, addBookByIsbn } = useLibrary();
  const [isScanning, setIsScanning] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const lastScanRef = useRef('');

  const [title, setTitle] = useState('');
  const [author, setAuthor] = useState('');
  const [seriesTitle, setSeriesTitle] = useState('');
  const [volumeNumber, setVolumeNumber] = useState('');
  const [isbn, setIsbn] = useState('');
  const [status, setStatus] = useState<ReadingStatus>('unread');

  const onTitleChange = (value: string) => {
    setTitle(value);
    const parsed = parseSeriesTitle(value);
    setSeriesTitle((current) => current || parsed.seriesTitle);
    setVolumeNumber((current) => current || (parsed.volumeNumber ? String(parsed.volumeNumber) : ''));
  };

  const handleBarcode = useCallback(
    async ({ data }: { data: string }) => {
      const normalized = data.replace(/[^0-9X]/gi, '');
      if (!isScanning || isSubmitting || normalized === lastScanRef.current) return;
      if (normalized.length !== 10 && normalized.length !== 13) return;

      lastScanRef.current = normalized;
      setIsSubmitting(true);
      try {
        const book = await addBookByIsbn(normalized);
        notify(book ? `${book.title} を追加しました` : '書籍データが見つかりません。手動登録してください。');
      } catch {
        notify('検索に失敗しました。手動登録できます。');
      } finally {
        setIsSubmitting(false);
        setTimeout(() => {
          lastScanRef.current = '';
        }, 1600);
      }
    },
    [addBookByIsbn, isScanning, isSubmitting],
  );

  const submitManual = async () => {
    if (!title.trim() || !seriesTitle.trim()) {
      notify('タイトルとシリーズ名は必須です。');
      return;
    }

    await addBook({
      isbn: isbn.trim() || undefined,
      title: title.trim(),
      author: author.trim() || undefined,
      seriesTitle: seriesTitle.trim(),
      volumeNumber: volumeNumber ? Number.parseInt(volumeNumber, 10) : undefined,
      status,
    });

    setTitle('');
    setAuthor('');
    setSeriesTitle('');
    setVolumeNumber('');
    setIsbn('');
    setStatus('unread');
    notify('書籍を追加しました');
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.cameraShell}>
          {permission?.granted ? (
            <CameraView
              barcodeScannerSettings={{ barcodeTypes: ['ean13', 'ean8', 'upc_a', 'upc_e'] }}
              onBarcodeScanned={handleBarcode}
              style={styles.camera}
            >
              <View style={styles.scanFrame} />
            </CameraView>
          ) : (
            <View style={styles.permissionBox}>
              <Text style={styles.permissionText}>ISBNスキャンにはカメラ権限が必要です。</Text>
              <Pressable style={styles.primaryButton} onPress={requestPermission}>
                <Text style={styles.primaryButtonText}>カメラを許可</Text>
              </Pressable>
            </View>
          )}
        </View>

        <View style={styles.scanControls}>
          <Pressable
            onPress={() => setIsScanning((value) => !value)}
            style={[styles.primaryButton, !isScanning && styles.pausedButton]}
          >
            <Text style={styles.primaryButtonText}>{isScanning ? 'スキャン停止' : 'スキャン再開'}</Text>
          </Pressable>
        </View>

        <View style={styles.form}>
          <Text style={styles.sectionTitle}>手動登録</Text>
          <TextInput value={title} onChangeText={onTitleChange} placeholder="タイトル" style={styles.input} />
          <TextInput value={seriesTitle} onChangeText={setSeriesTitle} placeholder="シリーズ名" style={styles.input} />
          <View style={styles.inputRow}>
            <TextInput
              value={volumeNumber}
              onChangeText={setVolumeNumber}
              keyboardType="number-pad"
              placeholder="巻"
              style={[styles.input, styles.compactInput]}
            />
            <TextInput value={isbn} onChangeText={setIsbn} placeholder="ISBN" style={[styles.input, styles.flexInput]} />
          </View>
          <TextInput value={author} onChangeText={setAuthor} placeholder="著者" style={styles.input} />
          <View style={styles.statusRow}>
            {statusOptions.map((option) => (
              <Pressable
                key={option.value}
                onPress={() => setStatus(option.value)}
                style={[styles.statusButton, status === option.value && styles.statusButtonActive]}
              >
                <Text style={[styles.statusText, status === option.value && styles.statusTextActive]}>
                  {option.label}
                </Text>
              </Pressable>
            ))}
          </View>
          <Pressable style={styles.submitButton} onPress={submitManual}>
            <Text style={styles.submitButtonText}>追加</Text>
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#ffffff' },
  content: { padding: 18, paddingBottom: 40 },
  cameraShell: {
    aspectRatio: 0.74,
    backgroundColor: '#0a0a0a',
    borderRadius: 8,
    overflow: 'hidden',
  },
  camera: { flex: 1, justifyContent: 'center', padding: 32 },
  scanFrame: {
    alignSelf: 'center',
    borderColor: '#0a84ff',
    borderRadius: 8,
    borderWidth: 3,
    height: 140,
    width: '86%',
  },
  permissionBox: { alignItems: 'center', flex: 1, justifyContent: 'center', padding: 24 },
  permissionText: { color: '#ffffff', fontSize: 15, marginBottom: 16, textAlign: 'center' },
  scanControls: { paddingVertical: 14 },
  primaryButton: {
    alignItems: 'center',
    backgroundColor: '#0a84ff',
    borderRadius: 8,
    height: 46,
    justifyContent: 'center',
  },
  pausedButton: { backgroundColor: '#111111' },
  primaryButtonText: { color: '#ffffff', fontSize: 15, fontWeight: '800' },
  form: { borderTopColor: '#e5e5e5', borderTopWidth: 1, paddingTop: 18 },
  sectionTitle: { color: '#111111', fontSize: 18, fontWeight: '800', marginBottom: 12 },
  input: {
    backgroundColor: '#f4f4f4',
    borderRadius: 8,
    color: '#111111',
    fontSize: 16,
    height: 46,
    marginBottom: 10,
    paddingHorizontal: 12,
  },
  inputRow: { flexDirection: 'row', gap: 10 },
  compactInput: { width: 82 },
  flexInput: { flex: 1 },
  statusRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  statusButton: {
    borderColor: '#d4d4d4',
    borderRadius: 8,
    borderWidth: 1,
    flex: 1,
    height: 40,
    justifyContent: 'center',
  },
  statusButtonActive: { backgroundColor: '#111111', borderColor: '#111111' },
  statusText: { color: '#444444', fontSize: 13, fontWeight: '700', textAlign: 'center' },
  statusTextActive: { color: '#ffffff' },
  submitButton: {
    alignItems: 'center',
    backgroundColor: '#111111',
    borderRadius: 8,
    height: 48,
    justifyContent: 'center',
  },
  submitButtonText: { color: '#ffffff', fontSize: 15, fontWeight: '800' },
});
