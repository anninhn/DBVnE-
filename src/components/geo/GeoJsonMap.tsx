"use client";

import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { useEffect, useRef, useState } from "react";

/**
 * GeoJsonMap — render GeoJSON FeatureCollection trên Leaflet.
 *
 * Preview-only: nhẹ (~40KB), không cần WebGL, render bằng Canvas.
 * - Base map: OSM raster tiles
 * - Style per geometry kind (point/line/polygon)
 * - Auto-fit bounds đến data
 * - Hover popup top 5 properties
 *
 * Component là client-only — phải dynamic import với ssr:false (xem GeoJsonMapLazy).
 */

export interface GeoJsonMapProps {
  /** FeatureCollection đã fetch sẵn từ R2 */
  data: GeoJSON.FeatureCollection;
  /** Pixel height, default 400 */
  height?: number;
  className?: string;
  /** Bật hover popup, default true */
  showPopup?: boolean;
}

type Phase = "loading" | "ready" | "error";

const DATA_STYLE_POLYGON: L.PathOptions = {
  color: "#1d4ed8",
  weight: 0.5,
  fillColor: "#3b82f6",
  fillOpacity: 0.25,
};
const DATA_STYLE_LINE: L.PathOptions = {
  color: "#3b82f6",
  weight: 1.5,
};
const DATA_STYLE_POINT: L.CircleMarkerOptions = {
  radius: 3,
  color: "#92400e",
  weight: 0.5,
  fillColor: "#fbbf24",
  fillOpacity: 0.9,
};

type GeomKind = "point" | "line" | "polygon";

