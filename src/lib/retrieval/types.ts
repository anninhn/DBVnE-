/**
 * Kiểu đầu vào/đầu ra của ba năng lực tra cứu.
 *
 * Nguồn: `specs/005-discovery-chat-scale/contracts/`. Mỗi kiểu ở đây là bản dịch
 * sang TypeScript của một hợp đồng — đổi kiểu mà không đổi hợp đồng là làm hợp đồng
 * thành vô nghĩa.
 *
 * Ba năng lực này ĐỘC LẬP VỚI MẶT TIỀN (FR-058): hôm nay chỉ trang hỏi đáp gọi,
 * nhưng kiểu không được mang bất kỳ khái niệm nào của luồng chat.
 */

// ── searchDatasets ────────────────────────────────────────────────────────────

export interface SearchFilters {
  category?: string;
  yearFrom?: number;
  yearTo?: number;
  format?: string;
}

export interface SearchDatasetsInput {
  /**
   * Câu hỏi ĐÃ hiểu đầy đủ trong ngữ cảnh. Nếu đến từ cuộc trò chuyện nhiều lượt
   * thì phần viết lại phải xong TRƯỚC khi gọi — năng lực này không đọc lịch sử.
   */
  query: string;
  limit?: number;
  filters?: SearchFilters;
  /** Ai gọi — bắt buộc, để ghi nhận (FR-059) */
  caller: string;
}

export interface SearchHit {
  slug: string;
  title: string;
  /** 0–1, đã chuẩn hoá */
  score: number;
  /** Nhánh nào tìm ra — để soi khi kết quả sai */
  matchedBy: "semantic" | "keyword" | "both";
}

export interface SearchDatasetsResult {
  results: SearchHit[];
  /** Chỉ mục dựng lúc nào — caller biết kết quả có cũ không */
  indexBuiltAt: string;
  /** Số dataset khớp TRƯỚC khi cắt `limit` */
  total: number;
}

// ── getDataset ────────────────────────────────────────────────────────────────

export interface ColumnValueSet {
  list: string[];
  /** Số giá trị THẬT, kể cả phần không lưu */
  total: number;
  /**
   * `false` = danh sách BỊ CẮT. Caller MUST KHÔNG kết luận một giá trị không tồn
   * tại chỉ vì nó không nằm trong `list` (D5). Bỏ qua cờ này là nguồn của câu trả
   * lời "không có Đà Nẵng" sai.
   */
  complete: boolean;
}

export interface DatasetColumn {
  name: string;
  type: string;
  unit?: string;
  description?: string;
  /** Frictionless — cho caller biết cách ĐỌC số, năng lực không tự chuyển đổi */
  decimalChar?: string;
  groupChar?: string;
  /** Chỉ có với chiều phân loại */
  values?: ColumnValueSet;
}

export interface DatasetDetail {
  slug: string;
  title: string;
  description: string;
  category?: string;
  source?: string;
  /** `null` khi dataset KHÔNG có chiều thời gian — không bịa khoảng (FR-048) */
  yearRange: { from: number; to: number } | null;
  rowCount?: number;
  columns: DatasetColumn[];
}

export interface GetDatasetInput {
  slugs: string[];
  includeValues?: boolean;
  caller: string;
}

export interface GetDatasetResult {
  datasets: DatasetDetail[];
  /** Slug không tồn tại hoặc đã xoá — không đánh sập cả lượt vì một slug hỏng */
  notFound: string[];
}

// ── lookupValue ───────────────────────────────────────────────────────────────

export interface ValueLocation {
  slug: string;
  title: string;
  column: string;
}

export interface LookupValueInput {
  value: string;
  caller: string;
}

export interface LookupValueResult {
  /**
   * CHỈ được `false` khi thật sự đã tra hết. Chỉ mục chưa dựng → ném lỗi, không trả
   * `false` — đó là nói "không có" khi thực ra là "chưa biết".
   */
  found: boolean;
  display: string | null;
  /** Các cách viết thật gặp trong dữ liệu (`Qui Nhơn` / `Quy Nhơn`) */
  variants: string[];
  /** ĐẦY ĐỦ, không phải mẫu (FR-036) */
  datasets: ValueLocation[];
  /**
   * Cột có >200 giá trị nên không vào chỉ mục — chỗ CHƯA KẾT LUẬN ĐƯỢC.
   * Không rỗng thì caller phải nói "chưa tra hết", không được nói "không có".
   */
  partialColumns: { slug: string; column: string }[];
}

// ── Chỉ mục (dữ liệu sinh ra, lưu R2) ─────────────────────────────────────────

export interface RetrievalIndexEntry {
  slug: string;
  vector: number[];
  /** Chính text đã dùng để sinh vector — giữ lại để tái tạo và soi khi kết quả sai */
  text: string;
  keywords: string[];
  /** Dấu vết metadata đã dùng — so với hiện hành để PHÁT HIỆN LỆCH (D3) */
  sourceFingerprint: string;
  builtAt: string;
}

export interface RetrievalIndex {
  entries: RetrievalIndexEntry[];
  builtAt: string;
  /** Chiều vector — đọc lên để bắt trường hợp đổi model mà quên dựng lại */
  dimensions: number;
}

export interface ValueIndexEntry {
  normalized: string;
  display: string;
  variants: string[];
  datasets: { slug: string; column: string }[];
}

export interface ValueIndex {
  entries: Record<string, ValueIndexEntry>;
  /** Cột bị cắt vì quá nhiều giá trị — nguồn của `partialColumns` */
  partialColumns: { slug: string; column: string }[];
  builtAt: string;
}

/** Ném khi chỉ mục chưa dựng hoặc đọc thất bại — KHÔNG được nuốt thành kết quả rỗng. */
export class RetrievalIndexUnavailableError extends Error {
  constructor(what: string, cause?: unknown) {
    super(`Chỉ mục ${what} chưa sẵn sàng. Chạy tools/build-retrieval-index.mjs.`);
    this.name = "RetrievalIndexUnavailableError";
    this.cause = cause;
  }
}
