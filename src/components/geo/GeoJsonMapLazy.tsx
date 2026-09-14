"use client";

import dynamic from "next/dynamic";
import type { ComponentProps } from "react";

/**
 * GeoJsonMapLazy — dynamic import wrapper cho GeoJsonMap.
 *
 * MapLibre cần `window`/WebGL context → không thể SSR. Wrapper này lazy-load
 * component chỉ ở client, tránh crash build/SSR, và giữ maplibre-gl (~230KB
 * gzip) ra khỏi INITIAL chunk của trang detail.
 *
 * Usage:
 *   import GeoJsonMapLazy from "@/components/geo/GeoJsonMapLazy";
 *   <GeoJsonMapLazy data={fc} height={400} />
 */
const GeoJsonMap = dynamic(() => import("./GeoJsonMap"), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center text-[13px] text-hf-text-muted bg-hf-bg-subtle border border-hf-border rounded-md">
      <svg className="animate-spin h-4 w-4 mr-2" viewBox="0 0 24 24" fill="none">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
      </svg>
      Đang tải bản đồ…
    </div>
  ),
});

export default function GeoJsonMapLazy(props: ComponentProps<typeof GeoJsonMap>) {
  return <GeoJsonMap {...props} />;
}
