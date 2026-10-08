/**
 * Bộ tool của harness — định nghĩa (tên, mô tả, JSON Schema) + cách chạy. MCP proxy
 * (tools/insight-mcp.mjs) lấy danh sách này qua GET /api/insight/tools và chuyển
 * mọi lượt gọi về POST cùng route.
 *
 * Mỗi tool trả về một kết quả có `result_id`. Mọi con số trong kết quả được lưu vào
 * phiên — đó là nguồn duy nhất mà thẻ được phép trích (rào chắn khớp số).
 */

import { loadDataset, LoadError } from "./load";
import { sliceTable, SliceError, type SliceSpec } from "./dataset";
import { regionReversal, trendBreak, DetectorError } from "./detectors";
import { checkCard } from "./guard";
import { collectNumbers, nextResultId, withSession, type Session } from "./session";
import { roundSig } from "./stats";
import { REGIONS } from "./geo";
import { compactOption, listCandidates, rankSelected, type Level } from "./measures";

type JSONSchema = Record<string, unknown>;

export interface ToolDef {
  name: string;
  description: string;
  inputSchema: JSONSchema;
}

const sliceSchema: JSONSchema = {
  type: "object",
  description: "Một lát dữ liệu: cột đo của một dataset, đã chốt các chiều.",
  properties: {
    slug: { type: "string", description: "Slug dataset" },
    measure: { type: "string", description: "Tên cột đo, chép đúng từ describe_dataset" },
    dims: {
      type: "object",
      description: 'Chốt giá trị cho từng chiều phụ, vd {"Cấp quản lý": "Sở Y tế quản lý"}',
      additionalProperties: { type: "string" },
    },
    level: { type: "string", enum: ["province", "region", "nation"] },
    scheme: { type: "string", enum: ["63", "34"], description: "Danh mục tỉnh muốn dùng" },
  },
  required: ["slug", "measure"],
};

/** Tool của bước ĐỀ XUẤT CHỈ TIÊU (chạy trước phân tích). */
export const SUGGEST_TOOL_NAMES = ["find_measures", "select_measures"];

