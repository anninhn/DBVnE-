/**
 * Dựng hai chỉ mục tra cứu từ metadata trong git.
 *
 * Chỉ mục là dữ liệu **sinh ra** (D1): nguồn sự thật vẫn là `datasets/<slug>/
 * metadata.yaml`. Dựng lại từ đầu bất cứ lúc nào cũng ra đúng kết quả cũ nếu
 * metadata không đổi — nên khi nghi ngờ chỉ mục lệch, cách xử lý luôn là dựng lại,
 * không phải vá tay file trên R2.
 *
 * Chỉ sinh vector cho entry **đã lệch hoặc còn thiếu**. Dựng lại toàn bộ mỗi lần
 * là 495 lượt gọi embedding cho một thay đổi — tốn tiền và tốn thời gian cho một
 * kết quả giống hệt cái đang có.
 */

import { fetchListingIndex } from "@/lib/datasets/index-json";
import { getDatasetBySlug } from "@/lib/datasets/read";
import type { Dataset } from "@/lib/types/dataset";
import {
  buildValueIndex,
  isValueListComplete,
  valueKeys,
  type ValueSource,
} from "./value-index";
import { loadValueIndex, saveValueIndex } from "./store";
import {
  fingerprint,
  loadVectorIndex,
  removeVectorEntry,
  saveVectorIndex,
  upsertVectorEntry,
} from "./vector-store";
import { buildIndexText, embedDimensions, embedTexts } from "./embed";
import { buildKeywords } from "./keyword";
import {
  RetrievalIndexUnavailableError,
  type RetrievalIndex,
  type RetrievalIndexEntry,
  type ValueIndex,
} from "./types";

/**
 * Số lượt đọc metadata chạy cùng lúc.
 *
 * GitHub cho 5.000 call/giờ nên trần không nằm ở đó; giới hạn này là để không mở
 * 500 kết nối cùng lúc. 10 là mức đọc xong 495 dataset trong khoảng 10 giây.
 */
const CONCURRENCY = 10;

async function mapLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]);
    }
  });
  await Promise.all(workers);
  return out;
}

// ── Đọc kho ───────────────────────────────────────────────────────────────────

interface RepoDataset {
  slug: string;
  title: string;
  indexText: string;
  keywords: string[];
  fingerprint: string;
  valueSource: ValueSource;
}

function columnNamesOf(dataset: Dataset): string[] {
  const fromDict = dataset.data_dictionary.map((d) => d.column_name);
  if (fromDict.length > 0) return fromDict;
  const stats = dataset.resources.find((r) => r.column_stats)?.column_stats ?? {};
  return Object.keys(stats);
}

function toRepoDataset(dataset: Dataset): { repo: RepoDataset; columnsIndexed: number } {
  const columns = columnNamesOf(dataset);
  const indexText = buildIndexText({
    title: dataset.title,
    description: dataset.description,
    category: dataset.category,
    columns,
  });

  const stats = dataset.resources.find((r) => r.column_stats)?.column_stats ?? {};
  const valueColumns: ValueSource["columns"] = [];
  let columnsIndexed = 0;
  for (const [name, stat] of Object.entries(stats)) {
    if (stat.kind !== "categorical") continue;
    const complete = isValueListComplete(stat);
    if (complete) columnsIndexed++;
    valueColumns.push({ name, values: stat.segments.map((s) => s.label), complete });
  }

  return {
    columnsIndexed,
    repo: {
      slug: dataset.slug,
      title: dataset.title,
      indexText,
      keywords: buildKeywords({
        title: dataset.title,
        description: dataset.description,
        columns,
      }),
      fingerprint: fingerprint(indexText),
      valueSource: { slug: dataset.slug, title: dataset.title, columns: valueColumns },
    },
  };
}

// ── Kế hoạch dựng ─────────────────────────────────────────────────────────────

export interface BuildPlan {
  datasetsRead: number;
  /** Slug có trong danh mục nhưng đọc metadata không ra — KHÔNG im lặng bỏ qua */
  unreadable: string[];
  value: {
    columnsIndexed: number;
    keys: number;
    partialColumns: number;
    sizeKb: number;
  };
  vector: {
    /** Entry đang có trong chỉ mục cũ */
    existing: number;
    /** Entry khớp dấu vết, giữ nguyên vector cũ */
    unchanged: number;
    /** Chưa có trong chỉ mục — sẽ sinh vector mới */
    missing: string[];
    /** Đã có nhưng dấu vết khác metadata hiện hành — chỉ mục ĐANG LỆCH */
    drifted: string[];
    /** Có trong chỉ mục nhưng không còn trong kho — sẽ bỏ */
    stale: string[];
    /** Số lượt gọi embedding mà `--apply` sẽ thực hiện */
    toEmbed: number;
  };
}

