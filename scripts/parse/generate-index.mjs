import { createHash } from "node:crypto";
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

const processedDir = path.resolve("data/processed");
const publicDataDir = path.resolve("public/data");
const historiesDir = path.join(publicDataDir, "histories");
const legacyPeriodsDir = path.join(publicDataDir, "periods");

function uniqueBy(records, getKey) {
  const map = new Map();
  for (const record of records) {
    map.set(getKey(record), record);
  }
  return [...map.values()];
}

function historyFileForKey(materialKey) {
  const hash = createHash("sha1").update(materialKey).digest("hex").slice(0, 16);
  return `histories/${hash}.json`;
}

await mkdir(publicDataDir, { recursive: true });
await rm(historiesDir, { recursive: true, force: true });
await rm(legacyPeriodsDir, { recursive: true, force: true });
await mkdir(historiesDir, { recursive: true });

const files = (await readdir(processedDir)).filter((fileName) => /^\d{4}-\d{2}\.json$/.test(fileName));

if (files.length === 0) {
  console.log("data/processed 中没有可生成索引的数据，保留当前 public/data。");
  process.exit(0);
}

const periods = files.map((fileName) => fileName.replace(".json", "")).sort();
const allRecords = [];

for (const period of periods) {
  const source = path.join(processedDir, `${period}.json`);
  const records = JSON.parse(await readFile(source, "utf8"));
  allRecords.push(...records);
}

const latestPeriod = periods.at(-1);
const latestSource = allRecords.filter((record) => record.period === latestPeriod);
const historiesByKey = new Map();

for (const record of allRecords) {
  if (!historiesByKey.has(record.materialKey)) {
    historiesByKey.set(record.materialKey, []);
  }
  historiesByKey.get(record.materialKey).push(record);
}

const materialIndex = [];

for (const [materialKey, history] of historiesByKey.entries()) {
  history.sort((a, b) => a.period.localeCompare(b.period, "zh-CN"));
  const record = history.at(-1);
  const historyFile = historyFileForKey(materialKey);

  materialIndex.push({
    ...record,
    historyFile
  });

  await writeFile(
    path.join(publicDataDir, historyFile),
    `${JSON.stringify(history, null, 2)}\n`,
    "utf8"
  );
}

const latest = uniqueBy(latestSource, (record) => record.materialKey).map((record) => ({
  ...record,
  historyFile: historyFileForKey(record.materialKey)
}));

const searchIndex = materialIndex.map((record) => ({
  ...record,
  text: [
    record.materialCode,
    record.materialName,
    record.spec,
    record.unit,
    record.period
  ].join(" ")
}));

const manifest = {
  latestPeriod,
  periods,
  generatedAt: new Date().toISOString(),
  totalRecords: allRecords.length,
  latestRecords: latest.length,
  historyFiles: materialIndex.length,
  indexedMaterials: materialIndex.length
};

await writeFile(path.join(publicDataDir, "latest.json"), `${JSON.stringify(latest, null, 2)}\n`, "utf8");
await writeFile(path.join(publicDataDir, "search-index.json"), `${JSON.stringify(searchIndex, null, 2)}\n`, "utf8");
await writeFile(path.join(publicDataDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

console.log(
  `generated static data: ${periods.length} periods, ${allRecords.length} records, ${materialIndex.length} histories`
);
