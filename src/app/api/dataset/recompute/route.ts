import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { parseDocument } from "yaml";

import { getObject } from "@/lib/r2/get";
import { inspectFile, detectFormat } from "@/lib/ai/inspect";
import { detectTemporalRange, detectTemporalColumn } from "@/lib/datasets/temporal";
import { commitMetadata } from "@/lib/dataset-commit";
import { getMetadataYamlRaw } from "@/lib/datasets/read";
import { fetchFileContents } from "@/lib/github/contents-api";
import { requireUserOr401 } from "@/lib/auth";
import type { MetadataYaml } from "@/lib/datasets/types";
import type { ColumnStats } from "@/lib/types/dataset";

/**
 * Tính lại `column_stats` + `coverage.temporal` cho một dataset ĐÃ có trong kho.
 *
 * Vì sao là route chứ không nằm hẳn trong script vận hành: việc tính stats nằm ở
 * `src/lib/ai/inspect/` (TypeScript, có parser CSV streaming, có schema thập phân
 * Frictionless). Chép lại logic đó sang một file `.mjs` là tạo ra bản thứ hai sẽ
 * lệch dần với bản thật — và lệch ở đây có nghĩa là số trong `metadata.yaml` khác
 * số hiện trên trang dataset, không ai phát hiện. Script
 * `tools/backfill-column-values.mjs` chỉ gọi route này cho từng slug.
 *
 * KHÔNG gọi AI (R10): chỉ đọc lại file và tính, chữ nghĩa (description,
 * dictionary) giữ nguyên như cũ.
 *
 * Mặc định là thử (`apply: false`) — trả về những gì SẼ đổi mà không commit.
 */
export const maxDuration = 60;

/**
 * Trần dung lượng file cho một lượt tính lại.
 *
 * Không phải giới hạn tuỳ tiện: GeoJSON được `inspectGeoJson` đọc nguyên file vào
 * bộ nhớ rồi `JSON.parse` — hai file ranh giới phường/xã toàn quốc nặng 169 MB
 * mỗi file, parse xong chiếm nhiều GB heap và làm sập tiến trình. Đổi lại thì mất
 * gì: chúng là dữ liệu hình học, cột phân loại là tên phường (hàng nghìn giá trị,
 * vượt ngưỡng lưu đủ dù có tính) và không có chiều thời gian. Bỏ qua chúng không
 * mất gì cho việc tra cứu; làm sập tiến trình giữa chừng thì mất cả lượt chạy.
 */
const MAX_INSPECT_MB = 50;

interface RecomputeRequest {
  slug: string;
  /** Thiếu hoặc `false` = chỉ tính rồi trả kết quả, không ghi */
  apply?: boolean;
  /** Trả kèm YAML SẼ được ghi — để soi mắt thường trước khi chạy cả kho */
  preview?: boolean;
}

interface ChangeReport {
  slug: string;
  filename: string;
  columnsBefore: number;
  columnsAfter: number;
  /** Số cột phân loại được lưu ĐỦ giá trị sau khi tính lại */
  completeColumns: number;
  /** Số cột phân loại vẫn bị cắt (quá nhiều giá trị) */
  truncatedColumns: number;
  temporalBefore: (number | string)[] | null;
  temporalAfter: [number, number] | null;
  temporalColumn: string | null;
  changed: boolean;
  committed: boolean;
  commitSha?: string;
  /** Chỉ có khi xin `preview` */
  metadataYaml?: string;
}

/**
 * Đặt `flow: true` cho một seq node — in ra `[a, b]` thay vì mỗi phần tử một dòng.
 *
 * Phải làm trên NODE do `doc.createNode()` tạo. Truyền thẳng giá trị JS vào
 * `setIn` thì thư viện tự dựng node lúc in, và không còn chỗ nào để đặt cờ.
 */
function markFlow(node: unknown): void {
  if (node && typeof node === "object" && "items" in node) {
    (node as { flow?: boolean }).flow = true;
  }
}

