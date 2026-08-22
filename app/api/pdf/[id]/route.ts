import archiveData from "@/data/archive.generated.json";
import type { ArchiveData } from "@/types/archive";

const CHUNK_SIZE = 3 * 1024 * 1024;
const data = archiveData as ArchiveData;

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const item = data.items.find((candidate) => candidate.id === id);

  if (!item) {
    return Response.json({ error: "問題が見つかりません。" }, { status: 404 });
  }

  const chunk = Number(new URL(request.url).searchParams.get("chunk"));
  if (!Number.isInteger(chunk) || chunk < 0) {
    return Response.json({ error: "チャンク番号が不正です。" }, { status: 400 });
  }

  const start = chunk * CHUNK_SIZE;
  if (start >= item.fileSize) {
    return Response.json({ error: "指定範囲がPDFの末尾を超えています。" }, { status: 416 });
  }

  const end = Math.min(item.fileSize - 1, start + CHUNK_SIZE - 1);
  const upstream = await fetch(item.pdfUrl, {
    headers: {
      Range: `bytes=${start}-${end}`,
      "User-Agent": "koukou-nyushi-rika-archive/1.0",
    },
    cache: "no-store",
  });

  if (!upstream.ok) {
    return Response.json({ error: "PDFの取得に失敗しました。" }, { status: 502 });
  }

  const source = new Uint8Array(await upstream.arrayBuffer());
  const expectedLength = end - start + 1;
  const payload = source.byteLength === expectedLength ? source : source.slice(start, end + 1);

  if (payload.byteLength !== expectedLength) {
    return Response.json({ error: "PDFの一部を正しく取得できませんでした。" }, { status: 502 });
  }

  return new Response(payload, {
    status: 200,
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Length": String(payload.byteLength),
      "Cache-Control": "public, max-age=31536000, s-maxage=31536000, immutable",
      "X-PDF-Chunk": String(chunk),
      "X-PDF-Range": `${start}-${end}/${item.fileSize}`,
    },
  });
}
