/**
 * Dataset enrichment — populate preview/row_count/downloads cho Dataset object.
 *
 * Tách từ read.ts (refactor 2026-07-24-pre-launch-refactor) để read.ts chỉ giữ
 * core read logic. Module này chứa:
 *   - withPreviewData: fetch + parse resource đầu tiên → structured_data (SSR)
 *   - enrichRowCounts: backfill row_count cho dataset thiếu (listing fallback)
 *   - enrichDownloadCounts: hydrate downloads từ R2 counter (listing)
 *
 * Fail gracefully — lỗi fetch/parse → log + giữ nguyên, caller render empty state.
 */

import type { Dataset, Resource } from "@/lib/types/dataset";
import { getDownloadCount } from "@/lib/r2/counter";
import { parseCSV } from "@/lib/parse/csv";
import * as XLSX from "xlsx";

// ──────────────────────────────────────────────────────────────────────────────
// Preview enrichment — populate structured_data cho DatasetViewer (tab Dataset card)
// ──────────────────────────────────────────────────────────────────────────────

const PREVIEW_ROW_LIMIT = 1000;

/**
 * Coerce giá trị cell XLSX về primitive — đảm bảo RSC-serializable khi truyền
 * structured_data sang Client Component. Date → ISO string, object lạ → string.
 */
function coerceCell(v: unknown): string | number | boolean | null {
  if (v == null) return null;
  if (typeof v === "number" || typeof v === "boolean") return v;
  if (typeof v === "string") return v;
  if (v instanceof Date) return v.toISOString();
  return String(v);
}

/**
 * Fetch + parse resource tabular đầu tiên (CSV hoặc XLSX) trong dataset.resources,
 * gán vào resource.structured_data.
 *
 * Cho phép DatasetViewer render table + histogram ở tab "Dataset card" (SSR, không
 * flicker). Post-re-arch 2026-07-02 data nằm trong R2 nên mapFilesToResources không
 * set structured_data — helper này bù lại.
 */
export async function withPreviewData(dataset: Dataset): Promise<Dataset> {
  const tabular = dataset.resources.find(
    (r) =>
      (r.file_type === "csv" || r.file_type === "xlsx" || r.file_type === "geojson") &&
      r.file_url,
  );
  if (!tabular?.file_url) return dataset;

  try {
    let headers: string[];
    let dataRows: Record<string, string | number | boolean | null>[];
    // Tổng số dòng thật (chỉ biết khi parse full file). CSV dùng Range chunk →
    // không biết tổng → null (không set dataset.row_count).
    let trueTotal: number | null = null;

    if (tabular.file_type === "csv") {
      // Range fetch ~1MB đầu — preview nhanh kể cả file 153MB. R2 hỗ trợ Range
      // (206 Partial Content). Full download + parse 153MB mất ~23s → không acceptable.
      const CHUNK = 1_048_576; // 1MB
      const res = await fetch(tabular.file_url, {
        headers: { Range: `bytes=0-${CHUNK - 1}` },
      });
      if (!res.ok) {
        console.warn(`[datasets] preview fetch failed (${res.status}) cho ${dataset.slug}`);
        return dataset;
      }
      const text = await res.text();
      const parsed = parseCSV(text);
      if (parsed.length < 2) return dataset;
      headers = parsed[0];
      const rowsAll = parsed.slice(1);
      // Dòng cuối chunk thường bị cắt ngang → bỏ nếu thiếu số cột.
      if (rowsAll.length > 0 && rowsAll[rowsAll.length - 1].length < headers.length) {
        rowsAll.pop();
      }
      dataRows = rowsAll.slice(0, PREVIEW_ROW_LIMIT).map((cells) => {
        const obj: Record<string, string | number | boolean | null> = {};
        headers.forEach((h, idx) => {
          obj[h] = cells[idx] ?? "";
        });
        return obj;
      });
    } else if (tabular.file_type === "xlsx") {
      // XLSX — parse full qua xlsx package (file XLSX trong app đều nhỏ < 1MB,
      // không range-parse được binary).
      // Rebuild từng row thành plain object {} với value primitive, vì sheet_to_json
      // có thể trả Date/cell-object (có methods) → RSC reject khi truyền sang Client
      // Component ("Only plain objects can be passed to Client Components").
      const res = await fetch(tabular.file_url);
      if (!res.ok) {
        console.warn(`[datasets] preview fetch failed (${res.status}) cho ${dataset.slug}`);
        return dataset;
      }
      const buf = await res.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const jsonRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
        defval: null,
      });
      if (jsonRows.length === 0) return dataset;
      headers = Object.keys(jsonRows[0]);
      trueTotal = jsonRows.length;
      dataRows = jsonRows.slice(0, PREVIEW_ROW_LIMIT).map((row) => {
        const obj: Record<string, string | number | boolean | null> = {};
        headers.forEach((h) => {
          obj[h] = coerceCell(row[h]);
        });
        return obj;
      });
    } else {
      // GeoJSON — flatten features.properties thành rows (table view ở Dataset card).
      // Skip file lớn (>10MB) vì fetch + JSON.parse blocking SSR; user vẫn xem table
      // ở tab "Files and versions" (client-side fetch). 169MB wards → skip, 18MB power → skip,
      // 2.2MB provinces → OK.
      if ((tabular.file_size_mb ?? 0) > 10) {
        console.info(
          `[datasets] GeoJSON ${dataset.slug} quá lớn (${tabular.file_size_mb}MB) — skip preview table`,
        );
        return dataset;
      }
      const res = await fetch(tabular.file_url);
      if (!res.ok) {
        console.warn(`[datasets] preview fetch failed (${res.status}) cho ${dataset.slug}`);
        return dataset;
      }
      const json = (await res.json()) as GeoJSON.FeatureCollection;
      const features = Array.isArray(json?.features) ? json.features : [];
      if (features.length === 0) return dataset;

      // Collect headers từ tất cả features (mỗi feature có thể có props khác nhau)
      const headerSet = new Set<string>();
      for (const f of features) {
        const props = f?.properties ?? {};
        for (const k of Object.keys(props)) headerSet.add(k);
      }
      headers = Array.from(headerSet);
      trueTotal = features.length;
      dataRows = features.slice(0, PREVIEW_ROW_LIMIT).map((f) => {
        const props = f?.properties ?? {};
        const obj: Record<string, string | number | boolean | null> = {};
        headers.forEach((h) => {
          obj[h] = coerceCell(props[h]);
        });
        return obj;
      });
    }

    tabular.structured_data = dataRows;
    tabular.columns = headers;
    // Backfill row_count chỉ khi biết tổng thật (XLSX full parse). CSV Range chunk
    // không biết tổng → không set.
    if (dataset.row_count === 0 && trueTotal != null) dataset.row_count = trueTotal;
  } catch (err) {
    console.warn(`[datasets] preview parse error cho ${dataset.slug}:`, err);
  }
  return dataset;
}

