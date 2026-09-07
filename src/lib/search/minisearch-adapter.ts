/**
 * MiniSearchAdapter — ô search catalog chạy trên inverted index + BM25.
 *
 * Đây là adapter mà quyết định D1 của spec Phase 1 hoạch định từ 2026-07-09
 * ("tránh refactor lớn khi catalog lớn và cần FlexSearch/Pagefind") và chưa bao
 * giờ được viết. `SimpleFilterAdapter` là chỗ giữ chân, và nó dùng
 * `String.includes()` — tức khớp chuỗi con, không phải khớp từ. Hậu quả đo trên
 * 493 dataset:
 *
 *     gõ "rừng" → 57 kết quả, 49 trong đó là rác
 *                 ("rừng" bỏ dấu thành "rung", nằm trong "t-rung bình")
 *     gõ "an"   → 487/493 dataset, tức gần như cả kho
 *
 * Vì sao MiniSearch chứ không FlexSearch (đo trên chính kho này):
 *   bundle gzip   5.974 B  vs  17.509 B
 *   chất lượng    như nhau trên 10 truy vấn thử
 *   dependency    0        vs  0
 * BM25 là ranking mặc định, nên chuẩn hoá theo độ dài trường và IDF có sẵn —
 * không phải tự viết.
 */

import MiniSearch from "minisearch";

import { normalize } from "@/lib/retrieval/normalize";
import type { Dataset } from "@/lib/types/dataset";
import type {
  SearchAdapter,
  SearchCapabilities,
  SearchQuery,
  SearchResult,
} from "./types";
import { SIZE_BUCKETS } from "./simple-filter";

/** Trường được lập chỉ mục, kèm trọng số — giữ đúng thang của adapter cũ. */
const FIELDS = ["title", "slug", "description", "category", "tags"] as const;
const BOOST: Record<string, number> = {
  title: 10,
  slug: 5,
  tags: 3,
  description: 2,
  category: 2,
};

/**
 * Tách từ theo ký tự KHÔNG phải chữ/số, dùng Unicode property escape.
 *
 * Phải là `\p{L}` chứ không `\w`: `\w` chỉ nhận `[A-Za-z0-9_]` nên "Đà Nẵng" bị
 * cắt vụn thành từng ký tự. Chạy trên text CHƯA bỏ dấu vì `processTerm` bỏ dấu
 * sau — tách trước rồi mới bỏ dấu thì `31/12/2023` và `2023-2024` vẫn ra token
 * đúng.
 */
function tokenize(text: string): string[] {
  return text.split(/[^\p{L}\p{N}]+/u).filter(Boolean);
}

function sizeBucket(rowCount: number): (typeof SIZE_BUCKETS)[number] {
  if (rowCount < 1_000) return "< 1K";
  if (rowCount < 10_000) return "1K–10K";
  if (rowCount < 100_000) return "10K–100K";
  if (rowCount < 1_000_000) return "100K–1M";
  return "> 1M";
}

export class MiniSearchAdapter implements SearchAdapter {
  private mini: MiniSearch<Dataset> | null = null;
  private bySlug = new Map<string, Dataset>();
  /** Mảng đã lập chỉ mục — so bằng reference để biết có phải dựng lại không. */
  private source: Dataset[] | null = null;

  readonly capabilities: SearchCapabilities = {
    fullText: true,
    /**
     * Chưa lập chỉ mục nội dung `data_dictionary` (tên cột) — cùng giới hạn như
     * adapter cũ. Bật lên là việc riêng: phải nạp dictionary của cả 493 dataset
     * về client, hiện chỉ trang chi tiết mới đọc.
     */
    dictionary: false,
    /**
     * Tắt fuzzy là QUYẾT ĐỊNH, không phải thiếu tính năng.
     *
     * Đo với `fuzzy: 0.2` trên kho này: "rừng" 9 → 349 kết quả, "giáo dục"
     * 37 → 228, và "dan sô" cho kết quả đầu là "Số vụ án và số bị can đã bị
     * truy tố" — sai hẳn. Trong khi lỗi chính tả thật thì nó KHÔNG chữa được:
     * "ngân sáhc" ra 0 kết quả dù bật hay tắt (đảo hai chữ = khoảng cách sửa 2,
     * ngưỡng 0,2 trên 4 ký tự chỉ cho phép 0).
     *
     * Với tiếng Việt đã bỏ dấu, fuzzy thêm rác nhiều hơn thêm khả năng.
     */
    fuzzy: false,
  };

