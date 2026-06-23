/**
 * Mock dataset library — dùng tạm cho Phase 1 visual prototype.
 * Chưa đụng DB/API. Khi chốt hướng đi, dữ liệu thật sẽ từ Supabase
 * (bảng datasets + resources + data_dictionary) thay thế file này.
 *
 * Cấu trúc bám theo constitution/tech-stack.md (datasets-centric model),
 * không bám theo entity-centric schema hiện tại trong DB.
 */

// ──────────────────────────────────────────────────────────────────────────────
// Types — khớp intent với tech-stack.md Data Model
// ──────────────────────────────────────────────────────────────────────────────

export type ResourceType =
  | "data"
  | "document"
  | "audio"
  | "geo_layer"
  | "image";

export type FileType = "csv" | "xlsx" | "pdf" | "mp3" | "geojson" | "json";

export type Category =
  | "kinh-te"
  | "xa-hoi"
  | "chinh-tri"
  | "khi-hau"
  | "ha-tang";

export interface DataDictionaryEntry {
  column_name: string;
  label_vi: string;
  data_type: "int" | "float" | "text" | "date";
  unit?: string;
  description?: string;
  source?: string;
}

export interface Resource {
  id: number;
  resource_type: ResourceType;
  title: string;
  description?: string;
  file_url?: string;
  file_type?: FileType;
  file_size_mb?: number;
  /** Preview rows (first N) — DataTable render từ đây */
  structured_data?: Record<string, string | number | null>[];
  /** Column order override; fallback = keys của structured_data[0] */
  columns?: string[];
  tags?: string[];
  year?: number;
  uploaded_by: string;
  uploaded_at: string; // ISO
}

export interface Dataset {
  slug: string;
  title: string;
  description: string;
  category: Category;
  tags: string[];
  license: "internal" | "public" | "restricted";
  year_range: number[];
  row_count: number;
  file_count: number;
  total_size_mb: number;
  downloads: number;
  likes: number;
  source: string;
  uploaded_by: string;
  uploaded_at: string; // ISO
  resources: Resource[];
  data_dictionary: DataDictionaryEntry[];
}

// ──────────────────────────────────────────────────────────────────────────────
// Hero dataset — Hồ sơ 34 tỉnh thành 2025 (seed data thật của dự án)
// ──────────────────────────────────────────────────────────────────────────────

const provinceStatsColumns: DataDictionaryEntry[] = [
  { column_name: "entity_id", label_vi: "Mã tỉnh", data_type: "text", description: "Mã định danh tỉnh sau sáp nhập (VD: VN-HCM)" },
  { column_name: "entity_name", label_vi: "Tên tỉnh", data_type: "text", source: "Thongtintinhthanh.TinhThanh" },
  { column_name: "region", label_vi: "Vùng kinh tế", data_type: "text" },
  { column_name: "population", label_vi: "Dân số", data_type: "int", unit: "người", source: "Thongtintinhthanh.Danso" },
  { column_name: "area", label_vi: "Diện tích", data_type: "float", unit: "km²", source: "Thongtintinhthanh.Dientich" },
  { column_name: "density", label_vi: "Mật độ", data_type: "float", unit: "người/km²", description: "Tính = population / area" },
  { column_name: "num_wards", label_vi: "Số đơn vị cấp xã", data_type: "int", unit: "đơn vị", source: "Thongtintinhthanh.SoDVHCcapxa" },
  { column_name: "grdp", label_vi: "GRDP", data_type: "float", unit: "tỷ đồng", source: "Thongtintinhthanh.GRDP" },
  { column_name: "budget_revenue", label_vi: "Thu ngân sách", data_type: "float", unit: "tỷ đồng", source: "Thongtintinhthanh.Thungansach" },
  { column_name: "rank_grdp", label_vi: "Hạng GRDP", data_type: "int", source: "Thongtintinhthanh.ThuhangGRDP" },
  { column_name: "is_merged", label_vi: "Có sáp nhập", data_type: "text", description: "Có / Không" },
];