function detectGeomKind(fc: GeoJSON.FeatureCollection): GeomKind {
  const counts: Record<GeomKind, number> = { point: 0, line: 0, polygon: 0 };
  for (const f of fc.features) {
    const t = f.geometry?.type;
    if (t === "Point" || t === "MultiPoint") counts.point++;
    else if (t === "LineString" || t === "MultiLineString") counts.line++;
    else counts.polygon++;
  }
  return counts.point >= counts.line && counts.point >= counts.polygon
    ? "point"
    : counts.line >= counts.polygon
      ? "line"
      : "polygon";
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function popupHtml(feature: GeoJSON.Feature): string {
  const props = feature.properties ?? {};
  const entries = Object.entries(props).slice(0, 5);
  if (entries.length === 0) return "<div><em>Không có properties</em></div>";
  const rows = entries
    .map(([k, v]) => {
      const val = v == null ? "<em>null</em>" : escapeHtml(String(v));
      return `<tr><td style="padding-right:8px;color:#6b7280;font-weight:500">${escapeHtml(k)}</td><td>${val}</td></tr>`;
    })
    .join("");
  return `<table style="font-size:11px;font-family:ui-sans-serif,system-ui">${rows}</table>`;
}

export default function GeoJsonMap({
  data,
  height = 400,
  className,
  showPopup = true,
}: GeoJsonMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const [phase, setPhase] = useState<Phase>("loading");
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    if (!containerRef.current) return;
    if (data.features.length === 0) {
      setErrorMsg("GeoJSON không có features.");
      setPhase("error");
      return;
    }

    // Defer 1 tick — đảm bảo container đã có dimension thực khi Leaflet init.
    // Nếu init ngay trong useEffect, container có thể vẫn 0×0 (layout chưa tính)
    // → Canvas renderer crash với `this._ctx.clearRect`.
    let disposed = false;
    let map: L.Map | null = null;

    const initMap = () => {
      if (disposed || !containerRef.current) return;

      const { clientWidth, clientHeight } = containerRef.current;
      if (clientWidth === 0 || clientHeight === 0) {
        // Container vẫn chưa có size — retry 1 frame nữa
        requestAnimationFrame(initMap);
        return;
      }

      // preferCanvas → Canvas renderer, render 1000+ polygons nhanh hơn SVG nhiều.
      map = L.map(containerRef.current, {
        preferCanvas: true,
        scrollWheelZoom: false,
        attributionControl: true,
      }).setView([16, 107], 4);
      mapRef.current = map;

      // Nền bản đồ: OpenStreetMap + lọc grayscale bằng CSS.
      //
      // Trước đây dùng CartoDB Positron. CARTO đã đóng basemap sau API key và
      // ĐÓNG DẤU thẳng vào ảnh tile: mỗi tile trả về HTTP 200 kèm chữ
      // "API KEY REQUIRED / carto.com/basemaps/apikeys" vắt chéo qua bản đồ.
      // Kiểm 2026-09-07 ở nhiều mức zoom: tile nào cũng bị. Không có lỗi mạng
      // nào để bắt — ảnh trả về "thành công", chỉ là nội dung bị đóng dấu.
      //
      // OSM không cần khoá. Nó có màu, nên lọc grayscale ở CSS để giữ đúng ý đồ
      // thiết kế ban đầu: nền xám tối giản, không tranh màu với dữ liệu vẽ lên.
      // Lọc ở tile layer chứ không ở cả map — lọc cả map thì polygon dữ liệu
      // cũng mất màu, tức mất luôn thứ người ta vào đây để xem.
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: "© OpenStreetMap contributors",
        className: "vne-basemap-grayscale",
      }).addTo(map);

      try {
        const kind = detectGeomKind(data);
        const pointToLayer = (_feat: GeoJSON.Feature<GeoJSON.Point>, latlng: L.LatLng) =>
          L.circleMarker(latlng, DATA_STYLE_POINT);

        const style =
          kind === "polygon"
            ? DATA_STYLE_POLYGON
            : kind === "line"
              ? DATA_STYLE_LINE
              : DATA_STYLE_POINT;

        const onEachFeature = (feat: GeoJSON.Feature, layer: L.Layer) => {
          if (!showPopup) return;
          // Hover popup — popup nhẹ theo vị trí mouse
          layer.on("mouseover", (e: L.LeafletMouseEvent) => {
            const html = popupHtml(feat);
            L.popup({ closeButton: false, offset: L.point(0, 8), className: "vne-map-popup" })
              .setLatLng(e.latlng)
              .setContent(html)
              .openOn(map!);
          });
          layer.on("mouseout", () => {
            map!.closePopup();
          });
        };

        const dataLayer = L.geoJSON(data, {
          style: kind === "point" ? undefined : style,
          pointToLayer: kind === "point" ? pointToLayer : undefined,
          onEachFeature,
        }).addTo(map);

        // Auto-fit bounds
        try {
          const bounds = dataLayer.getBounds();
          if (bounds.isValid()) {
            map.fitBounds(bounds, { padding: [20, 20] });
          }
        } catch {
          // bounds có thể invalid với empty geometry, ignore
        }

        // Force recalc layout sau khi all layers added
        map.invalidateSize();
        setPhase("ready");
      } catch (err) {
        console.error("[GeoJsonMap] L.geoJSON failed:", err);
        setErrorMsg(err instanceof Error ? err.message : "Không render được GeoJSON.");
        setPhase("error");
      }
    };

    requestAnimationFrame(initMap);

    return () => {
      disposed = true;
      if (map) {
        map.remove();
      }
      mapRef.current = null;
    };
  }, [data, showPopup]);

  return (
    <div className="relative" style={{ width: "100%", height }}>
      <div
        ref={containerRef}
        className={className}
        style={{ width: "100%", height }}
        role="img"
        aria-label="Bản đồ preview GeoJSON"
      />
      {phase === "loading" && (
        <div className="absolute top-2 right-2 bg-white/90 text-hf-text-muted text-[10px] px-2 py-0.5 rounded border border-hf-border pointer-events-none z-[1000]">
          Đang tải bản đồ…
        </div>
      )}
      {phase === "error" && (
        <div className="absolute inset-0 flex items-center justify-center bg-hf-bg-subtle/95 text-[12px] text-hf-text-muted text-center px-4">
          <div>
            <div className="font-medium text-hf-red mb-1">Không hiển thị được bản đồ</div>
            <div className="text-hf-text-faint">{errorMsg || "Lỗi không xác định"}</div>
          </div>
        </div>
      )}
    </div>
  );
}
