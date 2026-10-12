/**
 * Bảng chuẩn hoá địa lý cho harness insight — phần dùng chung DUY NHẤT giữa các
 * dataset. Muốn ghép thu nhập (dataset A) với mức sinh (dataset B) theo tỉnh × năm
 * thì tên tỉnh ở hai file phải quy về cùng một mã.
 *
 * Nguồn:
 *  - 63 tỉnh cũ + 6 vùng: thứ tự và cách gom vùng đối chiếu với chính dữ liệu NSO
 *    trong kho ("Dân số trung bình phân theo địa phương…", dòng vùng đứng trước các
 *    tỉnh của vùng).
 *  - 63 → 34: Nghị quyết 202/2025/QH15 (12/6/2025), danh sách theo bài "Chi tiết 34
 *    đơn vị hành chính cấp tỉnh" trên xaydungchinhsach.chinhphu.vn. Trang đó KHÔNG ghi
 *    thành phần của Tuyên Quang; Tuyên Quang = Tuyên Quang + Hà Giang suy ra bằng loại
 *    trừ (Hà Giang là tỉnh cũ duy nhất còn lại) — kiểm ở `checkGeoTables()`.
 */

export type GeoLevel = "nation" | "region" | "province";
export type ProvinceScheme = "63" | "34";

export interface Region {
  code: string;
  name: string;
}

export const REGIONS: Region[] = [
  { code: "dbsh", name: "Đồng bằng sông Hồng" },
  { code: "tdmnpb", name: "Trung du và miền núi phía Bắc" },
  { code: "btb-dhmt", name: "Bắc Trung Bộ và duyên hải miền Trung" },
  { code: "tay-nguyen", name: "Tây Nguyên" },
  { code: "dnb", name: "Đông Nam Bộ" },
  { code: "dbscl", name: "Đồng bằng sông Cửu Long" },
];

export interface Province63 {
  code: string;
  name: string;
  region: string;
}

