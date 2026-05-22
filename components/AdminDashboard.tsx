"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { Download, LockKeyhole, Search } from "lucide-react";
import { fetchHistory, fetchManifest, fetchSearchIndex } from "@/lib/data-client";
import { formatPrice } from "@/lib/format";
import { normalizeText, searchMaterials } from "@/lib/search";
import { sortHistory } from "@/lib/trend";
import type { DataManifest, MaterialEntity, PriceRecord } from "@/lib/types";

type LoadState = "loading" | "ready" | "error";

type CorrectionDraft = {
  displayName: string;
  normalizedName: string;
  spec: string;
  unit: string;
  aliases: string;
};

type MergeDraft = {
  targetCode?: string;
  targetKey?: string;
  sourceCodes: string[];
  sourceMaterialKeys: string[];
};

const adminPassword = process.env.NEXT_PUBLIC_ADMIN_PASSWORD ?? "";

function historyFallback(entity: MaterialEntity): PriceRecord[] {
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

function splitAliases(value: string) {
  return [...new Set(value.split(/[\n,，]/).map((alias) => alias.trim()).filter(Boolean))];
}

function downloadJson(name: string, payload: unknown) {
  const blob = new Blob([`${JSON.stringify(payload, null, 2)}\n`], {
    type: "application/json;charset=utf-8"
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}

export function AdminDashboard() {
  const [unlocked, setUnlocked] = useState(adminPassword.length === 0);
  const [passwordInput, setPasswordInput] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [status, setStatus] = useState<LoadState>("loading");
  const [error, setError] = useState("");
  const [manifest, setManifest] = useState<DataManifest | null>(null);
  const [materials, setMaterials] = useState<MaterialEntity[]>([]);
  const [keyword, setKeyword] = useState("水泥");
  const [selectedId, setSelectedId] = useState("");
  const [history, setHistory] = useState<PriceRecord[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [draft, setDraft] = useState<CorrectionDraft>({
    displayName: "",
    normalizedName: "",
    spec: "",
    unit: "",
    aliases: ""
  });
  const [mergeTarget, setMergeTarget] = useState<MaterialEntity | null>(null);
  const [mergeDrafts, setMergeDrafts] = useState<MergeDraft[]>([]);
  const [splitCodes, setSplitCodes] = useState<string[]>([]);

  useEffect(() => {
    let mounted = true;

    async function load() {
      try {
        const [nextManifest, nextMaterials] = await Promise.all([
          fetchManifest(),
          fetchSearchIndex()
        ]);

        if (!mounted) return;

        setManifest(nextManifest);
        setMaterials(nextMaterials);
        setSelectedId(nextMaterials[0]?.id ?? "");
        setStatus("ready");
      } catch (loadError) {
        if (!mounted) return;
        setError(loadError instanceof Error ? loadError.message : "管理数据加载失败");
        setStatus("error");
      }
    }

    load();

    return () => {
      mounted = false;
    };
  }, []);

  const matchedMaterials = useMemo(
    () => searchMaterials(materials, keyword).slice(0, 80),
    [keyword, materials]
  );
  const selectedEntity =
    materials.find((entity) => entity.id === selectedId) ?? matchedMaterials[0] ?? materials[0];

  useEffect(() => {
    if (!selectedEntity) return;

    setDraft({
      displayName: selectedEntity.displayName,
      normalizedName: selectedEntity.normalizedName,
      spec: selectedEntity.spec,
      unit: selectedEntity.unit,
      aliases: selectedEntity.aliases.join("\n")
    });
  }, [selectedEntity]);

  useEffect(() => {
    let mounted = true;

    async function loadSelectedHistory() {
      if (!selectedEntity) {
        setHistory([]);
        return;
      }

      setHistoryLoading(true);

      try {
        const nextHistory = selectedEntity.historyFile
          ? await fetchHistory(selectedEntity.historyFile)
          : historyFallback(selectedEntity);
        if (mounted) {
          setHistory(sortHistory(nextHistory, "desc"));
        }
      } catch {
        if (mounted) {
          setHistory(historyFallback(selectedEntity));
        }
      } finally {
        if (mounted) {
          setHistoryLoading(false);
        }
      }
    }

    loadSelectedHistory();

    return () => {
      mounted = false;
    };
  }, [selectedEntity]);

  function submitPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (passwordInput === adminPassword) {
      setUnlocked(true);
      setPasswordError("");
      return;
    }

    setPasswordError("密码不正确。");
  }

  function exportCorrectionDraft() {
    if (!selectedEntity) return;

    downloadJson("corrections-draft.json", {
      entities: [
        {
          id: selectedEntity.id,
          code: selectedEntity.code,
          materialKey: selectedEntity.materialKey,
          displayName: draft.displayName.trim(),
          normalizedName: draft.normalizedName.trim() || normalizeText(draft.displayName),
          spec: draft.spec.trim(),
          unit: draft.unit.trim(),
          aliases: splitAliases(draft.aliases)
        }
      ]
    });
  }

  function addMergeDraft(source: MaterialEntity) {
    if (!mergeTarget || mergeTarget.id === source.id) return;

    const targetCode = mergeTarget.code || undefined;
    const targetKey = targetCode ? undefined : `materialKey:${mergeTarget.materialKey}`;
    const nextDraft: MergeDraft = {
      targetCode,
      targetKey,
      sourceCodes: source.code ? [source.code] : [],
      sourceMaterialKeys: source.code ? [] : [source.materialKey]
    };

    setMergeDrafts((current) => {
      const serialized = JSON.stringify(nextDraft);
      return current.some((draftItem) => JSON.stringify(draftItem) === serialized)
        ? current
        : [...current, nextDraft];
    });
  }

  function addSplitCode(entity: MaterialEntity) {
    if (!entity.code) return;
    setSplitCodes((current) => (current.includes(entity.code) ? current : [...current, entity.code]));
  }

  function exportMergeDrafts() {
    downloadJson("material-merge-rules-draft.json", {
      merges: mergeDrafts,
      splitCodes
    });
  }

  if (!unlocked) {
    return (
      <main className="page-shell">
        <section className="admin-lock">
          <LockKeyhole size={28} />
          <h1>管理入口</h1>
          <form onSubmit={submitPassword}>
            <input
              onChange={(event) => setPasswordInput(event.target.value)}
              placeholder="输入管理密码"
              type="password"
              value={passwordInput}
            />
            <button className="primary-button" type="submit">
              进入
            </button>
          </form>
          {passwordError ? <p className="warning-note">{passwordError}</p> : null}
        </section>
      </main>
    );
  }

  if (status === "loading") {
    return (
      <main className="page-shell">
        <section className="state-panel">正在加载材料实体索引...</section>
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
    <main className="page-shell admin-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">Material Entity Admin</p>
          <h1>材料实体管理</h1>
        </div>
        <div className="topbar-actions">
          <Link className="admin-link" href="/">
            返回查询
          </Link>
          <div className="data-badge">索引期 {manifest?.latestPeriod}</div>
        </div>
      </header>

      <section className="admin-grid">
        <div className="table-panel admin-search-panel">
          <div className="panel-title">
            <h2>材料实体</h2>
            <span>{matchedMaterials.length} 个当前结果</span>
          </div>
          <label className="search-box admin-search">
            <Search size={18} />
            <input
              onChange={(event) => setKeyword(event.target.value)}
              placeholder="搜索名称、编码、规格或单位"
              value={keyword}
            />
          </label>
          <div className="admin-entity-list">
            {matchedMaterials.map((entity) => (
              <div
                className={entity.id === selectedEntity?.id ? "admin-entity active" : "admin-entity"}
                key={entity.id}
              >
                <button onClick={() => setSelectedId(entity.id)} type="button">
                  <strong>{entity.displayName}</strong>
                  <span>
                    {entity.code || "无编码"} · {entity.spec || "无规格"} · {entity.periodCount} 期
                  </span>
                </button>
                {mergeTarget && mergeTarget.id !== entity.id ? (
                  <button className="mini-button" onClick={() => addMergeDraft(entity)} type="button">
                    并到目标
                  </button>
                ) : null}
              </div>
            ))}
          </div>
        </div>

        <div className="detail-panel admin-detail">
          <div className="panel-title">
            <h2>{selectedEntity?.displayName ?? "请选择材料"}</h2>
            <span>{selectedEntity?.id}</span>
          </div>

          {selectedEntity ? (
            <div className="admin-editor">
              <div className="admin-form-grid">
                <label>
                  displayName
                  <input
                    onChange={(event) =>
                      setDraft((current) => ({ ...current, displayName: event.target.value }))
                    }
                    value={draft.displayName}
                  />
                </label>
                <label>
                  normalizedName
                  <input
                    onChange={(event) =>
                      setDraft((current) => ({ ...current, normalizedName: event.target.value }))
                    }
                    value={draft.normalizedName}
                  />
                </label>
                <label>
                  spec
                  <input
                    onChange={(event) =>
                      setDraft((current) => ({ ...current, spec: event.target.value }))
                    }
                    value={draft.spec}
                  />
                </label>
                <label>
                  unit
                  <input
                    onChange={(event) =>
                      setDraft((current) => ({ ...current, unit: event.target.value }))
                    }
                    value={draft.unit}
                  />
                </label>
                <label className="admin-aliases">
                  aliases
                  <textarea
                    onChange={(event) =>
                      setDraft((current) => ({ ...current, aliases: event.target.value }))
                    }
                    value={draft.aliases}
                  />
                </label>
              </div>

              <div className="admin-actions">
                <button onClick={exportCorrectionDraft} type="button">
                  <Download size={16} />
                  导出修正草稿
                </button>
                <button onClick={() => setMergeTarget(selectedEntity)} type="button">
                  设为合并目标
                </button>
                <button onClick={() => addSplitCode(selectedEntity)} type="button">
                  按编码拆分
                </button>
                <button onClick={exportMergeDrafts} type="button">
                  <Download size={16} />
                  导出合并规则
                </button>
              </div>

              <div className="admin-rule-state">
                <span>合并目标：{mergeTarget?.displayName ?? "-"}</span>
                <span>合并草稿：{mergeDrafts.length}</span>
                <span>拆分编码：{splitCodes.length}</span>
              </div>

              <div className="history-detail admin-history">
                <div className="history-heading">
                  <strong>历史价格记录</strong>
                  <span>{historyLoading ? "读取中..." : `${history.length} 条`}</span>
                </div>
                <div className="history-table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>期数</th>
                        <th>含税价</th>
                        <th>名称</th>
                        <th>规格 / 单位</th>
                        <th>来源</th>
                      </tr>
                    </thead>
                    <tbody>
                      {history.map((record) => (
                        <tr key={`${record.materialKey}-${record.period}-${record.sourceFile}`}>
                          <td>{record.period}</td>
                          <td>{formatPrice(record.taxIncludedPrice)}</td>
                          <td>{record.materialName}</td>
                          <td>
                            {record.spec || "-"} / {record.unit}
                          </td>
                          <td>{record.sourceFile}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </section>
    </main>
  );
}
