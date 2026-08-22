"use client";

import { useEffect, useMemo, useState } from "react";
import type { ArchiveData, ArchiveItem, ScienceField } from "@/types/archive";
import { FIELDS } from "@/types/archive";

type Props = { data: ArchiveData };

type Filters = {
  q: string;
  field: "" | ScienceField;
  year: string;
  prefecture: string;
};

const EMPTY_FILTERS: Filters = { q: "", field: "", year: "", prefecture: "" };

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

  const years = useMemo(
    () => [...new Set(data.items.map((item) => item.year))].sort((a, b) => b - a),
    [data.items],
  );
  const prefectures = useMemo(
    () => [...new Set(data.items.map((item) => item.prefecture))].sort((a, b) => a.localeCompare(b, "ja")),
    [data.items],
  );

  const fieldCounts = useMemo(() => {
    const counts = new Map<ScienceField, number>(FIELDS.map((field) => [field, 0]));
    for (const item of data.items) counts.set(item.field, (counts.get(item.field) || 0) + 1);
    return counts;
  }, [data.items]);

  const filtered = useMemo(() => {
    const q = normalize(filters.q);
    return data.items
      .filter((item) => {
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
    if (!selected) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSelected(null);
      if (event.key === "ArrowRight") setSelectedPage((page) => Math.min(selected.previewPages.length - 1, page + 1));
      if (event.key === "ArrowLeft") setSelectedPage((page) => Math.max(0, page - 1));
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [selected]);

  const setFilter = (key: keyof Filters, value: string) => setFilters((current) => ({ ...current, [key]: value }));

  const openPreview = (item: ArchiveItem) => {
    setSelected(item);
    setSelectedPage(0);
  };

  const chooseField = (field: ScienceField) => {
    setFilters((current) => ({ ...current, field: current.field === field ? "" : field }));
    window.setTimeout(() => document.getElementById("questions")?.scrollIntoView({ behavior: "smooth", block: "start" }), 0);
  };

  return (
    <main>
      <header className="site-header">
        <a className="brand" href="#top" aria-label="理科単元別アーカイブ トップへ">
          <span className="brand-mark" aria-hidden="true">⌁</span>
          <span>
            <strong>理科単元別アーカイブ</strong>
            <small>高校入試 大問セレクション</small>
          </span>
        </a>
        <a className="header-link" href="#questions">問題を探す</a>
      </header>

      <section id="top" className="hero">
        <img className="hero-image" src="/images/hero-science.webp" alt="凸レンズ、ばねばかり、試験管などを配置した理科実験机" />
        <div className="hero-overlay" />
        <div className="hero-content shell">
          <p className="eyebrow">SCIENCE ENTRANCE EXAM ARCHIVE</p>
          <div className="hero-grade"><span>中1</span> 物理・化学・地学・生物</div>
          <h1>問題を見比べて、<br />授業に合う一題を選ぶ。</h1>
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
          <p>同じ画面構成のまま、中2・中3を追加できます。</p>
        </div>
        <div className="grade-tabs">
          <button className="grade-tab is-active" type="button" aria-pressed="true">
            <span>中学1年</span><strong>{data.totalItems}題</strong>
          </button>
          <button className="grade-tab" type="button" disabled><span>中学2年</span><strong>準備中</strong></button>
          <button className="grade-tab" type="button" disabled><span>中学3年</span><strong>準備中</strong></button>
        </div>
      </section>

      <section id="fields" className="fields-section shell" aria-labelledby="fields-title">
        <div className="section-heading">
          <div>
            <p className="eyebrow">FIELDS</p>
            <h2 id="fields-title">4分野から選ぶ</h2>
          </div>
          <p>太字の解説見出しと全設問を確認し、中1範囲で構成される独立大問を収録しています。</p>
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
          <p>カードで問題1ページ目を比較し、「画像で確認」から全ページを送って内容を確認できます。</p>
        </div>

        <div className="filter-panel">
          <label className="search-field">
            <span>単元・キーワード</span>
            <div><span aria-hidden="true">⌕</span><input value={filters.q} onChange={(event) => setFilter("q", event.target.value)} placeholder="例：凸レンズ、地震、再結晶" /></div>
          </label>
          <FilterSelect label="分野" value={filters.field} onChange={(value) => setFilter("field", value)} options={FIELDS.map((field) => ({ value: field, label: `${field}（${fieldCounts.get(field)}）` }))} />
          <FilterSelect label="実施年" value={filters.year} onChange={(value) => setFilter("year", value)} options={years.map((year) => ({ value: String(year), label: `${year}年` }))} />
          <FilterSelect label="都道府県" value={filters.prefecture} onChange={(value) => setFilter("prefecture", value)} options={prefectures.map((prefecture) => ({ value: prefecture, label: prefecture }))} />
          <button className="clear-button" type="button" onClick={() => setFilters(EMPTY_FILTERS)} disabled={!filters.q && !filters.field && !filters.year && !filters.prefecture}>条件をクリア</button>
        </div>

        <div className="results-bar">
          <p><strong>{filtered.length}</strong>題を表示</p>
          <p>問題 → 解答用紙 → 正解 → 解説</p>
        </div>

        {filtered.length ? (
          <div className="question-grid">
            {filtered.map((item) => (
              <article className="question-card" key={item.id}>
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
                    <a className="text-link" href={item.pdfUrl} target="_blank" rel="noreferrer">PDFを開く ↗</a>
                  </div>
                </div>
              </article>
            ))}
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
            <li><b>02</b><span><strong>画像で確認</strong>問題から解説まで、全ページを軽く送って確認します。</span></li>
            <li><b>03</b><span><strong>PDFを利用</strong>採用する問題だけ、高解像度PDFを開きます。</span></li>
          </ol>
        </div>
      </section>

      <footer className="site-footer">
        <div className="shell">
          <div><strong>高校入試 理科単元別アーカイブ</strong><p>授業設計のための、問題選定を支えるデータベース。</p></div>
          <p>資料の利用にあたっては、各資料の権利条件をご確認ください。</p>
        </div>
      </footer>

      {selected && (
        <PreviewDialog
          item={selected}
          page={selectedPage}
          onPageChange={setSelectedPage}
          onClose={() => setSelected(null)}
        />
      )}
    </main>
  );
}

function PreviewDialog({ item, page, onPageChange, onClose }: { item: ArchiveItem; page: number; onPageChange: (page: number) => void; onClose: () => void }) {
  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) onClose(); }}>
      <section className="preview-dialog" role="dialog" aria-modal="true" aria-label={`${item.unit}の画像プレビュー`}>
        <header className="dialog-header">
          <div>
            <div className="badges"><span className={`field-badge field-${fieldClass(item.field)}`}>{item.field}</span><span>中{item.grade}</span><span>{item.year}年</span><span>{item.prefecture}</span></div>
            <h2>{item.shortUnit}</h2>
          </div>
          <div className="dialog-header-actions">
            <a className="button button-secondary" href={item.pdfUrl} target="_blank" rel="noreferrer">高解像度PDF ↗</a>
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