// 34 dòng province_stats (số liệu minh hoạ dựa trên Excel 34tinhthanh)
const provinceStatsRows: Record<string, string | number | null>[] = [
  { entity_id: "VN-HCM", entity_name: "TP Hồ Chí Minh", region: "Đông Nam Bộ", population: 14002598, area: 6773, density: 2067, num_wards: 168, grdp: 2715782, budget_revenue: 581700, rank_grdp: 1, is_merged: "Có" },
  { entity_id: "VN-HN", entity_name: "Hà Nội", region: "Đồng bằng sông Hồng", population: 8957600, area: 3359, density: 2667, num_wards: 57, grdp: 1670000, budget_revenue: 410000, rank_grdp: 2, is_merged: "Không" },
  { entity_id: "VN-DNai", entity_name: "Đồng Nai", region: "Đông Nam Bộ", population: 4928000, area: 5938, density: 830, num_wards: 117, grdp: 612000, budget_revenue: 92000, rank_grdp: 3, is_merged: "Có" },
  { entity_id: "VN-DN", entity_name: "Đà Nẵng", region: "Nam Trung Bộ", population: 3120000, area: 11856, density: 263, num_wards: 103, grdp: 472000, budget_revenue: 67000, rank_grdp: 4, is_merged: "Có" },
  { entity_id: "VN-HP", entity_name: "Hải Phòng", region: "Đồng bằng sông Hồng", population: 4020000, area: 3125, density: 1286, num_wards: 79, grdp: 368000, budget_revenue: 78000, rank_grdp: 5, is_merged: "Có" },
  { entity_id: "VN-CT", entity_name: "Cần Thơ", region: "Đồng bằng sông Cửu Long", population: 4190000, area: 6898, density: 607, num_wards: 100, grdp: 305000, budget_revenue: 45000, rank_grdp: 6, is_merged: "Có" },
  { entity_id: "VN-BNH", entity_name: "Bắc Ninh", region: "Đồng bằng sông Hồng", population: 4350000, area: 4645, density: 936, num_wards: 75, grdp: 296000, budget_revenue: 51000, rank_grdp: 7, is_merged: "Có" },
  { entity_id: "VN-QNI", entity_name: "Quảng Ninh", region: "Trung du và miền núi phía Bắc", population: 1780000, area: 6177, density: 288, num_wards: 56, grdp: 275000, budget_revenue: 56000, rank_grdp: 8, is_merged: "Không" },
  { entity_id: "VN-VH", entity_name: "Nghệ An", region: "Bắc Trung Bộ", population: 3440000, area: 16481, density: 209, num_wards: 184, grdp: 242000, budget_revenue: 36000, rank_grdp: 9, is_merged: "Không" },
  { entity_id: "VN-DT", entity_name: "Đồng Tháp", region: "Đồng bằng sông Cửu Long", population: 3470000, area: 5597, density: 620, num_wards: 107, grdp: 196000, budget_revenue: 24000, rank_grdp: 10, is_merged: "Có" },
  { entity_id: "VN-HH", entity_name: "Thanh Hoá", region: "Bắc Trung Bộ", population: 4010000, area: 11139, density: 360, num_wards: 178, grdp: 188000, budget_revenue: 28000, rank_grdp: 11, is_merged: "Không" },
  { entity_id: "VN-AG", entity_name: "An Giang", region: "Đồng bằng sông Cửu Long", population: 4750000, area: 8399, density: 565, num_wards: 113, grdp: 178000, budget_revenue: 22000, rank_grdp: 12, is_merged: "Có" },
  { entity_id: "VN-TN", entity_name: "Tây Ninh", region: "Đông Nam Bộ", population: 3010000, area: 8852, density: 340, num_wards: 79, grdp: 176000, budget_revenue: 26000, rank_grdp: 13, is_merged: "Có" },
  { entity_id: "VN-PT", entity_name: "Phú Thọ", region: "Trung du và miền núi phía Bắc", population: 3760000, area: 9117, density: 412, num_wards: 123, grdp: 172000, budget_revenue: 23000, rank_grdp: 14, is_merged: "Có" },
  { entity_id: "VN-NA", entity_name: "Ninh Bình", region: "Đồng bằng sông Hồng", population: 3760000, area: 3763, density: 999, num_wards: 70, grdp: 162000, budget_revenue: 21000, rank_grdp: 15, is_merged: "Có" },
  { entity_id: "VN-KH", entity_name: "Khánh Hòa", region: "Nam Trung Bộ", population: 2270000, area: 8902, density: 255, num_wards: 75, grdp: 156000, budget_revenue: 22000, rank_grdp: 16, is_merged: "Có" },
  { entity_id: "VN-GL", entity_name: "Gia Lai", region: "Tây Nguyên", population: 3120000, area: 15580, density: 200, num_wards: 131, grdp: 152000, budget_revenue: 18000, rank_grdp: 17, is_merged: "Có" },
  { entity_id: "VN-VL", entity_name: "Vĩnh Long", region: "Đồng bằng sông Cửu Long", population: 3460000, area: 4401, density: 786, num_wards: 89, grdp: 144000, budget_revenue: 18000, rank_grdp: 18, is_merged: "Có" },
  { entity_id: "VN-DL", entity_name: "Đắk Lắk", region: "Tây Nguyên", population: 3060000, area: 13125, density: 233, num_wards: 122, grdp: 138000, budget_revenue: 17000, rank_grdp: 19, is_merged: "Có" },
  { entity_id: "VN-LD", entity_name: "Lâm Đồng", region: "Tây Nguyên", population: 3010000, area: 15303, density: 197, num_wards: 118, grdp: 132000, budget_revenue: 16000, rank_grdp: 20, is_merged: "Có" },
  { entity_id: "VN-LC", entity_name: "Lào Cai", region: "Trung du và miền núi phía Bắc", population: 2050000, area: 13447, density: 152, num_wards: 81, grdp: 96000, budget_revenue: 11000, rank_grdp: 21, is_merged: "Có" },
  { entity_id: "VN-CH", entity_name: "Cà Mau", region: "Đồng bằng sông Cửu Long", population: 2190000, area: 7972, density: 275, num_wards: 71, grdp: 92000, budget_revenue: 11000, rank_grdp: 22, is_merged: "Có" },
  { entity_id: "VN-TQ", entity_name: "Tuyên Quang", region: "Trung du và miền núi phía Bắc", population: 1640000, area: 11280, density: 145, num_wards: 67, grdp: 88000, budget_revenue: 9000, rank_grdp: 23, is_merged: "Có" },
  { entity_id: "VN-HY", entity_name: "Hưng Yên", region: "Đồng bằng sông Hồng", population: 2790000, area: 2631, density: 1060, num_wards: 67, grdp: 86000, budget_revenue: 12000, rank_grdp: 24, is_merged: "Có" },
  { entity_id: "VN-QN", entity_name: "Quảng Ngãi", region: "Nam Trung Bộ", population: 2150000, area: 12107, density: 178, num_wards: 86, grdp: 82000, budget_revenue: 10000, rank_grdp: 25, is_merged: "Có" },
  { entity_id: "VN-QT", entity_name: "Quảng Trị", region: "Bắc Trung Bộ", population: 1450000, area: 11424, density: 127, num_wards: 71, grdp: 64000, budget_revenue: 7000, rank_grdp: 26, is_merged: "Có" },
  { entity_id: "VN-SL", entity_name: "Sơn La", region: "Trung du và miền núi phía Bắc", population: 1410000, area: 14174, density: 99, num_wards: 76, grdp: 60000, budget_revenue: 7000, rank_grdp: 27, is_merged: "Không" },
  { entity_id: "VN-TN2", entity_name: "Thái Nguyên", region: "Trung du và miền núi phía Bắc", population: 1680000, area: 5402, density: 311, num_wards: 73, grdp: 58000, budget_revenue: 8000, rank_grdp: 28, is_merged: "Có" },
  { entity_id: "VN-DB", entity_name: "Điện Biên", region: "Trung du và miền núi phía Bắc", population: 760000, area: 9540, density: 80, num_wards: 56, grdp: 38000, budget_revenue: 4000, rank_grdp: 29, is_merged: "Không" },
  { entity_id: "VN-HUE", entity_name: "TP Huế", region: "Bắc Trung Bộ", population: 1230000, area: 5033, density: 244, num_wards: 60, grdp: 56000, budget_revenue: 7000, rank_grdp: 30, is_merged: "Không" },
  { entity_id: "VN-CB", entity_name: "Cao Bằng", region: "Trung du và miền núi phía Bắc", population: 580000, area: 6700, density: 87, num_wards: 49, grdp: 30000, budget_revenue: 3000, rank_grdp: 31, is_merged: "Không" },
  { entity_id: "VN-HT", entity_name: "Hà Tĩnh", region: "Bắc Trung Bộ", population: 1660000, area: 5990, density: 277, num_wards: 78, grdp: 54000, budget_revenue: 6000, rank_grdp: 32, is_merged: "Không" },
  { entity_id: "VN-LS", entity_name: "Lạng Sơn", region: "Trung du và miền núi phía Bắc", population: 830000, area: 8310, density: 100, num_wards: 58, grdp: 42000, budget_revenue: 5000, rank_grdp: 33, is_merged: "Không" },
  { entity_id: "VN-LC2", entity_name: "Lai Châu", region: "Trung du và miền núi phía Bắc", population: 510000, area: 9025, density: 56, num_wards: 49, grdp: 26000, budget_revenue: 3000, rank_grdp: 34, is_merged: "Không" },
];

