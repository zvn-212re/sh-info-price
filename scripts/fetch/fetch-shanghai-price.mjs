import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";

const baseUrl =
  process.env.CIAC_INTERWEB_BASE_URL ??
  "https://ciac.zjw.sh.gov.cn/JGBXMGCZJInterWeb/interWeb";
const rawDir = path.resolve("data/raw");
const metadataPath = path.join(rawDir, "ciac-downloads.json");
const requestDelayMs = Number(process.env.CIAC_FETCH_DELAY_MS ?? 800);

const sources = {
  materials: {
    label: "材料信息价",
    bmCode: "003002",
    categoryCodes: ["003002"],
    targetDir: rawDir,
    fileName(record) {
      return `${record.period}.xls`;
    }
  },
  labor: {
    label: "建筑劳务信息",
    bmCode: "003003",
    categoryCodes: ["003003001", "003003002"],
    targetDir: path.join(rawDir, "labor"),
    fileName(record) {
      return `${record.period}-${sanitizeFileName(record.title)}.xls`;
    }
  }
};

function parseArgs(argv) {
  const args = {
    source: "materials",
    months: 6,
    all: false,
    force: false,
    dryRun: false,
    keyword: ""
  };

  for (const arg of argv) {
    if (arg === "--all") args.all = true;
    else if (arg === "--force") args.force = true;
    else if (arg === "--dry-run") args.dryRun = true;
    else if (arg.startsWith("--months=")) args.months = Number(arg.slice("--months=".length));
    else if (arg.startsWith("--source=")) args.source = arg.slice("--source=".length);
    else if (arg.startsWith("--keyword=")) args.keyword = arg.slice("--keyword=".length);
  }

  if (!Number.isFinite(args.months) || args.months < 1) {
    throw new Error("--months must be a positive number.");
  }

  if (!["materials", "labor", "all"].includes(args.source)) {
    throw new Error("--source must be one of: materials, labor, all.");
  }

  return args;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildUrl(endpoint, params = {}) {
  const url = new URL(`${baseUrl}${endpoint}`);

  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null) {
      url.searchParams.set(key, String(value));
    }
  }

  return url;
}

async function postJson(endpoint, params = {}, attempt = 1) {
  const url = buildUrl(endpoint, params);
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json;charset=utf-8",
      "User-Agent": "Mozilla/5.0"
    },
    signal: AbortSignal.timeout(30_000)
  });

  const text = await response.text();

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} for ${url}`);
  }

  let payload;
  try {
    payload = JSON.parse(text);
  } catch (error) {
    throw new Error(`Invalid JSON from ${url}: ${text.slice(0, 160)}`);
  }

  if (payload.code !== undefined && payload.code !== 200) {
    const message = payload.msg ?? payload.message ?? "unknown error";
    if (attempt < 4 && /频繁|稍后|timeout|超时/i.test(message)) {
      await sleep(requestDelayMs * attempt * 2);
      return postJson(endpoint, params, attempt + 1);
    }

    throw new Error(`CIAC API error ${payload.code}: ${message}`);
  }

  await sleep(requestDelayMs);
  return payload;
}

async function postBlob(endpoint, params = {}, attempt = 1) {
  const url = buildUrl(endpoint, params);
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/pdf;charset=UTF-8",
      "User-Agent": "Mozilla/5.0"
    },
    signal: AbortSignal.timeout(120_000)
  });

  const buffer = Buffer.from(await response.arrayBuffer());

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} for ${url}`);
  }

  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    const text = buffer.toString("utf8");
    if (attempt < 4 && /频繁|稍后|timeout|超时/i.test(text)) {
      await sleep(requestDelayMs * attempt * 2);
      return postBlob(endpoint, params, attempt + 1);
    }
    throw new Error(`CIAC download error: ${text}`);
  }

  await sleep(requestDelayMs);
  return buffer;
}

function sanitizeFileName(value) {
  return String(value)
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
}

