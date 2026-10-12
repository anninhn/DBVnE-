/**
 * Harness v8 — CHỮ KÝ GIAO DIỆN (dạng 3 của thiết kế, xem prototypes/insight-demo/v8/).
 * Chỉ có kiểu và chữ ký; chưa có cài đặt.
 *
 * MÔ HÌNH META KHÔNG GẮN LĨNH VỰC, theo khung dữ liệu Wikibase (Wikidata):
 * thực thể · thuộc tính · giá trị có kiểu · qualifier · nguồn · rank.
 * Không có enum lĩnh vực / nhóm / ban trong lõi — loại thực thể và thuộc tính là
 * TỪ VỰNG MỞ, lớn dần khi gặp (đề xuất bởi bước trích, kiểm, rồi mới thêm).
 * Phép tính định nghĩa theo KIỂU GIÁ TRỊ, không theo lĩnh vực.
 *
 * QUY TẮC ỔN ĐỊNH: nguồn / vấn đề mới chỉ được làm thay đổi TỪ VỰNG (khai báo) hoặc PLUGIN
 * (bộ đọc, phép tính, hình minh hoạ — thêm, không sửa). Sửa phần LÕI = thiết kế sai, phải ghi lý do.
 * Như Wikidata: tên, bí danh, mã ngoài, "thuộc", ranh giới… đều là NHẬN ĐỊNH, không phải trường của thực thể.
 */

// ════════════════════════════ LÕI ════════════════════════════

// ── Từ vựng mở ──

/** Thực thể bất kỳ — chỉ id + loại. Tên, bí danh, mã ngoài (mã CK, MST, ISO3), "thuộc" (tỉnh, ngành),
 *  ranh giới… đều là Statement với thuộc tính tương ứng (P:label, P:alias, P:ma_ck, P:thuoc, P:ranh_gioi…). */
export interface Entity {
  id: string; // "E:<loại>:<khoá>"
  type: string; // loại thực thể — từ vựng mở
}

export type ValueType = "quantity" | "time" | "entity" | "text" | "geo" | "shape" | "id";

/** Thuộc tính — từ vựng mở; mỗi thuộc tính khai KIỂU giá trị và (nếu là lượng) cách gộp */
export interface Property {
  id: string; // "P:<khoá>" — vd "P:loi_nhuan_sau_thue", "P:so_ca_mac", "P:muc_phat"
  label: string;
  aliases: string[];
  valueType: ValueType;
  /** Chỉ cho lượng: đơn vị chuẩn và cách gộp theo thực thể (cộng / không cộng / cần mẫu số) */
  quantity?: { unitStd: string; aggregate: "sum" | "none" | "weighted"; denominator?: string };
  /** Nhãn tự do (lĩnh vực, ban…) — KHÔNG dùng trong lõi */
  tags?: string[];
}

// ── Giá trị có kiểu ──

export type Value =
  | { type: "quantity"; amount: number; low?: number; high?: number; unit: string; raw: string }
  | { type: "time"; at: string; precision: "day" | "month" | "quarter" | "year"; raw: string }
  | { type: "entity"; entity: string; raw: string }
  | { type: "text"; text: string; lang: string }
  | { type: "geo"; lat: number; lon: number }
  /** Hình (đa giác / tuyến) — tham chiếu tới feature trong một tài sản GeoJSON, không chép hình học */
  | { type: "shape"; asset: string; featureId: string }
  /** Mã / định danh ngoài, URL */
  | { type: "id"; scheme: string; value: string };

// ── Qualifier — tinh chỉnh nghĩa của nhận định; bỏ qualifier là đổi nghĩa ──
// Giá trị của kind / meas / cmp lấy từ kd-data-demand (khái niệm không gắn lĩnh vực).

export interface Qualifiers {
  /** Kỳ / thời điểm / hiệu lực */
  period?: { start: string; end: string; label: string };
  /** Bản chất con số */
  kind?: "actual" | "estimate" | "forecast" | "target" | "proposed" | "rule" | "offer";
  /** Loại số đo (với lượng) */
  meas?: "level" | "change_pct" | "change_abs" | "multiple" | "share" | "rank" | "ratio";
  /** Mốc so sánh khi meas là thay đổi / bội số */
  cmp?: "yoy" | "mom" | "qoq" | "wow" | "dod" | "ytd" | "vs_target" | "vs_peak" | "vs_other" | "unspecified";
  /** Phạm vi áp dụng / phân tổ (vd "thành thị", "nhóm tuổi 15–24", "hàng nhập từ Mỹ") — thực thể hoặc chữ */
  scope?: Record<string, string>;
}

// ── Nguồn ──

export type PublisherType =
  | "stat_office" | "ministry_agency" | "central_bank" | "exchange" | "company_report" | "company_person"
  | "association" | "intl_org" | "securities_firm" | "data_vendor" | "research_consulting" | "news_agency"
  | "expert" | "legal_doc" | "informal" | "field_obs" | "newsroom" | "unknown";

