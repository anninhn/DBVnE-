/**
 * Pilot harness insight CHỈ chạy local (`npm run dev` trên máy Ninh): route chạy
 * spawn Claude Code CLI trên máy, nên tuyệt đối không bật ở bản deploy.
 *
 * Bật bằng `INSIGHT_LOCAL=1` trong .env.local. Thiếu cờ → mọi route /api/insight/*
 * trả 404 như thể không tồn tại.
 */
export function insightEnabled(): boolean {
  return process.env.INSIGHT_LOCAL === "1" && process.env.NODE_ENV !== "production";
}
