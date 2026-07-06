function comparableAuthor(value: string) {
  return value.toLocaleLowerCase().replace(/[\s　・·]/g, '');
}

function authorParts(value?: string) {
  if (!value?.trim()) return [];

  return value
    .replace(
      /([\u3040-\u30ff\u3400-\u9fff])[\s　]+(?=[\u3040-\u30ff\u3400-\u9fff])/g,
      '$1',
    )
    .split(/[、,，;；|｜/／]+/)
    .map((part) => part.trim())
    .filter(Boolean)
    .filter((part) => !/^(?:18|19|20)\d{2}\s*[-–—]?\s*$/.test(part));
}

export function normalizeAuthors(values: Array<string | undefined>) {
  const parts = values.flatMap(authorParts);
  const unique = parts.filter(
    (part, index) =>
      parts.findIndex((candidate) => comparableAuthor(candidate) === comparableAuthor(part)) ===
      index,
  );
  const withoutFragments = unique.filter((part, index) => {
    const comparable = comparableAuthor(part);
    if (comparable.length < 2) return false;

    return !unique.some((candidate, candidateIndex) => {
      if (candidateIndex === index) return false;
      const candidateComparable = comparableAuthor(candidate);
      return candidateComparable.length > comparable.length && candidateComparable.includes(comparable);
    });
  });

  return withoutFragments.length > 0 ? withoutFragments : unique;
}

export function normalizeAuthor(value?: string) {
  return normalizeAuthors([value]).join(', ') || undefined;
}
