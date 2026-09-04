/**
 * Dựng khối mô tả dataset cho model đọc.
 *
 * Trước spec 005, file này nạp **toàn bộ** kho vào mỗi câu hỏi: liệt kê thư mục
 * `datasets/`, rồi đọc `metadata.yaml` + `dictionary.md` của từng slug — hơn 1.000
 * lượt gọi GitHub API và ~200.000 token cho một câu hỏi ở 495 dataset. Chi phí đó
 * tăng tuyến tính theo số dataset, nên nó không phải chuyện tối ưu mà là chuyện hệ
 * thống ngừng hoạt động ở vài nghìn dataset (US2).
 *
 * Nay chỉ dựng khối cho **danh sách dataset nhận vào** — do `searchDatasets` chọn
 * ra. Đường nạp toàn bộ đã xoá hẳn, không để lại làm tuỳ chọn: còn để đó thì sớm
 * muộn có chỗ gọi lại nó.
 */

import type { DatasetColumn, DatasetDetail } from "@/lib/retrieval/types";
import type { Dataset } from "@/lib/types/dataset";

/** Cap số cột in ra, tránh dataset rất rộng chiếm hết chỗ của các dataset khác. */
const MAX_COLUMNS = 30;

/** Số chỗ chứa giá trị được liệt kê làm ví dụ. Con số TỔNG vẫn nói đầy đủ. */
const VALUE_SAMPLE = 6;

/**
 * Khối giá trị tra được từ chỉ mục nghịch đảo.
 *
 * Đây là **dữ kiện**, không phải gợi ý: `Đà Nẵng` có ở 176 dataset là chuyện tra
 * được đúng/sai, không phải chuyện tương đồng ngữ nghĩa. Khối này tồn tại vì tìm
 * kiếm bằng vector KHÔNG trả lời được câu "có dữ liệu gì về Đà Nẵng" — đo thực
 * tế cosine cao nhất chỉ 0,613, thấp hơn cả câu hỏi vô quan.
 */
export function buildValueBlock(
  matches: {
    display: string;
    variants: string[];
    datasetCount: number;
    datasets: { slug: string; title: string; column: string }[];
  }[],
  partialColumnCount: number,
): string {
  if (matches.length === 0) return "";

  const lines: string[] = [
    "GIÁ TRỊ TRA ĐƯỢC TRONG DỮ LIỆU (tra chỉ mục, KHÔNG phải suy đoán):",
  ];
  for (const m of matches) {
    const others = m.variants.filter((v) => v !== m.display);
    lines.push(
      `  - "${m.display}" — CÓ THẬT trong ${m.datasetCount} dataset ` +
        `(${m.datasets.length} cột)` +
        (others.length ? `. Cách viết khác trong dữ liệu: ${others.join(", ")}` : ""),
    );
    for (const d of m.datasets.slice(0, VALUE_SAMPLE)) {
      lines.push(`      · ${d.title} (\`${d.slug}\`) — cột \`${d.column}\``);
    }
    if (m.datasets.length > VALUE_SAMPLE) {
      lines.push(`      · … và ${m.datasets.length - VALUE_SAMPLE} chỗ khác`);
    }
  }
  lines.push(
    "TUYỆT ĐỐI KHÔNG nói kho chưa có dữ liệu về các giá trị trên — chúng đã được " +
      "tra ra trong dữ liệu thật.",
  );
  if (partialColumnCount > 0) {
    lines.push(
      `Ngoài ra còn ${partialColumnCount} cột có quá nhiều giá trị nên chưa tra hết — ` +
        "nếu người hỏi nêu một giá trị KHÔNG có trong khối trên thì nói \"chưa tra hết\", " +
        "không nói \"không có\".",
    );
  }
  return lines.join("\n");
}

function formatColumn(col: DatasetColumn): string {
  const parts = [`  - \`${col.name}\``];
  if (col.type) parts.push(`(${col.type})`);
  if (col.unit && col.unit !== "-") parts.push(`[${col.unit}]`);
  if (col.description) parts.push(`— ${col.description}`);
  return parts.join(" ");
}

/** Một dataset ứng viên — mô tả gọn, đủ để model quyết định nó có hợp không. */
function formatCandidate(d: DatasetDetail): string {
  const lines: string[] = [];
  lines.push(`### ${d.title}`);
  lines.push(`slug: \`${d.slug}\``);
  if (d.description) lines.push(`Mô tả: ${d.description}`);
  if (d.category) lines.push(`Danh mục: ${d.category}`);
  if (d.rowCount) lines.push(`Số dòng: ${d.rowCount}`);
  // Không có chiều thời gian thì KHÔNG in dòng nào — in "không rõ" cũng là một
  // khẳng định, và model sẽ nhắc lại nó như thể đã kiểm (FR-048).
  if (d.yearRange) {
    lines.push(
      d.yearRange.from === d.yearRange.to
        ? `Phạm vi thời gian: ${d.yearRange.from}`
        : `Phạm vi thời gian: ${d.yearRange.from}–${d.yearRange.to}`,
    );
  }
  if (d.source) lines.push(`Nguồn: ${d.source}`);

  if (d.columns.length > 0) {
    lines.push("Các cột/trường dữ liệu:");
    for (const col of d.columns.slice(0, MAX_COLUMNS)) lines.push(formatColumn(col));
    if (d.columns.length > MAX_COLUMNS) {
      lines.push(`  - (và ${d.columns.length - MAX_COLUMNS} cột khác)`);
    }
  }

  return lines.join("\n");
}

/**
 * Khối ứng viên gửi cho model.
 *
 * Nói rõ đây là **ứng viên đã lọc**, không phải cả kho: model không được suy ra
 * "kho chỉ có bấy nhiêu dataset" từ danh sách này, và cũng không được cho rằng
 * dataset đầu bảng là câu trả lời chỉ vì nó đứng đầu.
 */
