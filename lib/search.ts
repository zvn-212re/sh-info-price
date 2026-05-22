import type { MaterialEntity, PriceRecord } from "./types";

const SYMBOL_REPLACEMENTS: Array<[RegExp, string]> = [
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

const UNIT_REPLACEMENTS: Array<[RegExp, string]> = [
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

const SEARCH_SYNONYMS: Record<string, string[]> = {
  砼: ["混凝土"],
  混凝土: ["砼"],
  upvc: ["pvc-u", "pvc u"],
  "pvc-u": ["upvc", "pvc u"]
};

function compact(value: string) {
  return value.replace(/[\s,;:/_-]+/g, "");
}

export function normalizeText(value: string) {
  let normalized = value.normalize("NFKC").trim().toLowerCase();

  for (const [pattern, replacement] of SYMBOL_REPLACEMENTS) {
    normalized = normalized.replace(pattern, replacement);
  }

  for (const [pattern, replacement] of UNIT_REPLACEMENTS) {
    normalized = normalized.replace(pattern, replacement);
  }

  return normalized
    .replace(/(\d)\s*([x/])\s*(\d)/g, "$1$2$3")
    .replace(/(\d)\s+(?=\.\d)/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

export function materialTokens(value: string) {
  const normalized = normalizeText(value);
  const tokens = normalized.match(/[\p{Script=Han}]+|[a-z]+|\d+(?:\.\d+)?/gu) ?? [];

  return [...new Set(tokens.filter(Boolean))];
}

function expandTerms(keyword: string) {
  const tokens = materialTokens(keyword);
  const expanded = new Set(tokens);

  for (const token of tokens) {
    for (const synonym of SEARCH_SYNONYMS[token] ?? []) {
      for (const synonymToken of materialTokens(synonym)) {
        expanded.add(synonymToken);
      }
    }
  }

  return [...expanded];
}

function tokenCoverageScore(terms: string[], target: string) {
  if (terms.length === 0) return 0;

  const normalizedTarget = normalizeText(target);
  const matched = terms.filter((term) => normalizedTarget.includes(term));
  if (matched.length === 0) return 0;

  return matched.length / terms.length;
}

function subsequenceScore(query: string, target: string) {
  if (!query || !target || query.length > target.length) return 0;

  let queryIndex = 0;
  let gaps = 0;

  for (const char of target) {
    if (char === query[queryIndex]) {
      queryIndex += 1;
      if (queryIndex === query.length) {
        return Math.max(0, 1 - gaps / target.length);
      }
    } else if (queryIndex > 0) {
      gaps += 1;
    }
  }

  return 0;
}

function scoreField(
  query: string,
  queryCompact: string,
  terms: string[],
  value: string,
  weights: { exact: number; includes: number; tokens: number; fuzzy: number }
) {
  const normalized = normalizeText(value);
  const normalizedCompact = compact(normalized);
  let score = 0;

  if (!normalized) return score;
  if (normalized === query || normalizedCompact === queryCompact) score += weights.exact;
  if (normalized.includes(query) || normalizedCompact.includes(queryCompact)) {
    score += weights.includes;
  }

  score += tokenCoverageScore(terms, normalized) * weights.tokens;
  score += subsequenceScore(queryCompact, normalizedCompact) * weights.fuzzy;

  return score;
}

export function scoreMaterial(entity: MaterialEntity, keyword: string) {
  const query = normalizeText(keyword);
  const queryCompact = compact(query);

  if (!query) return 1;

  const terms = expandTerms(keyword);
  const nameScore = scoreField(
    query,
    queryCompact,
    terms,
    `${entity.displayName} ${entity.normalizedName}`,
    { exact: 1400, includes: 820, tokens: 560, fuzzy: 180 }
  );
  const aliasScore = Math.max(
    0,
    ...entity.aliases.map((alias) =>
      scoreField(query, queryCompact, terms, alias, {
        exact: 980,
        includes: 620,
        tokens: 420,
        fuzzy: 120
      })
    )
  );
  const codeScore = scoreField(query, queryCompact, terms, entity.code, {
    exact: 760,
    includes: 440,
    tokens: 220,
    fuzzy: 80
  });
  const specScore = scoreField(query, queryCompact, terms, entity.spec, {
    exact: 420,
    includes: 260,
    tokens: 200,
    fuzzy: 60
  });
  const unitScore = scoreField(query, queryCompact, terms, entity.unit, {
    exact: 180,
    includes: 120,
    tokens: 90,
    fuzzy: 24
  });
  const searchTextScore = scoreField(query, queryCompact, terms, entity.searchText, {
    exact: 0,
    includes: 120,
    tokens: 120,
    fuzzy: 24
  });

  return nameScore + aliasScore + codeScore + specScore + unitScore + searchTextScore;
}

export function searchMaterials(entities: MaterialEntity[], keyword: string) {
  if (!normalizeText(keyword)) {
    return sortByMaterial(entities);
  }

  return entities
    .map((entity) => ({ entity, score: scoreMaterial(entity, keyword) }))
    .filter((result) => result.score > 0)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (b.entity.periodCount !== a.entity.periodCount) {
        return b.entity.periodCount - a.entity.periodCount;
      }
      return a.entity.displayName.localeCompare(b.entity.displayName, "zh-CN");
    })
    .map((result) => result.entity);
}

export function recordMatches(record: PriceRecord, keyword: string) {
  const q = normalizeText(keyword);

  if (!q) {
    return true;
  }

  const haystack = normalizeText(
    [
      record.materialCode,
      record.materialName,
      record.spec,
      record.unit,
      record.period
    ].join(" ")
  );

  return haystack.includes(q);
}

export function sortByMaterial<T extends Pick<MaterialEntity, "displayName" | "spec">>(records: T[]) {
  return [...records].sort((a, b) => {
    const name = a.displayName.localeCompare(b.displayName, "zh-CN");
    if (name !== 0) return name;
    return a.spec.localeCompare(b.spec, "zh-CN");
  });
}
