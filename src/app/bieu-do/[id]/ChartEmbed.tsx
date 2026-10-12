"use client";

import { useEffect, useRef, useState } from "react";

declare global {
  interface Window {
    vegaEmbed?: (el: HTMLElement, spec: unknown, opts?: Record<string, unknown>) => Promise<unknown>;
  }
}

/** vega-lite cần `vega` có sẵn, vega-embed cần cả hai → tải LẦN LƯỢT, không song song */
const SCRIPTS = ["https://cdn.jsdelivr.net/npm/vega@5", "https://cdn.jsdelivr.net/npm/vega-lite@5", "https://cdn.jsdelivr.net/npm/vega-embed@6"];

function loadScript(src: string): Promise<void> {
  const existing = document.querySelector<HTMLScriptElement>(`script[data-src="${src}"]`);
  if (existing?.dataset.loaded) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const s = existing ?? document.createElement("script");
    s.src = src;
    s.dataset.src = src;
    s.onload = () => {
      s.dataset.loaded = "1";
      resolve();
    };
    s.onerror = () => reject(new Error(`không tải được ${src}`));
    if (!existing) document.head.appendChild(s);
  });
}

/** Vẽ spec Vega-Lite bằng vega-embed tải từ CDN — không thêm dependency npm */
export default function ChartEmbed({ spec }: { spec: Record<string, unknown> }) {
  const ref = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      for (const src of SCRIPTS) await loadScript(src);
      if (cancelled || !ref.current || !window.vegaEmbed) return;
      // Đo chiều rộng thật — "container" đo ra 0 khi vẽ ngay sau khi gắn, cột không hiện
      const width = Math.max(200, Math.min(900, ref.current.clientWidth) - 180);
      await window.vegaEmbed(ref.current, { ...spec, width }, { actions: { export: true, source: false, compiled: false, editor: false } });
    })().catch((e) => !cancelled && setError(String(e?.message ?? e)));
    return () => {
      cancelled = true;
    };
  }, [spec]);

  return (
    <>
      <div ref={ref} className="w-full" />
      {error && <p className="text-sm text-red-600 mt-2">Không vẽ được biểu đồ: {error}</p>}
    </>
  );
}
