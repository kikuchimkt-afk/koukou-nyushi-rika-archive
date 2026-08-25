import { access, readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const repoRoot = path.resolve(import.meta.dirname, "..");
const data = JSON.parse(await readFile(path.join(repoRoot, "data", "archive.generated.json"), "utf8"));
const errors = [];
const ids = new Set();
const releaseNames = new Set();
const expectedCounts = new Map([
  ["1:化学", 12],
  ["1:物理", 20],
  ["1:生物", 16],
  ["1:地学", 21],
  ["2:化学", 36],
  ["2:物理", 15],
  ["2:生物", 44],
  ["2:地学", 33],
]);
const actualCounts = new Map();

for (const item of data.items) {
  if (ids.has(item.id)) errors.push(`重複ID: ${item.id}`);
  ids.add(item.id);
  const countKey = `${item.grade}:${item.field}`;
  actualCounts.set(countKey, (actualCounts.get(countKey) || 0) + 1);
  const releaseName = `${item.id}.pdf`;
  releaseNames.add(releaseName);
  try {
    const releaseInfo = await stat(path.join(repoRoot, ".release-assets", releaseName));
    if (releaseInfo.size !== item.fileSize) {
      errors.push(`PDFサイズ不一致: ${releaseName} ${releaseInfo.size} != ${item.fileSize}`);
    }
  } catch {
    errors.push(`PDFなし: ${releaseName}`);
  }
  if (!item.previewPages.length) errors.push(`プレビューなし: ${item.id}`);
  for (const preview of item.previewPages) {
    const filePath = path.join(repoRoot, "public", preview.replace(/^\//, ""));
    try {
      await access(filePath);
      const info = await stat(filePath);
      if (info.size < 10_000) errors.push(`画像が小さすぎます: ${preview}`);
    } catch {
      errors.push(`画像なし: ${preview}`);
    }
  }
}

for (const entry of await readdir(path.join(repoRoot, "public", "previews"), { withFileTypes: true })) {
  if (entry.isDirectory() && /^g[123]-/.test(entry.name) && !ids.has(entry.name)) {
    errors.push(`古いプレビュー: ${entry.name}`);
  }
}
for (const entry of await readdir(path.join(repoRoot, ".release-assets"), { withFileTypes: true })) {
  if (entry.isFile() && /^g[123]-.+\.pdf$/i.test(entry.name) && !releaseNames.has(entry.name)) {
    errors.push(`古いPDF: ${entry.name}`);
  }
}

const countedPages = data.items.reduce((sum, item) => sum + item.previewPages.length, 0);
if (countedPages !== data.totalPages) errors.push(`ページ数不一致: ${countedPages} != ${data.totalPages}`);
if (data.items.length !== data.totalItems) errors.push(`題数不一致: ${data.items.length} != ${data.totalItems}`);
if (data.releaseTag !== "pdfs-v2") errors.push(`公開PDF版不一致: ${data.releaseTag} != pdfs-v2`);
if (data.totalItems !== 197) errors.push(`公開予定題数不一致: ${data.totalItems} != 197`);
if (data.totalPages !== 897) errors.push(`公開予定ページ数不一致: ${data.totalPages} != 897`);
for (const [key, expected] of expectedCounts) {
  const actual = actualCounts.get(key) || 0;
  if (actual !== expected) errors.push(`分野別題数不一致: ${key} ${actual} != ${expected}`);
}
for (const [key, actual] of actualCounts) {
  if (!expectedCounts.has(key)) errors.push(`想定外の学年・分野: ${key} ${actual}題`);
}

if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}

console.log(`OK: ${data.totalItems}題 / ${data.totalPages}ページ / ID重複なし / 全画像・全PDFあり / 古い生成物なし`);