export const TOOL_DEFS: ToolDef[] = [
  {
    name: "find_measures",
    description: [
      "Bước đề xuất chỉ tiêu. Với mỗi khái niệm trong câu hỏi, code tìm dataset, mở từng file và liệt kê MỌI cột đo kèm dữ kiện đo được: số tỉnh, năm, có phải nhóm con không, có dùng được không.",
      "Truyền các khái niệm bằng chữ của phóng viên, mỗi khái niệm một chỉ tiêu (vd ['thu nhập', 'mức sinh']).",
    ].join("\n"),
    inputSchema: {
      type: "object",
      properties: {
        khai_niem: { type: "array", items: { type: "string" } },
        cap: { type: "string", enum: ["province", "region", "nation"], description: "Cấp địa lý câu hỏi cần. Mặc định province." },
      },
      required: ["khai_niem"],
    },
  },
  {
    name: "select_measures",
    description: [
      "Sau find_measures: với mỗi khái niệm, liệt kê id của MỌI chỉ tiêu ĐÚNG NGHĨA với khái niệm, đúng nghĩa nhất trước.",
      "Chỉ xét NGHĨA. Không chọn chỉ tiêu chỉ trùng chữ (vd 'đăng ký khai sinh' KHÔNG phải 'tử vong trẻ sơ sinh'; 'chỉ số giá sinh hoạt' KHÔNG phải 'mức sinh').",
      "Không cần lo cấu trúc (số tỉnh, năm, nhóm con) — code tự xếp hạng theo luật và trả đề xuất cuối.",
    ].join("\n"),
    inputSchema: {
      type: "object",
      properties: {
        chon: {
          type: "array",
          items: {
            type: "object",
            properties: { khai_niem: { type: "string" }, ids: { type: "array", items: { type: "string" } } },
            required: ["khai_niem", "ids"],
          },
        },
      },
      required: ["chon"],
    },
  },
  {
    name: "plan_analysis",
    description: [
      "BẮT BUỘC gọi trước khi phân tích, sau khi đã describe_dataset các dataset được chọn.",
      "Liệt kê MỌI khái niệm/chỉ tiêu mà câu hỏi cần (vd 'thu nhập', 'mức sinh') và gán mỗi khái niệm vào một cột đo cụ thể của một dataset ĐÃ CHỌN.",
      "Khái niệm nào không có cột đo phù hợp trong các dataset đã chọn → để slug và measure là null. Không được gán gượng (vd 'mức sinh' vào một cột thu nhập).",
      "Thiếu khái niệm nào → phải dừng, không phân tích, không nộp thẻ.",
    ].join("\n"),
    inputSchema: {
      type: "object",
      properties: {
        khai_niem: {
          type: "array",
          items: {
            type: "object",
            properties: {
              ten: { type: "string", description: "Khái niệm trong câu hỏi, dùng chữ của phóng viên" },
              slug: { type: ["string", "null"] },
              measure: { type: ["string", "null"], description: "Tên cột đo, chép đúng từ describe_dataset" },
            },
            required: ["ten", "slug", "measure"],
          },
        },
      },
      required: ["khai_niem"],
    },
  },
  {
    name: "describe_dataset",
    description:
      "Đọc một dataset và cho biết cấu trúc: cột nào là địa lý / thời gian / chiều / cột đo, danh mục 63 hay 34 tỉnh, các năm có dữ liệu, giá trị của các chiều, đơn vị và khoảng giá trị của cột đo, cảnh báo dữ liệu. Luôn gọi trước khi phân tích một dataset.",
    inputSchema: { type: "object", properties: { slug: { type: "string" } }, required: ["slug"] },
  },
  {
    name: "check_artifacts",
    description:
      "Kiểm lỗi dữ liệu của một lát: giá hiện hành, năm thiếu, số sơ bộ, tổng các tỉnh lệch số cả nước, danh mục tỉnh cũ. Gọi trước khi viết thẻ dựa trên lát đó.",
    inputSchema: { type: "object", properties: { slice: sliceSchema }, required: ["slice"] },
  },
  {
    name: "run_detector",
    description: [
      "Chạy một phép phân tích có sẵn. AI không tự tính số — chỉ dùng số từ kết quả tool.",
      "kind=region_reversal: cần x và y (cấp tỉnh). So quan hệ x–y trong từng vùng với khi gộp cả nước, đánh dấu đổi dấu, tự kiểm lặp lại ở một năm khác. params.year (tuỳ chọn).",
      "kind=trend_break: cần x (một chuỗi). Kỷ lục, đảo chiều, điểm gãy theo thời gian. params.geo = mã tỉnh/vùng hoặc 'nation' nếu lát có nhiều địa phương.",
    ].join("\n"),
    inputSchema: {
      type: "object",
      properties: {
        kind: { type: "string", enum: ["region_reversal", "trend_break"] },
        x: sliceSchema,
        y: sliceSchema,
        params: {
          type: "object",
          properties: { year: { type: "integer" }, geo: { type: "string" } },
        },
      },
      required: ["kind", "x"],
    },
  },
  {
    name: "report_insufficient",
    description:
      "Khi kho không đủ dữ liệu để trả lời: ghi thẻ 'cần dữ liệu gì'. Đây là kết quả hợp lệ, tốt hơn là cố suy diễn.",
    inputSchema: {
      type: "object",
      properties: {
        de_tai: { type: "string", description: "Đề tài phóng viên muốn làm" },
        thieu: { type: "array", items: { type: "string" }, description: "Những dữ liệu còn thiếu" },
        gan_dung: { type: "string", description: "Dữ liệu gần đúng có trong kho và góc khả thi với nó" },
        noi_co_the_lay: { type: "string" },
      },
      required: ["de_tai", "thieu"],
    },
  },
  {
    name: "submit_card",
    description:
      "Nộp thẻ góc bài. Rào chắn sẽ kiểm: mọi con số phải chép từ kết quả tool trong phiên (định dạng Việt: 0,13; 1.234,5), mỗi dòng so_lieu trích result_id, nguon là slug đã đọc. Sai → nhận danh sách lỗi và được sửa một lần.",
    inputSchema: {
      type: "object",
      properties: {
        card: {
          type: "object",
          properties: {
            kind: { type: "string", enum: ["insight"] },
            tieu_de: { type: "string" },
            dang_pattern: { type: "string" },
            vi_sao_dang_viet: { type: "string" },
            so_lieu: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  nhan: { type: "string" },
                  gia_tri: { type: "string" },
                  result_id: { type: "string" },
                },
                required: ["nhan", "gia_tri", "result_id"],
              },
            },
            nguon: { type: "array", items: { type: "string" } },
            luu_y: { type: "string" },
            can_kiem_them: { type: "string" },
          },
          required: ["kind", "tieu_de", "dang_pattern", "vi_sao_dang_viet", "so_lieu", "nguon", "luu_y", "can_kiem_them"],
        },
      },
      required: ["card"],
    },
  },
];

