/**
 * Tầng năng lực tra cứu — mặt tiền nào cũng gọi được, không mặt tiền nào sở hữu.
 *
 * Ba năng lực theo `specs/005-discovery-chat-scale/contracts/`:
 *   - `searchDatasets` — tìm dataset liên quan tới một câu hỏi
 *   - `getDataset`     — lấy mô tả đầy đủ của một số dataset đã biết slug
 *   - `lookupValue`    — tra một giá trị ra danh sách dataset chứa nó
 *
 * Hai bất biến xuyên suốt:
 *   - Cùng đầu vào → cùng đầu ra, bất kể ai gọi (FR-056)
 *   - Mọi lượt gọi đều được ghi nhận kèm người gọi (FR-059)
 */

import { fetchListingIndex, type IndexEntry } from "@/lib/datasets/index-json";
import { getDatasetBySlug } from "@/lib/datasets/read";
import { loadValueIndex } from "./store";
import { loadVectorIndex, rankByVector } from "./vector-store";
import { rankByKeyword } from "./keyword";
import { fuse } from "./fuse";
import { embedQuery } from "./embed";
import { normalize, tokenize } from "./normalize";
import { isValueListComplete, valueKeys } from "./value-index";
import { withAudit } from "./audit";
import type {
  DatasetColumn,
  DatasetDetail,
  GetDatasetInput,
  GetDatasetResult,
  LookupValueInput,
  LookupValueResult,
  SearchDatasetsInput,
  SearchDatasetsResult,
  SearchFilters,
  ValueLocation,
} from "./types";

export type * from "./types";
export { RetrievalIndexUnavailableError } from "./types";
export { normalize, tokenize } from "./normalize";
export { buildValueIndex, valueKeys, isValueListComplete } from "./value-index";

// ── searchDatasets ────────────────────────────────────────────────────────────

/**
 * `filters` là **ràng buộc cứng**, áp TRƯỚC khi cắt `limit`.
 *
 * Áp sau khi cắt thì người dùng lọc "danh mục kinh tế" sẽ nhận về ít hơn `limit`
 * kết quả một cách ngẫu nhiên — số kết quả phụ thuộc vào việc top-20 tình cờ có
 * bao nhiêu dataset kinh tế, không phụ thuộc vào kho có bao nhiêu.
 */
function passesFilters(entry: IndexEntry, filters?: SearchFilters): boolean {
  if (!filters) return true;

  if (filters.category && entry.category !== filters.category) return false;

  if (filters.format) {
    const formats = new Set(entry.resources.map((r) => r.type));
    if (!formats.has(filters.format)) return false;
  }

  if (filters.yearFrom != null || filters.yearTo != null) {
    const years = entry.year_range ?? [];
    // Dataset chưa biết phạm vi thời gian thì KHÔNG khớp — nhận bừa là hứa nó có
    // dữ liệu năm đó, mà không ai kiểm được.
    if (years.length === 0) return false;
    const from = Math.min(...years);
    const to = Math.max(...years);
    if (filters.yearFrom != null && to < filters.yearFrom) return false;
    if (filters.yearTo != null && from > filters.yearTo) return false;
  }

  return true;
}

/**
 * Tìm dataset liên quan tới một câu hỏi, chạy **cả hai** nhánh.
 *
 * Bắt buộc cả hai (FR-030, FR-031): vector bắt từ đồng nghĩa ("lạm phát" ↔ "chỉ số
 * giá tiêu dùng"), từ khoá bắt tên riêng chính xác ("Đà Nẵng"). Bỏ một nhánh là mất
 * hẳn một loại câu hỏi, và loại bị mất không báo lỗi — nó chỉ trả về dataset khác.
 *
 * Câu hỏi phải đã được hiểu đầy đủ trong ngữ cảnh TRƯỚC khi gọi. Năng lực này không
 * đọc lịch sử hội thoại (bất biến của hợp đồng).
 */