function parsePeriod(row) {
  const candidates = [
    row.jgzq,
    row.timeflag,
    row.fbsj,
    row.changetime,
    row.changtime,
    row.bt,
    row.xxbt,
    row.fbrq
  ].filter(Boolean);

  for (const value of candidates) {
    const text = String(value);
    const monthMatch =
      text.match(/(20\d{2})[-/.年](\d{1,2})(?:[-/.月]|\b)/) ??
      text.match(/(20\d{2})\s*年\s*(\d{1,2})\s*月/);
    if (monthMatch) {
      return `${monthMatch[1]}-${monthMatch[2].padStart(2, "0")}`;
    }

    const quarterMatch = text.match(/(20\d{2})\s*年\s*([1-4])\s*季度/);
    if (quarterMatch) {
      return `${quarterMatch[1]}-Q${quarterMatch[2]}`;
    }
  }

  return "unknown-period";
}

async function readMetadata() {
  try {
    return JSON.parse(await readFile(metadataPath, "utf8"));
  } catch {
    return { updatedAt: null, sources: {} };
  }
}

async function writeMetadata(metadata) {
  metadata.updatedAt = new Date().toISOString();
  await writeFile(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`, "utf8");
}

async function getCategories(source) {
  const response = await postJson("/hyxx/getTree", { bmCode: source.bmCode });
  const rows = Array.isArray(response.data) ? response.data : [];
  const categories = rows.filter((row) => source.categoryCodes.includes(row.bm));

  if (categories.length === 0) {
    throw new Error(`No categories found for ${source.label} (${source.bmCode}).`);
  }

  return categories;
}

async function getListings(category, options) {
  const pageSize = 10;
  const targetCount = options.all ? Number.POSITIVE_INFINITY : options.months;
  const records = [];
  let pageNum = 1;
  let total = Number.POSITIVE_INFINITY;

  while (records.length < targetCount && records.length < total) {
    const response = await postJson("/hyxx/getHyxxList", {
      zdId: category.id,
      bt: options.keyword,
      fbsjStart: "",
      fbsjEnd: "",
      defl: "",
      gczy: "",
      pageSize,
      pageNum
    });

    const rows = Array.isArray(response.rows) ? response.rows : [];
    total = Number(response.total ?? rows.length);

    for (const row of rows) {
      records.push({
        id: row.id,
        fileId: row.wjid,
        title: row.xxbt ?? row.bt ?? "",
        publishDate: row.fbsj ?? row.fbrq ?? row.changetime ?? row.changtime ?? "",
        period: parsePeriod(row),
        categoryCode: row.xxlb ?? category.bm,
        categoryName: category.mc,
        raw: row
      });

      if (records.length >= targetCount) break;
    }

    if (rows.length < pageSize) break;
    pageNum += 1;
  }

  return records;
}

async function downloadRecord(source, record, options) {
  if (!record.fileId) {
    return { ...record, status: "metadata-only", path: null };
  }

  const fileName = source.fileName(record);
  const targetPath = path.join(source.targetDir, fileName);

  if (!options.force) {
    try {
      const existing = await stat(targetPath);
      if (existing.size > 0) {
        return { ...record, status: "exists", path: targetPath, size: existing.size };
      }
    } catch {
      // Missing files are downloaded below.
    }
  }

  if (options.dryRun) {
    return { ...record, status: "dry-run", path: targetPath };
  }

  const buffer = await postBlob("/currently/bdFileDownload", { id: record.fileId });
  await mkdir(source.targetDir, { recursive: true });
  await writeFile(targetPath, buffer);

  return { ...record, status: "downloaded", path: targetPath, size: buffer.length };
}

async function run() {
  const options = parseArgs(process.argv.slice(2));
  const selectedSources =
    options.source === "all" ? [sources.materials, sources.labor] : [sources[options.source]];
  const metadata = await readMetadata();

  await mkdir(rawDir, { recursive: true });

  for (const source of selectedSources) {
    console.log(`Fetching ${source.label} (${source.bmCode})...`);
    await mkdir(source.targetDir, { recursive: true });

    const categories = await getCategories(source);
    const sourceResults = [];

    for (const category of categories) {
      console.log(`  Category ${category.bm} ${category.mc}`);
      const listings = await getListings(category, options);
      console.log(`  Found ${listings.length} listing(s).`);

      for (const listing of listings) {
        const result = await downloadRecord(source, listing, options);
        sourceResults.push(result);
        console.log(`  ${result.status}: ${result.title} -> ${result.path ?? "no file"}`);
      }
    }

    metadata.sources[source.bmCode] = {
      label: source.label,
      fetchedAt: new Date().toISOString(),
      records: sourceResults
    };
  }

  await writeMetadata(metadata);
  console.log(`Wrote metadata: ${metadataPath}`);
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
