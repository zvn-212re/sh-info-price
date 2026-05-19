"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ArrowDownRight,
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
  Download,
  RefreshCcw,
  Search
} from "lucide-react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import { fetchHistory, fetchLatest, fetchManifest, fetchSearchIndex } from "@/lib/data-client";
import { formatPercent, formatPrice } from "@/lib/format";
import { recordMatches, sortByMaterial } from "@/lib/search";
import type { DataManifest, PriceRecord, SearchIndexRecord } from "@/lib/types";

type LoadState = "loading" | "ready" | "error";
const PAGE_SIZE = 50;

function compareRecords(base?: PriceRecord, target?: PriceRecord) {
  if (!base || !target) {
    return { base, target, diff: null, percent: null };
  }

  const diff = target.taxIncludedPrice - base.taxIncludedPrice;
  const percent = base.taxIncludedPrice === 0 ? null : (diff / base.taxIncludedPrice) * 100;

  return { base, target, diff, percent };
}

export function PriceDashboard() {
  const [status, setStatus] = useState<LoadState>("loading");
  const [error, setError] = useState("");
  const [manifest, setManifest] = useState<DataManifest | null>(null);
  const [latest, setLatest] = useState<PriceRecord[]>([]);
  const [materials, setMaterials] = useState<SearchIndexRecord[]>([]);
  const [historyCache, setHistoryCache] = useState<Map<string, PriceRecord[]>>(new Map());
  const [selectedHistory, setSelectedHistory] = useState<PriceRecord[]>([]);
  const [keyword, setKeyword] = useState("水泥");
  const [page, setPage] = useState(1);
  const [selectedKey, setSelectedKey] = useState<string>("");
  const [monthA, setMonthA] = useState("");
  const [monthB, setMonthB] = useState("");

  useEffect(() => {
    let mounted = true;

    async function load() {
      try {
        const [nextManifest, nextLatest, nextMaterials] = await Promise.all([
          fetchManifest(),
          fetchLatest(),
          fetchSearchIndex()
        ]);

        if (!mounted) return;

        setManifest(nextManifest);
        setLatest(nextLatest);
        setMaterials(nextMaterials);
        setMonthA(nextManifest.periods.at(-2) ?? nextManifest.latestPeriod);
        setMonthB(nextManifest.latestPeriod);
        setSelectedKey(nextMaterials[0]?.materialKey ?? nextLatest[0]?.materialKey ?? "");
        setStatus("ready");
      } catch (loadError) {
        if (!mounted) return;
        setError(loadError instanceof Error ? loadError.message : "数据加载失败");
        setStatus("error");
      }
    }

    load();

    return () => {
      mounted = false;
    };
  }, []);

  const matchedResults = useMemo(() => {
    return sortByMaterial(materials.filter((record) => recordMatches(record, keyword)));
  }, [keyword, materials]);

  const totalPages = Math.max(1, Math.ceil(matchedResults.length / PAGE_SIZE));

  const pagedResults = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return matchedResults.slice(start, start + PAGE_SIZE);
  }, [matchedResults, page]);

  useEffect(() => {
    setPage(1);
  }, [keyword]);

  useEffect(() => {
    setPage((currentPage) => Math.min(currentPage, totalPages));
  }, [totalPages]);

  useEffect(() => {
    if (matchedResults.length === 0) {
      setSelectedKey("");
      return;
    }

    if (!matchedResults.some((record) => record.materialKey === selectedKey)) {
      setSelectedKey(matchedResults[0].materialKey);
    }
  }, [matchedResults, selectedKey]);

  const selectedRecord = useMemo(() => {
    return (
      matchedResults.find((record) => record.materialKey === selectedKey) ??
      materials.find((record) => record.materialKey === selectedKey) ??
      matchedResults[0]
    );
  }, [matchedResults, materials, selectedKey]);

  useEffect(() => {
    let mounted = true;

    async function loadHistory(record: PriceRecord) {
      if (!record.historyFile) {
        setSelectedHistory([record]);
        return;
      }

      const cached = historyCache.get(record.materialKey);
      if (cached) {
        setSelectedHistory(cached);
        return;
      }

      try {
        const history = await fetchHistory(record.historyFile);
        if (!mounted) return;
        setHistoryCache((current) => new Map(current).set(record.materialKey, history));
        setSelectedHistory(history);
      } catch {
        if (!mounted) return;
        setSelectedHistory([record]);
      }
    }

    if (selectedRecord) {
      loadHistory(selectedRecord);
    } else {
      setSelectedHistory([]);
    }

    return () => {
      mounted = false;
    };
  }, [historyCache, selectedRecord]);

  const trend = useMemo(() => {
    return selectedHistory.map((record) => ({
      period: record.period,
      price: record.taxIncludedPrice,
      unit: record.unit
    }));
  }, [selectedHistory]);

  const compare = useMemo(() => {
    if (!selectedRecord) {
      return compareRecords();
    }

    const base = selectedHistory.find((record) => record.period === monthA);
    const target = selectedHistory.find((record) => record.period === monthB);

    return compareRecords(base, target);
  }, [monthA, monthB, selectedHistory, selectedRecord]);

  async function exportResults() {
    const xlsx = await import("xlsx");
    const rows = matchedResults.map((record) => ({
      月份: record.period,
      材料编码: record.materialCode,
      材料名称: record.materialName,
      规格型号: record.spec,
      单位: record.unit,
      信息价含税: record.taxIncludedPrice,
      发布日期: record.publishDate
    }));
    const sheet = xlsx.utils.json_to_sheet(rows);
    const book = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(book, sheet, "查询结果");
    xlsx.writeFile(book, `上海信息价查询结果-${manifest?.latestPeriod ?? "latest"}.xlsx`);
  }

  if (status === "loading") {
    return (
      <main className="page-shell">
        <section className="state-panel">正在加载本地信息价数据...</section>
      </main>
    );
  }

  if (status === "error") {
    return (
      <main className="page-shell">
        <section className="state-panel error-state">{error}</section>
      </main>
    );
  }

  return (
    <main className="page-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">Shanghai Construction Price Index</p>
          <h1>上海信息价数据库比对系统</h1>
        </div>
        <div className="data-badge" title="当前展示的是 public/data 中的静态数据">
          <RefreshCcw size={16} />
          <span>最新期 {manifest?.latestPeriod}</span>
        </div>
      </header>

      <section className="toolbar" aria-label="查询条件">
        <label className="search-box">
          <Search size={18} />
          <input
            value={keyword}
            onChange={(event) => setKeyword(event.target.value)}
            placeholder="输入材料名称、编码、规格或单位"
          />
        </label>
        <button className="primary-button" onClick={exportResults} type="button">
          <Download size={17} />
          导出结果
        </button>
      </section>

      <section className="stats-grid">
        <div>
          <span>最新数据量</span>
          <strong>{latest.length}</strong>
        </div>
        <div>
          <span>当前匹配</span>
          <strong>{matchedResults.length}</strong>
        </div>
        <div>
          <span>覆盖月份</span>
          <strong>{manifest?.periods.length}</strong>
        </div>
        <div>
          <span>总记录</span>
          <strong>{manifest?.indexedMaterials ?? materials.length}</strong>
        </div>
      </section>

      <section className="content-grid">
        <div className="table-panel">
          <div className="panel-title">
            <h2>材料查询结果</h2>
            <span>
              共 {matchedResults.length} 条，第 {page} / {totalPages} 页
            </span>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>材料</th>
                  <th>规格</th>
                  <th>单位</th>
                  <th>含税价</th>
                  <th>期号</th>
                </tr>
              </thead>
              <tbody>
                {pagedResults.map((record) => (
                  <tr
                    className={record.materialKey === selectedRecord?.materialKey ? "selected" : ""}
                    key={record.materialKey}
                    onClick={() => setSelectedKey(record.materialKey)}
                  >
                    <td>
                      <strong>{record.materialName}</strong>
                      <span>{record.materialCode}</span>
                    </td>
                    <td>{record.spec}</td>
                    <td>{record.unit}</td>
                    <td>{formatPrice(record.taxIncludedPrice)}</td>
                    <td>{record.period}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="pagination-bar">
            <span>
              当前显示 {pagedResults.length === 0 ? 0 : (page - 1) * PAGE_SIZE + 1}-
              {Math.min(page * PAGE_SIZE, matchedResults.length)} 条
            </span>
            <div>
              <button
                aria-label="Previous page"
                disabled={page <= 1}
                onClick={() => setPage((currentPage) => Math.max(1, currentPage - 1))}
                type="button"
              >
                <ChevronLeft size={17} />
              </button>
              <button
                aria-label="Next page"
                disabled={page >= totalPages}
                onClick={() => setPage((currentPage) => Math.min(totalPages, currentPage + 1))}
                type="button"
              >
                <ChevronRight size={17} />
              </button>
            </div>
          </div>
        </div>

        <div className="detail-panel">
          <div className="panel-title">
            <h2>{selectedRecord?.materialName ?? "请选择材料"}</h2>
            <span>{selectedRecord?.spec}</span>
          </div>

          <div className="chart-box">
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={trend} margin={{ left: 4, right: 16, top: 12, bottom: 8 }}>
                <CartesianGrid strokeDasharray="4 4" stroke="#d7dde8" />
                <XAxis dataKey="period" tick={{ fontSize: 12 }} />
                <YAxis
                  tick={{ fontSize: 12 }}
                  width={54}
                  domain={["dataMin - 10", "dataMax + 10"]}
                />
                <Tooltip formatter={(value) => [formatPrice(Number(value)), "含税价"]} />
                <Line
                  type="monotone"
                  dataKey="price"
                  stroke="#2563eb"
                  strokeWidth={3}
                  dot={{ r: 4 }}
                  activeDot={{ r: 6 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div className="compare-panel">
            <div className="compare-controls">
              <label>
                月份 A
                <select value={monthA} onChange={(event) => setMonthA(event.target.value)}>
                  {manifest?.periods.map((period) => (
                    <option value={period} key={period}>
                      {period}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                月份 B
                <select value={monthB} onChange={(event) => setMonthB(event.target.value)}>
                  {manifest?.periods.map((period) => (
                    <option value={period} key={period}>
                      {period}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="compare-result">
              <div>
                <span>{monthA}</span>
                <strong>{formatPrice(compare.base?.taxIncludedPrice)}</strong>
              </div>
              <div>
                <span>{monthB}</span>
                <strong>{formatPrice(compare.target?.taxIncludedPrice)}</strong>
              </div>
              <div className={compare.diff !== null && compare.diff >= 0 ? "up" : "down"}>
                {compare.diff !== null && compare.diff >= 0 ? (
                  <ArrowUpRight size={18} />
                ) : (
                  <ArrowDownRight size={18} />
                )}
                <strong>{formatPrice(compare.diff)}</strong>
                <span>{formatPercent(compare.percent)}</span>
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