export async function searchDatasets(
  input: SearchDatasetsInput,
): Promise<SearchDatasetsResult> {
  return withAudit(
    "searchDatasets",
    input.caller,
    input.query,
    (r) => r.results.length,
    async () => {
      // Ném khi chỉ mục chưa dựng — rỗng và lỗi là hai chuyện khác nhau (T043).
      const index = await loadVectorIndex();
      const limit = input.limit ?? 20;

      // Câu hỏi chỉ gồm từ dừng ("có không", "thế nào") → không đoán. Kiểm TRƯỚC
      // khi gọi embedding: vừa đúng hợp đồng, vừa không tốn một lượt gọi mạng.
      if (tokenize(input.query).length === 0) {
        return { results: [], indexBuiltAt: index.builtAt, total: 0 };
      }

      const [queryVector, listing] = await Promise.all([
        embedQuery(input.query),
        fetchListingIndex(),
      ]);

      const semantic = rankByVector(index, queryVector);
      const keyword = rankByKeyword(index, input.query);

      const meta = new Map(listing.map((e) => [e.slug, e]));
      // Cắt `limit` sau cùng: trộn hết, lọc, rồi mới cắt.
      const fused = fuse(semantic, keyword, Number.MAX_SAFE_INTEGER);

      const allowed = fused.filter((hit) => {
        const entry = meta.get(hit.slug);
        // Không có trong danh mục = đã xoá hoặc chỉ mục cũ hơn kho. Không trả về
        // (D6): dataset đã xoá không bao giờ được xuất hiện.
        if (!entry || entry.status === "deleted") return false;
        return passesFilters(entry, input.filters);
      });

      const results = allowed.slice(0, limit).map((hit) => ({
        ...hit,
        title: meta.get(hit.slug)?.title ?? hit.slug,
      }));

      return {
        results,
        // Caller cần biết chỉ mục dựng lúc nào để tự đánh giá kết quả có cũ không.
        indexBuiltAt: index.builtAt,
        total: allowed.length,
      };
    },
  );
}

// ── lookupValue ───────────────────────────────────────────────────────────────

/**
 * Tra một giá trị ra **đầy đủ** danh sách dataset chứa nó.
 *
 * Ba trạng thái phải phân biệt được, và đó là toàn bộ lý do năng lực này tồn tại:
 *   - "không có"      → `found: false`, `partialColumns` rỗng
 *   - "chưa tra hết"  → `found: false`, `partialColumns` KHÔNG rỗng
 *   - "chưa biết"     → ném `RetrievalIndexUnavailableError` (chỉ mục chưa dựng)
 *
 * Gộp ba thứ đó thành một `false` là dựng lại đúng cái lỗi FR-037 muốn chặn.
 */
export async function lookupValue(
  input: LookupValueInput,
): Promise<LookupValueResult> {
  return withAudit(
    "lookupValue",
    input.caller,
    input.value,
    (r) => r.datasets.length,
    async () => {
      // Ném khi chỉ mục chưa dựng — KHÔNG bắt để trả `found: false`.
      const index = await loadValueIndex();

      const keys = valueKeys(input.value);
      const variants = new Set<string>();
      const seen = new Set<string>();
      const datasets: ValueLocation[] = [];
      let display: string | null = null;

      for (const key of keys) {
        const entry = index.entries[key];
        if (!entry) continue;
        // Dạng hiển thị lấy từ khoá khớp ĐẦU TIÊN — `valueKeys` trả khoá đầy đủ
        // trước bí danh, nên đây là cách viết gần với câu hỏi nhất.
        display ??= entry.display;
        for (const v of entry.variants) variants.add(v);
        for (const [si, ci] of entry.refs) {
          const id = `${si} ${ci}`;
          if (seen.has(id)) continue;
          seen.add(id);
          const slug = index.slugs[si];
          datasets.push({
            slug,
            title: index.titles[slug] ?? slug,
            column: index.columns[ci],
          });
        }
      }

      return {
        found: datasets.length > 0,
        display,
        variants: [...variants],
        // Trả ĐẦY ĐỦ, không cắt (FR-036) — caller tự quyết hiện bao nhiêu.
        datasets,
        // Mọi cột bị cắt trong kho đều là chỗ chưa kết luận được, kể cả khi đã
        // tìm thấy giá trị ở nơi khác: "có ở 3 dataset" không có nghĩa là "chỉ
        // có ở 3 dataset".
        partialColumns: index.partialColumns,
      };
    },
  );
}

// ── findValuesInQuery ─────────────────────────────────────────────────────────

/**
 * Số từ tối đa của một cụm đem đi tra. `Bắc Trung Bộ và Duyên hải miền Trung` là
 * 8 từ, nhưng cụm dài thì hầu như không ai gõ nguyên văn trong câu hỏi; 4 phủ
 * được mọi tên tỉnh/thành và phần lớn tên vùng.
 */
const MAX_NGRAM_WORDS = 4;

