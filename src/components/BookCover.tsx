import { useEffect, useMemo, useState } from 'react';
import { Image, ImageStyle, StyleProp, StyleSheet, Text, View } from 'react-native';

type BookCoverProps = {
  thumbnailUrl?: string;
  isbn?: string;
  style?: StyleProp<ImageStyle>;
  missing?: boolean;
  placeholderText?: string;
};

function normalizeImageUrl(url?: string) {
  if (!url) return undefined;
  return url.replace(/^http:\/\//i, 'https://');
}

function normalizeIsbn(isbn?: string) {
  return isbn?.replace(/[^0-9X]/gi, '').toUpperCase();
}

function buildGoogleCoverUrl(isbn?: string) {
  const normalized = normalizeIsbn(isbn);
  if (!normalized) return undefined;
  return `https://books.google.com/books/content?vid=ISBN${normalized}&printsec=frontcover&img=1&zoom=1&source=gbs_api`;
}

function buildGoogleLargeCoverUrl(isbn?: string) {
  const normalized = normalizeIsbn(isbn);
  if (!normalized) return undefined;
  return `https://books.google.com/books/content?vid=ISBN${normalized}&printsec=frontcover&img=1&zoom=0&source=gbs_api`;
}

function buildOpenLibraryCoverUrl(isbn?: string) {
  const normalized = normalizeIsbn(isbn);
  if (!normalized) return undefined;
  return `https://covers.openlibrary.org/b/isbn/${normalized}-L.jpg?default=false`;
}

export function BookCover({
  thumbnailUrl,
  isbn,
  style,
  missing = false,
  placeholderText = 'No Cover',
}: BookCoverProps) {
  const candidates = useMemo(
    () =>
      [
        normalizeImageUrl(thumbnailUrl),
        buildGoogleCoverUrl(isbn),
        buildGoogleLargeCoverUrl(isbn),
        buildOpenLibraryCoverUrl(isbn),
      ].filter((url): url is string => !!url),
    [isbn, thumbnailUrl],
  );
  const [candidateIndex, setCandidateIndex] = useState(0);

  useEffect(() => {
    setCandidateIndex(0);
  }, [candidates]);

  const imageUri = candidates[candidateIndex];
  const coverStyle = [styles.cover, style, missing && styles.missingCover];

  if (imageUri) {
    return (
      <Image
        source={{ uri: imageUri }}
        style={coverStyle}
        resizeMode="cover"
        onError={() => setCandidateIndex((current) => current + 1)}
      />
    );
  }

  return (
    <View style={[coverStyle, styles.coverFallback]}>
      <Text style={styles.coverFallbackText} numberOfLines={2}>
        {placeholderText}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  cover: {
    backgroundColor: '#e5e5e5',
    overflow: 'hidden',
  },
  missingCover: { opacity: 0.35 },
  coverFallback: { alignItems: 'center', justifyContent: 'center' },
  coverFallbackText: {
    color: '#777777',
    fontSize: 11,
    fontWeight: '800',
    paddingHorizontal: 4,
    textAlign: 'center',
  },
});