export interface ToolCallResult {
  ok: boolean;
  text: string;
}

function record(s: Session, tool: string, args: unknown, summary: unknown, chart?: unknown): string {
  const id = nextResultId(s);
  s.results[id] = {
    id,
    tool,
    args,
    summary,
    chart,
    numbers: collectNumbers(summary),
    turn: s.turn,
    at: new Date().toISOString(),
  };
  return id;
}

async function slice(spec: SliceSpec) {
  if (!spec?.slug || !spec?.measure) throw new SliceError("Lát dữ liệu cần ít nhất slug và measure.");
  const { table, profile } = await loadDataset(spec.slug);
  return { profile, slice: sliceTable(table, profile, spec) };
}

/** Chạy một tool trong phiên. Lỗi nghiệp vụ trả về như kết quả (ok=false) để AI sửa. */
export async function callTool(sessionId: string, name: string, args: Record<string, unknown>): Promise<ToolCallResult> {
  return withSession(sessionId, async (s) => {
    try {
      switch (name) {
        case "find_measures": {
          const concepts = (Array.isArray(args.khai_niem) ? args.khai_niem : []).map(String).filter((c) => c.trim()).slice(0, 4);
          if (!concepts.length) return { ok: false, text: "khai_niem rỗng." };
          const level = (["province", "region", "nation"].includes(String(args.cap)) ? args.cap : "province") as Level;
          const list = [];
          for (const [i, c] of concepts.entries()) list.push(await listCandidates(c, level, String.fromCharCode(97 + i)));
          s.candidates = { level, list };
          s.suggestion = undefined;
          const summary = {
            cap: level,
            khai_niem: list.map((c) => ({
              ten: c.concept,
              ...(c.degraded ? { canh_bao: "Tìm chỉ theo từ khoá — có thể sót." } : {}),
              chi_tieu: c.options.map(compactOption),
            })),
          };
          const id = record(s, name, args, summary);
          return { ok: true, text: JSON.stringify({ result_id: id, ...summary }) };
        }

        case "select_measures": {
          if (!s.candidates) return { ok: false, text: "Chưa gọi find_measures." };
          const items = Array.isArray(args.chon) ? (args.chon as Record<string, unknown>[]) : [];
          const chosen: Record<string, string[]> = {};
          const errors: string[] = [];
          for (const it of items) {
            const concept = String(it.khai_niem ?? "");
            const cand = s.candidates.list.find((c) => c.concept === concept);
            if (!cand) {
              errors.push(`Khái niệm "${concept}" không có trong find_measures (${s.candidates.list.map((c) => c.concept).join(", ")}).`);
              continue;
            }
            const ids = (Array.isArray(it.ids) ? it.ids : []).map(String);
            const unknown = ids.filter((x) => !cand.options.some((o) => o.id === x));
            if (unknown.length) errors.push(`"${concept}": id lạ ${unknown.join(", ")}.`);
            chosen[concept] = ids;
          }
          if (errors.length) return { ok: false, text: errors.join("\n") };
          const result = rankSelected(s.candidates.level, s.candidates.list, chosen);
          s.suggestion = result;
          const brief = (o: { measure: string; datasetTitle: string; provinces: number; years: number[] } | null) =>
            o ? `${o.measure} — ${o.datasetTitle} (${o.provinces} tỉnh, ${o.years[0]}–${o.years[o.years.length - 1]})` : "KHÔNG CÓ chỉ tiêu dùng được";
          const lines = result.concepts.map((c) =>
            [
              `• ${c.concept}: ${brief(c.recommended)}`,
              ...c.alternatives.map((a) => `    khác: ${brief(a)}`),
              ...c.rejected.map((r) => `    không dùng: ${r.measure} — ${r.excluded ?? r.subgroup}`),
            ].join("\n")
          );
          const text = [
            "Đề xuất (code xếp hạng theo luật cấu trúc):",
            ...lines,
            result.commonYears ? `Năm dùng chung: ${result.commonYears.join(", ") || "KHÔNG CÓ"}` : "",
            ...result.notes,
            "Dừng ở đây — phóng viên sẽ xem và xác nhận trên giao diện.",
          ]
            .filter(Boolean)
            .join("\n");
          return { ok: true, text };
        }

        case "plan_analysis": {
          const items = Array.isArray(args.khai_niem) ? (args.khai_niem as Record<string, unknown>[]) : [];
          if (!items.length) return { ok: false, text: "khai_niem rỗng — liệt kê các khái niệm câu hỏi cần." };
          const concepts: { ten: string; slug: string | null; measure: string | null }[] = [];
          const errors: string[] = [];
          for (const it of items) {
            const ten = String(it.ten ?? "").trim();
            const slug = it.slug ? String(it.slug) : null;
            const measure = it.measure ? String(it.measure) : null;
            if (slug && !s.slugs.includes(slug)) {
              errors.push(`"${ten}": ${slug} không nằm trong các dataset phóng viên đã chọn (${s.slugs.join(", ")}).`);
              continue;
            }
            if (slug && measure) {
              const { profile } = await loadDataset(slug);
              if (!profile.measures.some((m) => m.name === measure)) {
                errors.push(`"${ten}": ${slug} không có cột đo "${measure}". Có: ${profile.measures.map((m) => `"${m.name}"`).join(", ")}.`);
                continue;
              }
            }
            concepts.push({ ten, slug: slug && measure ? slug : null, measure: slug && measure ? measure : null });
          }
          // Phóng viên đã xác nhận chỉ tiêu → đối chiếu PHẢI dùng đúng các chỉ tiêu đó.
          for (const pick of s.confirmed ?? []) {
            if (!concepts.some((c) => c.slug === pick.slug && c.measure === pick.measure)) {
              errors.push(`Phóng viên đã chọn "${pick.measure}" (${pick.slug}) cho "${pick.ten}" — phải dùng đúng chỉ tiêu này.`);
            }
          }
          if (errors.length) return { ok: false, text: `Đối chiếu chưa hợp lệ:\n- ${errors.join("\n- ")}` };
          const missing = concepts.filter((c) => !c.slug).map((c) => c.ten);
          s.plan = { turn: s.turn, concepts, missing };
          const mapping = concepts
            .map((c) => (c.slug ? `- ${c.ten} → "${c.measure}" (${c.slug})` : `- ${c.ten} → CHƯA CÓ trong dataset đã chọn`))
            .join("\n");
          if (missing.length) {
            return {
              ok: false,
              text: [
                `DỪNG. Các dataset phóng viên chọn chưa có số liệu cho: ${missing.join(", ")}.`,
                mapping,
                "Không phân tích tiếp, không nộp thẻ, không gọi report_insufficient (kho có thể có dataset phù hợp mà phóng viên chưa chọn).",
                `Trả lời phóng viên: các dataset bạn chọn chưa có số liệu về ${missing.join(", ")} — hãy tìm và thêm dataset phù hợp rồi chạy lại. KHÔNG được nói "kho không có".`,
              ].join("\n"),
            };
          }
          return { ok: true, text: `Đủ dữ liệu cho mọi khái niệm:\n${mapping}` };
        }

        case "describe_dataset": {
          const { profile: p } = await loadDataset(String(args.slug));
          const summary = {
            slug: p.slug,
            tieu_de: p.title,
            nguon_goc: p.source,
            cot: p.columns,
            dia_ly: { cot: p.geoColumn ?? null, danh_muc_tinh: p.scheme ?? null, ...p.geoLevels },
            thoi_gian: { cot: p.timeColumn ?? null, nam: p.years.length > 12 ? `${p.years[0]}–${p.years[p.years.length - 1]} (${p.years.length} năm)` : p.years, nam_so_bo: p.provisionalYears },
            chieu: p.dims.map((d) => ({ ten: d.name, so_gia_tri: d.total, gia_tri: d.values.slice(0, 15) })),
            cot_do: p.measures.map((m) => ({
              ten: m.name,
              don_vi: m.unit ?? null,
              cong_duoc: m.additive,
              min: roundSig(m.min, 4),
              max: roundSig(m.max, 4),
            })),
            canh_bao: p.warnings,
          };
          const id = record(s, name, args, summary);
          return { ok: true, text: JSON.stringify({ result_id: id, ...summary }) };
        }

        case "check_artifacts": {
          const spec = args.slice as SliceSpec;
          const { profile, slice: sl } = await slice(spec);
          const warnings = [...profile.warnings, ...sl.notes];
          const measure = profile.measures.find((m) => m.name === spec.measure);
          // Tổng các tỉnh so với số cả nước (chỉ với chỉ tiêu cộng được, năm mới nhất có cả hai)
          let tong_tinh_vs_ca_nuoc: unknown = "không kiểm (chỉ tiêu không cộng được hoặc thiếu dòng cả nước)";
          if (measure?.additive && profile.geoLevels.nation && profile.geoLevels.provinces > 0) {
            const { table } = await loadDataset(spec.slug);
            const nation = sliceTable(table, profile, { ...spec, level: "nation", scheme: undefined });
            const prov = sliceTable(table, profile, { ...spec, level: "province", scheme: undefined });
            const years = nation.points.map((p) => p.year).sort((a, b) => b - a);
            for (const y of years) {
              const pv = prov.points.filter((p) => p.year === y);
              if (pv.length < 50) continue;
              const sum = pv.reduce((a, b) => a + b.value, 0);
              const nv = nation.points.find((p) => p.year === y)!.value;
              const lech = nv === 0 ? 0 : (sum - nv) / nv;
              tong_tinh_vs_ca_nuoc = { nam: y, tong_cac_tinh: roundSig(sum, 5), ca_nuoc: roundSig(nv, 5), lech_ti_le: roundSig(lech, 2) };
              if (Math.abs(lech) > 0.02) warnings.push(`Năm ${y}: tổng các tỉnh lệch số cả nước ${roundSig(lech * 100, 2)}% — kiểm lại phân tổ/đơn vị.`);
              break;
            }
          }
          const summary = { lat: sl.label, danh_muc_tinh: sl.scheme ?? null, so_diem: sl.points.length, canh_bao: warnings, tong_tinh_vs_ca_nuoc };
          const id = record(s, name, args, summary);
          return { ok: true, text: JSON.stringify({ result_id: id, ...summary }) };
        }

        case "run_detector": {
          const kind = String(args.kind);
          const params = (args.params ?? {}) as { year?: number; geo?: string };
          let xSpec = args.x as SliceSpec;
          // trend_break theo một địa phương: cấp địa lý suy từ mã ("nation" / mã vùng / mã tỉnh)
          if (kind === "trend_break" && params.geo && !xSpec?.level) {
            const level = params.geo === "nation" ? "nation" : REGIONS.some((r) => r.code === params.geo) ? "region" : "province";
            xSpec = { ...xSpec, level };
          }
          const x = (await slice(xSpec)).slice;
          let out;
          if (kind === "region_reversal") {
            if (!args.y) throw new DetectorError("region_reversal cần cả x và y.");
            const y = (await slice(args.y as SliceSpec)).slice;
            out = regionReversal(x, y, params);
          } else if (kind === "trend_break") {
            out = trendBreak(x, params);
          } else {
            throw new DetectorError(`Bộ dò "${kind}" chưa có. Có: region_reversal, trend_break.`);
          }
          s.testsCount += out.tests;
          const id = record(s, name, args, out.summary, out.chart);
          return { ok: true, text: JSON.stringify({ result_id: id, so_phep_thu_trong_phien: s.testsCount, ...out.summary }) };
        }

        case "report_insufficient": {
          if (s.plan?.turn === s.turn && s.plan.missing.length) {
            return {
              ok: false,
              text: `Không dùng report_insufficient: thiếu ${s.plan.missing.join(", ")} là thiếu trong các dataset ĐÃ CHỌN, chưa phải trong kho. Nói phóng viên tìm thêm dataset.`,
            };
          }
          // Phạm vi kết luận do code ghi — harness chỉ thấy các dataset được đưa cho nó.
          const card = { kind: "insufficient", ...args, pham_vi: `Kết luận dựa trên các dataset: ${s.slugs.join(", ")}` };
          const check = checkCard(card, s);
          s.cards.push({ turn: s.turn, at: new Date().toISOString(), card, ok: check.ok, errors: check.errors, attempt: 1 });
          return check.ok
            ? { ok: true, text: "Đã ghi thẻ 'cần dữ liệu gì'." }
            : { ok: false, text: `Thẻ chưa hợp lệ: ${check.errors.join(" ")}` };
        }

        case "submit_card": {
          // submit_card chỉ dành cho thẻ insight — tự điền `kind` thay vì bắt AI nộp lại
          // vì quên một trường cố định (GLM quên ở cả 2 lần chạy thử 2026-10-08).
          const card =
            args.card && typeof args.card === "object" ? { kind: "insight", ...(args.card as Record<string, unknown>) } : args.card;
          if (!s.plan || s.plan.turn !== s.turn) {
            return { ok: false, text: "Chưa gọi plan_analysis trong lượt này — đối chiếu khái niệm với dataset trước khi nộp thẻ." };
          }
          if (s.plan.missing.length) {
            return { ok: false, text: `Không nộp thẻ: dataset đã chọn chưa có số liệu cho ${s.plan.missing.join(", ")}.` };
          }
          // Đếm MỌI lần nộp thẻ insight trong lượt (kể cả lần thiếu trường) — quy tắc là sửa một lần.
          const attempt = s.cards.filter((c) => c.turn === s.turn && (c.card as { kind?: string })?.kind !== "insufficient").length + 1;
          const check = checkCard(card, s);
          s.cards.push({ turn: s.turn, at: new Date().toISOString(), card, ok: check.ok, errors: check.errors, attempt });
          if (check.ok) return { ok: true, text: "Thẻ đạt rào chắn và đã gửi cho phóng viên." };
          if (attempt >= 2) {
            return { ok: false, text: `Thẻ bị loại sau ${attempt} lần nộp: ${check.errors.join(" ")} Không nộp lại nữa; giải thích ngắn cho phóng viên vì sao chưa có thẻ.` };
          }
          return { ok: false, text: `Rào chắn trả lỗi, sửa và nộp lại MỘT lần:\n- ${check.errors.join("\n- ")}` };
        }

        default:
          return { ok: false, text: `Không có tool "${name}".` };
      }
    } catch (e) {
      if (e instanceof LoadError || e instanceof SliceError || e instanceof DetectorError) {
        return { ok: false, text: e.message };
      }
      throw e;
    }
  });
}
