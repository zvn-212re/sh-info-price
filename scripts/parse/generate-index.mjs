import { createHash } from "node:crypto";
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

const processedDir = path.resolve("data/processed");
const rulesDir = path.resolve("data/rules");
const publicDataDir = path.resolve("public/data");
const historiesDir = path.join(publicDataDir, "histories");
const legacyPeriodsDir = path.join(publicDataDir, "periods");

const EMPTY_ALIASES = {
  byCode: {},
  byEntityId: {},
  byMaterialKey: {}
};
const EMPTY_CORRECTIONS = {
  entities: []
};
const EMPTY_MERGE_RULES = {
  merges: [],
  splitCodes: []
};

const symbolReplacements = [
  [/[，、；]/g, ","],
  [/[。．]/g, "."],
  [/[：]/g, ":"],
  [/[（）【】［］｛｝]/g, " "],
  [/[／]/g, "/"],
  [/[－—–]/g, "-"],
  [/[×＊]/g, "x"],
  [/[·•]/g, " "],
  [/[㎡]/g, "m2"],
  [/[㎥]/g, "m3"],
  [/[²]/g, "2"],
  [/[³]/g, "3"]
];
const unitReplacements = [
  [/平方米/gi, "m2"],
  [/平米/gi, "m2"],
  [/立方米/gi, "m3"],
  [/立米/gi, "m3"],
  [/千克/gi, "kg"],
  [/公斤/gi, "kg"],
  [/吨/gi, "t"],
  [/毫米/gi, "mm"],
  [/厘米/gi, "cm"],
  [/米/gi, "m"]
];

function uniqueBy(records, getKey) {
  const map = new Map();
  for (const record of records) {
    map.set(getKey(record), record);
  }
  return [...map.values()];
}

function dedupe(values) {
  return [...new Set(values.map((value) => String(value ?? "").trim()).filter(Boolean))];
}

