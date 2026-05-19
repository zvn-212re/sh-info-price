import type { PriceRecord, SearchIndexRecord } from "./types";

export function normalizeText(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

export function recordMatches(record: PriceRecord | SearchIndexRecord, keyword: string) {
  const q = normalizeText(keyword);

  if (!q) {
    return true;
  }

  const haystack = normalizeText(
    "text" in record
      ? `${record.text} ${record.period}`
      : [
          record.materialCode,
          record.materialName,
          record.spec,
          record.unit,
          record.period
        ].join(" ")
  );

  return haystack.includes(q);
}

export function sortByMaterial(records: PriceRecord[]) {
  return [...records].sort((a, b) => {
    const name = a.materialName.localeCompare(b.materialName, "zh-CN");
    if (name !== 0) return name;
    return a.spec.localeCompare(b.spec, "zh-CN");
  });
}
