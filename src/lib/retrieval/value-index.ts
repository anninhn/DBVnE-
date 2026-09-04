/**
 * Chỉ mục nghịch đảo: một giá trị → các dataset chứa nó.
 *
 * Trả lời câu "dataset nào có Đà Nẵng" bằng **dữ liệu**, không bằng suy luận của
 * model — và trả lời được cả chiều phủ định, thứ mà tìm kiếm tương đồng không làm
 * được (FR-036, FR-037, R7).
 *
 * File này CHỈ dựng và tra chỉ mục trong bộ nhớ. Việc đọc metadata và ghi lên R2
 * nằm ở chỗ khác — giữ như vậy để hàm dựng chỉ mục kiểm được mà không cần mạng.
 */

import { normalize } from "./normalize";
import type { ValueIndex, ValueIndexEntry } from "./types";

// ── Khoá tra ──────────────────────────────────────────────────────────────────

/**
 * Gộp cách viết `i`/`y` — `Qui Nhơn` và `Quy Nhơn` là một chỗ (FR-057).
 *
 * Chỉ gộp khi `y` đứng sau phụ âm hoặc trong `qu`: đó là những âm tiết mà chính
 * tả tiếng Việt cho phép viết hai kiểu (`kĩ`/`kỹ`, `Mĩ`/`Mỹ`, `lí`/`lý`,
 * `Qui`/`Quy`). KHÔNG gộp khi `y` đứng sau nguyên âm, vì ở đó `y` là một phần của
 * vần chứ không phải cách viết khác: gộp thì `Tây` thành `tai`, và `Tây Ninh` bị
 * trộn với bất kỳ chỗ nào đọc ra `tai ninh`.
 */
function foldIY(s: string): string {
  // `quy` xử lý riêng vì `y` ở đó đứng sau `u` — luật phụ âm bên dưới không chạm tới.
  return s.replace(/quy/g, "qui").replace(/([bcdghklmnprstvx])y/g, "$1i");
}

/**
 * Tiền tố cấp hành chính — bỏ đi để `Thành phố Hà Nội` tra được bằng `Hà Nội`.
 *
 * Đây là chuyện FR-057 gọi là "một cột địa bàn có thể chứa nhiều cấp hành chính
 * lẫn nhau": cùng một tỉnh, dataset này ghi `Tỉnh Lai Châu`, dataset kia ghi
 * `Lai Châu`. Người hỏi gõ `Lai Châu` và phải ra cả hai.
 */
const ADMIN_PREFIXES = [
  "thanh pho ",
  "tinh ",
  "tp ",
  "tp. ",
  "thi xa ",
  "thi tran ",
  "quan ",
  "huyen ",
  "phuong ",
  "xa ",
];

function stripAdminPrefix(s: string): string {
  for (const p of ADMIN_PREFIXES) {
    if (s.startsWith(p)) {
      const rest = s.slice(p.length).trim();
      // `Quận 1` → `1` là vô nghĩa, và trộn mọi "Quận 1" của mọi tỉnh vào một
      // khoá. Chỉ bỏ tiền tố khi phần còn lại vẫn là một cái tên.
      if (rest.length >= 2 && !/^\d+$/.test(rest)) return rest;
    }
  }
  return s;
}

/** Bỏ phần chú trong ngoặc: `Hà Nội (Láng)` → thêm khoá phụ `ha noi`. */
function stripParenthetical(s: string): string {
  return s.replace(/\s*\([^)]*\)\s*/g, " ").trim();
}

/**
 * Sinh mọi khoá tra cho một giá trị thô.
 *
 * Khoá đầu là khoá **chính** (dạng đầy đủ); các khoá sau là bí danh. Cùng một hàm
 * này được dùng cả lúc dựng chỉ mục lẫn lúc tra (D4) — dùng hai hàm khác nhau thì
 * chỉ cần lệch một dấu cách là tra không ra, mà không có triệu chứng nào.
 */
export function valueKeys(raw: string): string[] {
  const base = normalize(raw).replace(/\s+/g, " ").trim();
  if (base.length < 2) return [];

  const keys = new Set<string>();
  const add = (s: string) => {
    const k = foldIY(s).trim();
    if (k.length >= 2) keys.add(k);
  };

  add(base);
  const noParen = stripParenthetical(base);
  if (noParen !== base) add(noParen);
  add(stripAdminPrefix(base));
  if (noParen !== base) add(stripAdminPrefix(noParen));

  return [...keys];
}

// ── Dựng chỉ mục ──────────────────────────────────────────────────────────────

export interface ValueSourceColumn {
  name: string;
  /** Danh sách giá trị lấy từ `column_stats.segments` */
  values: string[];
  /** `false` = danh sách đã bị cắt, cột này CHƯA kết luận được */
  complete: boolean;
}

export interface ValueSource {
  slug: string;
  title: string;
  columns: ValueSourceColumn[];
}

/**
 * Dựng chỉ mục từ danh sách dataset.
 *
 * Cột `complete: false` KHÔNG được đưa giá trị vào chỉ mục — danh sách của nó đã
 * bị cắt, nên có mặt trong chỉ mục cũng không chứng minh được gì, mà vắng mặt thì
 * lại bị hiểu nhầm là "không có". Thay vào đó chúng được ghi vào `partialColumns`
 * để lúc tra còn nói được "chưa tra hết chỗ này".
 */
export function buildValueIndex(sources: ValueSource[]): ValueIndex {
  const entries: Record<string, ValueIndexEntry> = {};
  const titles: Record<string, string> = {};
  const partialColumns: { slug: string; column: string }[] = [];
  // Đếm cách viết để chọn dạng hiển thị: dạng gặp nhiều nhất là dạng người đọc
  // quen mắt nhất, không phải dạng gặp đầu tiên.
  const displayCounts = new Map<string, Map<string, number>>();

  for (const src of sources) {
    titles[src.slug] = src.title;
    for (const col of src.columns) {
      if (!col.complete) {
        partialColumns.push({ slug: src.slug, column: col.name });
        continue;
      }
      for (const raw of col.values) {
        const keys = valueKeys(raw);
        if (keys.length === 0) continue;

        for (const key of keys) {
          const entry = (entries[key] ??= {
            normalized: key,
            display: raw,
            variants: [],
            datasets: [],
          });
          if (!entry.variants.includes(raw)) entry.variants.push(raw);
          if (
            !entry.datasets.some(
              (d) => d.slug === src.slug && d.column === col.name,
            )
          ) {
            entry.datasets.push({ slug: src.slug, column: col.name });
          }

          const counts = displayCounts.get(key) ?? new Map<string, number>();
          counts.set(raw, (counts.get(raw) ?? 0) + 1);
          displayCounts.set(key, counts);
        }
      }
    }
  }

  for (const [key, counts] of displayCounts) {
    let best = entries[key].display;
    let bestN = -1;
    for (const [raw, n] of counts) {
      // Hoà thì lấy dạng dài hơn: `Thành phố Hà Nội` mang nhiều thông tin hơn
      // `Hà Nội`, và người đọc không mất gì khi thấy dạng đầy đủ.
      if (n > bestN || (n === bestN && raw.length > best.length)) {
        best = raw;
        bestN = n;
      }
    }
    entries[key].display = best;
  }

  return {
    entries,
    titles,
    partialColumns,
    builtAt: new Date().toISOString(),
  };
}