/**
 * Nhãn tổng hợp — bỏ qua khi tra.
 *
 * `TỔNG SỐ` / `CẢ NƯỚC` là **nhãn dòng tổng**, không phải một đối tượng người ta
 * hỏi về. Câu "tổng số dân là bao nhiêu" không phải câu hỏi theo giá trị, mà tra
 * ra `TỔNG SỐ` (có ở 173 dataset) rồi xếp 173 dataset đó lên đầu thì làm hỏng
 * đúng phần xếp hạng theo chủ đề.
 *
 * Lọc bằng danh sách chứ không bằng tỉ lệ: đo thực tế, `CẢ NƯỚC` có ở 195/493
 * dataset và `Đà Nẵng` ở 176/493 — tỉ lệ không tách được hai loại này.
 */
const AGGREGATE_LABELS = new Set([
  "tong so", "tong", "tong cong", "ca nuoc", "chung", "toan bo", "toan quoc",
]);

/**
 * Guard thưa cho những giá trị lọt danh sách trên mà vẫn có ở gần hết kho — xếp
 * hạng theo một giá trị như thế thì không còn là xếp hạng.
 */
const TOO_COMMON_RATIO = 0.6;

export interface QueryValueMatch {
  /** Cách viết chuẩn để hiện cho người dùng */
  display: string;
  /** Các cách viết thật gặp trong dữ liệu */
  variants: string[];
  /** ĐẦY ĐỦ mọi chỗ chứa giá trị này */
  datasets: ValueLocation[];
  /** Số dataset khác nhau (một dataset có thể chứa giá trị ở nhiều cột) */
  datasetCount: number;
}

export interface FindValuesResult {
  matches: QueryValueMatch[];
  /** Cột >200 giá trị nên không vào chỉ mục — chỗ chưa kết luận được */
  partialColumns: { slug: string; column: string }[];
}

/**
 * Tìm xem câu hỏi có nêu giá trị nào **thật sự có trong dữ liệu** hay không.
 *
 * Vì sao cần: câu "có dữ liệu gì về Đà Nẵng" cho cosine cao nhất chỉ **0,613** —
 * thấp hơn cả câu hỏi hoàn toàn vô quan (tới 0,62). Một tên tỉnh đứng một mình
 * không giống tiêu đề dataset nào về mặt ngữ nghĩa, nên tìm kiếm tương đồng
 * KHÔNG trả lời được câu này. Trong khi chỉ mục nghịch đảo trả lời chính xác:
 * `Đà Nẵng` có ở 178 chỗ.
 *
 * Không gọi model: sinh cụm từ câu hỏi rồi tra chỉ mục trong memory. 0 token.
 */
export async function findValuesInQuery(
  query: string,
  caller: string,
): Promise<FindValuesResult> {
  return withAudit(
    "lookupValue",
    caller,
    query,
    (r) => r.matches.length,
    async () => {
      const index = await loadValueIndex();
      const words = query.split(/\s+/).filter(Boolean);
      const total = Math.max(1, index.slugs.length);

      // Quét cụm DÀI TRƯỚC: khớp được `Đà Nẵng` thì không xét `Nẵng` nữa. Xét cả
      // hai thì cụm ngắn kéo theo những giá trị chẳng liên quan tới câu hỏi.
      const taken = new Set<number>();
      const seenEntry = new Set<string>();
      const matches: QueryValueMatch[] = [];

      for (let n = Math.min(MAX_NGRAM_WORDS, words.length); n >= 1; n--) {
        for (let i = 0; i + n <= words.length; i++) {
          if (Array.from({ length: n }, (_, k) => i + k).some((k) => taken.has(k))) continue;

          const phrase = words.slice(i, i + n).join(" ");
          const entry = valueKeys(phrase)
            .map((k) => index.entries[k])
            .find(Boolean);
          if (!entry) continue;

          // Cụm MỘT TỪ phải khớp đúng cả dấu. Chuẩn hoá bỏ dấu để gộp cách viết
          // (`Qui Nhơn`/`Quy Nhơn`) là đúng cho cụm nhiều từ, nhưng với một từ
          // ngắn thì nó gộp cả những từ chẳng liên quan: `cả` (trong "cả nước")
          // bỏ dấu thành `ca` và khớp với giá trị `Cá`; `năm` khớp với `Nam`.
          // Người dùng của kho này gõ tiếng Việt có dấu, nên đòi khớp đúng dấu
          // cho một từ là siết đúng chỗ mà không mất trường hợp thật nào.
          if (n === 1) {
            const exact = phrase.toLowerCase();
            if (!entry.variants.some((v) => v.toLowerCase() === exact)) continue;
          }

          if (AGGREGATE_LABELS.has(normalize(entry.display))) continue;
          const slugs = new Set(entry.refs.map(([si]) => si));
          if (slugs.size / total > TOO_COMMON_RATIO) continue;

          for (let k = i; k < i + n; k++) taken.add(k);
          // Hai cách viết của cùng một chỗ (`Qui Nhơn` và `Quy Nhơn` trong cùng
          // câu hỏi) trỏ về cùng entry — kể hai lần là nói kho có hai đối tượng.
          if (seenEntry.has(entry.display)) continue;
          seenEntry.add(entry.display);
          matches.push({
            display: entry.display,
            variants: entry.variants,
            datasets: entry.refs.map(([si, ci]) => ({
              slug: index.slugs[si],
              title: index.titles[index.slugs[si]] ?? index.slugs[si],
              column: index.columns[ci],
            })),
            datasetCount: slugs.size,
          });
        }
      }

      return { matches, partialColumns: index.partialColumns };
    },
  );
}