export function buildCandidateBlock(
  datasets: DatasetDetail[],
  opts?: { total?: number; valueSorted?: boolean },
): string {
  if (datasets.length === 0) {
    return "(Không tìm thấy dataset nào liên quan tới câu hỏi này trong kho.)";
  }

  const header =
    `DATASET ỨNG VIÊN (${datasets.length} dataset liên quan nhất` +
    (opts?.total && opts.total > datasets.length ? ` trong ${opts.total} dataset khớp` : "") +
    `, xếp theo mức liên quan giảm dần — KHÔNG phải toàn bộ kho):`;

  // Nói rõ danh sách đã được xếp lại theo giá trị tra được — nếu không, model
  // thấy thứ tự khác thứ tự "liên quan nhất" mà không hiểu vì sao.
  const note = opts?.valueSorted
    ? "\nDanh sách đã xếp lại: dataset CHỨA các giá trị tra được ở khối trên lên trước."
    : "";

  return `${header}${note}\n\n${datasets.map(formatCandidate).join("\n\n---\n\n")}`;
}

// ──────────────────────────────────────────────────────────────────────────────
// FOCUS block — Discovery Chat attach dataset
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Build FOCUS block cho Discovery Chat khi user attach dataset cụ thể (click
 * "Hỏi về dataset này" từ sidebar).
 *
 * Format tương tự `formatDataset` NHƯNG:
 * - Toàn bộ data dictionary (không cap MAX_COLUMNS) — AI cần columns đầy đủ để
 *   trả lời chính xác.
 * - Có marker `🎯 FOCUS DATASET` để system prompt nhận biết priority.
 * - Kèm **danh sách giá trị** của các cột phân loại, thay cho dữ liệu mẫu.
 *
 * Vì sao bỏ dữ liệu mẫu: 5 dòng đầu của một file là mẫu **không đại diện** —
 * dữ liệu thống kê hầu hết sắp theo thời gian hoặc theo địa bàn, nên 5 dòng đầu
 * chỉ có một năm và vài tỉnh. Model đọc chúng rồi kết luận về cả dataset:
 * "dataset này có Hà Nội, Hải Phòng..." trong khi nó có đủ 63 tỉnh, hoặc tệ hơn
 * là "không có Đà Nẵng". Danh sách giá trị đi kèm cờ đầy-đủ/bị-cắt trả lời đúng
 * câu đó, và ngắn hơn.
 */
export function buildFocusBlock(
  dataset: Dataset,
  valueColumns?: DatasetColumn[],
): string {
  const lines: string[] = [];
  lines.push("🎯 FOCUS DATASET (user đã chọn — ưu tiên trả lời dựa trên dataset này):");
  lines.push(`### ${dataset.title}`);
  lines.push(`slug: \`${dataset.slug}\``);

  if (dataset.description) lines.push(`Mô tả: ${dataset.description}`);
  if (dataset.category) lines.push(`Danh mục: ${dataset.category}`);
  if (dataset.tags?.length) lines.push(`Tags: ${dataset.tags.join(", ")}`);

  // Formats — distinct file_type từ resources
  const formats = Array.from(
    new Set(
      dataset.resources
        .map((r) => r.file_type)
        .filter((t): t is NonNullable<typeof t> => Boolean(t)),
    ),
  );
  if (formats.length > 0) lines.push(`Định dạng: ${formats.join(", ")}`);

  if (dataset.row_count) lines.push(`Số dòng: ${dataset.row_count}`);
  if (dataset.year_range?.length) {
    lines.push(`Phạm vi thời gian: ${dataset.year_range.join(", ")}`);
  }
  if (dataset.feature_count != null) lines.push(`Số features: ${dataset.feature_count}`);
  if (dataset.geometry_type) lines.push(`Geometry: ${dataset.geometry_type}`);
  if (dataset.license) lines.push(`License: ${dataset.license}`);
  if (dataset.source) lines.push(`Nguồn: ${dataset.source}`);

  // FULL data dictionary — không cap. Primary context cho AI matching.
  if (dataset.data_dictionary.length > 0) {
    lines.push("Tất cả các cột/trường dữ liệu (data dictionary đầy đủ):");
    for (const entry of dataset.data_dictionary) {
      const parts = [`  - \`${entry.column_name}\``];
      if (entry.data_type) parts.push(`(${entry.data_type})`);
      if (entry.unit && entry.unit !== "-") parts.push(`[${entry.unit}]`);
      if (entry.description) parts.push(`— ${entry.description}`);
      lines.push(parts.join(" "));
    }
  }

  // Danh sách giá trị của các chiều phân loại — thay cho dữ liệu mẫu.
  const categorical = (valueColumns ?? []).filter((c) => c.values);
  if (categorical.length > 0) {
    lines.push("GIÁ TRỊ CỦA CÁC CỘT PHÂN LOẠI:");
    for (const col of categorical) {
      const v = col.values!;
      // Nhãn phải nằm NGAY cạnh danh sách, không nằm ở chú thích cuối khối:
      // model đọc tới đâu kết luận tới đó, và "bị cắt" là thông tin quyết định
      // câu trả lời có được phép nói "không có" hay không.
      const flag = v.complete
        ? `${v.total} giá trị, ĐẦY ĐỦ`
        : `${v.total} giá trị, DANH SÁCH BỊ CẮT còn ${v.list.length} — KHÔNG được kết luận "không có" từ danh sách này`;
      lines.push(`  - \`${col.name}\` (${flag}): ${v.list.join(", ")}`);
    }
  }

  return lines.join("\n");
}
