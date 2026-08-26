import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { PDFDocument } from "pdf-lib";

const baseUrl = process.env.MERGE_TEST_BASE_URL || "http://127.0.0.1:3170";
const chunkSize = 3 * 1024 * 1024;
const data = JSON.parse(readFileSync(new URL("../data/archive.generated.json", import.meta.url), "utf8"));
const samples = [
  data.items.find((item) => item.grade === 1),
  data.items.find((item) => item.grade === 1 && item.year === 2021 && item.prefecture === "埼玉県" && item.field === "地学"),
  data.items.find((item) => item.grade === 2 && item.field === "生物"),
  data.items.find((item) => item.grade === 2 && item.field === "地学"),
  data.items.find((item) => item.grade === 2 && item.field === "化学"),
  data.items.find((item) => item.grade === 2 && item.field === "物理"),
];
if (samples.some((item) => !item)) throw new Error("結合テストに必要な学年・分野の資料がありません。");
const items = [...new Map(samples.map((item) => [item.id, item])).values()];
const merged = await PDFDocument.create();

for (const item of items) {
  const contentVersion = encodeURIComponent(`${data.releaseTag}-${item.contentVersion}`);
  const bytes = new Uint8Array(item.fileSize);
  let offset = 0;
  const chunkCount = Math.ceil(item.fileSize / chunkSize);

  for (let chunk = 0; chunk < chunkCount; chunk += 1) {
    const response = await fetch(`${baseUrl}/api/pdf/${encodeURIComponent(item.id)}?chunk=${chunk}&v=${contentVersion}`);
    if (!response.ok) throw new Error(`${item.id} chunk ${chunk}: HTTP ${response.status}`);
    const start = chunk * chunkSize;
    const end = Math.min(item.fileSize - 1, start + chunkSize - 1);
    const expectedRange = `${start}-${end}/${item.fileSize}`;
    if (response.headers.get("x-pdf-content-version") !== item.contentVersion) {
      throw new Error(`${item.id} chunk ${chunk}: PDF content version mismatch`);
    }
    if (response.headers.get("x-pdf-range") !== expectedRange) {
      throw new Error(`${item.id} chunk ${chunk}: PDF range mismatch`);
    }
    const part = new Uint8Array(await response.arrayBuffer());
    bytes.set(part, offset);
    offset += part.byteLength;
  }

  if (offset !== item.fileSize) throw new Error(`${item.id}: ${offset} bytes, expected ${item.fileSize}`);
  const actualVersion = createHash("sha256").update(bytes).digest("hex");
  if (actualVersion !== item.contentVersion) {
    throw new Error(`${item.id}: SHA-256 ${actualVersion}, expected ${item.contentVersion}`);
  }
  const source = await PDFDocument.load(bytes);
  const pages = await merged.copyPages(source, source.getPageIndices());
  pages.forEach((page) => merged.addPage(page));
}

const output = await merged.save({ useObjectStreams: true });
const reopened = await PDFDocument.load(output);
const expectedPages = items.reduce((sum, item) => sum + item.pageCount, 0);

if (reopened.getPageCount() !== expectedPages) {
  throw new Error(`結合後${reopened.getPageCount()}ページ、期待値${expectedPages}ページ`);
}

console.log(`OK: ${items.length}題を1 PDFへ結合 / ${reopened.getPageCount()}ページ / ${output.byteLength} bytes`);