  /**
   * Lập chỉ mục. **Bỏ qua nếu cùng mảng** — `DatasetExplorer` gọi hàm này ngay
   * trong `results` useMemo nên nó chạy MỖI LẦN GÕ; dựng lại chỉ mục 493 dataset
   * tốn ~45ms, tức 45ms trễ trên từng ký tự. Adapter cũ chịu được vì `index()`
   * của nó chỉ là phép gán.
   *
   * So bằng reference là đủ cho luồng dữ liệu React (dữ liệu đổi → mảng mới).
   * Nếu caller sửa mảng tại chỗ thì ta không thấy — nhưng không chỗ nào làm vậy,
   * và đánh đổi ngược lại là 45ms mỗi ký tự.
   */
  index(datasets: Dataset[]): void {
    if (this.source === datasets && this.mini) return;

    const mini = new MiniSearch<Dataset>({
      idField: "slug",
      fields: [...FIELDS],
      tokenize,
      // Bỏ dấu + hạ chữ thường, dùng ĐÚNG hàm mà ô search cũ, nhánh từ khoá của
      // AMA và chỉ mục giá trị đang dùng. Ba chỗ chuẩn hoá lệch nhau một chút là
      // ba chỗ cho kết quả khác nhau, và loại lệch đó không có triệu chứng.
      processTerm: (term) => normalize(term) || null,
      // `tags` là string[]; nối tại đây thay vì clone cả 493 dataset.
      extractField: (doc, field) =>
        field === "tags"
          ? doc.tags.join(" ")
          : (doc[field as keyof Dataset] as string | undefined) ?? "",
    });
    mini.addAll(datasets);

    this.mini = mini;
    this.source = datasets;
    this.bySlug = new Map(datasets.map((d) => [d.slug, d]));
  }

  search(query: SearchQuery): SearchResult[] {
    const text = query.text.trim();
    const all = this.source ?? [];

    // Không có chữ nào → trả toàn bộ theo facet, điểm 0. Giữ đúng hành vi cũ:
    // xếp hạng lúc đó do `sort` của UI quyết định, không phải do search.
    if (text.length === 0) {
      return all
        .filter((d) => this.matchesFilters(d, query.filters))
        .map((dataset) => ({ dataset, score: 0, matchedFields: [] }));
    }
    if (!this.mini) return [];

    const hits = this.mini.search(text, {
      boost: BOOST,
      // AND: mọi token phải khớp. Đúng cho ô search — người gõ nhiều từ thì mong
      // tất cả đều khớp. (Nhánh từ khoá của AMA cố ý dùng OR, vì câu hỏi tự
      // nhiên chứa nhiều từ không mang thông tin.)
      combineWith: "AND",
      /**
       * Prefix CHỈ cho token cuối — token người dùng đang gõ dở.
       *
       * Bật cho mọi token thì tiếng Việt trượt sang âm tiết khác: `dan` là đầu
       * của `dang`, `danh`, `dai`. Đo được: "dân số" 128 → 84 kết quả,
       * "ngan sa" 37 → 6, và 31 cái bị loại đều khớp qua `ngành`, không phải
       * `ngân sách`.
       */
      prefix: (_term, i, terms) => i === terms.length - 1,
      fuzzy: false,
    });

    const out: SearchResult[] = [];
    for (const hit of hits) {
      const dataset = this.bySlug.get(hit.id as string);
      if (!dataset) continue;
      if (!this.matchesFilters(dataset, query.filters)) continue;
      out.push({
        dataset,
        score: hit.score,
        // `hit.match` là `{ token: [tên trường, …] }` — gộp lại thành danh sách
        // trường. Adapter cũ cũng tính giá trị này rồi bỏ đó; nay nó chính xác
        // hơn vì đến từ chỉ mục chứ không từ `includes()`.
        matchedFields: [...new Set(Object.values(hit.match).flat())],
      });
    }

    // Phá thế đồng điểm bằng slug để thứ tự TẤT ĐỊNH. Không có bước này thì hai
    // dataset cùng điểm xếp theo thứ tự nội bộ của chỉ mục, và thứ tự đó đổi khi
    // `index.json` đổi — người dùng thấy kết quả nhảy chỗ mà không rõ vì sao.
    out.sort((a, b) =>
      b.score - a.score || a.dataset.slug.localeCompare(b.dataset.slug),
    );
    return out;
  }

  /** AND logic — dataset phải khớp mọi facet đang bật. Giữ nguyên từ adapter cũ. */
  private matchesFilters(d: Dataset, filters: SearchQuery["filters"]): boolean {
    if (!filters) return true;
    if (filters.categories?.length && !filters.categories.includes(d.category)) {
      return false;
    }
    if (filters.tags?.length && !d.tags.some((t) => filters.tags!.includes(t))) {
      return false;
    }
    if (filters.sizes?.length && !filters.sizes.includes(sizeBucket(d.row_count))) {
      return false;
    }
    return true;
  }
}