const wardsColumns: DataDictionaryEntry[] = [
  { column_name: "entity_id", label_vi: "Mã tỉnh", data_type: "text" },
  { column_name: "ward_name", label_vi: "Tên xã/phường", data_type: "text" },
  { column_name: "ward_type", label_vi: "Loại", data_type: "text", description: "Xã / Phường / Thị trấn" },
  { column_name: "old_wards", label_vi: "Xã phường cũ", data_type: "text", description: "Danh sách trước sáp nhập" },
  { column_name: "population", label_vi: "Dân số", data_type: "int", unit: "người" },
  { column_name: "area", label_vi: "Diện tích", data_type: "float", unit: "km²" },
  { column_name: "density", label_vi: "Mật độ", data_type: "float", unit: "người/km²" },
  { column_name: "hq_name", label_vi: "Trụ sở hành chính", data_type: "text" },
];

// 8 dòng wards mẫu (preview — dữ liệu thật có 168 xã/phường HCMC)
const wardsRows: Record<string, string | number | null>[] = [
  { entity_id: "VN-HCM", ward_name: "Phường Bến Nghé", ward_type: "Phường", old_wards: "Phường Bến Nghé, Phường Bến Thành", population: 45200, area: 3.21, density: 14081, hq_name: "UBND Phường Bến Nghé" },
  { entity_id: "VN-HCM", ward_name: "Phường Sài Gòn", ward_type: "Phường", old_wards: "Phường Nguyễn Thái Bình, Phường Phạm Ngũ Lão, Phường Cô Giang", population: 68900, area: 4.55, density: 15143, hq_name: "UBND Phường Sài Gòn" },
  { entity_id: "VN-HCM", ward_name: "Phường Ba Son", ward_type: "Phường", old_wards: "Phường Bến Nghé (một phần), Phường Đa Kao", population: 38500, area: 2.88, density: 13368, hq_name: "UBND Phường Ba Son" },
  { entity_id: "VN-HCM", ward_name: "Phường Chợ Lớn", ward_type: "Phường", old_wards: "Phường Nguyễn Thái Học, Phường Châu Văn Liêm", population: 72100, area: 5.12, density: 14082, hq_name: "UBND Phường Chợ Lớn" },
  { entity_id: "VN-HCM", ward_name: "Phường An Đông", ward_type: "Phường", old_wards: "Phường 9, Phường 10, Phường 11 (Quận 5)", population: 95400, area: 6.78, density: 14071, hq_name: "UBND Phường An Đông" },
  { entity_id: "VN-HCM", ward_name: "Phường Bình Thọ", ward_type: "Phường", old_wards: "Phường Bình Thọ, Phường Trường Thọ", population: 118000, area: 8.45, density: 13964, hq_name: "UBND Phường Bình Thọ" },
  { entity_id: "VN-HCM", ward_name: "Phường Hiệp Bình", ward_type: "Phường", old_wards: "Phường Hiệp Bình Chánh, Phường Hiệp Phú", population: 132500, area: 9.12, density: 14528, hq_name: "UBND Phường Hiệp Bình" },
  { entity_id: "VN-HCM", ward_name: "Phường An Khánh", ward_type: "Phường", old_wards: "Phường An Phú, Phường An Khánh (TP Thủ Đức cũ)", population: 145000, area: 10.2, density: 14216, hq_name: "UBND Phường An Khánh" },
];