function normalizeText(value) {
  let normalized = String(value ?? "").normalize("NFKC").trim().toLowerCase();

  for (const [pattern, replacement] of symbolReplacements) {
    normalized = normalized.replace(pattern, replacement);
  }

  for (const [pattern, replacement] of unitReplacements) {
    normalized = normalized.replace(pattern, replacement);
  }

  return normalized
    .replace(/(\d)\s*([x/])\s*(\d)/g, "$1$2$3")
    .replace(/(\d)\s+(?=\.\d)/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

function tokens(value) {
  return dedupe(normalizeText(value).match(/[\p{Script=Han}]+|[a-z]+|\d+(?:\.\d+)?/gu) ?? []);
}

function normalizeCode(value) {
  return normalizeText(value).replace(/\s+/g, "");
}

function normalizeIdentityName(value) {
  const identityTokens = tokens(value).sort((a, b) => a.localeCompare(b, "zh-CN"));
  return identityTokens.join("|") || normalizeText(value);
}

function normalizeIdentityField(value) {
  return normalizeText(value).replace(/\s+/g, "");
}

function hash(value, length = 16) {
  return createHash("sha1").update(value).digest("hex").slice(0, length);
}

function historyFileForKey(materialKey) {
  return `histories/${hash(materialKey)}.json`;
}

function entityIdForKey(entityKey) {
  return `m-${hash(entityKey, 14)}`;
}

async function readOptionalRule(fileName, fallback) {
  try {
    return JSON.parse(await readFile(path.join(rulesDir, fileName), "utf8"));
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      return fallback;
    }

    throw error;
  }
}

function fallbackEntityKey(record) {
  return [
    "fallback",
    normalizeIdentityName(record.materialName),
    normalizeIdentityField(record.spec),
    normalizeIdentityField(record.unit)
  ].join(":");
}

function mergeTargetForRecord(record, mergeMap) {
  const code = normalizeCode(record.materialCode);
  const candidates = [
    code ? `code:${code}` : "",
    record.materialKey ? `materialKey:${record.materialKey}` : ""
  ].filter(Boolean);

  for (const candidate of candidates) {
    if (mergeMap.has(candidate)) {
      return mergeMap.get(candidate);
    }
  }

  return "";
}

function buildMergeMap(mergeRules) {
  const mergeMap = new Map();

  for (const rule of mergeRules.merges ?? []) {
    const targetCode = normalizeCode(rule.targetCode);
    const targetKey = rule.targetKey || (targetCode ? `code:${targetCode}` : "");
    if (!targetKey) continue;

    for (const code of rule.sourceCodes ?? []) {
      const normalizedCode = normalizeCode(code);
      if (normalizedCode) {
        mergeMap.set(`code:${normalizedCode}`, targetKey);
      }
    }

    for (const materialKey of rule.sourceMaterialKeys ?? []) {
      if (materialKey) {
        mergeMap.set(`materialKey:${materialKey}`, targetKey);
      }
    }

    for (const sourceKey of rule.sourceKeys ?? []) {
      if (sourceKey) {
        mergeMap.set(sourceKey, targetKey);
      }
    }
  }

  return mergeMap;
}

function entityKeyForRecord(record, splitCodes, mergeMap) {
  const mergeTarget = mergeTargetForRecord(record, mergeMap);
  if (mergeTarget) return mergeTarget;

  const code = normalizeCode(record.materialCode);
  if (code && !splitCodes.has(code)) {
    return `code:${code}`;
  }

  return fallbackEntityKey(record);
}

function findCorrection(entity, corrections) {
  return (corrections.entities ?? []).find((correction) => {
    if (correction.id && correction.id === entity.id) return true;
    if (correction.code && normalizeCode(correction.code) === normalizeCode(entity.code)) return true;
    return correction.materialKey && entity.sourceKeys.includes(correction.materialKey);
  });
}

function aliasesForEntity(entity, aliasesRule) {
  return dedupe([
    ...(aliasesRule.byCode?.[entity.code] ?? []),
    ...(aliasesRule.byEntityId?.[entity.id] ?? []),
    ...entity.sourceKeys.flatMap((materialKey) => aliasesRule.byMaterialKey?.[materialKey] ?? [])
  ]);
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

const [aliasesRule, correctionsRule, mergeRules] = await Promise.all([
  readOptionalRule("aliases.json", EMPTY_ALIASES),
  readOptionalRule("corrections.json", EMPTY_CORRECTIONS),
  readOptionalRule("material-merge-rules.json", EMPTY_MERGE_RULES)
]);
const splitCodes = new Set((mergeRules.splitCodes ?? []).map((code) => normalizeCode(code)));
const mergeMap = buildMergeMap(mergeRules);
const periods = files.map((fileName) => fileName.replace(".json", "")).sort();
const allRecords = [];

for (const period of periods) {
  const source = path.join(processedDir, `${period}.json`);
  const records = JSON.parse(await readFile(source, "utf8"));
  allRecords.push(...records);
}

const latestPeriod = periods.at(-1);
const latestSource = allRecords.filter((record) => record.period === latestPeriod);
const historiesByEntityKey = new Map();

for (const record of allRecords) {
  const entityKey = entityKeyForRecord(record, splitCodes, mergeMap);
  if (!historiesByEntityKey.has(entityKey)) {
    historiesByEntityKey.set(entityKey, []);
  }

  historiesByEntityKey.get(entityKey).push(record);
}

const entityByKey = new Map();
const materialIndex = [];

for (const [entityKey, history] of historiesByEntityKey.entries()) {
  history.sort((a, b) => {
    const periodOrder = a.period.localeCompare(b.period, "zh-CN");
    if (periodOrder !== 0) return periodOrder;
    return a.publishDate.localeCompare(b.publishDate, "zh-CN");
  });

  const latestRecord = history.at(-1);
  const periodHistory = uniqueBy(history, (record) => record.period);
  const oldestRecord = periodHistory[0];
  const id = entityIdForKey(entityKey);
  const historyFile = historyFileForKey(latestRecord.materialKey || id);
  const sourceKeys = dedupe(history.map((record) => record.materialKey));
  const rawNames = dedupe(history.map((record) => record.materialName));
  const draft = {
    id,
    code: latestRecord.materialCode,
    displayName: latestRecord.materialName,
    normalizedName: normalizeText(latestRecord.materialName),
    spec: latestRecord.spec,
    unit: latestRecord.unit,
    sourceKeys
  };
  const correction = findCorrection(draft, correctionsRule);
  const displayName = correction?.displayName ?? draft.displayName;
  const spec = correction?.spec ?? draft.spec;
  const unit = correction?.unit ?? draft.unit;
  const normalizedName = correction?.normalizedName ?? normalizeText(displayName);
  const baseAliases = aliasesForEntity(draft, aliasesRule);
  const aliases = dedupe([
    ...baseAliases,
    ...(correction?.aliases ?? []),
    ...rawNames.filter((name) => normalizeText(name) !== normalizedName)
  ]);
  const priceChange = latestRecord.taxIncludedPrice - oldestRecord.taxIncludedPrice;
  const priceChangePercent =
    oldestRecord.taxIncludedPrice === 0 ? null : (priceChange / oldestRecord.taxIncludedPrice) * 100;
  const searchText = [
    draft.code,
    displayName,
    normalizedName,
    spec,
    unit,
    aliases.join(" "),
    latestRecord.period
  ].join(" ");
  const entity = {
    id,
    code: draft.code,
    displayName,
    normalizedName,
    spec,
    unit,
    aliases,
    recordCount: history.length,
    periodCount: periodHistory.length,
    oldestPeriod: oldestRecord.period,
    oldestPrice: oldestRecord.taxIncludedPrice,
    latestPeriod: latestRecord.period,
    latestPrice: latestRecord.taxIncludedPrice,
    priceChange,
    priceChangePercent,
    historyFile,
    sourceKeys,
    searchText,

    period: latestRecord.period,
    materialKey: latestRecord.materialKey,
    materialCode: draft.code,
    materialName: displayName,
    taxIncludedPrice: latestRecord.taxIncludedPrice,
    publishDate: latestRecord.publishDate,
    sourceFile: latestRecord.sourceFile,
    text: searchText
  };

  entityByKey.set(entityKey, entity);
  materialIndex.push(entity);

  await writeFile(
    path.join(publicDataDir, historyFile),
    `${JSON.stringify(history, null, 2)}\n`,
    "utf8"
  );
}

const latest = uniqueBy(latestSource, (record) => entityKeyForRecord(record, splitCodes, mergeMap)).map(
  (record) => {
    const entityKey = entityKeyForRecord(record, splitCodes, mergeMap);
    const entity = entityByKey.get(entityKey);

    return {
      ...record,
      materialEntityId: entity?.id,
      historyFile: entity?.historyFile ?? historyFileForKey(record.materialKey)
    };
  }
);

materialIndex.sort((a, b) => {
  const name = a.displayName.localeCompare(b.displayName, "zh-CN");
  if (name !== 0) return name;
  return a.spec.localeCompare(b.spec, "zh-CN");
});

const manifest = {
  latestPeriod,
  periods,
  generatedAt: new Date().toISOString(),
  totalRecords: allRecords.length,
  latestRecords: latest.length,
  historyFiles: materialIndex.length,
  indexedMaterials: materialIndex.length,
  indexedEntities: materialIndex.length,
  singlePeriodEntities: materialIndex.filter((entity) => entity.periodCount === 1).length,
  twoPeriodEntities: materialIndex.filter((entity) => entity.periodCount === 2).length
};

await writeFile(path.join(publicDataDir, "latest.json"), `${JSON.stringify(latest, null, 2)}\n`, "utf8");
await writeFile(path.join(publicDataDir, "search-index.json"), `${JSON.stringify(materialIndex, null, 2)}\n`, "utf8");
await writeFile(path.join(publicDataDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

console.log(
  `generated static data: ${periods.length} periods, ${allRecords.length} records, ${materialIndex.length} material entities`
);
console.log(
  `history diagnostics: ${manifest.singlePeriodEntities} entities with 1 period, ${manifest.twoPeriodEntities} entities with 2 periods`
);
