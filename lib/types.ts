export type PriceRecord = {
  period: string;
  materialEntityId?: string;
  materialKey: string;
  materialCode: string;
  materialName: string;
  spec: string;
  unit: string;
  taxIncludedPrice: number;
  publishDate: string;
  sourceFile: string;
  historyFile?: string;
};

export type MaterialEntity = {
  id: string;
  code: string;
  displayName: string;
  normalizedName: string;
  spec: string;
  unit: string;
  aliases: string[];
  recordCount: number;
  periodCount: number;
  oldestPeriod: string;
  oldestPrice: number;
  latestPeriod: string;
  latestPrice: number;
  priceChange: number | null;
  priceChangePercent: number | null;
  historyFile: string;
  sourceKeys: string[];
  searchText: string;

  // Compatibility fields retained for the static fallback tool and exports.
  period: string;
  materialKey: string;
  materialCode: string;
  materialName: string;
  taxIncludedPrice: number;
  publishDate: string;
  sourceFile: string;
  text: string;
};

export type SearchIndexRecord = MaterialEntity;

export type DataManifest = {
  latestPeriod: string;
  periods: string[];
  generatedAt: string;
  totalRecords: number;
  latestRecords?: number;
  historyFiles?: number;
  indexedMaterials?: number;
  indexedEntities?: number;
  singlePeriodEntities?: number;
  twoPeriodEntities?: number;
};

export type CompareResult = {
  base?: PriceRecord;
  target?: PriceRecord;
  diff: number | null;
  percent: number | null;
};
