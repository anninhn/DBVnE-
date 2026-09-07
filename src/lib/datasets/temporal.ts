/**
 * Phát hiện chiều thời gian của một dataset từ dữ liệu thật.
 *
 * Quy tắc của spec 005 (data-model § IndexEntry):
 *   - Suy từ **cột năm trong dữ liệu**, KHÔNG suy từ tiêu đề. Tiêu đề ghi
 *     "2005-2024" nhưng dữ liệu chỉ tới 2013 thì phải theo dữ liệu — người đọc
 *     lọc theo năm rồi mở dataset ra không thấy năm đó là mất lòng tin, và họ
 *     không có cách nào biết trước.
 *   - Dataset KHÔNG có chiều thời gian thì trả `null`, không bịa ra một khoảng
 *     (FR-048). Hầu hết dataset trong kho là bảng tra cứu tĩnh — gán đại cho
 *     chúng một khoảng năm làm bộ lọc thời gian thành vô nghĩa.
 */

import type { ColumnStats } from "@/lib/types/dataset";
import { normalize } from "@/lib/retrieval/normalize";

/** Ngoài khoảng này thì con số đó là mã số/dân số/tiền, không phải năm. */
const MIN_YEAR = 1900;
const MAX_YEAR = 2100;

/**
 * Tỉ lệ ô phải là năm hợp lệ thì cột mới được coi là cột năm.
 *
 * Không đặt 100%: dữ liệu thật hay có dòng tổng ("Tổng số", "Cả nước") lẫn vào
 * cột năm. Không đặt thấp hơn: cột "mã tỉnh" có vài giá trị rơi vào 1900–2100 là
 * chuyện bình thường, hạ ngưỡng xuống là nhận nhầm nó thành cột năm.
 */
const YEAR_RATIO = 0.8;

/**
 * Cột năm BẮT BUỘC phải có tên chỉ thời gian.
 *
 * Ban đầu tên cột chỉ dùng để ưu tiên, còn nội dung tự nó đủ để kết luận. Chạy
 * thử trên 495 dataset cho thấy như vậy là quá rộng: 466 cột được nhận đúng đều
 * có tên chỉ thời gian (`Năm`, `Năm học`, `year`), còn đúng 2 cột được nhận nhờ
 * nội dung lại là nhận nhầm — một cột tên văn bản pháp quy (`Nghị định .../2005`)
 * và một cột `Hiện trạng`, cả hai chứa năm nhưng năm đó không phải phạm vi thời
 * gian của dataset. Bỏ chúng đi không mất gì; giữ lại thì hai dataset mang khoảng
 * thời gian sai mà không có triệu chứng.
 */
const YEAR_NAME_HINTS = [
  "nam",
  "year",
  "thoi gian",
  "thoi ky",
  "thoi diem",
  // `Giai đoạn` — cột chứa khoảng nhiều năm ("2011-2015"). Thiếu nó thì dataset
  // TFP có cột `Giai đoạn` với dữ liệu 2011–2023 vẫn bị coi là không có chiều
  // thời gian, và bộ lọc theo năm âm thầm bỏ sót nó. `yearsInLabel` vốn đã đọc
  // được dạng khoảng, chỉ thiếu đúng cái tên này.
  "giai doan",
  "nien do",
  "period",
  "ky",
];

/** Cột có tên chỉ thời gian không — dùng chung hàm chuẩn hoá của tầng tra cứu. */
function hasYearName(column: string): boolean {
  const n = normalize(column);
  return YEAR_NAME_HINTS.some((h) => n.includes(h));
}

/**
 * Rút các năm từ một nhãn.
 *
 * Nhận cả dạng khoảng ("1995 -1996", "2010-2011" — niên khoá/niên độ hay gặp ở
 * dữ liệu giáo dục) và trả về TẤT CẢ năm tìm được, vì cả hai đầu đều là thời
 * gian mà dataset có phủ.
 */
function yearsInLabel(label: string): number[] {
  const out: number[] = [];
  for (const m of label.matchAll(/\b(\d{4})\b/g)) {
    const y = Number(m[1]);
    if (y >= MIN_YEAR && y <= MAX_YEAR) out.push(y);
  }
  return out;
}

interface ColumnYears {
  column: string;
  years: number[];
  /** Tỉ lệ ô đọc được thành năm */
  ratio: number;
}

/**
 * Bảng thống kê từng cột — tính trên TOÀN BỘ file lúc inspect.
 *
 * Nhận `column_stats` chứ không nhận cả `FileInspection`: chỉ cần đúng phần này,
 * và nhận hẹp thì luồng commit (chỉ có `column_stats` gửi lên từ bước phân tích)
 * dùng lại được mà không phải đọc lại file.
 */
export type ColumnStatsMap = Record<string, ColumnStats>;