const leadershipColumns: DataDictionaryEntry[] = [
  { column_name: "entity_id", label_vi: "Mã tỉnh", data_type: "text" },
  { column_name: "entity_name", label_vi: "Tỉnh", data_type: "text" },
  { column_name: "role", label_vi: "Chức vụ", data_type: "text", description: "bí thư / chủ tịch" },
  { column_name: "title", label_vi: "Chức danh đầy đủ", data_type: "text" },
  { column_name: "name", label_vi: "Họ tên", data_type: "text" },
];

const leadershipRows: Record<string, string | number | null>[] = [
  { entity_id: "VN-HCM", entity_name: "TP Hồ Chí Minh", role: "bí thư", title: "Bí thư Thành ủy", name: "Nguyễn Văn Nên" },
  { entity_id: "VN-HCM", entity_name: "TP Hồ Chí Minh", role: "chủ tịch", title: "Chủ tịch UBND TP", name: "Phan Văn Mãi" },
  { entity_id: "VN-HN", entity_name: "Hà Nội", role: "bí thư", title: "Bí thư Thành ủy", name: "Bùi Thị Minh Hoài" },
  { entity_id: "VN-HN", entity_name: "Hà Nội", role: "chủ tịch", title: "Chủ tịch UBND TP", name: "Trần Sỹ Thanh" },
  { entity_id: "VN-DN", entity_name: "Đà Nẵng", role: "bí thư", title: "Bí thư Thành ủy", name: "Nguyễn Văn Quang" },
  { entity_id: "VN-DN", entity_name: "Đà Nẵng", role: "chủ tịch", title: "Chủ tịch UBND TP", name: "Lê Trung Chinh" },
  { entity_id: "VN-HP", entity_name: "Hải Phòng", role: "bí thư", title: "Bí thư Thành ủy", name: "Lê Tiến Châu" },
  { entity_id: "VN-HP", entity_name: "Hải Phòng", role: "chủ tịch", title: "Chủ tịch UBND TP", name: "Nguyễn Văn Tùng" },
];

