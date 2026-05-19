import { mkdir, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import xlsx from "xlsx";
import { z } from "zod";

const rawDir = path.resolve("data/raw");
const processedDir = path.resolve("data/processed");

const aliases = {
  materialCode: ["材料编码", "材料编号", "编码"],
  suffix: ["后缀"],
  materialName: ["材料名称", "名称", "品名"],
  spec: ["规格型号", "规格", "型号"],
  unit: ["计量单位", "单位"],
  taxIncludedPrice: ["信息价（含税）", "信息价(含税)", "含税价(元)", "含税价", "信息价"],
  publishDate: ["发布日期", "发布月份", "发布时间", "日期"]
};

const recordSchema = z.object({
  period: z.string(),
  materialKey: z.string(),
  materialCode: z.string(),
  materialName: z.string(),
  spec: z.string(),
  unit: z.string(),
  taxIncludedPrice: z.number(),
  publishDate: z.string(),
  sourceFile: z.string()
});

function normalizeHeader(value) {
  return String(value)
    .replace(/\s+/g, "")
    .replace(/[（）]/g, (char) => (char === "（" ? "(" : ")"))
    .trim();
}

function excelDateToIso(value) {
  const parsed = xlsx.SSF.parse_date_code(value);
  if (!parsed) return "";

  const year = String(parsed.y).padStart(4, "0");
  const month = String(parsed.m).padStart(2, "0");
  const day = String(parsed.d).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function cellText(value, options = {}) {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "number" && options.date && value > 20_000) {
    return excelDateToIso(value);
  }

  return String(value).trim();
}

function parsePrice(value) {
  const text = String(value).trim();
  if (!text || text.includes("-") || text.includes("～") || text.includes("~")) {
    return null;
  }

  const normalized = text.replace(/[^\d.]/g, "");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function periodFromFile(fileName) {
  const quarterMatch = fileName.match(/(20\d{2})[-_年]?Q([1-4])/i);
  if (quarterMatch) {
    return `${quarterMatch[1]}-Q${quarterMatch[2]}`;
  }

  const match = fileName.match(/(20\d{2})[-_年.]?(\d{1,2})/);
  if (!match) {
    throw new Error(`文件名缺少月份信息：${fileName}`);
  }

  return `${match[1]}-${match[2].padStart(2, "0")}`;
}

function makeKey(record) {
  const raw = [
    record.materialCode,
    record.materialName,
    record.spec,
    record.unit
  ]
    .filter(Boolean)
    .join("-");

  return raw
    .normalize("NFKD")
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
}

function findHeaderMap(rows) {
  for (let rowIndex = 0; rowIndex < Math.min(30, rows.length); rowIndex += 1) {
    const values = rows[rowIndex].map((value) => normalizeHeader(cellText(value)));
    const map = {};

    for (const [field, fieldAliases] of Object.entries(aliases)) {
      const index = values.findIndex((value) =>
        fieldAliases.some((alias) => value.includes(normalizeHeader(alias)))
      );

      if (index >= 0) {
        map[field] = index;
      }
    }

    if (map.materialName !== undefined && map.unit !== undefined && map.taxIncludedPrice !== undefined) {
      return { headerRow: rowIndex, map };
    }
  }

  return null;
}

function buildMaterialCode(row, map) {
  const code = map.materialCode !== undefined ? cellText(row[map.materialCode]) : "";
  const suffix = map.suffix !== undefined ? cellText(row[map.suffix]) : "";

  if (!suffix || suffix === "000") return code;
  if (!code) return suffix;
  return `${code}-${suffix}`;
}

async function parseWorkbook(fileName) {
  const period = periodFromFile(fileName);
  const workbook = xlsx.readFile(path.join(rawDir, fileName), {
    cellDates: false,
    raw: true
  });

  const records = [];

  for (const sheetName of workbook.SheetNames) {
    const worksheet = workbook.Sheets[sheetName];
    const rows = xlsx.utils.sheet_to_json(worksheet, {
      header: 1,
      defval: "",
      raw: true
    });
    const header = findHeaderMap(rows);
    if (!header) continue;

    for (let rowIndex = header.headerRow + 1; rowIndex < rows.length; rowIndex += 1) {
      const row = rows[rowIndex];
      const materialName = cellText(row[header.map.materialName]);
      const unit = cellText(row[header.map.unit]);
      const price = parsePrice(cellText(row[header.map.taxIncludedPrice]));

      if (!materialName || !unit || price === null) continue;

      const draft = {
        period,
        materialCode: buildMaterialCode(row, header.map),
        materialName,
        spec: header.map.spec !== undefined ? cellText(row[header.map.spec]) : "",
        unit,
        taxIncludedPrice: price,
        publishDate:
          header.map.publishDate !== undefined
            ? cellText(row[header.map.publishDate], { date: true }) || `${period}-15`
            : `${period}-15`,
        sourceFile: fileName
      };

      const record = {
        ...draft,
        materialKey: makeKey(draft)
      };

      records.push(recordSchema.parse(record));
    }
  }

  return { period, records };
}

await mkdir(processedDir, { recursive: true });

const files = (await readdir(rawDir)).filter((fileName) => /\.xlsx?$/i.test(fileName));

if (files.length === 0) {
  console.log("data/raw 中没有 Excel 文件，跳过解析。");
  process.exit(0);
}

for (const fileName of files) {
  const { period, records } = await parseWorkbook(fileName);
  const target = path.join(processedDir, `${period}.json`);
  await writeFile(target, `${JSON.stringify(records, null, 2)}\n`, "utf8");
  console.log(`parsed ${fileName}: ${records.length} records -> ${target}`);
}