// Thứ tự theo bảng NSO. `code` là slug không dấu, ổn định để làm khoá ghép.
export const PROVINCES_63: Province63[] = [
  ["ha-noi", "Hà Nội", "dbsh"],
  ["vinh-phuc", "Vĩnh Phúc", "dbsh"],
  ["bac-ninh", "Bắc Ninh", "dbsh"],
  ["quang-ninh", "Quảng Ninh", "dbsh"],
  ["hai-duong", "Hải Dương", "dbsh"],
  ["hai-phong", "Hải Phòng", "dbsh"],
  ["hung-yen", "Hưng Yên", "dbsh"],
  ["thai-binh", "Thái Bình", "dbsh"],
  ["ha-nam", "Hà Nam", "dbsh"],
  ["nam-dinh", "Nam Định", "dbsh"],
  ["ninh-binh", "Ninh Bình", "dbsh"],
  ["ha-giang", "Hà Giang", "tdmnpb"],
  ["cao-bang", "Cao Bằng", "tdmnpb"],
  ["bac-kan", "Bắc Kạn", "tdmnpb"],
  ["tuyen-quang", "Tuyên Quang", "tdmnpb"],
  ["lao-cai", "Lào Cai", "tdmnpb"],
  ["yen-bai", "Yên Bái", "tdmnpb"],
  ["thai-nguyen", "Thái Nguyên", "tdmnpb"],
  ["lang-son", "Lạng Sơn", "tdmnpb"],
  ["bac-giang", "Bắc Giang", "tdmnpb"],
  ["phu-tho", "Phú Thọ", "tdmnpb"],
  ["dien-bien", "Điện Biên", "tdmnpb"],
  ["lai-chau", "Lai Châu", "tdmnpb"],
  ["son-la", "Sơn La", "tdmnpb"],
  ["hoa-binh", "Hòa Bình", "tdmnpb"],
  ["thanh-hoa", "Thanh Hóa", "btb-dhmt"],
  ["nghe-an", "Nghệ An", "btb-dhmt"],
  ["ha-tinh", "Hà Tĩnh", "btb-dhmt"],
  ["quang-binh", "Quảng Bình", "btb-dhmt"],
  ["quang-tri", "Quảng Trị", "btb-dhmt"],
  ["hue", "Huế", "btb-dhmt"],
  ["da-nang", "Đà Nẵng", "btb-dhmt"],
  ["quang-nam", "Quảng Nam", "btb-dhmt"],
  ["quang-ngai", "Quảng Ngãi", "btb-dhmt"],
  ["binh-dinh", "Bình Định", "btb-dhmt"],
  ["phu-yen", "Phú Yên", "btb-dhmt"],
  ["khanh-hoa", "Khánh Hòa", "btb-dhmt"],
  ["ninh-thuan", "Ninh Thuận", "btb-dhmt"],
  ["binh-thuan", "Bình Thuận", "btb-dhmt"],
  ["kon-tum", "Kon Tum", "tay-nguyen"],
  ["gia-lai", "Gia Lai", "tay-nguyen"],
  ["dak-lak", "Đắk Lắk", "tay-nguyen"],
  ["dak-nong", "Đắk Nông", "tay-nguyen"],
  ["lam-dong", "Lâm Đồng", "tay-nguyen"],
  ["binh-phuoc", "Bình Phước", "dnb"],
  ["tay-ninh", "Tây Ninh", "dnb"],
  ["binh-duong", "Bình Dương", "dnb"],
  ["dong-nai", "Đồng Nai", "dnb"],
  ["ba-ria-vung-tau", "Bà Rịa - Vũng Tàu", "dnb"],
  ["ho-chi-minh", "TP. Hồ Chí Minh", "dnb"],
  ["long-an", "Long An", "dbscl"],
  ["tien-giang", "Tiền Giang", "dbscl"],
  ["ben-tre", "Bến Tre", "dbscl"],
  ["tra-vinh", "Trà Vinh", "dbscl"],
  ["vinh-long", "Vĩnh Long", "dbscl"],
  ["dong-thap", "Đồng Tháp", "dbscl"],
  ["an-giang", "An Giang", "dbscl"],
  ["kien-giang", "Kiên Giang", "dbscl"],
  ["can-tho", "Cần Thơ", "dbscl"],
  ["hau-giang", "Hậu Giang", "dbscl"],
  ["soc-trang", "Sóc Trăng", "dbscl"],
  ["bac-lieu", "Bạc Liêu", "dbscl"],
  ["ca-mau", "Cà Mau", "dbscl"],
].map(([code, name, region]) => ({ code, name, region }));

export interface Province34 {
  code: string;
  name: string;
  /** Mã các tỉnh cũ hợp thành. Tỉnh giữ nguyên → một phần tử là chính nó. */
  members: string[];
}