// ──────────────────────────────────────────────────────────────────────────────
// Row-count enrichment — listing fallback khi metadata thiếu row_count
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Đếm số dòng data của 1 resource tabular (CSV/XLSX) — fetch + parse full.
 * Trả null nếu không hợp lệ/lỗi. Phase 1 ít dataset → acceptable cho listing.
 */
async function countRows(resource: Resource): Promise<number | null> {
  if (!resource.file_url) return null;
  try {
    const res = await fetch(resource.file_url);
    if (!res.ok) return null;
    if (resource.file_type === "csv") {
      const parsed = parseCSV(await res.text());
      return Math.max(0, parsed.length - 1);
    }
    if (resource.file_type === "xlsx") {
      const buf = await res.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      return XLSX.utils.sheet_to_json(sheet, { defval: null }).length;
    }
  } catch {
    // ignore — trả null
  }
  return null;
}

/**
 * Backfill row_count cho các dataset thiếu (metadata pre-row_count-persist).
 * Chỉ fetch resource tabular đầu tiên NHỎ (file_size_mb < SIZE_CAP_MB) — không
 * download file 153MB để count. Dùng ở listing (listDatasets) — self-healing cho
 * dataset nhỏ; dataset lớn phải có row_count trong metadata (persist lúc upload).
 */
const ROW_COUNT_SIZE_CAP_MB = 10;
export async function enrichRowCounts(datasets: Dataset[]): Promise<void> {
  await Promise.all(
    datasets.map(async (d) => {
      if (d.row_count > 0) return;
      const tabular = d.resources.find(
        (r) => r.file_type === "csv" || r.file_type === "xlsx",
      );
      if (!tabular) return;
      // Skip file lớn — download 153MB để count rows là quá đắt cho listing.
      if ((tabular.file_size_mb ?? 0) >= ROW_COUNT_SIZE_CAP_MB) return;
      const count = await countRows(tabular);
      if (count != null) d.row_count = count;
    }),
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// Download-count enrichment — fetch R2 counters song song cho listing
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Hydrate `downloads` field cho mỗi dataset từ R2 counter file.
 *
 * R2 GET/object ~50ms, fetch song song nên listing 20 dataset vẫn ~50ms tổng
 * (không phải 20×50ms). Failures tự động trả 0 trong getDownloadCount.
 */
export async function enrichDownloadCounts(datasets: Dataset[]): Promise<void> {
  await Promise.all(
    datasets.map(async (d) => {
      d.downloads = await getDownloadCount(d.slug);
    }),
  );
}
