import type { DataManifest, MaterialEntity, PriceRecord } from "./types";

const DATA_BASE_PATH = (process.env.NEXT_PUBLIC_BASE_PATH || "").replace(/\/$/, "");

function withDataBasePath(path: string) {
  return `${DATA_BASE_PATH}${path}`;
}

async function readJson<T>(path: string): Promise<T> {
  const response = await fetch(withDataBasePath(path), { cache: "no-store" });

  if (!response.ok) {
    throw new Error(`读取数据失败：${path}`);
  }

  return response.json() as Promise<T>;
}

export function fetchManifest() {
  return readJson<DataManifest>("/data/manifest.json");
}

export function fetchLatest() {
  return readJson<PriceRecord[]>("/data/latest.json");
}

export function fetchSearchIndex() {
  return readJson<MaterialEntity[]>("/data/search-index.json");
}

export function fetchPeriod(period: string) {
  return readJson<PriceRecord[]>(`/data/periods/${period}.json`);
}

export function fetchHistory(historyFile: string) {
  return readJson<PriceRecord[]>(`/data/${historyFile}`);
}

export async function fetchAllPeriods(periods: string[]) {
  const entries = await Promise.all(
    periods.map(async (period) => [period, await fetchPeriod(period)] as const)
  );

  return new Map(entries);
}