export const PROVINCES_34: Province34[] = [
  // 11 đơn vị giữ nguyên
  ["cao-bang", "Cao Bằng", ["cao-bang"]],
  ["dien-bien", "Điện Biên", ["dien-bien"]],
  ["ha-tinh", "Hà Tĩnh", ["ha-tinh"]],
  ["lai-chau", "Lai Châu", ["lai-chau"]],
  ["lang-son", "Lạng Sơn", ["lang-son"]],
  ["nghe-an", "Nghệ An", ["nghe-an"]],
  ["quang-ninh", "Quảng Ninh", ["quang-ninh"]],
  ["thanh-hoa", "Thanh Hóa", ["thanh-hoa"]],
  ["son-la", "Sơn La", ["son-la"]],
  ["ha-noi", "Hà Nội", ["ha-noi"]],
  ["hue", "Huế", ["hue"]],
  // 23 đơn vị hợp nhất
  ["tuyen-quang", "Tuyên Quang", ["tuyen-quang", "ha-giang"]],
  ["lao-cai", "Lào Cai", ["lao-cai", "yen-bai"]],
  ["thai-nguyen", "Thái Nguyên", ["thai-nguyen", "bac-kan"]],
  ["phu-tho", "Phú Thọ", ["phu-tho", "vinh-phuc", "hoa-binh"]],
  ["bac-ninh", "Bắc Ninh", ["bac-ninh", "bac-giang"]],
  ["hung-yen", "Hưng Yên", ["hung-yen", "thai-binh"]],
  ["hai-phong", "Hải Phòng", ["hai-phong", "hai-duong"]],
  ["ninh-binh", "Ninh Bình", ["ninh-binh", "ha-nam", "nam-dinh"]],
  ["quang-tri", "Quảng Trị", ["quang-tri", "quang-binh"]],
  ["da-nang", "Đà Nẵng", ["da-nang", "quang-nam"]],
  ["quang-ngai", "Quảng Ngãi", ["quang-ngai", "kon-tum"]],
  ["gia-lai", "Gia Lai", ["gia-lai", "binh-dinh"]],
  ["khanh-hoa", "Khánh Hòa", ["khanh-hoa", "ninh-thuan"]],
  ["lam-dong", "Lâm Đồng", ["lam-dong", "dak-nong", "binh-thuan"]],
  ["dak-lak", "Đắk Lắk", ["dak-lak", "phu-yen"]],
  ["ho-chi-minh", "TP. Hồ Chí Minh", ["ho-chi-minh", "binh-duong", "ba-ria-vung-tau"]],
  ["dong-nai", "Đồng Nai", ["dong-nai", "binh-phuoc"]],
  ["tay-ninh", "Tây Ninh", ["tay-ninh", "long-an"]],
  ["can-tho", "Cần Thơ", ["can-tho", "soc-trang", "hau-giang"]],
  ["vinh-long", "Vĩnh Long", ["vinh-long", "ben-tre", "tra-vinh"]],
  ["dong-thap", "Đồng Tháp", ["dong-thap", "tien-giang"]],
  ["ca-mau", "Cà Mau", ["ca-mau", "bac-lieu"]],
  ["an-giang", "An Giang", ["an-giang", "kien-giang"]],
].map(([code, name, members]) => ({
  code: code as string,
  name: name as string,
  members: members as string[],
}));

/** Tên tỉnh cũ đã biến mất sau sáp nhập — gặp tên này thì dữ liệu chắc chắn theo 63. */
export const NAMES_ONLY_IN_63 = new Set(
  PROVINCES_63.filter((p) => !PROVINCES_34.some((n) => n.code === p.code)).map((p) => p.code)
);

/** Tỉnh mới giữ tên một tỉnh cũ nhưng ranh giới đã đổi → tên này mơ hồ 63/34. */
export const AMBIGUOUS_NAMES = new Set(
  PROVINCES_34.filter((p) => p.members.length > 1).map((p) => p.code)
);

// ── Chuẩn hoá chuỗi ───────────────────────────────────────────────────────────

/**
 * Bỏ dấu, chữ thường, chỉ giữ a–z. Ð (U+00D0, có trong dữ liệu NSO) và Đ (U+0110)
 * đều thành "d" — hai ký tự trông giống nhau nhưng khác mã.
 */
export function normKey(raw: string): string {
  return raw
    .replace(/[ĐđÐð]/g, "d")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z]/g, "");
}

// Tiền tố hành chính bỏ đi trước khi tra (đã bỏ dấu).
const PREFIXES = ["thanhpho", "tinh", "tp"];

function stripPrefix(k: string): string {
  for (const p of PREFIXES) {
    if (k.startsWith(p) && k.length > p.length + 2) return k.slice(p.length);
  }
  return k;
}

export type GeoMatch =
  | { level: "nation" }
  | { level: "region"; code: string }
  | { level: "province"; code: string }
  | { level: "historic"; code: string } // tỉnh không còn từ trước 2008 (Hà Tây)
  | { level: "ignore" }; // "Không xác định", "Khác"…

const LOOKUP = new Map<string, GeoMatch>();

function add(names: string[], m: GeoMatch) {
  for (const n of names) LOOKUP.set(normKey(n), m);
}

for (const p of PROVINCES_63) add([p.name], { level: "province", code: p.code });
for (const r of REGIONS) add([r.name], { level: "region", code: r.code });