export interface BuildResult extends BuildPlan {
  applied: boolean;
  embedded: number;
  vectorSizeKb: number;
  builtAt: string;
}

async function loadExistingVectorIndex(): Promise<RetrievalIndex | null> {
  try {
    return await loadVectorIndex();
  } catch (err) {
    // Chưa dựng bao giờ, hoặc chỉ mục cũ khác số chiều → coi như trống và dựng lại.
    if (err instanceof RetrievalIndexUnavailableError) return null;
    throw err;
  }
}

/**
 * Đọc kho, so với chỉ mục hiện có, trả về **những gì sẽ đổi** mà không đổi gì.
 *
 * Danh sách `drifted` là phần quan trọng nhất của cả script này. Vector cũ +
 * metadata mới thì hệ thống VẪN trả lời, chỉ là trả lời sai dataset, và không có
 * triệu chứng nào (R4). Báo ra trước khi sửa là cách duy nhất người vận hành thấy
 * được chuyện đó đã xảy ra.
 */
async function planBuild(): Promise<{
  plan: BuildPlan;
  repo: RepoDataset[];
  existing: RetrievalIndex | null;
  valueIndex: ValueIndex;
}> {
  const entries = (await fetchListingIndex()).filter((e) => e.status !== "deleted");

  const unreadable: string[] = [];
  let columnsIndexed = 0;

  const loaded = await mapLimit(entries, CONCURRENCY, async (entry) => {
    const dataset = await getDatasetBySlug(entry.slug);
    if (!dataset) {
      unreadable.push(entry.slug);
      return null;
    }
    const { repo, columnsIndexed: n } = toRepoDataset(dataset);
    columnsIndexed += n;
    return repo;
  });

  const repo = loaded.filter((r): r is RepoDataset => r !== null);
  const valueIndex = buildValueIndex(repo.map((r) => r.valueSource));
  const existing = await loadExistingVectorIndex();

  const byslug = new Map((existing?.entries ?? []).map((e) => [e.slug, e]));
  const missing: string[] = [];
  const drifted: string[] = [];
  let unchanged = 0;

  for (const r of repo) {
    const old = byslug.get(r.slug);
    if (!old) missing.push(r.slug);
    else if (old.sourceFingerprint !== r.fingerprint) drifted.push(r.slug);
    else unchanged++;
  }

  const inRepo = new Set(repo.map((r) => r.slug));
  const stale = (existing?.entries ?? [])
    .map((e) => e.slug)
    .filter((slug) => !inRepo.has(slug));

  return {
    repo,
    existing,
    valueIndex,
    plan: {
      datasetsRead: repo.length,
      unreadable,
      value: {
        columnsIndexed,
        keys: Object.keys(valueIndex.entries).length,
        partialColumns: valueIndex.partialColumns.length,
        sizeKb: Math.round(JSON.stringify(valueIndex).length / 1024),
      },
      vector: {
        existing: existing?.entries.length ?? 0,
        unchanged,
        missing,
        drifted,
        stale,
        toEmbed: missing.length + drifted.length,
      },
    },
  };
}

/**
 * Dựng chỉ mục. `apply: false` (mặc định) chỉ báo cáo, KHÔNG gọi embedding.
 *
 * Dry-run cố ý không gọi embedding: nó tốn tiền, và mọi thứ cần biết để quyết định
 * — bao nhiêu entry lệch, lệch cái nào — đều tính được từ dấu vết mà không cần
 * vector.
 */
export async function buildIndexes(apply: boolean): Promise<BuildResult> {
  const { plan, repo, existing, valueIndex } = await planBuild();

  if (!apply) {
    return { ...plan, applied: false, embedded: 0, vectorSizeKb: 0, builtAt: "" };
  }

  const byslug = new Map((existing?.entries ?? []).map((e) => [e.slug, e]));
  const needEmbed = repo.filter((r) => {
    const old = byslug.get(r.slug);
    return !old || old.sourceFingerprint !== r.fingerprint;
  });

  const vectors = await embedTexts(needEmbed.map((r) => r.indexText));
  const fresh = new Map<string, number[]>();
  needEmbed.forEach((r, i) => fresh.set(r.slug, vectors[i]));

  const now = new Date().toISOString();
  const entries: RetrievalIndexEntry[] = repo.map((r) => {
    const vector = fresh.get(r.slug);
    if (vector) {
      return {
        slug: r.slug,
        vector,
        text: r.indexText,
        keywords: r.keywords,
        sourceFingerprint: r.fingerprint,
        builtAt: now,
      };
    }
    // Giữ nguyên entry cũ nhưng cập nhật `keywords`: chúng tính được từ metadata
    // mà không cần gọi mạng, nên không có lý do gì để chúng cũ.
    const old = byslug.get(r.slug)!;
    return { ...old, keywords: r.keywords, text: r.indexText };
  });

  const index: RetrievalIndex = {
    entries,
    builtAt: now,
    dimensions: embedDimensions(),
  };

  await saveVectorIndex(index);
  await saveValueIndex(valueIndex);

  return {
    ...plan,
    applied: true,
    embedded: needEmbed.length,
    vectorSizeKb: Math.round(
      entries.reduce((n, e) => n + e.vector.length * 4, 0) / 1024,
    ),
    builtAt: now,
  };
}

