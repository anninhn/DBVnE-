"use client";

import { useEffect, useState } from "react";
import GeoJsonMapLazy from "./GeoJsonMapLazy";
import { proxiedR2Url } from "@/lib/r2/proxy";
import type { Dataset } from "@/lib/types/dataset";

/**
 * DatasetGeoJsonPreview — wrapper fetch GeoJSON từ R2 + render GeoJsonMapLazy.
 *
 * Dùng cho detail page (Dataset card tab) — render map lớn (450px). Khi dataset
 * có geometry_type, được nhúng trong DatasetCardTabs (toggle Map/Table).
 *
 * `embedded=true` bỏ border/rounded — giả định parent đã có border (tránh lồng).
 *
 * Fail gracefully: lỗi fetch/parse → message gọn, không block page.
 */
interface Props {
  dataset: Dataset;
  height?: number;
  /** Bỏ border/rounded khi render bên trong container đã có border (vd: DatasetCardTabs). */
  embedded?: boolean;
}

type LoadState = "loading" | "ready" | "error";

export default function DatasetGeoJsonPreview({ dataset, height = 450, embedded = false }: Props) {
  // Class chung cho wrapper — embedded=true thì chỉ nền, không border/rounded
  const surfaceClass = embedded
    ? "flex items-center justify-center bg-hf-bg-subtle text-[13px] text-hf-text-muted"
    : "flex items-center justify-center bg-hf-bg-subtle border border-hf-border rounded-md text-[13px] text-hf-text-muted";
  const frameClass = embedded
    ? "overflow-hidden"
    : "border border-hf-border rounded-md overflow-hidden";
  const [state, setState] = useState<LoadState>("loading");
  const [data, setData] = useState<GeoJSON.FeatureCollection | null>(null);
  const [errorMsg, setErrorMsg] = useState("");

  const fileUrl = dataset.resources[0]?.file_url;

  useEffect(() => {
    if (!fileUrl) return;

    let cancelled = false;
    (async () => {
      setState("loading");
      try {
        const res = await fetch(proxiedR2Url(fileUrl));
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = (await res.json()) as GeoJSON.FeatureCollection;
        if (!json || json.type !== "FeatureCollection" || !Array.isArray(json.features)) {
          throw new Error("File không phải GeoJSON FeatureCollection hợp lệ.");
        }
        if (!cancelled) {
          setData(json);
          setState("ready");
        }
      } catch (err) {
        if (!cancelled) {
          setErrorMsg(err instanceof Error ? err.message : "Không xác định");
          setState("error");
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [fileUrl]);

  if (!fileUrl) {
    return (
      <div className={surfaceClass} style={{ height }}>
        File GeoJSON không khả dụng.
      </div>
    );
  }

  if (state === "loading") {
    return (
      <div className={surfaceClass} style={{ height }}>
        <svg className="animate-spin h-4 w-4 mr-2" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
        Đang tải bản đồ…
      </div>
    );
  }

  if (state === "error" || !data) {
    return (
      <div className={surfaceClass} style={{ height }}>
        Không tải được bản đồ. {errorMsg && <span className="text-hf-text-faint">({errorMsg})</span>}
      </div>
    );
  }

  return (
    <div className={frameClass}>
      <GeoJsonMapLazy data={data} height={height} />
    </div>
  );
}