export interface Reference {
  /** Nơi phát hành gốc nếu truy được */
  origin: { publisher: string | null; type: PublisherType };
  /** Nơi lấy số (có thể là trung gian: bài báo, hãng tin) + vị trí */
  via: { doc: string; location: string; type: PublisherType };
}

// ── Nhận định ──

export interface Statement {
  id: string;
  subject: string; // Entity.id
  property: string; // Property.id
  value: Value;
  qualifiers: Qualifiers;
  references: Reference[];
  /** preferred = nguồn được ưu tiên khi nhiều nguồn lệch; deprecated = đã bị thay / sai */
  rank: "preferred" | "normal" | "deprecated";
  check: Verification;
}

// ── Xác minh KHÔNG cần nhiều nguồn (khoảng trống của field: số mới thường chỉ có một nguồn) ──

export interface Verification {
  /** Giá trị có thật trong đoạn nguồn (code) */
  inSource: boolean;
  /** Đã lần tới nơi phát hành gốc và kiểm lại ở đó */
  atOrigin: boolean;
  /** Số học của lượng: mức ↔ thay đổi, tổng ↔ thành phần, kỳ ↔ kỳ con — kết quả từng phép */
  arithmetic: { rule: string; ok: boolean; with: string[] }[];
  /** So với chuỗi đã lưu của cùng thực thể + thuộc tính (nhảy bất thường, đổi đơn vị ngầm) */
  series: { ok: boolean; note?: string } | null;
  corroboratedBy: string[];
  conflictsWith: string[];
  /** Phóng viên đã dùng và xác nhận trong bài */
  confirmedIn: string[];
  /** Trạng thái tổng hợp hiện cho phóng viên */
  status: "verified_origin" | "intermediary_only" | "single_source_unchecked" | "conflict" | "unverified_new_doc";
}

/** Sổ nguồn gốc: thuộc tính → nơi phát hành gốc → mẫu tài liệu — học từ trích dẫn trong bài đã đăng */
export interface SourceRegistryEntry {
  property: string;
  publisher: string;
  publisherType: PublisherType;
  templates: string[]; // id ReadingSpec
  cadence?: string; // nhịp công bố (hằng ngày, hằng quý…)
  evidenceArticles: number; // số bài đã trích dẫn nơi này cho thuộc tính này
}

/** Cách đọc theo MẪU tài liệu của một nơi phát hành — học một lần, dùng lại cho các kỳ sau */
export interface ReadingSpec {
  id: string;
  publisher: string;
  format: SourceFormat;
  /** Đặc tả JSON do code thực thi: sheet/trang, dòng header, dòng nhóm, xoay cột năm, ánh xạ cột → thuộc tính / thực thể / qualifier */
  steps: unknown[];
  verifiedOn: string[]; // sha các tài liệu đã chạy đúng
}

// ════════════ GIAO DIỆN MỞ RỘNG — lõi giữ giao diện; mỗi bộ đọc / phép tính cụ thể là plugin ════════════

// ── Tầng tiếp nhận: bộ đọc theo ĐỊNH DẠNG / KÊNH, không theo ban ──

export type SourceFormat = "csv" | "xlsx" | "pdf" | "html" | "feed" | "geojson" | "article_text";

export interface SourceAdapter {
  format: SourceFormat;
  discover(since: string): Promise<DocRef[]>;
  /** Đọc thành đoạn có vị trí (trang/bảng/ô/dòng) — KHÔNG gọi AI */
  read(doc: DocRef): Promise<Passage[]>;
}

export interface DocRef { id: string; format: SourceFormat; url: string; sha: string; publishedAt: string }
export interface Passage { doc: string; location: string; text: string; table?: string[][] }

/** AI trích: chỉ dùng thuộc tính / loại thực thể có trong snippet; cái chưa có → ĐỀ XUẤT mới (không tự thêm) */
export type Extract = (passage: Passage, snippet: VocabSnippet) => Promise<{ candidates: Candidate[]; proposals: VocabProposal[] }>;
/** Gate code: giá trị có thật trong đoạn nguồn, kiểu giá trị đúng, đơn vị / thời điểm đọc được */
export type Ground = (c: Candidate, passage: Passage) => { ok: boolean; reasons: string[] };
/** Quy thực thể + thuộc tính về id, chuẩn hoá đơn vị, đối chiếu nhận định đã có → nhận định + rank */
export type Commit = (c: Candidate) => Promise<Statement>;

export interface Candidate {
  subjectText: string;
  propertyText: string;
  value: Value;
  qualifiers: Qualifiers;
  reference: Reference;
  evidence: string;
}

