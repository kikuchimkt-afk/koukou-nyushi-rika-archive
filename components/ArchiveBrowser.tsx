"use client";

import { PDFDocument } from "pdf-lib";
import { useEffect, useMemo, useState } from "react";
import type { ArchiveData, ArchiveItem, ScienceField } from "@/types/archive";
import { FIELDS } from "@/types/archive";

type Props = { data: ArchiveData };

type Filters = {
  q: string;
  grade: string;
  field: "" | ScienceField;
  year: string;
  prefecture: string;
};

type BundleState = {
  status: "idle" | "fetching" | "packing" | "done" | "error";
  progress: number;
  message: string;
};

const EMPTY_FILTERS: Filters = { q: "", grade: "", field: "", year: "", prefecture: "" };
const EMPTY_BUNDLE_STATE: BundleState = { status: "idle", progress: 0, message: "" };
const STICKY_STORAGE_KEY = "science-archive-sticky-v1";
const PDF_CHUNK_SIZE = 3 * 1024 * 1024;
const MAX_BUNDLE_ITEMS = 10;
const MAX_BUNDLE_BYTES = 120 * 1024 * 1024;

const FIELD_META: Record<ScienceField, { image: string; eyebrow: string; description: string }> = {
  物理: {
    image: "/images/field-physics.webp",
    eyebrow: "LIGHT · SOUND · FORCE",
    description: "光、音、力、圧力を、図と実験から考える問題",
  },
  化学: {
    image: "/images/field-chemistry.webp",
    eyebrow: "MATTER · SOLUTION",
    description: "物質、状態変化、水溶液、気体を扱う問題",
  },
  地学: {
    image: "/images/field-earth.webp",
    eyebrow: "EARTH · STRATA",
    description: "地層、火山、岩石、地震から大地を読む問題",
  },
  生物: {
    image: "/images/field-biology.webp",
    eyebrow: "LIFE · CLASSIFICATION",
    description: "生物の特徴や分類を観察結果から考える問題",
  },
};

const FIELD_ORDER = new Map(FIELDS.map((field, index) => [field, index]));

