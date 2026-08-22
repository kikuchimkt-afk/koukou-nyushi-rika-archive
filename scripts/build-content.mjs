import { createHash } from "node:crypto";
import { copyFile, mkdir, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";
import process from "node:process";

const args = parseArgs(process.argv.slice(2));
const repoRoot = path.resolve(import.meta.dirname, "..");
const sourceRoot = path.resolve(args["source-root"] || process.env.SOURCE_ROOT || "");
const pdftoppm = args.pdftoppm || process.env.PDFTOPPM || "pdftoppm";
const releaseTag = args["release-tag"] || process.env.RELEASE_TAG || "pdfs-v1";
const githubRepo = args["github-repo"] || process.env.GITHUB_REPO || "kikuchimkt-afk/koukou-nyushi-rika-archive";
const previewRoot = path.join(repoRoot, "public", "previews");
const releaseRoot = path.join(repoRoot, ".release-assets");
const dataPath = path.join(repoRoot, "data", "archive.generated.json");

if (!sourceRoot || sourceRoot === path.parse(sourceRoot).root) {
  fail("--source-root には既存のPDF最終版フォルダを含むディレクトリを指定してください。");
}

await assertDirectory(sourceRoot);
await mkdir(previewRoot, { recursive: true });
await mkdir(releaseRoot, { recursive: true });

const sourceDirs = await findFinalDirectories(sourceRoot);
if (!sourceDirs.length) fail(`最終版フォルダが見つかりません: ${sourceRoot}`);

const sourcePdfs = [];
for (const sourceDir of sourceDirs) {
  const names = await readdir(sourceDir);
  for (const name of names.filter((value) => value.toLowerCase().endsWith(".pdf"))) {
    sourcePdfs.push({ sourceDir, sourcePath: path.join(sourceDir, name), name });
  }
}

sourcePdfs.sort((a, b) => a.name.localeCompare(b.name, "ja"));
if (!sourcePdfs.length) fail("対象PDFがありません。");

const seenIds = new Set();
const items = [];

for (const [index, source] of sourcePdfs.entries()) {
  const parsed = parsePdfName(source.name);
  if (!parsed) {
    console.warn(`skip: ファイル名を解析できません: ${source.name}`);
    continue;
  }

  const field = detectField(source.sourceDir, parsed.unit);
  const id = makeId(parsed, field);
  if (seenIds.has(id)) fail(`重複ID: ${id}`);
  seenIds.add(id);

  const previewDir = path.join(previewRoot, id);
  await rm(previewDir, { recursive: true, force: true });
  await mkdir(previewDir, { recursive: true });

  const tempPrefix = path.join(previewDir, "render");
  const render = spawnSync(
    pdftoppm,
    [
      "-jpeg",
      "-scale-to-x",
      "1200",
      "-scale-to-y",
      "-1",
      "-jpegopt",
      "quality=76,optimize=y,progressive=y",
      source.sourcePath,
      tempPrefix,
    ],
    { encoding: "utf8", windowsHide: true },
  );
  if (render.status !== 0) {
    fail(`画像変換に失敗: ${source.name}\n${render.stderr || render.stdout}`);
  }

  const rendered = (await readdir(previewDir))
    .filter((name) => /^render-\d+\.jpg$/i.test(name))
    .sort((a, b) => pageNumber(a) - pageNumber(b));
  if (!rendered.length) fail(`プレビュー画像が生成されませんでした: ${source.name}`);

  const previewPages = [];
  for (const [pageIndex, renderedName] of rendered.entries()) {
    const pageName = `page-${String(pageIndex + 1).padStart(2, "0")}.jpg`;
    await rename(path.join(previewDir, renderedName), path.join(previewDir, pageName));
    previewPages.push(`/previews/${id}/${pageName}`);
  }

  const releaseName = `${id}.pdf`;
  await copyFile(source.sourcePath, path.join(releaseRoot, releaseName));
  const fileStats = await stat(source.sourcePath);
  const { shortUnit, tags } = splitUnit(parsed.unit);

  items.push({
    id,
    grade: parsed.grade,
    year: parsed.year,
    prefecture: parsed.prefecture,
    field,
    unit: parsed.unit,
    shortUnit,
    tags,
    pageCount: previewPages.length,
    previewPages,
    pdfUrl: `https://github.com/${githubRepo}/releases/download/${releaseTag}/${releaseName}`,
    pdfFileName: source.name,
    fileSize: fileStats.size,
  });

  console.log(`[${index + 1}/${sourcePdfs.length}] ${id} ${rendered.length}p ${source.name}`);
}

items.sort((a, b) =>
  b.year - a.year ||
  a.field.localeCompare(b.field, "ja") ||
  a.prefecture.localeCompare(b.prefecture, "ja") ||
  a.unit.localeCompare(b.unit, "ja"),
);

const archive = {
  generatedAt: new Date().toISOString(),
  releaseTag,
  totalItems: items.length,
  totalPages: items.reduce((sum, item) => sum + item.pageCount, 0),
  items,
};

await writeFile(dataPath, `${JSON.stringify(archive, null, 2)}\n`, "utf8");
console.log(`完了: ${archive.totalItems}題 / ${archive.totalPages}ページ`);

function parseArgs(argv) {
  const result = {};
  for (let i = 0; i < argv.length; i += 1) {
    const value = argv[i];
    if (!value.startsWith("--")) continue;
    result[value.slice(2)] = argv[i + 1];
    i += 1;
  }
  return result;
}

async function assertDirectory(target) {
  try {
    const info = await stat(target);
    if (!info.isDirectory()) throw new Error("not directory");
  } catch {
    fail(`source-root が存在しません: ${target}`);
  }
}

async function findFinalDirectories(root) {
  const entries = await readdir(root, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isDirectory() && /^中[123]理科_.+_最終版$/.test(entry.name))
    .map((entry) => path.join(root, entry.name));
}

function parsePdfName(filename) {
  const match = filename.match(/^(\d{4})年実施_(.+?)_(中([123]))理科_(.+)\.pdf$/);
  if (!match) return null;
  return {
    year: Number(match[1]),
    prefecture: match[2],
    grade: Number(match[4]),
    unit: match[5],
  };
}

function detectField(sourceDir, unit) {
  const parent = path.basename(sourceDir);
  if (parent.includes("地学生物")) return /動物|植物|生物|分類|細胞|遺伝|生殖|消化|呼吸|循環|神経|感覚/.test(unit) ? "生物" : "地学";
  if (parent.includes("化学物理")) {
    if (/^(大気圧|水圧|浮力|力|光|音|凸レンズ|鏡)/.test(unit)) return "物理";
    if (/^(気体の性質|水溶液|状態変化|物質の性質|溶解度|蒸留|沸点|融点|結晶|再結晶|混合物|溶質|溶媒)/.test(unit)) return "化学";
    return "物理";
  }
  if (/動物|植物|生物|分類|細胞|遺伝|生殖|消化|呼吸|循環|神経|感覚/.test(unit)) return "生物";
  if (/地層|地震|火山|火成岩|大地|化石|岩石|天気|気象|星|太陽|月/.test(unit)) return "地学";
  if (/光|音|力|圧力|浮力|ばね|レンズ|鏡/.test(unit)) return "物理";
  return "化学";
}

function makeId(parsed, field) {
  const pref = prefectureCode(parsed.prefecture);
  const fieldCode = { 物理: "physics", 化学: "chemistry", 地学: "earth", 生物: "biology" }[field];
  const hash = createHash("sha1").update(parsed.unit).digest("hex").slice(0, 7);
  return `g${parsed.grade}-${parsed.year}-${pref}-${fieldCode}-${hash}`;
}

function prefectureCode(name) {
  const map = {
    北海道: "hokkaido", 青森県: "aomori", 岩手県: "iwate", 宮城県: "miyagi", 秋田県: "akita", 山形県: "yamagata", 福島県: "fukushima",
    茨城県: "ibaraki", 栃木県: "tochigi", 群馬県: "gunma", 埼玉県: "saitama", 千葉県: "chiba", 東京都: "tokyo", 神奈川県: "kanagawa",
    新潟県: "niigata", 富山県: "toyama", 石川県: "ishikawa", 福井県: "fukui", 山梨県: "yamanashi", 長野県: "nagano", 岐阜県: "gifu", 静岡県: "shizuoka", 愛知県: "aichi",
    三重県: "mie", 滋賀県: "shiga", 京都府: "kyoto", 大阪府: "osaka", 兵庫県: "hyogo", 奈良県: "nara", 和歌山県: "wakayama",
    鳥取県: "tottori", 島根県: "shimane", 岡山県: "okayama", 広島県: "hiroshima", 山口県: "yamaguchi", 徳島県: "tokushima", 香川県: "kagawa", 愛媛県: "ehime", 高知県: "kochi",
    福岡県: "fukuoka", 佐賀県: "saga", 長崎県: "nagasaki", 熊本県: "kumamoto", 大分県: "oita", 宮崎県: "miyazaki", 鹿児島県: "kagoshima", 沖縄県: "okinawa",
  };
  return map[name] || createHash("sha1").update(name).digest("hex").slice(0, 8);
}

function splitUnit(unit) {
  const match = unit.match(/^(.+?)（(.+)）$/);
  if (!match) return { shortUnit: unit, tags: [] };
  return { shortUnit: match[1], tags: match[2].split("・").map((value) => value.trim()).filter(Boolean) };
}

function pageNumber(name) {
  return Number(name.match(/(\d+)\.jpg$/i)?.[1] || 0);
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