export async function POST(req: NextRequest) {
  const authCheck = await requireUserOr401();
  if (!authCheck.ok) return authCheck.response;

  let body: RecomputeRequest;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body phải là JSON hợp lệ" }, { status: 400 });
  }

  const slug = body.slug?.trim();
  const apply = body.apply === true;

  if (!slug || slug.includes("/") || slug.includes("..")) {
    return NextResponse.json({ error: "Slug không hợp lệ" }, { status: 400 });
  }

  const yamlText = await getMetadataYamlRaw(slug);
  if (!yamlText) {
    return NextResponse.json({ error: `Không có dataset "${slug}"` }, { status: 404 });
  }

  // `parseDocument` (không phải `parse`) để giữ lại comment đầu file và cách
  // trình bày của những phần KHÔNG đụng tới. Round-trip qua `parse`+`stringify`
  // vẫn đúng nghĩa nhưng viết lại toàn bộ file — 495 dataset × cả file đổi dạng
  // làm `git log -p` của metadata thành vô dụng, đúng thứ provenance dựa vào.
  const doc = parseDocument(yamlText);
  const meta = doc.toJS() as MetadataYaml;
  const files = meta.files ?? [];
  const fileIndex = files.findIndex((f) => f.r2_key);
  const target = fileIndex >= 0 ? files[fileIndex] : undefined;
  if (!target?.r2_key) {
    return NextResponse.json(
      { error: `Dataset "${slug}" không có file trong R2 để tính lại` },
      { status: 422 },
    );
  }

  const filename = target.filename ?? target.r2_key.split("/").pop() ?? "";
  if (!detectFormat(filename)) {
    return NextResponse.json(
      { error: `Định dạng không đọc được: ${filename}` },
      { status: 422 },
    );
  }

  if ((target.size_mb ?? 0) > MAX_INSPECT_MB) {
    return NextResponse.json(
      {
        error:
          `File ${filename} nặng ${target.size_mb} MB, vượt trần ${MAX_INSPECT_MB} MB — bỏ qua.`,
        tooLarge: true,
      },
      { status: 413 },
    );
  }

  const buffer = await getObject(target.r2_key);
  const inspection = inspectFile(buffer, filename);
  const newStats = inspection.columnStats ?? {};

  // Chốt chặn: tính lại mà mất sạch stats cũ thì KHÔNG ghi. Nguyên nhân hay gặp
  // là file trong R2 khác file lúc upload (đã thay tay), và ghi đè lúc đó là xoá
  // dữ liệu đúng bằng dữ liệu rỗng — không có bước hoàn lại.
  const oldStats = (target.column_stats ?? {}) as Record<string, ColumnStats>;
  const oldCount = Object.keys(oldStats).length;
  const newCount = Object.keys(newStats).length;
  if (oldCount > 0 && newCount === 0) {
    return NextResponse.json(
      {
        error:
          `Tính lại "${slug}" ra 0 cột trong khi metadata đang có ${oldCount} cột. ` +
          `Không ghi đè — kiểm tra file trong R2 trước.`,
      },
      { status: 409 },
    );
  }

  let completeColumns = 0;
  let truncatedColumns = 0;
  for (const stat of Object.values(newStats)) {
    if (stat.kind !== "categorical") continue;
    if (stat.complete === false) truncatedColumns++;
    else completeColumns++;
  }

  const temporalBefore = meta.coverage?.temporal ?? null;
  const temporalAfter = detectTemporalRange(newStats);
  const temporalColumn = detectTemporalColumn(newStats);

  const report: ChangeReport = {
    slug,
    filename,
    columnsBefore: oldCount,
    columnsAfter: newCount,
    completeColumns,
    truncatedColumns,
    temporalBefore: temporalBefore && temporalBefore.length ? temporalBefore : null,
    temporalAfter,
    temporalColumn,
    changed: false,
    committed: false,
  };

  // So sánh bằng JSON: stats là dữ liệu thuần, không có hàm/undefined lồng nhau.
  const statsChanged = JSON.stringify(oldStats) !== JSON.stringify(newStats);
  const temporalChanged =
    JSON.stringify(report.temporalBefore) !== JSON.stringify(temporalAfter);
  report.changed = statsChanged || temporalChanged;

  if (!report.changed) {
    return NextResponse.json(report);
  }

  // Giữ nguyên style của `renderMetadataYaml`: histogram và khoảng thời gian viết
  // trên một dòng. Cùng một trường mà chỗ viết một dòng, chỗ trải tám dòng thì
  // `git diff` giữa hai lần sửa không đọc được nữa.
  const statsNode = doc.createNode(newStats);
  for (const pair of (statsNode as unknown as { items: { value?: { get?: (k: string) => unknown } }[] }).items) {
    markFlow(pair.value?.get?.("histogram"));
  }
  doc.setIn(["files", fileIndex, "column_stats"], statsNode);

  if (temporalAfter) {
    const temporalNode = doc.createNode(temporalAfter);
    markFlow(temporalNode);
    doc.setIn(["coverage", "temporal"], temporalNode);
  }

  if (body.preview === true) report.metadataYaml = doc.toString({ lineWidth: 0 });
  if (!apply) {
    return NextResponse.json(report);
  }

  const dictionary = await fetchFileContents(`datasets/${slug}/dictionary.md`);
  if (!dictionary) {
    return NextResponse.json(
      { error: `Không đọc được dictionary.md của "${slug}" — không commit nửa vời` },
      { status: 502 },
    );
  }

  const result = await commitMetadata({
    slug,
    metadataYaml: doc.toString({ lineWidth: 0 }),
    dictionaryMarkdown: dictionary.content,
    mode: "update",
  });

  revalidateTag("datasets", { expire: 0 });

  report.committed = true;
  report.commitSha = result.commitSha;
  return NextResponse.json(report);
}
