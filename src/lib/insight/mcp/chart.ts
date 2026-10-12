/**
 * Biểu đồ do CODE dựng (THIET-KE-V8 quyết định 8) — spec Vega-Lite v5, dữ liệu là CHÍNH các số đã làm tròn
 * trong kết quả tool. Client (Claude Desktop, app) chỉ hiển thị, không chép lại số → không có chỗ để vẽ sai.
 *
 * Loại hình theo phép: diễn biến → đường; xếp hạng / so sánh / gộp vùng / thành phần → cột; ngoại lệ → cột
 * tô nổi; quan hệ theo vùng → cột hệ số r. Năm sơ bộ vẽ nét đứt / mờ.
 */

export type ChartSpec = Record<string, unknown>;

const SCHEMA = "https://vega.github.io/schema/vega-lite/v5.json";
const FONT = { font: "system-ui, -apple-system, sans-serif" };

function header(title: string, unit: string | null | undefined, source: string) {
  return {
    $schema: SCHEMA,
    title: { text: title, subtitle: [unit ? `Đơn vị: ${unit}` : "", `Nguồn: ${source}`].filter(Boolean), anchor: "start", ...FONT },
    config: { ...FONT, axis: { labelFont: FONT.font, titleFont: FONT.font }, legend: { labelFont: FONT.font, titleFont: FONT.font } },
    width: 560,
  };
}

/** Một hoặc nhiều đường theo năm */
export function lineChart(
  rows: { noi: string; nam: number; gia_tri: number; so_bo?: boolean }[],
  o: { title: string; unit?: string | null; source: string }
): ChartSpec {
  const many = new Set(rows.map((r) => r.noi)).size > 1;
  const color = many ? { field: "noi", type: "nominal", title: null } : { value: "#1f6f8b" };
  return {
    ...header(o.title, o.unit, o.source),
    height: 280,
    data: { values: rows.map((r) => ({ ...r, so_bo: !!r.so_bo })) },
    encoding: {
      x: { field: "nam", type: "quantitative", title: null, axis: { format: "d", tickMinStep: 1 } },
      y: { field: "gia_tri", type: "quantitative", title: null, scale: { zero: false } },
      color,
    },
    layer: [
      { mark: { type: "line", strokeWidth: 2 } },
      {
        mark: { type: "point", filled: true, size: 36 },
        encoding: {
          opacity: { condition: { test: "datum.so_bo", value: 0.35 }, value: 1 },
          tooltip: [
            { field: "noi", title: "Nơi" },
            { field: "nam", title: "Năm" },
            { field: "gia_tri", title: "Giá trị", format: ",.4~g" },
            { field: "so_bo", title: "Sơ bộ" },
          ],
        },
      },
    ],
  };
}

/** Cột ngang, đã xếp. `nhom` (tuỳ chọn) để tô nổi — vd ngoại lệ, nơi được hỏi */
export function barChart(
  rows: { nhan: string; gia_tri: number; nhom?: string }[],
  o: { title: string; unit?: string | null; source: string; sort?: "desc" | "asc" | "none"; colorTitle?: string }
): ChartSpec {
  const grouped = rows.some((r) => r.nhom);
  return {
    ...header(o.title, o.unit, o.source),
    height: { step: rows.length > 30 ? 12 : 20 },
    data: { values: rows },
    mark: { type: "bar", cornerRadiusEnd: 2 },
    encoding: {
      y: { field: "nhan", type: "nominal", title: null, sort: o.sort === "none" ? null : o.sort === "asc" ? "x" : "-x" },
      x: { field: "gia_tri", type: "quantitative", title: null },
      color: grouped ? { field: "nhom", type: "nominal", title: o.colorTitle ?? null } : { value: "#1f6f8b" },
      tooltip: [
        { field: "nhan", title: "" },
        { field: "gia_tri", title: "Giá trị", format: ",.4~g" },
        ...(grouped ? [{ field: "nhom", title: o.colorTitle ?? "Nhóm" }] : []),
      ],
    },
  };
}
