"use client";

import { useEffect, useState } from "react";
import { Map as MapIcon } from "lucide-react";
import GeoJsonMapLazy from "./GeoJsonMapLazy";
import type { UploadResult } from "@/components/upload/UploadWizard";

/**
 * UploadWizardMapPreview — small map (250px) cho step 3 wizard review.
 *
 * Verify geo data trước khi commit — user thấy ngay ranh giới/vị trí có đúng không.
 * Bỏ qua nếu upload.format !== "geojson" hoặc publicUrl rỗng (R2 chưa config public).
 */
interface Props {
  upload: UploadResult;
  height?: number;
}

type LoadState = "loading" | "ready" | "error";

export default function UploadWizardMapPreview({ upload, height = 250 }: Props) {
  const [state, setState] = useState<LoadState>("loading");
  const [data, setData] = useState<GeoJSON.FeatureCollection | null>(null);

  const url = upload.publicUrl;
  const isGeojson = upload.format === "geojson";

  useEffect(() => {
    if (!isGeojson || !url) return;
    let cancelled = false;
    (async () => {
      setState("loading");
      try {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = (await res.json()) as GeoJSON.FeatureCollection;
        if (!json || json.type !== "FeatureCollection" || !Array.isArray(json.features)) {
          throw new Error("Không phải GeoJSON FeatureCollection.");
        }
        if (!cancelled) {
          setData(json);
          setState("ready");
        }
      } catch {
        if (!cancelled) setState("error");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [url, isGeojson]);

  // Skip silently — tabular files + missing publicUrl không có map
  if (!isGeojson || !url) return null;

  return (
    <section className="bg-hf-bg border border-hf-border rounded-md p-4">
      <div className="flex items-center gap-2 mb-2">
        <MapIcon className="w-4 h-4 text-hf-text-muted" strokeWidth={1.75} aria-hidden />
        <h3 className="text-[13px] font-semibold text-hf-text">Bản đồ preview</h3>
        {data && (
          <span className="text-[11px] text-hf-text-faint ml-auto">
            {data.features.length} features
          </span>
        )}
      </div>

      {state === "loading" && (
        <div
          className="flex items-center justify-center bg-hf-bg-subtle border border-hf-border rounded text-[12px] text-hf-text-muted"
          style={{ height }}
        >
          <svg className="animate-spin h-3.5 w-3.5 mr-2" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          Đang tải bản đồ…
        </div>
      )}

      {state === "error" && (
        <div
          className="flex items-center justify-center bg-hf-bg-subtle border border-hf-border rounded text-[12px] text-hf-text-muted"
          style={{ height }}
        >
          Không tải được bản đồ preview. Tiếp tục commit, xem map ở detail page sau.
        </div>
      )}

      {state === "ready" && data && (
        <div className="border border-hf-border rounded overflow-hidden">
          <GeoJsonMapLazy data={data} height={height} />
        </div>
      )}
    </section>
  );
}