// Bí danh gặp trong kho (đo 2026-10-06 trên 183 dataset có cột tỉnh).
add(["CẢ NƯỚC", "Toàn quốc", "TỔNG SỐ", "Tổng số", "Cả nước"], { level: "nation" });
add(["Thừa Thiên Huế", "Thừa Thiên - Huế", "TT Huế"], { level: "province", code: "hue" });
add(["Hồ Chí Minh", "TP HCM", "TP.HCM", "Thành phố Hồ Chí Minh", "TP. Hồ Chí Minh"], {
  level: "province",
  code: "ho-chi-minh",
});
add(["Bà Rịa - V.Tàu", "Bà Rịa Vũng Tàu", "BR-VT"], { level: "province", code: "ba-ria-vung-tau" });
add(["Đắc Lắc", "Đăk Lăk"], { level: "province", code: "dak-lak" });
add(["Đăk Nông"], { level: "province", code: "dak-nong" });
add(["Hà Tây"], { level: "historic", code: "ha-tay" });
add(
  ["Không xác định", "Khác", "Các địa phương khác", "Các đơn vị không phân theo địa phương"],
  { level: "ignore" }
);
add(["Tây Nguyên - Central Highlands"], { level: "region", code: "tay-nguyen" });
add(["Đông Nam Bộ - South East"], { level: "region", code: "dnb" });
add(["Bắc Trung Bộ và Duyên hải miền Trung", "Bắc Trung Bộ và DH miền Trung"], {
  level: "region",
  code: "btb-dhmt",
});

/** Tra một giá trị ô địa lý. `null` = không nhận ra (dữ liệu lạ → báo lỗi cụ thể). */
export function matchGeo(raw: string): GeoMatch | null {
  const k = normKey(raw);
  if (!k) return null;
  return LOOKUP.get(k) ?? LOOKUP.get(stripPrefix(k)) ?? null;
}

export function provinceName(code: string, scheme: ProvinceScheme = "63"): string {
  if (scheme === "34") return PROVINCES_34.find((p) => p.code === code)?.name ?? code;
  return PROVINCES_63.find((p) => p.code === code)?.name ?? code;
}

export function regionOf(code63: string): string | undefined {
  return PROVINCES_63.find((p) => p.code === code63)?.region;
}

export function regionName(code: string): string {
  return REGIONS.find((r) => r.code === code)?.name ?? code;
}

/** Mã tỉnh mới chứa tỉnh cũ `code63`. */
export function to34(code63: string): string | undefined {
  return PROVINCES_34.find((p) => p.members.includes(code63))?.code;
}

/**
 * Tự kiểm bảng: mỗi tỉnh cũ thuộc đúng một tỉnh mới, đủ 63 / 34 / 6 vùng.
 * Trả danh sách lỗi (rỗng = đúng). Gọi trong test, không gọi lúc chạy.
 */
export function checkGeoTables(): string[] {
  const errors: string[] = [];
  if (PROVINCES_63.length !== 63) errors.push(`PROVINCES_63 có ${PROVINCES_63.length} tỉnh`);
  if (PROVINCES_34.length !== 34) errors.push(`PROVINCES_34 có ${PROVINCES_34.length} tỉnh`);
  const seen = new Map<string, string>();
  for (const p of PROVINCES_34) {
    for (const m of p.members) {
      if (!PROVINCES_63.some((o) => o.code === m)) errors.push(`${p.code}: mã cũ lạ ${m}`);
      if (seen.has(m)) errors.push(`${m} thuộc cả ${seen.get(m)} và ${p.code}`);
      seen.set(m, p.code);
    }
  }
  for (const o of PROVINCES_63) if (!seen.has(o.code)) errors.push(`${o.code} không thuộc tỉnh mới nào`);
  for (const o of PROVINCES_63) {
    if (!REGIONS.some((r) => r.code === o.region)) errors.push(`${o.code}: vùng lạ ${o.region}`);
  }
  return errors;
}