export function ArchiveBrowser({ data }: Props) {
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [selected, setSelected] = useState<ArchiveItem | null>(null);
  const [selectedPage, setSelectedPage] = useState(0);
  const [stickyIds, setStickyIds] = useState<string[]>([]);
  const [stickyReady, setStickyReady] = useState(false);
  const [trayExpanded, setTrayExpanded] = useState(false);
  const [collectionOpen, setCollectionOpen] = useState(false);
  const [bundleState, setBundleState] = useState<BundleState>(EMPTY_BUNDLE_STATE);

  const itemById = useMemo(() => new Map(data.items.map((item) => [item.id, item])), [data.items]);
  const stickyItems = useMemo(
    () => stickyIds.map((id) => itemById.get(id)).filter((item): item is ArchiveItem => Boolean(item)),
    [itemById, stickyIds],
  );
  const stickyPages = useMemo(() => stickyItems.reduce((sum, item) => sum + item.pageCount, 0), [stickyItems]);
  const stickyBytes = useMemo(() => stickyItems.reduce((sum, item) => sum + item.fileSize, 0), [stickyItems]);
  const bundleLimitMessage = useMemo(() => {
    if (stickyItems.length > MAX_BUNDLE_ITEMS) return `一括DLは${MAX_BUNDLE_ITEMS}題までです。付箋を絞ってください。`;
    if (stickyBytes > MAX_BUNDLE_BYTES) return `一括DLは合計${formatFileSize(MAX_BUNDLE_BYTES)}までです。付箋を絞ってください。`;
    return "";
  }, [stickyBytes, stickyItems.length]);

  const years = useMemo(
    () => [...new Set(data.items.map((item) => item.year))].sort((a, b) => b - a),
    [data.items],
  );
  const prefectures = useMemo(
    () => [...new Set(data.items.map((item) => item.prefecture))].sort((a, b) => a.localeCompare(b, "ja")),
    [data.items],
  );

  const gradeCounts = useMemo(() => {
    const counts = new Map<number, number>([[1, 0], [2, 0], [3, 0]]);
    for (const item of data.items) counts.set(item.grade, (counts.get(item.grade) || 0) + 1);
    return counts;
  }, [data.items]);

  const fieldCounts = useMemo(() => {
    const counts = new Map<ScienceField, number>(FIELDS.map((field) => [field, 0]));
    for (const item of data.items) {
      if (filters.grade && item.grade !== Number(filters.grade)) continue;
      counts.set(item.field, (counts.get(item.field) || 0) + 1);
    }
    return counts;
  }, [data.items, filters.grade]);

  const filtered = useMemo(() => {
    const q = normalize(filters.q);
    return data.items
      .filter((item) => {
        if (filters.grade && item.grade !== Number(filters.grade)) return false;
        if (filters.field && item.field !== filters.field) return false;
        if (filters.year && item.year !== Number(filters.year)) return false;
        if (filters.prefecture && item.prefecture !== filters.prefecture) return false;
        if (!q) return true;
        return normalize(`${item.unit} ${item.shortUnit} ${item.tags.join(" ")} ${item.prefecture} ${item.year} ${item.field}`).includes(q);
      })
      .sort(
        (a, b) =>
          b.year - a.year ||
          (FIELD_ORDER.get(a.field) || 0) - (FIELD_ORDER.get(b.field) || 0) ||
          a.prefecture.localeCompare(b.prefecture, "ja") ||
          a.unit.localeCompare(b.unit, "ja"),
      );
  }, [data.items, filters]);

  useEffect(() => {
    try {
      const stored = JSON.parse(window.localStorage.getItem(STICKY_STORAGE_KEY) || "[]") as unknown;
      if (Array.isArray(stored)) {
        setStickyIds(stored.filter((id): id is string => typeof id === "string" && itemById.has(id)));
      }
    } catch {
      setStickyIds([]);
    } finally {
      setStickyReady(true);
    }
  }, [itemById]);

  useEffect(() => {
    if (!stickyReady) return;
    window.localStorage.setItem(STICKY_STORAGE_KEY, JSON.stringify(stickyIds));
  }, [stickyIds, stickyReady]);

  useEffect(() => {
    if (!selected && !collectionOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (collectionOpen) setCollectionOpen(false);
        else setSelected(null);
      }
      if (!selected || collectionOpen) return;
      if (event.key === "ArrowRight") setSelectedPage((page) => Math.min(selected.previewPages.length - 1, page + 1));
      if (event.key === "ArrowLeft") setSelectedPage((page) => Math.max(0, page - 1));
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [collectionOpen, selected]);

  useEffect(() => {
    if (collectionOpen && stickyItems.length === 0) setCollectionOpen(false);
  }, [collectionOpen, stickyItems.length]);

  const setFilter = (key: keyof Filters, value: string) => setFilters((current) => ({ ...current, [key]: value }));

  const openPreview = (item: ArchiveItem) => {
    setSelected(item);
    setSelectedPage(0);
  };

  const chooseField = (field: ScienceField) => {
    setFilters((current) => ({ ...current, field: current.field === field ? "" : field }));
    window.setTimeout(() => document.getElementById("questions")?.scrollIntoView({ behavior: "smooth", block: "start" }), 0);
  };

  const toggleSticky = (id: string) => {
    setStickyIds((current) => current.includes(id) ? current.filter((candidate) => candidate !== id) : [...current, id]);
    setBundleState(EMPTY_BUNDLE_STATE);
  };

  const clearSticky = () => {
    setStickyIds([]);
    setBundleState(EMPTY_BUNDLE_STATE);
  };

  const downloadBundle = async () => {
    if (!stickyItems.length || bundleLimitMessage || bundleState.status === "fetching" || bundleState.status === "packing") return;

    const snapshot = [...stickyItems];
    const totalBytes = snapshot.reduce((sum, item) => sum + item.fileSize, 0);
    let loadedBytes = 0;

    try {
      const mergedPdf = await PDFDocument.create();
      mergedPdf.setTitle(`高校入試 理科 選定問題 ${snapshot.length}題`);
      mergedPdf.setSubject(snapshot.map((item) => `${item.year}年 ${item.prefecture} ${item.shortUnit}`).join(" / "));

      for (let itemIndex = 0; itemIndex < snapshot.length; itemIndex += 1) {
        const item = snapshot[itemIndex];
        const pdfBytes = new Uint8Array(item.fileSize);
        let itemOffset = 0;
        const chunkCount = Math.ceil(item.fileSize / PDF_CHUNK_SIZE);
        setBundleState({
          status: "fetching",
          progress: Math.round((loadedBytes / totalBytes) * 80),
          message: `${itemIndex + 1}/${snapshot.length}題目「${item.shortUnit}」を取得中`,
        });

        for (let chunk = 0; chunk < chunkCount; chunk += 1) {
          const response = await fetch(`/api/pdf/${encodeURIComponent(item.id)}?chunk=${chunk}`);
          if (!response.ok) throw new Error(`${item.prefecture}「${item.shortUnit}」の取得に失敗しました。`);
          const part = await response.arrayBuffer();
          pdfBytes.set(new Uint8Array(part), itemOffset);
          itemOffset += part.byteLength;
          loadedBytes += part.byteLength;
          setBundleState({
            status: "fetching",
            progress: Math.min(80, Math.round((loadedBytes / totalBytes) * 80)),
            message: `${itemIndex + 1}/${snapshot.length}題目「${item.shortUnit}」を取得中`,
          });
        }

        if (itemOffset !== item.fileSize) throw new Error(`${item.prefecture}「${item.shortUnit}」のPDFが不完全です。`);
        setBundleState({
          status: "packing",
          progress: 80 + Math.round(((itemIndex + 1) / snapshot.length) * 15),
          message: `${itemIndex + 1}/${snapshot.length}題目を結合中`,
        });
        const sourcePdf = await PDFDocument.load(pdfBytes);
        const copiedPages = await mergedPdf.copyPages(sourcePdf, sourcePdf.getPageIndices());
        copiedPages.forEach((page) => mergedPdf.addPage(page));
      }

      setBundleState({ status: "packing", progress: 96, message: "1つのPDFとして保存準備中" });
      const mergedBytes = await mergedPdf.save({ useObjectStreams: true });
      const mergedBuffer = mergedBytes.buffer.slice(
        mergedBytes.byteOffset,
        mergedBytes.byteOffset + mergedBytes.byteLength,
      ) as ArrayBuffer;
      const mergedBlob = new Blob([mergedBuffer], { type: "application/pdf" });
      const url = URL.createObjectURL(mergedBlob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `高校入試理科_選定問題_${dateStamp()}_${snapshot.length}題_結合版.pdf`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
      setBundleState({ status: "done", progress: 100, message: `${snapshot.length}題を1つのPDFに結合して保存しました` });
    } catch (error) {
      setBundleState({
        status: "error",
        progress: 0,
        message: error instanceof Error ? error.message : "PDFの結合に失敗しました。",
      });
    }
  };

  const bundleBusy = bundleState.status === "fetching" || bundleState.status === "packing";

  return (
    <main className={stickyItems.length ? "has-sticky-tray" : ""}>
      <header className="site-header">
        <a className="brand" href="#top" aria-label="SCIENTIA トップへ">
          <span className="brand-mark" aria-hidden="true">⌁</span>
          <span>
            <strong>SCIENTIA</strong>
            <small>高校入試 理科大問アーカイブ</small>
          </span>
        </a>
        <a className="header-link" href="#questions">問題を探す</a>
      </header>

      <section id="top" className="hero">
        <img className="hero-image" src="/images/hero-science.webp" alt="凸レンズ、ばねばかり、試験管などを配置した理科実験机" />
        <div className="hero-overlay" />
        <div className="hero-content shell">
          <p className="eyebrow">SCIENCE ENTRANCE EXAM ARCHIVE</p>
          <div className="hero-grade"><span>中1・中2</span> 物理・化学・地学・生物</div>
          <h1 className="app-title">SCIENTIA<span>スキエンティア</span></h1>
          <p className="hero-copy">
            高校入試の理科大問を、単元別に整理しました。PDFを開く前に全ページを画像で確認でき、問題選定を短時間で進められます。
          </p>
          <div className="hero-actions">
            <a className="button button-primary" href="#fields">分野から選ぶ</a>
            <a className="button button-secondary" href="#questions">一覧を見る</a>
          </div>
          <dl className="hero-stats" aria-label="収録情報">
            <div><dt>{data.totalItems}</dt><dd>大問</dd></div>
            <div><dt>{data.totalPages}</dt><dd>プレビューページ</dd></div>
            <div><dt>{years.at(-1)}–{years[0]}</dt><dd>実施年</dd></div>
          </dl>
        </div>
      </section>

      <section className="grade-section shell" aria-labelledby="grade-title">
        <div className="section-heading compact-heading">
          <div>
            <p className="eyebrow">GRADE</p>
            <h2 id="grade-title">学年を選ぶ</h2>
          </div>
          <p>学年を切り替えて、授業に合う大問を探せます。</p>
        </div>
        <div className="grade-tabs">
          {[1, 2, 3].map((grade) => {
            const count = gradeCounts.get(grade) || 0;
            const active = filters.grade === String(grade);
            return (
              <button
                className={`grade-tab ${active ? "is-active" : ""}`}
                type="button"
                key={grade}
                aria-pressed={active}
                disabled={!count}
                onClick={() => setFilter("grade", active ? "" : String(grade))}
              >
                <span>中学{grade}年</span><strong>{count ? `${count}題` : "準備中"}</strong>
              </button>
            );
          })}
        </div>
      </section>

      <section id="fields" className="fields-section shell" aria-labelledby="fields-title">
        <div className="section-heading">
          <div>
            <p className="eyebrow">FIELDS</p>
            <h2 id="fields-title">4分野から選ぶ</h2>
          </div>
          <p>太字の解説見出しと全設問を確認し、学年範囲で構成される独立大問を収録しています。</p>
        </div>
        <div className="field-grid">
          {FIELDS.map((field) => {
            const meta = FIELD_META[field];
            const active = filters.field === field;
            return (
              <button
                type="button"
                key={field}
                aria-pressed={active}
                className={`field-card ${active ? "is-active" : ""}`}
                onClick={() => chooseField(field)}
              >
                <img src={meta.image} alt="" />
                <span className="field-card-overlay" />
                <span className="field-card-content">
                  <small>{meta.eyebrow}</small>
                  <strong>{field}</strong>
                  <span>{meta.description}</span>
                  <em>{fieldCounts.get(field)}題を見る <b aria-hidden="true">→</b></em>
                </span>
              </button>
            );
          })}
        </div>
      </section>

      <section id="questions" className="archive-section shell" aria-labelledby="questions-title">
        <div className="section-heading">
          <div>
            <p className="eyebrow">QUESTION SELECTOR</p>
            <h2 id="questions-title">大問を選定する</h2>
          </div>
          <p>候補には付箋を付けて保存できます。複数の問題を連続確認し、1つのPDFに結合して取得できます。</p>
        </div>

        <div className="filter-panel">
          <label className="search-field">
            <span>単元・キーワード</span>
            <div><span aria-hidden="true">⌕</span><input value={filters.q} onChange={(event) => setFilter("q", event.target.value)} placeholder="例：凸レンズ、地震、再結晶" /></div>
          </label>
          <FilterSelect label="分野" value={filters.field} onChange={(value) => setFilter("field", value)} options={FIELDS.map((field) => ({ value: field, label: `${field}（${fieldCounts.get(field)}）` }))} />
          <FilterSelect label="実施年" value={filters.year} onChange={(value) => setFilter("year", value)} options={years.map((year) => ({ value: String(year), label: `${year}年` }))} />
          <FilterSelect label="都道府県" value={filters.prefecture} onChange={(value) => setFilter("prefecture", value)} options={prefectures.map((prefecture) => ({ value: prefecture, label: prefecture }))} />
          <button className="clear-button" type="button" onClick={() => setFilters(EMPTY_FILTERS)} disabled={!filters.q && !filters.grade && !filters.field && !filters.year && !filters.prefecture}>条件をクリア</button>
        </div>

        <div className="results-bar">
          <p><strong>{filtered.length}</strong>題を表示</p>
          <p>問題 → 解答用紙 → 正解 → 解説</p>
        </div>

        {filtered.length ? (
          <div className="question-grid">
            {filtered.map((item) => {
              const marked = stickyIds.includes(item.id);
              return (
                <article className={`question-card ${marked ? "is-marked" : ""}`} key={item.id}>
                  <button
                    className={`sticky-button card-sticky-button ${marked ? "is-active" : ""}`}
                    type="button"
                    aria-pressed={marked}
                    onClick={() => toggleSticky(item.id)}
                  >
                    <span aria-hidden="true">{marked ? "✓" : "+"}</span> {marked ? "付箋済み" : "付箋"}
                  </button>
                  <button className="question-thumb" type="button" onClick={() => openPreview(item)} aria-label={`${item.year}年 ${item.prefecture} ${item.unit}を画像で確認`}>
                    <img src={item.previewPages[0]} alt={`${item.year}年 ${item.prefecture} ${item.shortUnit} 問題1ページ目`} loading="lazy" />
                    <span className="thumb-shade" />
                    <span className="preview-pill">全{item.pageCount}ページを確認</span>
                  </button>
                  <div className="question-body">
                    <div className="badges">
                      <span className={`field-badge field-${fieldClass(item.field)}`}>{item.field}</span>
                      <span>中{item.grade}</span><span>{item.year}年</span><span>{item.prefecture}</span>
                    </div>
                    <h3>{item.shortUnit}</h3>
                    <div className="tag-list">
                      {item.tags.slice(0, 6).map((tag) => <span key={tag}>{tag}</span>)}
                      {item.tags.length > 6 && <span>ほか{item.tags.length - 6}</span>}
                    </div>
                    <div className="card-actions">
                      <button className="button button-primary" type="button" onClick={() => openPreview(item)}>画像で確認</button>
                      <a className="text-link" href={item.pdfUrl}>PDFを取得 ↓</a>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="empty-state">
            <strong>条件に合う問題がありません</strong>
            <p>キーワードまたは絞り込み条件を減らしてお試しください。</p>
            <button className="button button-secondary" type="button" onClick={() => setFilters(EMPTY_FILTERS)}>条件をクリア</button>
          </div>
        )}
      </section>

      <section className="workflow-section shell">
        <img src="/images/field-force.webp" alt="ばね、ばねばかり、水中の物体を配置した力の実験" />
        <div>
          <p className="eyebrow">FOR TEACHERS</p>
          <h2>PDFを開く前に、授業で使えるか判断。</h2>
          <ol>
            <li><b>01</b><span><strong>絞り込む</strong>分野・年度・県・単元で候補を絞ります。</span></li>
            <li><b>02</b><span><strong>付箋に集める</strong>候補を残し、複数の問題を連続して見比べます。</span></li>
            <li><b>03</b><span><strong>1ファイルで利用</strong>採用する高解像度PDFを付箋順に結合して取得します。</span></li>
          </ol>
        </div>
      </section>

      <footer className="site-footer">
        <div className="shell">
          <div><strong>SCIENTIA <small>スキエンティア</small></strong><p>高校入試理科を単元別に収めた、講師向けアーカイブ。</p></div>
          <p>資料の利用にあたっては、各資料の権利条件をご確認ください。</p>
        </div>
      </footer>

      {selected && (
        <PreviewDialog
          item={selected}
          page={selectedPage}
          marked={stickyIds.includes(selected.id)}
          onToggleSticky={() => toggleSticky(selected.id)}
          onPageChange={setSelectedPage}
          onClose={() => setSelected(null)}
        />
      )}

      {collectionOpen && stickyItems.length > 0 && (
        <CollectionDialog
          items={stickyItems}
          totalPages={stickyPages}
          bundleState={bundleState}
          bundleBusy={bundleBusy}
          bundleLimitMessage={bundleLimitMessage}
          onRemove={toggleSticky}
          onDownload={downloadBundle}
          onClose={() => setCollectionOpen(false)}
        />
      )}

      {stickyItems.length > 0 && (
        <StickyTray
          items={stickyItems}
          totalPages={stickyPages}
          totalBytes={stickyBytes}
          expanded={trayExpanded}
          bundleState={bundleState}
          bundleBusy={bundleBusy}
          bundleLimitMessage={bundleLimitMessage}
          onToggleExpanded={() => setTrayExpanded((current) => !current)}
          onRemove={toggleSticky}
          onClear={clearSticky}
          onPreview={() => setCollectionOpen(true)}
          onDownload={downloadBundle}
        />
      )}
    </main>
  );
}

function PreviewDialog({ item, page, marked, onToggleSticky, onPageChange, onClose }: {
  item: ArchiveItem;
  page: number;
  marked: boolean;
  onToggleSticky: () => void;
  onPageChange: (page: number) => void;
  onClose: () => void;
}) {
  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) onClose(); }}>
      <section className="preview-dialog" role="dialog" aria-modal="true" aria-label={`${item.unit}の画像プレビュー`}>
        <header className="dialog-header">
          <div>
            <div className="badges"><span className={`field-badge field-${fieldClass(item.field)}`}>{item.field}</span><span>中{item.grade}</span><span>{item.year}年</span><span>{item.prefecture}</span></div>
            <h2>{item.shortUnit}</h2>
          </div>
          <div className="dialog-header-actions">
            <button className={`sticky-button dialog-sticky-button ${marked ? "is-active" : ""}`} type="button" aria-pressed={marked} onClick={onToggleSticky}>
              {marked ? "✓ 付箋済み" : "+ 付箋に追加"}
            </button>
            <a className="button button-secondary dialog-download-button" href={item.pdfUrl}>高解像度PDFを取得 ↓</a>
            <button className="close-button" type="button" onClick={onClose} aria-label="プレビューを閉じる">×</button>
          </div>
        </header>

        <div className="preview-layout">
          <nav className="thumbnail-rail" aria-label="プレビューページ一覧">
            {item.previewPages.map((preview, index) => (
              <button key={preview} type="button" className={index === page ? "is-active" : ""} onClick={() => onPageChange(index)} aria-label={`${index + 1}ページ目`}>
                <img src={preview} alt="" loading="lazy" /><span>{index + 1}</span>
              </button>
            ))}
          </nav>
          <div className="preview-stage">
            <img src={item.previewPages[page]} alt={`${item.unit} ${page + 1}ページ目`} />
          </div>
        </div>

        <footer className="dialog-footer">
          <button type="button" onClick={() => onPageChange(Math.max(0, page - 1))} disabled={page === 0}>← 前のページ</button>
          <p><strong>{page + 1}</strong> / {item.pageCount}<span>画像プレビュー</span></p>
          <button type="button" onClick={() => onPageChange(Math.min(item.pageCount - 1, page + 1))} disabled={page === item.pageCount - 1}>次のページ →</button>
        </footer>
      </section>
    </div>
  );
}

function StickyTray({ items, totalPages, totalBytes, expanded, bundleState, bundleBusy, bundleLimitMessage, onToggleExpanded, onRemove, onClear, onPreview, onDownload }: {
  items: ArchiveItem[];
  totalPages: number;
  totalBytes: number;
  expanded: boolean;
  bundleState: BundleState;
  bundleBusy: boolean;
  bundleLimitMessage: string;
  onToggleExpanded: () => void;
  onRemove: (id: string) => void;
  onClear: () => void;
  onPreview: () => void;
  onDownload: () => void;
}) {
  return (
    <aside className={`sticky-tray ${expanded ? "is-expanded" : ""}`} aria-label="選定した問題の付箋">
      <div className="sticky-tray-head">
        <button className="sticky-tray-title" type="button" onClick={onToggleExpanded} aria-expanded={expanded}>
          <span className="sticky-symbol" aria-hidden="true">▰</span>
          <span><strong>選定付箋</strong><small>{items.length}題・{totalPages}ページ・{formatFileSize(totalBytes)}</small></span>
          <span className="tray-chevron" aria-hidden="true">{expanded ? "⌄" : "⌃"}</span>
        </button>
        <div className="sticky-tray-actions">
          <button className="button button-secondary" type="button" onClick={onPreview}>まとめて確認</button>
          <button className="button button-primary" type="button" onClick={onDownload} disabled={bundleBusy || Boolean(bundleLimitMessage)} title={bundleLimitMessage || undefined}>
            {bundleBusy ? `${bundleState.progress}%` : "1つのPDFに結合"}
          </button>
          <button className="tray-clear-button" type="button" onClick={onClear} disabled={bundleBusy}>すべて外す</button>
        </div>
      </div>

      {expanded && (
        <div className="sticky-tray-body">
          <div className="sticky-item-list">
            {items.map((item, index) => (
              <div className="sticky-item" key={item.id}>
                <span className="sticky-item-number">{index + 1}</span>
                <img src={item.previewPages[0]} alt="" />
                <span><strong>{item.shortUnit}</strong><small>{item.year}年・{item.prefecture}・{item.field}</small></span>
                <button type="button" onClick={() => onRemove(item.id)} aria-label={`${item.shortUnit}の付箋を外す`} disabled={bundleBusy}>×</button>
              </div>
            ))}
          </div>
          {(bundleState.message || bundleLimitMessage) && (
            <div className={`bundle-status ${bundleState.status === "error" || bundleLimitMessage ? "is-error" : ""}`} aria-live="polite">
              <span>{bundleLimitMessage || bundleState.message}</span>
              {bundleBusy && <progress max="100" value={bundleState.progress}>{bundleState.progress}%</progress>}
            </div>
          )}
        </div>
      )}
    </aside>
  );
}

function CollectionDialog({ items, totalPages, bundleState, bundleBusy, bundleLimitMessage, onRemove, onDownload, onClose }: {
  items: ArchiveItem[];
  totalPages: number;
  bundleState: BundleState;
  bundleBusy: boolean;
  bundleLimitMessage: string;
  onRemove: (id: string) => void;
  onDownload: () => void;
  onClose: () => void;
}) {
  const [activeId, setActiveId] = useState(items[0]?.id || "");

  useEffect(() => {
    if (!items.some((item) => item.id === activeId)) setActiveId(items[0]?.id || "");
  }, [activeId, items]);

  const jumpTo = (id: string) => {
    setActiveId(id);
    document.getElementById(`collection-${id}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div className="dialog-backdrop collection-backdrop" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) onClose(); }}>
      <section className="preview-dialog collection-dialog" role="dialog" aria-modal="true" aria-label="選定問題の連続プレビュー">
        <header className="dialog-header collection-dialog-header">
          <div>
            <p className="collection-kicker"><span aria-hidden="true">▰</span> 選定付箋</p>
            <h2>{items.length}題をまとめて確認</h2>
          </div>
          <div className="dialog-header-actions">
            <button className="button button-primary collection-download-button" type="button" onClick={onDownload} disabled={bundleBusy || Boolean(bundleLimitMessage)} title={bundleLimitMessage || undefined}>
              {bundleBusy ? `${bundleState.progress}% 作成中` : "1つのPDFに結合"}
            </button>
            <button className="close-button" type="button" onClick={onClose} aria-label="まとめて確認を閉じる">×</button>
          </div>
        </header>

        {(bundleState.message || bundleLimitMessage) && (
          <div className={`collection-status ${bundleState.status === "error" || bundleLimitMessage ? "is-error" : ""}`} aria-live="polite">
            <span>{bundleLimitMessage || bundleState.message}</span>
            {bundleBusy && <progress max="100" value={bundleState.progress}>{bundleState.progress}%</progress>}
          </div>
        )}

        <div className="collection-layout">
          <nav className="collection-rail" aria-label="選定問題一覧">
            {items.map((item, index) => (
              <button key={item.id} className={activeId === item.id ? "is-active" : ""} type="button" onClick={() => jumpTo(item.id)}>
                <span className="collection-rail-number">{index + 1}</span>
                <img src={item.previewPages[0]} alt="" />
                <span><strong>{item.shortUnit}</strong><small>{item.prefecture}・{item.pageCount}ページ</small></span>
              </button>
            ))}
          </nav>

          <div className="collection-stage">
            {items.map((item, itemIndex) => (
              <article className="collection-problem" id={`collection-${item.id}`} key={item.id}>
                <header>
                  <div>
                    <p>選定問題 {itemIndex + 1} / {items.length}</p>
                    <div className="badges"><span className={`field-badge field-${fieldClass(item.field)}`}>{item.field}</span><span>中{item.grade}</span><span>{item.year}年</span><span>{item.prefecture}</span></div>
                    <h3>{item.shortUnit}</h3>
                    <small>{item.unit}</small>
                  </div>
                  <div className="collection-problem-actions">
                    <a href={item.pdfUrl}>このPDFを取得 ↓</a>
                    <button type="button" onClick={() => onRemove(item.id)} disabled={bundleBusy}>付箋を外す</button>
                  </div>
                </header>
                <div className="collection-pages">
                  {item.previewPages.map((page, pageIndex) => (
                    <figure key={page}>
                      <figcaption>{item.shortUnit}　{pageIndex + 1} / {item.pageCount}</figcaption>
                      <img src={page} alt={`${item.unit} ${pageIndex + 1}ページ目`} loading="lazy" />
                    </figure>
                  ))}
                </div>
              </article>
            ))}
          </div>
        </div>

        <footer className="collection-footer">
          <span>{items.length}題を選定</span><strong>{totalPages}ページ</strong><span>上から連続して確認できます</span>
        </footer>
      </section>
    </div>
  );
}

function FilterSelect({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: { value: string; label: string }[] }) {
  return (
    <label className="select-field">
      <span>{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="">すべて</option>
        {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
    </label>
  );
}

function normalize(value: string) {
  return value.toLowerCase().normalize("NFKC").replace(/\s+/g, "");
}

function fieldClass(field: ScienceField) {
  return { 物理: "physics", 化学: "chemistry", 地学: "earth", 生物: "biology" }[field];
}

function formatFileSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(bytes >= 10 * 1024 * 1024 ? 0 : 1)}MB`;
}

function dateStamp() {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}${month}${day}`;
}
