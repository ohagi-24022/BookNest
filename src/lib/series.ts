const VOLUME_PATTERNS = [
  /(?:第)?([0-9]{1,3})\s*(?:巻|巻目|volume|vol\.?|#)/i,
  /(?:\(|（)\s*([0-9]{1,3})\s*(?:\)|）)/,
  /\s([0-9]{1,3})$/,
];

export function parseSeriesTitle(title: string) {
  const normalized = title.replace(/\s+/g, ' ').trim();
  let volumeNumber: number | undefined;
  let seriesTitle = normalized;

  for (const pattern of VOLUME_PATTERNS) {
    const match = normalized.match(pattern);
    if (!match?.[1]) continue;

    volumeNumber = Number.parseInt(match[1], 10);
    seriesTitle = normalized.replace(match[0], '').trim();
    break;
  }

  seriesTitle = seriesTitle
    .replace(/[\[(（【].*?[\]）)】]/g, '')
    .replace(/\s+-\s+.*$/, '')
    .replace(/\s+/g, ' ')
    .trim();

  return {
    seriesTitle: seriesTitle || normalized,
    volumeNumber: Number.isFinite(volumeNumber) ? volumeNumber : undefined,
  };
}

export function getMissingVolumes(volumes: number[]) {
  const unique = [...new Set(volumes.filter((volume) => Number.isInteger(volume)))].sort(
    (a, b) => a - b,
  );

  if (unique.length < 2) return [];

  const missing: number[] = [];
  for (let volume = unique[0]; volume <= unique[unique.length - 1]; volume += 1) {
    if (!unique.includes(volume)) missing.push(volume);
  }

  return missing;
}