// ── getDataset ────────────────────────────────────────────────────────────────

/**
 * Đọc `column_stats` của một dataset thành danh sách giá trị mỗi cột.
 *
 * Cờ `complete` đi kèm danh sách và KHÔNG được bỏ: thiếu nó thì bên đọc không
 * phân biệt được "cột chỉ có 12 giá trị" với "cột bị cắt còn 12" (D5).
 */
function columnsOf(
  dataset: NonNullable<Awaited<ReturnType<typeof getDatasetBySlug>>>,
  includeValues: boolean,
): DatasetColumn[] {
  const stats = dataset.resources.find((r) => r.column_stats)?.column_stats ?? {};
  const dict = new Map(
    dataset.data_dictionary.map((d) => [d.column_name, d] as const),
  );

  // Lấy tên cột từ dictionary trước, rồi bổ sung cột chỉ có trong stats: dictionary
  // là thứ người đọc thấy, nhưng cột thiếu trong dictionary vẫn có thật trong file.
  const names = new Set<string>([...dict.keys(), ...Object.keys(stats)]);

  return [...names].map((name) => {
    const d = dict.get(name);
    const stat = stats[name];
    const col: DatasetColumn = {
      name,
      type: d?.data_type ?? (stat?.kind === "numeric" ? "float" : "text"),
      unit: d?.unit,
      description: d?.description,
      decimalChar: d?.decimal_char,
      groupChar: d?.group_char,
    };
    if (includeValues && stat?.kind === "categorical") {
      col.values = {
        list: stat.segments.map((s) => s.label),
        total: stat.distinct,
        complete: isValueListComplete(stat),
      };
    }
    return col;
  });
}

/**
 * Lấy mô tả đầy đủ của các dataset đã biết slug.
 *
 * Slug hỏng không đánh sập cả lượt — chúng đi vào `notFound`. Một slug do model
 * đọc nhầm không được phép làm mất câu trả lời cho 19 slug còn lại.
 */
export async function getDataset(
  input: GetDatasetInput,
): Promise<GetDatasetResult> {
  return withAudit(
    "getDataset",
    input.caller,
    input.slugs.join(", "),
    (r) => r.datasets.length,
    async () => {
      const includeValues = input.includeValues !== false;
      const loaded = await Promise.all(
        input.slugs.map(async (slug) => ({
          slug,
          dataset: await getDatasetBySlug(slug),
        })),
      );

      const datasets: DatasetDetail[] = [];
      const notFound: string[] = [];

      for (const { slug, dataset } of loaded) {
        if (!dataset) {
          notFound.push(slug);
          continue;
        }
        const years = dataset.year_range ?? [];
        datasets.push({
          slug: dataset.slug,
          title: dataset.title,
          description: dataset.description,
          category: dataset.category,
          source: dataset.source,
          // `null` khi không có chiều thời gian — không bịa khoảng (FR-048).
          yearRange:
            years.length > 0
              ? { from: Math.min(...years), to: Math.max(...years) }
              : null,
          rowCount: dataset.row_count,
          columns: columnsOf(dataset, includeValues),
        });
      }

      return { datasets, notFound };
    },
  );
}
