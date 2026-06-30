const VOLUME_PATTERNS = [
  /(?:^|[\s　:：-])(?:第)?([0-9０-９]{1,3})\s*(?:巻|巻目|volume|vol\.?|#)/i,
  /(?:第)?([0-9]{1,3})\s*(?:巻|巻目|volume|vol\.?|#)/i,
  /([0-9０-９]{1,3})\s*(?=[（(【「『〈<])/,
  /(?:\(|（|〈|<)\s*([0-9０-９]{1,3})\s*(?:\)|）|〉|>)/,
  /(?:^|[\s　])([0-9０-９]{1,3})$/,
];

function toHalfWidthNumber(value: string) {
  return value.replace(/[０-９]/g, (character) =>
    String.fromCharCode(character.charCodeAt(0) - 0xfee0),
  );
}

export function parseSeriesTitle(title: string) {
  const normalized = title.replace(/\s+/g, ' ').trim();
  let volumeNumber: number | undefined;
  let seriesTitle = normalized;

  for (const pattern of VOLUME_PATTERNS) {
    const match = normalized.match(pattern);
    if (!match?.[1]) continue;

    volumeNumber = Number.parseInt(toHalfWidthNumber(match[1]), 10);
    seriesTitle = normalized.replace(match[0], '').trim();
    break;
  }

  seriesTitle = seriesTitle
    .replace(/[（(【「『〈<].*?[）)】」』〉>]\s*$/g, '')
    .replace(/(?:第)?[0-9０-９]{1,3}\s*巻$/, '')
    .replace(/[0-9０-９]{1,3}\s*$/, '')
    .replace(/[\[(（【]\s*(?:第)?[0-9０-９]{1,3}\s*(?:巻)?\s*[\]）)】]/g, '')
    .replace(
      /(?:モノクロ版|カラー版|デジタル版|電子版|ジャンプコミックスDIGITAL|ジャンプコミックス|コミック|漫画|マンガ|文庫|新装版|完全版|愛蔵版)\s*$/g,
      '',
    )
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

  if (unique.length === 0) return [];

  const missing: number[] = [];
  for (let volume = 1; volume <= unique[unique.length - 1]; volume += 1) {
    if (!unique.includes(volume)) missing.push(volume);
  }

  return missing;
}
