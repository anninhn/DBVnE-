/**
 * Dựng chỉ mục tra cứu từ metadata trong git.
 *
 * Chỉ mục là dữ liệu **sinh ra** (D1): nguồn sự thật vẫn là `datasets/<slug>/
 * metadata.yaml`. Dựng lại từ đầu bất cứ lúc nào cũng ra đúng kết quả cũ — nên
 * khi nghi ngờ chỉ mục lệch, cách xử lý luôn là dựng lại, không phải vá tay.
 *
 * Đọc metadata của từng dataset là việc tốn mạng (mỗi dataset một lượt gọi GitHub
 * Contents API), nên chạy song song có giới hạn — xem `CONCURRENCY`.
 */

import { fetchListingIndex } from "@/lib/datasets/index-json";
import { getDatasetBySlug } from "@/lib/datasets/read";
import { buildValueIndex, isValueListComplete, type ValueSource } from "./value-index";
import { saveValueIndex } from "./store";
import type { ValueIndex } from "./types";

/**
 * Số lượt đọc metadata chạy cùng lúc.
 *
 * GitHub cho 5.000 call/giờ nên trần không nằm ở đó; giới hạn này là để không mở
 * 500 kết nối cùng lúc. 10 là mức đọc xong 495 dataset trong khoảng 15 giây.
 */
const CONCURRENCY = 10;

async function mapLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]);
    }
  });
  await Promise.all(workers);
  return out;
}

export interface BuildValueIndexResult {
  index: ValueIndex;
  /** Số dataset đọc được metadata */
  datasetsRead: number;
  /** Slug có trong danh mục nhưng đọc metadata không ra — KHÔNG im lặng bỏ qua */
  unreadable: string[];
  /** Số cột phân loại đưa được vào chỉ mục */
  columnsIndexed: number;
  /** Số khoá tra (đã gồm cả bí danh) */
  keys: number;
}

/**
 * Đọc toàn bộ kho, dựng chỉ mục giá trị trong bộ nhớ.
 *
 * Dataset đọc không ra KHÔNG bị bỏ qua im lặng: nó đi vào `unreadable`. Bỏ qua im
 * lặng ở đây có nghĩa là chỉ mục thiếu dataset đó, và mọi câu hỏi "dataset nào có
 * X" sau này đều trả lời sai về nó mà không có dấu hiệu gì.
 */
export async function buildValueIndexFromRepo(): Promise<BuildValueIndexResult> {
  const entries = (await fetchListingIndex()).filter((e) => e.status !== "deleted");

  const unreadable: string[] = [];
  let columnsIndexed = 0;

  const sources = await mapLimit(entries, CONCURRENCY, async (entry) => {
    const dataset = await getDatasetBySlug(entry.slug);
    if (!dataset) {
      unreadable.push(entry.slug);
      return null;
    }

    const stats =
      dataset.resources.find((r) => r.column_stats)?.column_stats ?? {};

    const columns: ValueSource["columns"] = [];
    for (const [name, stat] of Object.entries(stats)) {
      if (stat.kind !== "categorical") continue;
      const complete = isValueListComplete(stat);
      if (complete) columnsIndexed++;
      columns.push({
        name,
        values: stat.segments.map((s) => s.label),
        complete,
      });
    }

    return { slug: dataset.slug, title: dataset.title, columns };
  });

  const index = buildValueIndex(sources.filter((s): s is ValueSource => s !== null));

  return {
    index,
    datasetsRead: entries.length - unreadable.length,
    unreadable,
    columnsIndexed,
    keys: Object.keys(index.entries).length,
  };
}

/** Dựng rồi ghi lên R2. Tách khỏi hàm trên để dry-run dùng chung đúng một đường. */
export async function buildAndSaveValueIndex(): Promise<BuildValueIndexResult> {
  const result = await buildValueIndexFromRepo();
  await saveValueIndex(result.index);
  return result;
}
