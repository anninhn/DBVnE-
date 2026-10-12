/**
 * Ca kiểm tra cho bước đề xuất chỉ tiêu — mỗi ca là MỘT LỖI CHỌN SAI ĐÃ GẶP THẬT.
 * Danh sách lớn dần theo lỗi phát hiện khi dùng thử, không phải bộ đánh giá soạn sẵn.
 *
 * Kiểm phần CODE chịu trách nhiệm (tìm ra ứng viên, đo đúng dữ kiện, xếp nhóm con
 * xuống dưới) — tất định, chạy lại được sau mỗi lần sửa. Phần AI chọn "đúng nghĩa"
 * không kiểm tự động được; nó được kiểm bằng chạy thử thật.
 *
 * Chạy: GET /api/insight/selfcheck (local).
 */

import { listCandidates, rankSelected, type MeasureOption } from "./measures";

interface Case {
  name: string;
  /** Lỗi gốc, để biết ca này canh cái gì */
  bug: string;
  concept: string;
  /** Chỉ tiêu PHẢI có mặt trong ứng viên và dùng được */
  mustFind: { slug: string; measure: string }[];
  /** Chỉ tiêu PHẢI bị đánh dấu nhóm con (không được làm đề xuất khi có số chung) */
  mustBeSubgroup?: { slug: string; measureIncludes: string }[];
}

export const CASES: Case[] = [
  {
    name: "mức sinh",
    bug: "2026-10-08: Discovery bỏ sót 'Tổng tỷ suất sinh' (hạng 55 sau khi trộn) khi hỏi 'thu nhập và mức sinh'.",
    concept: "mức sinh",
    mustFind: [{ slug: "tong-ty-suat-sinh-phan-theo-dia-phuong", measure: "Tổng tỷ suất sinh" }],
  },
  {
    name: "thu nhập",
    bug: "2026-10-08: Discovery chọn 'Chênh lệch thu nhập… giữa các nhóm' — chỉ có thu nhập nhóm thấp/cao nhất.",
    concept: "thu nhập",
    mustFind: [
      { slug: "thu-nhap-binh-quan-mot-lao-dong-dang-lam-viec-phan-theo-dia", measure: "Thu nhập bình quân một lao động đang làm việc" },
    ],
    mustBeSubgroup: [{ slug: "chenh-lech-thu-nhap-binh-quan-dau-nguoi-mot-thang-giua-nhom", measureIncludes: "Nhóm thu nhập" }],
  },
  {
    name: "di cư",
    bug: "2026-10-08: so chữ bỏ hết từ 2 chữ cái ('di', 'cư') → không đề xuất được gì.",
    concept: "di cư",
    mustFind: [{ slug: "ty-suat-nhap-cu-xuat-cu-va-di-cu-thuan-phan-theo-dia-phuong", measure: "Tỷ suất nhập cư" }],
  },
  {
    name: "tử vong trẻ sơ sinh",
    bug: "2026-10-08: so chữ đề xuất nhầm 'đăng ký khai sinh' (trùng chữ 'sinh').",
    concept: "tử vong trẻ sơ sinh",
    mustFind: [{ slug: "ty-suat-chet-cua-tre-em-duoi-mot-tuoi-phan-theo-dia-phuong", measure: "Tỷ suất chết của trẻ em dưới một tuổi" }],
  },
];

export interface CaseResult {
  name: string;
  ok: boolean;
  failures: string[];
}

export async function runCases(): Promise<CaseResult[]> {
  const out: CaseResult[] = [];
  for (const c of CASES) {
    const failures: string[] = [];
    const cand = await listCandidates(c.concept, "province", "x");
    if (cand.degraded) failures.push(`tìm kiếm chạy chế độ chỉ từ khoá: ${cand.degraded}`);
    const find = (slug: string, pred: (o: MeasureOption) => boolean) => cand.options.find((o) => o.slug === slug && pred(o));
    for (const m of c.mustFind) {
      const o = find(m.slug, (x) => x.measure === m.measure);
      if (!o) failures.push(`không có trong ứng viên: "${m.measure}" (${m.slug})`);
      else if (o.excluded) failures.push(`"${m.measure}" bị loại sai: ${o.excluded}`);
    }
    for (const m of c.mustBeSubgroup ?? []) {
      const o = find(m.slug, (x) => x.measure.includes(m.measureIncludes));
      if (o && !o.subgroup) failures.push(`"${o.measure}" không bị đánh dấu nhóm con`);
      // Nếu AI chọn cả nhóm con lẫn số chung (nhóm con trước), code vẫn phải đề xuất số chung
      const main = find(c.mustFind[0].slug, (x) => x.measure === c.mustFind[0].measure);
      if (o && main) {
        const r = rankSelected("province", [cand], { [c.concept]: [o.id, main.id] });
        if (r.concepts[0].recommended?.id !== main.id) failures.push("nhóm con được đề xuất trước số chung");
      }
    }
    out.push({ name: c.name, ok: failures.length === 0, failures });
  }
  return out;
}
