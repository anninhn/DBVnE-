/**
 * Copy worker của MapLibre từ node_modules sang `public/maplibre/`.
 *
 * Chạy: node tools/sync-maplibre-worker.mjs   (đã gắn vào `prebuild`/`predev`)
 *
 * VÌ SAO PHẢI COPY TAY:
 * MapLibre 6 tách worker ra file riêng và tự dò đường dẫn bằng `import.meta.url`
 * của chunk đã bundle. Với Next/Turbopack, đường đó trỏ tới
 * `/_next/static/chunks/maplibre-gl-worker.mjs` — không có thật, dev server trả
 * trang 404 HTML. Worker chết, mà MapLibre KHÔNG bắn lỗi nào: bản đồ vẫn dựng
 * canvas, vẫn hiện attribution, chỉ là mọi tile kẹt ở trạng thái `loading` vĩnh
 * viễn và map xám trắng. Rất dễ tưởng là lỗi nhà cung cấp tile.
 *
 * Cách chữa: tự phục vụ worker ở `public/` rồi gọi `setWorkerUrl()` trỏ vào đó
 * (xem `src/components/geo/GeoJsonMap.tsx`).
 *
 * Phải copy CẢ HAI file: `maplibre-gl-worker.mjs` import
 * `./maplibre-gl-shared.mjs` bằng đường dẫn tương đối, nên hai file bắt buộc
 * nằm cùng thư mục được phục vụ.
 *
 * File đích có commit vào repo để deploy không phụ thuộc hook chạy đúng lúc;
 * script này lo việc cập nhật lại mỗi khi nâng version maplibre-gl.
 */
import { copyFileSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const srcDir = join(root, "node_modules", "maplibre-gl", "dist");
const destDir = join(root, "public", "maplibre");

const FILES = ["maplibre-gl-worker.mjs", "maplibre-gl-shared.mjs"];

try {
  const version = JSON.parse(
    readFileSync(join(root, "node_modules", "maplibre-gl", "package.json"), "utf-8")
  ).version;

  mkdirSync(destDir, { recursive: true });
  for (const file of FILES) {
    copyFileSync(join(srcDir, file), join(destDir, file));
  }
  console.log(`✅ Đã đồng bộ worker MapLibre ${version} → public/maplibre/`);
} catch (err) {
  console.error("❌ Không copy được worker MapLibre:", err.message);
  process.exit(1);
}
