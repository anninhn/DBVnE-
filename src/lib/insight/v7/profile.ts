/**
 * HỒ SƠ NGỮ NGHĨA của một dataset (THIET-KE-V7 mục 3, tầng [2]).
 *
 * Mô tả dữ liệu NÓI VỀ CÁI GÌ, đủ để các phép truy vấn cơ bản (tầng [3]) tự kiểm điều
 * kiện cần — thay cho các hàm đoán theo tên/đơn vị của v6 (`isExtensive`,
 * `isNominalMoney`, `measureName`…). AI đề xuất hồ sơ; code kiểm bằng dữ liệu
 * (verify.ts); chỗ không chắc hỏi người upload. Không có hàng đợi review.
 *
 * Nguyên tắc khi thêm trường: trường phải KIỂM ĐƯỢC bằng dữ liệu hoặc bằng bảng tham
 * chiếu, hoặc được người upload xác nhận. Trường chỉ đoán được từ tên thì không thêm.
 */

/** Hình dạng — quyết định phép truy vấn nào áp được */
export type Shape =
  /** chủ thể × thời gian × số đo (bảng thống kê) */
  | "observations"
  /** mỗi dòng là một sự vật / sự kiện có thuộc tính; số liệu sinh bằng đếm / gộp */
  | "records"
  /** đối tượng có hình học (GeoJSON) */
  | "spatial"
  /** văn bản / tài liệu — chỉ tìm và trích, không tính */
  | "document";

/** Loại chủ thể — mỗi loại gắn một bảng tham chiếu (có thể chưa có) */
export type EntityKind =
  | "nation"
  | "region"
  | "province"
  | "ward"
  | "station"
  | "country"
  | "industry"
  | "organization"
  | "person"
  | "article"
  | "event"
  | "facility"
  | "other";

export interface EntityRole {
  /** Cột chứa tên / mã chủ thể */
  column: string;
  kind: EntityKind;
  /** Bảng tham chiếu dùng để quy mã (vd "vn-admin-63", "vn-admin-34", "vn-ward-2025"); null = chưa có */
  gazetteer: string | null;
  /** Các giá trị trong cột là CẤP KHÁC (vd "Cả nước", tên vùng lẫn trong cột tỉnh) */
  mixedLevels?: boolean;
}

export type TimeGrain = "year" | "quarter" | "month" | "day" | "school_year" | "period" | "none";

export interface TimeRole {
  /** Cột thời gian; null khi thời gian nằm trong tên cột hoặc là một mốc cố định của cả file */
  column: string | null;
  grain: TimeGrain;
  /** Mốc cố định khi cả file là một thời điểm (vd "6/2026") */
  fixed?: string;
  /** Cột đánh dấu số sơ bộ, hoặc cách nhận ra (vd hậu tố "Sơ bộ" trong giá trị năm) */
  provisionalMarker?: string | null;
}

/** Loại số đo — quyết định cộng / chia / so được thế nào */
export type MeasureKind =
  /** đếm (vụ, người, trường…) — cộng được theo chủ thể */
  | "count"
  /** lượng vật lý (ha, tấn, mm…) */
  | "amount"
  /** tiền */
  | "money"
  /** tỷ lệ / tỷ suất / % — KHÔNG cộng, gộp phải có mẫu số */
  | "rate"
  /** bình quân (bình quân đầu người, trung bình) — KHÔNG cộng */
  | "average"
  /** chỉ số (năm gốc = 100, hệ số GINI, HDI) */
  | "index"
  /** tốc độ tăng / thay đổi so với kỳ trước */
  | "growth"
  /** thuộc tính văn bản / phân loại, không phải số đo */
  | "attribute";

export interface MeasureRole {
  column: string;
  /** Tên chỉ tiêu đầy đủ, GIỮ định ngữ ("số vụ ly hôn đã xét xử") */
  name: string;
  kind: MeasureKind;
  /** Đơn vị như ghi; null = không rõ */
  unit: string | null;
  /** Hệ số so với đơn vị gốc (vd "nghìn người" → 1000, đơn vị gốc "người") */
  unitMultiplier?: number;
  /** Cộng được theo chủ thể (tỉnh → vùng → cả nước) */
  additive: boolean;
  /** Với tỷ lệ / bình quân: mẫu số là gì (chữ), để biết gộp thế nào */
  denominator?: string | null;
  /** Với tiền: giá hiện hành / giá so sánh năm X / không áp dụng */
  priceBasis?: "current" | "constant" | "n/a";
  /** Chuẩn đo / phương pháp nếu biết (vd "chuẩn nghèo đa chiều 2021–2025") */
  standard?: string | null;
  /** Mã chỉ tiêu chung (bảng mã nhẹ, lớn dần); null = chưa quy mã */
  indicatorCode?: string | null;
  /** Cột này bằng tổng các cột khác (vd "Tổng số" = "Cấp tỉnh" + "Cấp huyện") — kiểm được bằng dữ liệu */
  sumOf?: string[];
}

export interface DimensionRole {
  column: string;
  /** Giá trị là tổng của các giá trị còn lại (vd "Tổng số", "Chung") — null nếu không có */
  totalValue: string | null;
  /** Các giá trị là phân tổ con không cộng thành tổng (vd nhóm tuổi chồng lấn) */
  notAdditiveAcross?: boolean;
}

export interface Profile {
  slug: string;
  /** File / sheet mà hồ sơ mô tả (một dataset có thể nhiều) */
  part: string;
  shape: Shape;
  /** Tidy: mỗi dòng một quan sát. Không tidy (năm thành cột, header nhiều tầng…) thì cần cách đọc [1] */
  tidy: boolean;
  /** Ghi chú cách đọc khi không tidy (header dòng mấy, cột nào là năm…) */
  readingNote?: string;
  entity: EntityRole | null;
  time: TimeRole | null;
  measures: MeasureRole[];
  dimensions: DimensionRole[];
  /** Các cột còn lại và vai trò (ghi chú, mã, đường dẫn…) */
  otherColumns?: Record<string, string>;
  /** Điều đáng chú ý cho người dùng dữ liệu (đổi chuẩn, năm thiếu, chỉ một phần…) */
  caveats?: string[];
}

/** Nhãn đúng của một hồ sơ — kèm độ chắc của người gắn và trạng thái duyệt */
export interface GoldLabel {
  profile: Profile;
  /** Trường mình không chắc khi gắn — cần người duyệt xem kỹ */
  unsure: string[];
  reviewed: "chua_duyet" | "dong_y" | "sua";
  reviewerNote?: string;
}
