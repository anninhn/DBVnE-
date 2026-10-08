/**
 * Thống kê tối thiểu cho harness — TS thuần, không dependency. Mỗi phép tính chỉ
 * chạy trên vài chục điểm (tỉnh × năm) nên không cần thư viện số.
 *
 * Kết quả được kiểm chéo với statsmodels (prototypes/insight-demo/crosscheck.py).
 */

export interface OLSResult {
  n: number;
  slope: number;
  intercept: number;
  /** Hệ số tương quan Pearson */
  r: number;
}

/** Hồi quy tuyến tính đơn y = a + b·x. `null` khi n < 3 hoặc x không đổi. */
export function ols(xs: number[], ys: number[]): OLSResult | null {
  const n = Math.min(xs.length, ys.length);
  if (n < 3) return null;
  let mx = 0;
  let my = 0;
  for (let i = 0; i < n; i++) {
    mx += xs[i];
    my += ys[i];
  }
  mx /= n;
  my /= n;
  let sxx = 0;
  let syy = 0;
  let sxy = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - mx;
    const dy = ys[i] - my;
    sxx += dx * dx;
    syy += dy * dy;
    sxy += dx * dy;
  }
  if (sxx === 0) return null;
  const slope = sxy / sxx;
  const r = syy === 0 ? 0 : sxy / Math.sqrt(sxx * syy);
  return { n, slope, intercept: my - slope * mx, r };
}

/** PRNG có seed (mulberry32) — để kết quả hoán vị lặp lại được giữa các lần chạy. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * p-value hai phía cho độ dốc bằng kiểm định hoán vị: xáo y, đếm tỷ lệ lần độ dốc
 * xáo có |độ dốc| ≥ |độ dốc thật|. Hợp với n nhỏ (8–15 tỉnh/vùng), không cần giả
 * định phân phối chuẩn.
 */
export function permutationPValue(xs: number[], ys: number[], iterations = 2000, seed = 42): number | null {
  const obs = ols(xs, ys);
  if (!obs) return null;
  const rand = rng(seed);
  const y = ys.slice();
  let hits = 0;
  for (let it = 0; it < iterations; it++) {
    for (let i = y.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [y[i], y[j]] = [y[j], y[i]];
    }
    const perm = ols(xs, y);
    if (perm && Math.abs(perm.slope) >= Math.abs(obs.slope) - 1e-12) hits++;
  }
  return (hits + 1) / (iterations + 1);
}

/** Tổng bình phương phần dư của hồi quy tuyến tính trên (t, v). */
export function sse(ts: number[], vs: number[]): number {
  const fit = ols(ts, vs);
  if (!fit) return Infinity;
  let s = 0;
  for (let i = 0; i < ts.length; i++) {
    const e = vs[i] - (fit.intercept + fit.slope * ts[i]);
    s += e * e;
  }
  return s;
}

/**
 * Làm tròn để hiển thị và để rào chắn đối chiếu: giữ `sig` chữ số có nghĩa.
 * Không giới hạn số chữ số thập phân — độ dốc có thể rất nhỏ khi x tính bằng nghìn
 * đồng (vd −0,000234), cắt ở 4 chữ số sẽ mất hết thông tin.
 */
export function roundSig(v: number, sig = 3): number {
  if (!Number.isFinite(v) || v === 0) return v;
  const digits = Math.max(0, sig - 1 - Math.floor(Math.log10(Math.abs(v))));
  const f = 10 ** digits;
  return Math.round(v * f) / f;
}
