"use client";

import { useState } from "react";
import { Map as MapIcon, Table as TableIcon } from "lucide-react";
import type { Dataset } from "@/lib/types/dataset";
import { formatCompactNumber } from "@/lib/format";
import DatasetViewer from "./DatasetViewer";
import DatasetGeoJsonPreview from "@/components/geo/DatasetGeoJsonPreview";

interface Props {
  dataset: Dataset;
}

/**
 * DatasetCardTabs — wrapper cho Dataset card tab với toggle Map/Table (chỉ GeoJSON).
 *
 * - GeoJSON dataset (có geometry_type): render toggle Map/Table ở header. Cả 2 view
 *   được mount đồng thời, dùng CSS `hidden` để toggle — tránh re-fetch GeoJSON +
 *   re-import GeoJsonMap lazy module khi user chuyển đi chuyển lại.
 * - Tabular dataset: chỉ render DatasetViewer, không toggle.
 *
 * Pattern tương tự R2FileViewer (tab Files and versions) nhưng render-both-hidden
 * thay vì conditional — vì DatasetGeoJsonPreview đã fetch GeoJSON client-side,
 * unmount sẽ reset state.
 */
export default function DatasetCardTabs({ dataset }: Props) {
  // Detect GeoJSON từ resource file_type (authoritative) HOẶC geometry_type
  // (metadata field). Cần cả 2 vì metadata cũ có thể thiếu geometry_type khi upload
  // trước khi geo fields support được commit.
  const isGeo =
    dataset.resources.some((r) => r.file_type === "geojson") ||
    Boolean(dataset.geometry_type);
  const [view, setView] = useState<"map" | "table">("map");

  // Tabular — không cần toggle, render thẳng DatasetViewer.
  if (!isGeo) return <DatasetViewer dataset={dataset} />;

  const featureCount = dataset.feature_count;

  return (
    <div className="mb-6">
      <div className="border border-hf-border rounded-md overflow-hidden">
        {/* Header — feature count + toggle Map/Table */}
        <div className="flex items-center justify-between px-3 py-1.5 bg-hf-bg-subtle border-b border-hf-border">
          <span className="text-[11px] text-hf-text-faint">
            {featureCount != null
              ? `${formatCompactNumber(featureCount)} features`
              : "GeoJSON"}
          </span>
          <div className="flex gap-1">
            <ToggleButton
              active={view === "map"}
              onClick={() => setView("map")}
              icon={<MapIcon className="w-3 h-3" strokeWidth={1.75} aria-hidden />}
              label="Map"
            />
            <ToggleButton
              active={view === "table"}
              onClick={() => setView("table")}
              icon={<TableIcon className="w-3 h-3" strokeWidth={1.75} aria-hidden />}
              label="Table"
            />
          </div>
        </div>

        {/* Map luôn mount (CSS hidden khi không active) — giữ state GeoJSON đã fetch
            + Leaflet instance, tránh refetch/re-import khi toggle đi trở lại. */}
        <div className={view === "map" ? "" : "hidden"}>
          <DatasetGeoJsonPreview dataset={dataset} height={450} embedded />
        </div>
        {/* Table conditional mount — chỉ render khi view === "table". Lý do: nếu
            GeoJSON lớn (>10MB), SSR skip structured_data → DatasetViewer render
            GeoJsonClientTable fetch client-side. Mount upfront = download 169MB
            trên page load dù user chỉ xem map. Lazy mount tránh điều đó. */}
        {view === "table" && <DatasetViewer dataset={dataset} />}
      </div>
    </div>
  );
}

/** Toggle pill button — dùng cho Map/Table switch (giống R2FileViewer). */
function ToggleButton({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium transition ${
        active
          ? "bg-hf-text text-hf-bg"
          : "bg-hf-bg text-hf-text-muted hover:text-hf-text border border-hf-border"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}