// ──────────────────────────────────────────────────────────────────────────────
// Các dataset khác (mock) — để card grid có nội dung
// ──────────────────────────────────────────────────────────────────────────────

const grdpColumns: DataDictionaryEntry[] = [
  { column_name: "entity_id", label_vi: "Mã tỉnh", data_type: "text" },
  { column_name: "entity_name", label_vi: "Tỉnh", data_type: "text" },
  { column_name: "grdp_2020", label_vi: "GRDP 2020", data_type: "float", unit: "tỷ đồng" },
  { column_name: "grdp_2021", label_vi: "GRDP 2021", data_type: "float", unit: "tỷ đồng" },
  { column_name: "grdp_2022", label_vi: "GRDP 2022", data_type: "float", unit: "tỷ đồng" },
  { column_name: "grdp_2023", label_vi: "GRDP 2023", data_type: "float", unit: "tỷ đồng" },
  { column_name: "grdp_2024", label_vi: "GRDP 2024", data_type: "float", unit: "tỷ đồng" },
  { column_name: "growth_avg", label_vi: "Tăng trưởng TB", data_type: "float", unit: "%" },
];

const fdiColumns: DataDictionaryEntry[] = [
  { column_name: "entity_id", label_vi: "Mã tỉnh", data_type: "text" },
  { column_name: "entity_name", label_vi: "Tỉnh", data_type: "text" },
  { column_name: "projects", label_vi: "Dự án FDI", data_type: "int", unit: "dự án" },
  { column_name: "registered_capital", label_vi: "Vốn đăng ký", data_type: "float", unit: "triệu USD" },
  { column_name: "disbursed_capital", label_vi: "Vốn giải ngân", data_type: "float", unit: "triệu USD" },
];

// ──────────────────────────────────────────────────────────────────────────────
// Datasets
// ──────────────────────────────────────────────────────────────────────────────

