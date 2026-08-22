import { access, readFile, stat } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const repoRoot = path.resolve(import.meta.dirname, "..");
const data = JSON.parse(await readFile(path.join(repoRoot, "data", "archive.generated.json"), "utf8"));
const errors = [];
const ids = new Set();

for (const item of data.items) {
  if (ids.has(item.id)) errors.push(`重複ID: ${item.id}`);
  ids.add(item.id);
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

const countedPages = data.items.reduce((sum, item) => sum + item.previewPages.length, 0);
if (countedPages !== data.totalPages) errors.push(`ページ数不一致: ${countedPages} != ${data.totalPages}`);
if (data.items.length !== data.totalItems) errors.push(`題数不一致: ${data.items.length} != ${data.totalItems}`);

if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}

console.log(`OK: ${data.totalItems}題 / ${data.totalPages}ページ / ID重複なし / 全画像あり`);