// ── Giữ chỉ mục đồng bộ với từng thay đổi ─────────────────────────────────────

/**
 * Thay toàn bộ phần của MỘT dataset trong chỉ mục giá trị.
 *
 * Không dựng lại cả chỉ mục: đọc 495 metadata cho một lần sửa tiêu đề là bắt người
 * dùng chờ vài chục giây sau khi bấm Lưu.
 *
 * Bảng `slugs`/`columns` cố ý KHÔNG dọn phần tử không còn ai trỏ tới. Dọn thì mọi
 * chỉ số phía sau bị dời, tức phải sửa lại toàn bộ `refs` của cả chỉ mục — nhiều
 * việc và nhiều chỗ sai, để đổi lấy vài chục byte. Script dựng lại làm sạch.
 */
function replaceValueEntriesFor(
  index: ValueIndex,
  source: ValueSource,
): ValueIndex {
  const slugs = [...index.slugs];
  const columns = [...index.columns];
  let si = slugs.indexOf(source.slug);
  if (si === -1) si = slugs.push(source.slug) - 1;

  const entries: Record<string, typeof index.entries[string]> = {};
  for (const [key, entry] of Object.entries(index.entries)) {
    const refs = entry.refs.filter(([s]) => s !== si);
    if (refs.length === 0) continue;
    entries[key] = { ...entry, refs };
  }

  const columnIdx = new Map(columns.map((c, i) => [c, i] as const));
  const intern = (name: string): number => {
    const existing = columnIdx.get(name);
    if (existing !== undefined) return existing;
    const i = columns.push(name) - 1;
    columnIdx.set(name, i);
    return i;
  };

  for (const col of source.columns) {
    if (!col.complete) continue;
    const ci = intern(col.name);
    for (const raw of col.values) {
      for (const key of valueKeys(raw)) {
        const entry = (entries[key] ??= { display: raw, variants: [], refs: [] });
        if (!entry.variants.includes(raw)) entry.variants.push(raw);
        entry.refs.push([si, ci]);
      }
    }
  }

  return {
    entries,
    titles: { ...index.titles, [source.slug]: source.title },
    slugs,
    columns,
    partialColumns: [
      ...index.partialColumns.filter((p) => p.slug !== source.slug),
      ...source.columns
        .filter((c) => !c.complete)
        .map((c) => ({ slug: source.slug, column: c.name })),
    ],
    builtAt: new Date().toISOString(),
  };
}

/**
 * Ghi lại phần chỉ mục của một dataset sau khi upload hoặc sửa (FR-032, FR-033).
 *
 * **Best-effort có chủ ý**: caller đã commit metadata rồi, ném lỗi ở đây chỉ làm
 * người dùng thấy "lưu thất bại" cho một thứ đã lưu xong. Chỉ mục lệch thì
 * `tools/build-retrieval-index.mjs` phát hiện và chữa — đó là lý do dấu vết
 * `source_fingerprint` tồn tại.
 */
export async function syncDatasetIndexes(slug: string): Promise<boolean> {
  try {
    const dataset = await getDatasetBySlug(slug);
    if (!dataset) return false;
    const { repo } = toRepoDataset(dataset);

    const [vector] = await embedTexts([repo.indexText]);
    await upsertVectorEntry({
      slug: repo.slug,
      vector,
      text: repo.indexText,
      keywords: repo.keywords,
      sourceFingerprint: repo.fingerprint,
      builtAt: new Date().toISOString(),
    });

    const valueIndex = await loadValueIndex();
    await saveValueIndex(replaceValueEntriesFor(valueIndex, repo.valueSource));
    return true;
  } catch (err) {
    console.warn(`[retrieval] cập nhật chỉ mục cho "${slug}" thất bại:`, err);
    return false;
  }
}

/** Bỏ dataset khỏi cả hai chỉ mục khi nó bị xoá (D6). Best-effort như trên. */
export async function removeDatasetIndexes(slug: string): Promise<boolean> {
  try {
    await removeVectorEntry(slug);
    const valueIndex = await loadValueIndex();
    await saveValueIndex(
      replaceValueEntriesFor(valueIndex, { slug, title: "", columns: [] }),
    );
    return true;
  } catch (err) {
    console.warn(`[retrieval] bỏ chỉ mục của "${slug}" thất bại:`, err);
    return false;
  }
}