export const datasets: Dataset[] = [
  {
    slug: "ho-so-34-tinh-thanh-2025",
    title: "Hồ sơ 34 tỉnh thành 2025",
    description:
      "Bộ dữ liệu nền dùng chung cho 34 tỉnh, thành Việt Nam sau sáp nhập hành chính 2025. " +
      "Gồm thống kê kinh tế - xã hội (dân số, diện tích, GRDP, ngân sách, hạ tầng), " +
      "danh sách xã/phường mới, và lãnh đạo (bí thư, chủ tịch UBND). " +
      "Đơn vị phân tích: 34 tỉnh. Nguồn: Tổng cục Thống kê + báo cáo chính thức của các tỉnh.",
    category: "xa-hoi",
    tags: ["vĩ mô", "dân số", "GRDP", "hành chính", "sáp nhập 2025", "lãnh đạo"],
    license: "internal",
    year_range: [2025],
    row_count: 258,
    file_count: 3,
    total_size_mb: 2.4,
    downloads: 142,
    likes: 34,
    source: "Tổng cục Thống kê + báo cáo UBND các tỉnh (2025)",
    uploaded_by: "Ninh",
    uploaded_at: "2026-06-09T10:30:00Z",
    resources: [
      {
        id: 1,
        resource_type: "data",
        title: "Thống kê kinh tế - xã hội 34 tỉnh",
        description: "Dân số, diện tích, mật độ, số đơn vị cấp xã, GRDP, thu ngân sách, cảng biển, sân bay, thứ hạng.",
        file_type: "csv",
        file_size_mb: 0.4,
        file_url: "#",
        structured_data: provinceStatsRows,
        columns: provinceStatsColumns.map((c) => c.column_name),
        tags: ["vĩ mô", "GRDP"],
        year: 2025,
        uploaded_by: "Ninh",
        uploaded_at: "2026-06-09T10:30:00Z",
      },
      {
        id: 2,
        resource_type: "data",
        title: "Xã phường mới sau sáp nhập (chi tiết TP HCM)",
        description: "168 xã/phường TP HCM với dân số, diện tích, trụ sở hành chính, tọa độ. Các tỉnh khác chỉ có số lượng tổng hợp.",
        file_type: "csv",
        file_size_mb: 1.6,
        file_url: "#",
        structured_data: wardsRows,
        columns: wardsColumns.map((c) => c.column_name),
        tags: ["hành chính", "sáp nhập 2025"],
        year: 2025,
        uploaded_by: "Ninh",
        uploaded_at: "2026-06-10T14:20:00Z",
      },
      {
        id: 3,
        resource_type: "data",
        title: "Lãnh đạo 34 tỉnh (bí thư, chủ tịch UBND)",
        description: "Bí thư và chủ tịch UBND các tỉnh thành sau sáp nhập, kèm chức danh đầy đủ và ảnh.",
        file_type: "csv",
        file_size_mb: 0.4,
        file_url: "#",
        structured_data: leadershipRows,
        columns: leadershipColumns.map((c) => c.column_name),
        tags: ["lãnh đạo", "chính trị"],
        year: 2025,
        uploaded_by: "Ninh",
        uploaded_at: "2026-06-10T15:00:00Z",
      },
    ],
    data_dictionary: [...provinceStatsColumns, ...wardsColumns, ...leadershipColumns],
  },
  {
    slug: "grdp-34-tinh-2020-2024",
    title: "GRDP 34 tỉnh giai đoạn 2020–2024",
    description:
      "Chuỗi thời gian GRDP của 34 tỉnh thành trong 5 năm, kèm tốc độ tăng trưởng trung bình. " +
      "Dùng để phát hiện xu hướng và bất thường. Nguồn: Niên giám thống kê + Sở KH&ĐT các tỉnh.",
    category: "kinh-te",
    tags: ["vĩ mô", "GRDP", "tăng trưởng"],
    license: "internal",
    year_range: [2020, 2021, 2022, 2023, 2024],
    row_count: 34,
    file_count: 1,
    total_size_mb: 0.3,
    downloads: 89,
    likes: 12,
    source: "Niên giám thống kê 2024 + Sở KH&ĐT",
    uploaded_by: "Minh",
    uploaded_at: "2026-06-12T09:15:00Z",
    resources: [
      {
        id: 4,
        resource_type: "data",
        title: "GRDP 34 tỉnh 2020–2024",
        file_type: "xlsx",
        file_size_mb: 0.3,
        file_url: "#",
        structured_data: [
          { entity_id: "VN-HCM", entity_name: "TP Hồ Chí Minh", grdp_2020: 1340000, grdp_2021: 1420000, grdp_2022: 1550000, grdp_2023: 1680000, grdp_2024: 1820000, growth_avg: 7.9 },
          { entity_id: "VN-HN", entity_name: "Hà Nội", grdp_2020: 980000, grdp_2021: 1080000, grdp_2022: 1190000, grdp_2023: 1320000, grdp_2024: 1450000, growth_avg: 10.3 },
          { entity_id: "VN-DNai", entity_name: "Đồng Nai", grdp_2020: 390000, grdp_2021: 430000, grdp_2022: 475000, grdp_2023: 528000, grdp_2024: 582000, growth_avg: 10.5 },
          { entity_id: "VN-DN", entity_name: "Đà Nẵng", grdp_2020: 280000, grdp_2021: 310000, grdp_2022: 350000, grdp_2023: 395000, grdp_2024: 440000, growth_avg: 12.0 },
          { entity_id: "VN-HP", entity_name: "Hải Phòng", grdp_2020: 220000, grdp_2021: 245000, grdp_2022: 275000, grdp_2023: 308000, grdp_2024: 345000, growth_avg: 11.9 },
        ],
        columns: grdpColumns.map((c) => c.column_name),
        tags: ["GRDP"],
        year: 2024,
        uploaded_by: "Minh",
        uploaded_at: "2026-06-12T09:15:00Z",
      },
    ],
    data_dictionary: grdpColumns,
  },
  {
    slug: "ket-qua-bau-cu-qh-2026",
    title: "Kết quả bầu cử Quốc hội 2026",
    description:
      "Kết quả chính thức bầu cử đại biểu Quốc hội khoá XVI (2026) theo đơn vị bầu cử. " +
      "Bao gồm danh sách trúng cử, tỷ lệ participação, và tài liệu hướng dẫn bầu cử (PDF).",
    category: "chinh-tri",
    tags: ["bầu cử", "Quốc hội", "chính trị"],
    license: "public",
    year_range: [2026],
    row_count: 500,
    file_count: 2,
    total_size_mb: 4.8,
    downloads: 67,
    likes: 28,
    source: "Ủy ban bầu cử quốc gia",
    uploaded_by: "Hoa",
    uploaded_at: "2026-06-15T16:00:00Z",
    resources: [
      {
        id: 5,
        resource_type: "data",
        title: "Danh sách đại biểu trúng cử",
        description: "500 đại biểu Quốc hội khoá XVI, theo đơn vị bầu cử.",
        file_type: "csv",
        file_size_mb: 0.6,
        file_url: "#",
        structured_data: [
          { entity_id: "UB1", ubcv: "Hà Nội 1", name: "Nguyễn Thị A", party: "Đảng", votes: 125000, ratio: 78.5 },
          { entity_id: "UB2", ubcv: "TP HCM 1", name: "Trần Văn B", party: "Đảng", votes: 210000, ratio: 82.1 },
          { entity_id: "UB3", ubcv: "Đà Nẵng", name: "Lê Thị C", party: "Đảng", votes: 98000, ratio: 75.3 },
          { entity_id: "UB4", ubcv: "Hải Phòng", name: "Phạm Văn D", party: "Đảng", votes: 87000, ratio: 71.8 },
          { entity_id: "UB5", ubcv: "Cần Thơ", name: "Hoàng Thị E", party: "Đảng", votes: 76000, ratio: 69.4 },
        ],
        columns: ["entity_id", "ubcv", "name", "party", "votes", "ratio"],
        tags: ["bầu cử"],
        year: 2026,
        uploaded_by: "Hoa",
        uploaded_at: "2026-06-15T16:00:00Z",
      },
      {
        id: 6,
        resource_type: "document",
        title: "Tài liệu hướng dẫn bầu cử 2026",
        description: "Sổ tay hướng dẫn cử tri và quy trình bầu cử, 48 trang.",
        file_type: "pdf",
        file_size_mb: 4.2,
        file_url: "#",
        tags: ["bầu cử", "tài liệu"],
        year: 2026,
        uploaded_by: "Hoa",
        uploaded_at: "2026-06-15T16:05:00Z",
      },
    ],
    data_dictionary: [
      { column_name: "entity_id", label_vi: "Mã đơn vị bầu cử", data_type: "text" },
      { column_name: "ubcv", label_vi: "Đơn vị bầu cử", data_type: "text" },
      { column_name: "name", label_vi: "Họ tên đại biểu", data_type: "text" },
      { column_name: "party", label_vi: "Đảng phái", data_type: "text" },
      { column_name: "votes", label_vi: "Số phiếu", data_type: "int", unit: "phiếu" },
      { column_name: "ratio", label_vi: "Tỷ lệ", data_type: "float", unit: "%" },
    ],
  },
  {
    slug: "khi-hau-thien-tai-2024",
    title: "Khí hậu & thiên tai 2024",
    description:
      "Dữ liệu khí hậu (nhiệt độ, lượng mưa, chất lượng không khí) và thống kê thiên tai " +
      "(bão, lũ, sạt lở) kèm thiệt hại theo địa phương năm 2024.",
    category: "khi-hau",
    tags: ["khí hậu", "thiên tai", "môi trường"],
    license: "internal",
    year_range: [2024],
    row_count: 68,
    file_count: 1,
    total_size_mb: 1.1,
    downloads: 34,
    likes: 8,
    source: "Tổng cục Khí tượng Thủy văn + Bộ Nông nghiệp",
    uploaded_by: "Ninh",
    uploaded_at: "2026-06-18T11:00:00Z",
    resources: [
      {
        id: 7,
        resource_type: "data",
        title: "Thống kê thiên tai theo tỉnh 2024",
        file_type: "csv",
        file_size_mb: 1.1,
        file_url: "#",
        structured_data: [
          { entity_id: "VN-HUE", entity_name: "TP Huế", storms: 4, floods: 6, landslides: 12, damage_bn: 850 },
          { entity_id: "VN-QN", entity_name: "Quảng Ngãi", storms: 3, floods: 4, landslides: 5, damage_bn: 420 },
          { entity_id: "VN-KH", entity_name: "Khánh Hòa", storms: 2, floods: 3, landslides: 2, damage_bn: 210 },
          { entity_id: "VN-DL", entity_name: "Đắk Lắk", storms: 1, floods: 2, landslides: 8, damage_bn: 340 },
          { entity_id: "VN-CH", entity_name: "Cà Mau", storms: 2, floods: 5, landslides: 0, damage_bn: 180 },
        ],
        columns: ["entity_id", "entity_name", "storms", "floods", "landslides", "damage_bn"],
        tags: ["thiên tai"],
        year: 2024,
        uploaded_by: "Ninh",
        uploaded_at: "2026-06-18T11:00:00Z",
      },
    ],
    data_dictionary: [
      { column_name: "entity_id", label_vi: "Mã tỉnh", data_type: "text" },
      { column_name: "entity_name", label_vi: "Tỉnh", data_type: "text" },
      { column_name: "storms", label_vi: "Số cơn bão", data_type: "int", unit: "cơn" },
      { column_name: "floods", label_vi: "Số đợt lũ", data_type: "int", unit: "đợt" },
      { column_name: "landslides", label_vi: "Sạt lở", data_type: "int", unit: "vụ" },
      { column_name: "damage_bn", label_vi: "Thiệt hại", data_type: "float", unit: "tỷ đồng" },
    ],
  },
  {
    slug: "fdi-theo-tinh-2023",
    title: "FDI theo tỉnh 2023",
    description:
      "Dự án FDI, vốn đăng ký và vốn giải ngân theo địa phương năm 2023. " +
      "Phục vụ phân tích thu hút đầu tư và so sánh giữa các tỉnh.",
    category: "kinh-te",
    tags: ["FDI", "đầu tư", "vĩ mô"],
    license: "internal",
    year_range: [2023],
    row_count: 34,
    file_count: 1,
    total_size_mb: 0.5,
    downloads: 56,
    likes: 15,
    source: "Cục Đầu tư nước ngoài (Bộ KH&ĐT)",
    uploaded_by: "Minh",
    uploaded_at: "2026-06-20T13:45:00Z",
    resources: [
      {
        id: 8,
        resource_type: "data",
        title: "FDI 34 tỉnh 2023",
        file_type: "csv",
        file_size_mb: 0.5,
        file_url: "#",
        structured_data: [
          { entity_id: "VN-HCM", entity_name: "TP Hồ Chí Minh", projects: 4521, registered_capital: 8420, disbursed_capital: 5210 },
          { entity_id: "VN-BNH", entity_name: "Bắc Ninh", projects: 2104, registered_capital: 22300, disbursed_capital: 6800 },
          { entity_id: "VN-DNai", entity_name: "Đồng Nai", projects: 1689, registered_capital: 4150, disbursed_capital: 2980 },
          { entity_id: "VN-HN", entity_name: "Hà Nội", projects: 1980, registered_capital: 3950, disbursed_capital: 2410 },
          { entity_id: "VN-DN", entity_name: "Đà Nẵng", projects: 945, registered_capital: 2840, disbursed_capital: 1620 },
        ],
        columns: fdiColumns.map((c) => c.column_name),
        tags: ["FDI"],
        year: 2023,
        uploaded_by: "Minh",
        uploaded_at: "2026-06-20T13:45:00Z",
      },
    ],
    data_dictionary: fdiColumns,
  },
];

// ──────────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────────

export function getDatasetBySlug(slug: string): Dataset | undefined {
  return datasets.find((d) => d.slug === slug);
}

export const CATEGORY_LABELS: Record<Category, string> = {
  "kinh-te": "Kinh tế",
  "xa-hoi": "Xã hội",
  "chinh-tri": "Chính trị",
  "khi-hau": "Khí hậu",
  "ha-tang": "Hạ tầng",
};

export const RESOURCE_TYPE_LABELS: Record<ResourceType, string> = {
  data: "Dữ liệu",
  document: "Tài liệu",
  audio: "Ghi âm",
  geo_layer: "Bản đồ",
  image: "Hình ảnh",
};
