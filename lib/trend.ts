import type { MaterialEntity, PriceRecord } from "./types";

export type TrendRow = {
  period: string;
  [key: string]: string | number | null;
};

export type TrendSummary = {
  pointCount: number;
  first?: PriceRecord;
  latest?: PriceRecord;
  min?: PriceRecord;
  max?: PriceRecord;
  diff: number | null;
  percent: number | null;
};

export function sortHistory(records: PriceRecord[], direction: "asc" | "desc" = "asc") {
  const sorted = [...records].sort((a, b) => {
    const periodOrder = a.period.localeCompare(b.period, "zh-CN");
    if (periodOrder !== 0) return periodOrder;
    return a.publishDate.localeCompare(b.publishDate, "zh-CN");
  });

  return direction === "desc" ? sorted.reverse() : sorted;
}

export function uniqueHistoryPeriods(records: PriceRecord[]) {
  const byPeriod = new Map<string, PriceRecord>();

  for (const record of sortHistory(records)) {
    byPeriod.set(record.period, record);
  }

  return [...byPeriod.values()];
}

export function buildTrendRows(
  series: Array<{ entity: MaterialEntity; history: PriceRecord[] }>
) {
  const rows = new Map<string, TrendRow>();

  for (const { entity, history } of series) {
    for (const record of uniqueHistoryPeriods(history)) {
      const row = rows.get(record.period) ?? { period: record.period };
      row[entity.id] = record.taxIncludedPrice;
      rows.set(record.period, row);
    }
  }

  return [...rows.values()].sort((a, b) => a.period.localeCompare(b.period, "zh-CN"));
}

export function summarizeHistory(records: PriceRecord[], visiblePeriods?: Set<string>): TrendSummary {
  const visibleRecords = uniqueHistoryPeriods(records).filter(
    (record) => !visiblePeriods || visiblePeriods.has(record.period)
  );

  const first = visibleRecords[0];
  const latest = visibleRecords.at(-1);

  if (!first || !latest) {
    return {
      pointCount: 0,
      diff: null,
      percent: null
    };
  }

  const min = visibleRecords.reduce((lowest, record) =>
    record.taxIncludedPrice < lowest.taxIncludedPrice ? record : lowest
  );
  const max = visibleRecords.reduce((highest, record) =>
    record.taxIncludedPrice > highest.taxIncludedPrice ? record : highest
  );
  const diff = latest.taxIncludedPrice - first.taxIncludedPrice;
  const percent = first.taxIncludedPrice === 0 ? null : (diff / first.taxIncludedPrice) * 100;

  return {
    pointCount: visibleRecords.length,
    first,
    latest,
    min,
    max,
    diff,
    percent
  };
}