/** Từ vựng lớn dần: đề xuất thuộc tính / loại thực thể mới khi gặp, kèm bằng chứng; kiểm trùng nghĩa trước khi thêm */
export interface VocabProposal {
  kind: "property" | "entity_type";
  label: string;
  valueType?: ValueType;
  evidence: string[];
  nearest: string[]; // id gần nghĩa đã có — để kiểm trùng
}

/** Phần từ vựng đưa vào prompt (như ontology snippet của ODKE+) — sinh tự động theo đoạn văn */
export interface VocabSnippet {
  properties: Pick<Property, "id" | "label" | "aliases" | "valueType" | "quantity">[];
  entityTypes: string[];
}

// ── Tầng trả lời ──

export interface Plan {
  asks: { what: string; subjects: string[]; time?: string; compare?: string }[];
}

export interface Result {
  value?: Value;
  statements: Statement[];
  /** Nhận định đã tính bằng code (hướng, kỷ lục, hoà, hạng…) — chỗ trống cho lời văn */
  claims: Record<string, string>;
  /** Không đủ điều kiện → lý do có cấu trúc (thẻ phạm vi gom lại) */
  unmet?: string;
}

/** Phép tính theo KIỂU GIÁ TRỊ — mỗi phép khai điều kiện cần bằng Property / Entity, không bằng lĩnh vực */
export interface QuantityOps {
  latest(p: string, s: string, asOf?: string): Result;
  change(p: string, s: string, t1: string, t2: string): Result;
  record(p: string, s: string): Result; // cao / thấp nhất kể từ, hoà
  trend(p: string, s: string): Result; // các đoạn đổi chiều
  rank(p: string, peers: { type: string; within?: string }, at: string): Result; // within: thực thể cha qua P:thuoc
  compare(p: string, subjects: string[], at: string): Result;
  planVsActual(p: string, s: string, period: string): Result; // qualifier kind = target vs actual
  relation(x: string, y: string, peers: { type: string }, at: string): Result;
  /** Gộp / quy đổi theo nhận định P:thuoc (có qualifier thời gian) — chỉ khi aggregate = sum, hoặc weighted có mẫu số */
  aggregate(p: string, to: { type: string }, at: string): Result;
}

export interface TimeOps {
  between(p: string, s: string): Result; // khoảng thời gian
  inForce(p: string, s: string, at: string): Result; // quy định đang hiệu lực tại thời điểm
}

export interface EntityOps {
  related(s: string, p: string): Result; // ai sở hữu, thuộc đâu, ai ban hành
}

export interface TextOps {
  quote(s: string, topic: string): Result; // trích dẫn có nguồn, không tính toán
}

export interface Card {
  title: string;
  text: string;
  statements: Statement[];
  scope: { answered: string[]; notYet: string[]; missing: string[]; onlyIntermediary: string[]; singleSource: string[]; conflicts: string[]; stale: string[] };
}


/** Phóng viên bấm "dùng số này" khi viết — xác nhận nằm trong luồng làm việc, không phải hàng đợi */
export type Confirm = (statementId: string, articleId: string) => Promise<void>;

// ════════════════════════════ PLUGIN (thêm, không sửa lõi) ════════════════════════════

/** Tài sản không gian: một file GeoJSON đóng vai bảng tham chiếu (ranh giới) hoặc nguồn dữ liệu (điểm, tuyến) */
export interface GeoAsset {
  id: string; // vd "geo:vn-province-34", "geo:vn-ward-2025", "geo:power-grid-osm"
  role: "boundary" | "data";
  entityType: string; // loại thực thể mỗi feature đại diện
  idProperty: string; // thuộc tính feature dùng làm khoá
  validFrom?: string;
  sourceDataset: string; // slug trong kho
}

// ── Hiển thị: code chọn và vẽ — không phải AI ──

export type VisualSpec =
  | { kind: "line"; property: string; subject: string; points: [string, number][]; marks?: string[] }
  | { kind: "bar"; property: string; at: string; rows: { subject: string; value: number }[] }
  | { kind: "choropleth"; property: string; at: string; asset: string; values: Record<string, number> }
  | { kind: "points"; asset: string; features: string[]; colorBy?: string };

/** Chọn hình minh hoạ theo PHÉP và KIỂU THỰC THỂ: trend → line; rank/compare → bar;
 *  compare giữa thực thể có nhận định P:ranh_gioi (giá trị shape) cùng tài sản → choropleth; danh sách có toạ độ → points.
 *  Điều kiện cần: số và ranh giới cùng danh mục (vd số 63 tỉnh không vẽ lên ranh giới 34 nếu không quy đổi được). */
export type Visualize = (r: Result, op: string) => { spec?: VisualSpec; unmet?: string };

/** Bản nháp bài cho phóng viên: tít + đoạn (AI-3 quanh chỗ trống) + hình (code) + nguồn từng số — KHÔNG tự đăng */
export interface Draft { cards: Card[]; visuals: VisualSpec[]; sources: Reference[] }
