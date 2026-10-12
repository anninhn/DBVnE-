/**
 * Đẩy danh mục chỉ tiêu (data/insight/catalog.json, dựng bằng buildCatalog) lên R2 `_index/measures.json` để
 * /api/mcp trên production đọc được (spec 2026-10-12-mcp-connector). Ghi qua code của app, không sửa tay bucket.
 *
 *   node --experimental-strip-types --import ./prototypes/insight-demo/bench/node-loader/register.mjs \
 *     tools/build-measures-index.mjs [--rebuild]
 *
 * --rebuild: dựng lại catalog từ kho trước khi đẩy (đọc mọi dataset, vài phút).
 */
import { buildCatalog, publishCatalog } from "@/lib/insight/v2/catalog";

if (process.argv.includes("--rebuild")) {
  const c = await buildCatalog((m) => console.error(m));
  console.error(`Dựng xong: ${c.entries.length} chỉ tiêu, bỏ qua ${c.skipped.length} dataset`);
}
const r = await publishCatalog();
console.log(`Đã ghi R2 _index/measures.json: ${r.entries} chỉ tiêu`);
