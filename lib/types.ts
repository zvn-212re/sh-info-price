export type PriceRecord = {
  period: string;
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

export type SearchIndexRecord = PriceRecord & {
  text: string;
};

export type DataManifest = {
  latestPeriod: string;
  periods: string[];
  generatedAt: string;
  totalRecords: number;
  latestRecords?: number;
  historyFiles?: number;
  indexedMaterials?: number;
};

export type CompareResult = {
  base?: PriceRecord;
  target?: PriceRecord;
  diff: number | null;
  percent: number | null;
};
