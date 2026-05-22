"use client";

import Link from "next/link";
import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Download,
  RefreshCcw,
  Search,
  X
} from "lucide-react";
import {
  Brush,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import { fetchHistory, fetchLatest, fetchManifest, fetchSearchIndex } from "@/lib/data-client";
import { formatPercent, formatPrice } from "@/lib/format";
import { searchMaterials } from "@/lib/search";
import { buildTrendRows, sortHistory, summarizeHistory, uniqueHistoryPeriods } from "@/lib/trend";
import type { DataManifest, MaterialEntity, PriceRecord } from "@/lib/types";

type LoadState = "loading" | "ready" | "error";
type BrushRange = { startIndex: number; endIndex: number };

const PAGE_SIZE = 30;
const MAX_COMPARE = 5;
const CHART_COLORS = ["#2563eb", "#0f766e", "#dc2626", "#9333ea", "#d97706"];

function entityFallbackHistory(entity: MaterialEntity): PriceRecord[] {
  return [
    {
      period: entity.latestPeriod,
      materialEntityId: entity.id,
      materialKey: entity.materialKey,
      materialCode: entity.code,
      materialName: entity.displayName,
      spec: entity.spec,
      unit: entity.unit,
      taxIncludedPrice: entity.latestPrice,
      publishDate: entity.publishDate,
      sourceFile: entity.sourceFile,
      historyFile: entity.historyFile
    }
  ];
}

function entityLabel(entity: MaterialEntity) {
  return [entity.displayName, entity.spec].filter(Boolean).join(" ");
}

function historyForEntity(cache: Map<string, PriceRecord[]>, entity?: MaterialEntity) {
  if (!entity) return [];
  return cache.get(entity.id) ?? entityFallbackHistory(entity);
}

function logHistoryDiagnostic(entity: MaterialEntity, history: PriceRecord[]) {
  if (process.env.NODE_ENV === "production") return;

  const periods = uniqueHistoryPeriods(history).map((record) => record.period);
  console.info("[material-history-diagnostic]", {
    entityId: entity.id,
    code: entity.code,
    displayName: entity.displayName,
    records: history.length,
    periods: periods.length,
    periodRange: periods.length > 0 ? `${periods[0]}..${periods.at(-1)}` : "empty"
  });
}

function rangeText(rows: Array<{ period: string }>) {
  const first = rows[0]?.period;
  const last = rows.at(-1)?.period;

  if (!first || !last) return "-";
  return first === last ? first : `${first} 至 ${last}`;
}

export function PriceDashboard() {
  const [status, setStatus] = useState<LoadState>("loading");
  const [error, setError] = useState("");
  const [manifest, setManifest] = useState<DataManifest | null>(null);
  const [latest, setLatest] = useState<PriceRecord[]>([]);
  const [materials, setMaterials] = useState<MaterialEntity[]>([]);
  const [historyCache, setHistoryCache] = useState<Map<string, PriceRecord[]>>(new Map());
  const [historyLoading, setHistoryLoading] = useState<Set<string>>(new Set());
  const [keyword, setKeyword] = useState("水泥");
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState("");
  const [compareIds, setCompareIds] = useState<string[]>([]);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [compareNotice, setCompareNotice] = useState("");
  const [brushRange, setBrushRange] = useState<BrushRange>({ startIndex: 0, endIndex: 0 });
  const [rangeMode, setRangeMode] = useState<"all" | "6" | "12" | "custom">("all");

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
        setSelectedId(nextMaterials[0]?.id ?? "");
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

  const matchedResults = useMemo(() => searchMaterials(materials, keyword), [keyword, materials]);
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
      setSelectedId("");
      return;
    }

    if (!matchedResults.some((entity) => entity.id === selectedId)) {
      setSelectedId(matchedResults[0].id);
    }
  }, [matchedResults, selectedId]);

  const selectedEntity = useMemo(() => {
    return (
      materials.find((entity) => entity.id === selectedId) ??
      matchedResults[0] ??
      materials[0]
    );
  }, [matchedResults, materials, selectedId]);

  const loadHistory = useCallback(
    async (entity: MaterialEntity) => {
      if (historyCache.has(entity.id) || historyLoading.has(entity.id)) {
        return;
      }

      setHistoryLoading((current) => new Set(current).add(entity.id));

      try {
        const history = entity.historyFile
          ? await fetchHistory(entity.historyFile)
          : entityFallbackHistory(entity);
        logHistoryDiagnostic(entity, history);
        setHistoryCache((current) => new Map(current).set(entity.id, sortHistory(history)));
      } catch {
        const fallback = entityFallbackHistory(entity);
        logHistoryDiagnostic(entity, fallback);
        setHistoryCache((current) => new Map(current).set(entity.id, fallback));
      } finally {
        setHistoryLoading((current) => {
          const next = new Set(current);
          next.delete(entity.id);
          return next;
        });
      }
    },
    [historyCache, historyLoading]
  );

  const comparisonEntities = useMemo(() => {
    const selectedForChart = compareIds.length > 0 ? compareIds : selectedEntity ? [selectedEntity.id] : [];
    return selectedForChart
      .map((id) => materials.find((entity) => entity.id === id))
      .filter((entity): entity is MaterialEntity => Boolean(entity));
  }, [compareIds, materials, selectedEntity]);

  useEffect(() => {
    for (const entity of comparisonEntities) {
      loadHistory(entity);
    }
  }, [comparisonEntities, loadHistory]);

  const trendRows = useMemo(() => {
    return buildTrendRows(
      comparisonEntities.map((entity) => ({
        entity,
        history: historyForEntity(historyCache, entity)
      }))
    );
  }, [comparisonEntities, historyCache]);

  useEffect(() => {
    setBrushRange({
      startIndex: 0,
      endIndex: Math.max(0, trendRows.length - 1)
    });
    setRangeMode("all");
  }, [trendRows.length, comparisonEntities.map((entity) => entity.id).join("|")]);

  const visibleTrendRows = useMemo(() => {
    if (trendRows.length === 0) return [];

    const startIndex = Math.max(0, Math.min(brushRange.startIndex, trendRows.length - 1));
    const endIndex = Math.max(startIndex, Math.min(brushRange.endIndex, trendRows.length - 1));
    return trendRows.slice(startIndex, endIndex + 1);
  }, [brushRange, trendRows]);
  const visiblePeriods = useMemo(
    () => new Set(visibleTrendRows.map((row) => row.period)),
    [visibleTrendRows]
  );
  const focusedEntity =
    comparisonEntities.find((entity) => entity.id === selectedEntity?.id) ?? comparisonEntities[0];
  const focusedHistory = historyForEntity(historyCache, focusedEntity);
  const focusedSummary = useMemo(
    () => summarizeHistory(focusedHistory, visiblePeriods),
    [focusedHistory, visiblePeriods]
  );
  const focusedAllPointCount = uniqueHistoryPeriods(focusedHistory).length;
  const unitSet = new Set(comparisonEntities.map((entity) => entity.unit).filter(Boolean));

  function selectEntity(entity: MaterialEntity) {
    setSelectedId(entity.id);
    setCompareNotice("");
    loadHistory(entity);

    if (compareIds.length <= 1) {
      setCompareIds([entity.id]);
    }
  }

  function toggleCompare(entity: MaterialEntity) {
    setCompareNotice("");
    setCompareIds((current) => {
      if (current.includes(entity.id)) {
        return current.filter((id) => id !== entity.id);
      }

      if (current.length >= MAX_COMPARE) {
        setCompareNotice(`最多同时对比 ${MAX_COMPARE} 个材料。`);
        return current;
      }

      return [...current, entity.id];
    });
    loadHistory(entity);
  }

  function toggleExpanded(entity: MaterialEntity) {
    setExpandedIds((current) => {
      const next = new Set(current);
      if (next.has(entity.id)) {
        next.delete(entity.id);
      } else {
        next.add(entity.id);
        loadHistory(entity);
      }
      return next;
    });
  }

  function setRecentRange(months: 6 | 12) {
    if (trendRows.length === 0) return;

    const endPeriod = trendRows.at(-1)?.period;
    const periodIndex = manifest?.periods.findIndex((period) => period === endPeriod) ?? -1;
    const cutoff =
      periodIndex >= 0 ? manifest?.periods[Math.max(0, periodIndex - months + 1)] : undefined;
    const startIndex = cutoff
      ? trendRows.findIndex((row) => row.period.localeCompare(cutoff, "zh-CN") >= 0)
      : Math.max(0, trendRows.length - months);

    setBrushRange({
      startIndex: startIndex >= 0 ? startIndex : 0,
      endIndex: trendRows.length - 1
    });
    setRangeMode(months === 6 ? "6" : "12");
  }

  function setAllRange() {
    setBrushRange({
      startIndex: 0,
      endIndex: Math.max(0, trendRows.length - 1)
    });
    setRangeMode("all");
  }

  async function exportResults() {
    const xlsx = await import("xlsx");
    const rows = matchedResults.map((entity) => ({
      材料实体ID: entity.id,
      材料编码: entity.code,
      材料名称: entity.displayName,
      规格型号: entity.spec,
      单位: entity.unit,
      最新期数: entity.latestPeriod,
      最新含税价: entity.latestPrice,
      有效历史期数: entity.periodCount,
      涨跌幅: entity.priceChangePercent
    }));
    const sheet = xlsx.utils.json_to_sheet(rows);
    const book = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(book, sheet, "材料实体搜索结果");
    xlsx.writeFile(book, `上海信息价材料搜索结果-${manifest?.latestPeriod ?? "latest"}.xlsx`);
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
        <div className="topbar-actions">
          <Link className="admin-link" href="/admin">
            后台
          </Link>
          <div className="data-badge" title="当前展示的是 public/data 中的静态数据">
            <RefreshCcw size={16} />
            <span>最新期 {manifest?.latestPeriod}</span>
          </div>
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
          <span>当前匹配实体</span>
          <strong>{matchedResults.length}</strong>
        </div>
        <div>
          <span>覆盖月份</span>
          <strong>{manifest?.periods.length}</strong>
        </div>
        <div>
          <span>材料实体</span>
          <strong>{manifest?.indexedEntities ?? materials.length}</strong>
        </div>
      </section>

      <section className="content-grid">
        <div className="table-panel">
          <div className="panel-title">
            <h2>材料搜索结果</h2>
            <span>
              共 {matchedResults.length} 个实体，第 {page} / {totalPages} 页
            </span>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>材料实体</th>
                  <th>规格 / 单位</th>
                  <th>最新价</th>
                  <th>历史</th>
                  <th>对比</th>
                </tr>
              </thead>
              <tbody>
                {pagedResults.map((entity) => {
                  const expanded = expandedIds.has(entity.id);
                  const detailHistory = sortHistory(historyForEntity(historyCache, entity), "desc");

                  return (
                    <Fragment key={entity.id}>
                      <tr
                        className={entity.id === selectedEntity?.id ? "selected" : ""}
                        onClick={() => selectEntity(entity)}
                      >
                        <td>
                          <div className="material-cell">
                            <button
                              aria-label={expanded ? "收起期数明细" : "展开期数明细"}
                              className="icon-button"
                              onClick={(event) => {
                                event.stopPropagation();
                                toggleExpanded(entity);
                              }}
                              title={expanded ? "收起期数明细" : "展开期数明细"}
                              type="button"
                            >
                              {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                            </button>
                            <div>
                              <strong>{entity.displayName}</strong>
                              <span>{entity.code || "无编码"}</span>
                            </div>
                          </div>
                        </td>
                        <td>
                          <strong>{entity.spec || "-"}</strong>
                          <span>{entity.unit}</span>
                        </td>
                        <td>
                          <strong>{formatPrice(entity.latestPrice)}</strong>
                          <span>{entity.latestPeriod}</span>
                        </td>
                        <td>
                          <strong>{entity.periodCount} 期</strong>
                          <span>
                            {entity.periodCount > 1
                              ? `全段 ${formatPercent(entity.priceChangePercent)}`
                              : "仅有单期"}
                          </span>
                        </td>
                        <td>
                          <label
                            className="compare-toggle"
                            onClick={(event) => event.stopPropagation()}
                          >
                            <input
                              checked={compareIds.includes(entity.id)}
                              onChange={() => toggleCompare(entity)}
                              type="checkbox"
                            />
                            <span>加入</span>
                          </label>
                        </td>
                      </tr>
                      {expanded ? (
                        <tr className="history-row">
                          <td colSpan={5}>
                            <div className="history-detail">
                              <div className="history-heading">
                                <strong>{entityLabel(entity)} 期数明细</strong>
                                <span>
                                  {historyLoading.has(entity.id)
                                    ? "正在读取历史..."
                                    : `匹配 ${detailHistory.length} 条价格记录`}
                                </span>
                              </div>
                              <div className="history-table-wrap">
                                <table>
                                  <thead>
                                    <tr>
                                      <th>期数</th>
                                      <th>含税价</th>
                                      <th>单位</th>
                                      <th>规格</th>
                                      <th>来源</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {detailHistory.map((record) => (
                                      <tr key={`${entity.id}-${record.period}-${record.sourceFile}`}>
                                        <td>{record.period}</td>
                                        <td>{formatPrice(record.taxIncludedPrice)}</td>
                                        <td>{record.unit}</td>
                                        <td>{record.spec || "-"}</td>
                                        <td>{record.sourceFile}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="pagination-bar">
            <span>
              当前显示 {pagedResults.length === 0 ? 0 : (page - 1) * PAGE_SIZE + 1}-
              {Math.min(page * PAGE_SIZE, matchedResults.length)} 个实体
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
            <h2>
              {comparisonEntities.length === 0
                ? "请选择材料查看趋势"
                : comparisonEntities.length === 1
                  ? `${comparisonEntities[0].displayName} 历史价格`
                  : "材料价格走势对比"}
            </h2>
            <span>{focusedEntity ? `${focusedEntity.periodCount} 个有效历史期数` : ""}</span>
          </div>

          <div className="chart-box">
            {trendRows.length === 0 ? (
              <div className="chart-empty">请选择材料查看真实历史数据点。</div>
            ) : (
              <ResponsiveContainer width="100%" height={330}>
                <LineChart data={trendRows} margin={{ left: 4, right: 16, top: 12, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="4 4" stroke="#d7dde8" />
                  <XAxis dataKey="period" tick={{ fontSize: 12 }} minTickGap={18} />
                  <YAxis
                    tick={{ fontSize: 12 }}
                    width={62}
                    domain={["dataMin - 10", "dataMax + 10"]}
                  />
                  <Tooltip
                    formatter={(value, name) => [
                      value === null || value === undefined ? "-" : formatPrice(Number(value)),
                      name
                    ]}
                  />
                  {comparisonEntities.length > 1 ? <Legend /> : null}
                  {comparisonEntities.map((entity, index) => (
                    <Line
                      activeDot={{ r: 6 }}
                      connectNulls={false}
                      dataKey={entity.id}
                      dot={{ r: 4 }}
                      key={entity.id}
                      name={entityLabel(entity)}
                      stroke={CHART_COLORS[index % CHART_COLORS.length]}
                      strokeWidth={3}
                      type="monotone"
                    />
                  ))}
                  <Brush
                    dataKey="period"
                    endIndex={brushRange.endIndex}
                    height={28}
                    onChange={(range) => {
                      if (range?.startIndex === undefined || range?.endIndex === undefined) return;
                      setBrushRange({
                        startIndex: range.startIndex,
                        endIndex: range.endIndex
                      });
                      setRangeMode("custom");
                    }}
                    startIndex={brushRange.startIndex}
                    stroke="#2563eb"
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>

          <div className="trend-workbench">
            {focusedAllPointCount === 1 ? (
              <p className="data-note">该材料仅有 1 期数据，无法形成趋势曲线。</p>
            ) : focusedSummary.pointCount === 2 ? (
              <p className="data-note">当前趋势仅基于 2 期真实数据点。</p>
            ) : focusedSummary.pointCount === 1 ? (
              <p className="data-note">当前时间范围仅保留 1 个真实数据点。</p>
            ) : null}

            {unitSet.size > 1 ? (
              <p className="warning-note">单位不同，价格对比可能不具备直接可比性。</p>
            ) : null}
            {compareNotice ? <p className="warning-note">{compareNotice}</p> : null}

            <div className="compare-chips">
              {comparisonEntities.map((entity) => (
                <span className="compare-chip" key={entity.id}>
                  {entityLabel(entity)}
                  {compareIds.includes(entity.id) ? (
                    <button
                      aria-label={`移除 ${entityLabel(entity)}`}
                      onClick={() => toggleCompare(entity)}
                      title="移出对比"
                      type="button"
                    >
                      <X size={14} />
                    </button>
                  ) : null}
                </span>
              ))}
            </div>

            <div className="range-controls">
              <span>时间范围</span>
              <button
                className={rangeMode === "6" ? "active" : ""}
                onClick={() => setRecentRange(6)}
                type="button"
              >
                最近 6 个月
              </button>
              <button
                className={rangeMode === "12" ? "active" : ""}
                onClick={() => setRecentRange(12)}
                type="button"
              >
                最近 12 个月
              </button>
              <button
                className={rangeMode === "all" ? "active" : ""}
                onClick={setAllRange}
                type="button"
              >
                全部历史
              </button>
              <strong>{rangeText(visibleTrendRows)}</strong>
            </div>

            <div className="summary-grid">
              <div>
                <span>当前选中</span>
                <strong>{comparisonEntities.length}</strong>
              </div>
              <div>
                <span>可见真实点</span>
                <strong>{focusedSummary.pointCount}</strong>
              </div>
              <div>
                <span>最新价</span>
                <strong>{formatPrice(focusedSummary.latest?.taxIncludedPrice)}</strong>
              </div>
              <div>
                <span>区间最高 / 最低</span>
                <strong>
                  {formatPrice(focusedSummary.max?.taxIncludedPrice)} /{" "}
                  {formatPrice(focusedSummary.min?.taxIncludedPrice)}
                </strong>
              </div>
              <div>
                <span>涨跌幅摘要</span>
                <strong>{formatPercent(focusedSummary.percent)}</strong>
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