/**
 * Quét mọi cột, trả về những cột **trông như cột năm** kèm các năm đọc được.
 *
 * Cố ý KHÔNG đọc từ dữ liệu mẫu: mẫu chỉ là 5 dòng đầu, mà dữ liệu thống kê sắp
 * theo thời gian — lấy khoảng năm từ 5 dòng đầu thì mọi dataset đều ra "khoảng"
 * bằng đúng năm đầu tiên.
 */
function scanColumns(stats: ColumnStatsMap): ColumnYears[] {
  const found: ColumnYears[] = [];

  for (const [column, stat] of Object.entries(stats)) {
    if (stat.kind === "numeric") {
      // Cột số: chỉ min/max, không có từng giá trị. Coi là cột năm khi CẢ hai
      // đầu đều nằm trong khoảng năm — đủ để bắt cột `Năm` đã infer thành số.
      const lo = Math.round(stat.min);
      const hi = Math.round(stat.max);
      const whole = Number.isInteger(stat.min) && Number.isInteger(stat.max);
      if (whole && lo >= MIN_YEAR && hi <= MAX_YEAR && hasYearName(column)) {
        found.push({ column, years: [lo, hi], ratio: 1 });
      }
      continue;
    }

    if (!hasYearName(column)) continue;
    const labels = stat.segments.map((s) => s.label);
    if (labels.length === 0) continue;
    const years: number[] = [];
    let hits = 0;
    for (const label of labels) {
      const ys = yearsInLabel(label);
      if (ys.length > 0) {
        hits++;
        years.push(...ys);
      }
    }
    const ratio = hits / labels.length;
    if (ratio >= YEAR_RATIO && years.length > 0) {
      found.push({ column, years, ratio });
    }
  }

  return found;
}

/**
 * Chọn cột năm đáng tin nhất trong số các ứng viên.
 *
 * Cố ý KHÔNG gộp năm của mọi cột lại: gộp nhầm một cột vào là khoảng thời gian
 * rộng ra một cách âm thầm, không ai phát hiện.
 */
function pickTemporalColumn(stats: ColumnStatsMap): ColumnYears | null {
  const candidates = scanColumns(stats);
  if (candidates.length === 0) return null;

  // Mọi ứng viên đều đã có tên chỉ thời gian, nên chỉ còn xếp theo tỉ lệ ô đọc
  // được thành năm — cột nào "ra năm" rõ hơn thì tin cột đó.
  candidates.sort((a, b) => b.ratio - a.ratio);
  return candidates[0];
}

/**
 * Tỉ lệ tên cột phải chứa năm thì bảng mới được coi là **bảng ngang theo năm**.
 *
 * Không phải dataset nào cũng ở dạng gọn (mỗi chỉ tiêu một cột, năm nằm ở cột
 * `Năm`). Một số bảng giữ nguyên dạng gốc: mỗi năm là MỘT CỘT (`2019`, `2020*`,
 * `Sơ bộ Prel. 2024`). Với chúng, chiều thời gian nằm ở **tên cột**, không nằm
 * trong dữ liệu — không đọc tên cột thì chúng bị coi là không có thời gian.
 */
const HEADER_YEAR_RATIO = 0.5;
const HEADER_YEAR_MIN_COLUMNS = 2;

/** Khoảng năm suy từ TÊN CỘT, cho bảng ngang. `null` nếu không phải dạng đó. */
function rangeFromHeaders(stats: ColumnStatsMap): [number, number] | null {
  const names = Object.keys(stats);
  if (names.length === 0) return null;

  const years: number[] = [];
  let hits = 0;
  for (const name of names) {
    const ys = yearsInLabel(name);
    if (ys.length > 0) {
      hits++;
      years.push(...ys);
    }
  }

  if (hits < HEADER_YEAR_MIN_COLUMNS) return null;
  if (hits / names.length < HEADER_YEAR_RATIO) return null;
  return [Math.min(...years), Math.max(...years)];
}

/** Trả `[năm đầu, năm cuối]`, hoặc `null` khi dataset không có chiều thời gian. */
export function detectTemporalRange(
  stats: ColumnStatsMap,
): [number, number] | null {
  const picked = pickTemporalColumn(stats);
  // Cột năm thật trong dữ liệu thắng tên cột: nó là dữ liệu, tên cột là nhãn.
  if (picked) return [Math.min(...picked.years), Math.max(...picked.years)];
  return rangeFromHeaders(stats);
}

/**
 * Tên cột đã được chọn làm chiều thời gian — để script backfill in ra cho người
 * chạy soi. Nhận nhầm cột nào chỉ nhìn ra khi biết nó chọn cột nào.
 */
export function detectTemporalColumn(
  stats: ColumnStatsMap,
): string | null {
  const picked = pickTemporalColumn(stats);
  if (picked) return picked.column;
  return rangeFromHeaders(stats) ? "(tên cột)" : null;
}
