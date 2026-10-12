"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import { Map as MapLibreMap, Popup, setWorkerUrl } from "maplibre-gl";
import { useEffect, useRef, useState } from "react";

/**
 * GeoJsonMap — render GeoJSON FeatureCollection trên MapLibre GL.
 *
 * Preview-only:
 * - Base map: OpenFreeMap Positron (vector tiles, nền xám tối giản)
 * - Style riêng cho từng loại geometry (point/line/polygon), lọc bằng
 *   `geometry-type` nên FeatureCollection trộn nhiều loại vẫn vẽ đúng
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

/**
 * Nền bản đồ: OpenFreeMap Positron — xám tối giản, không tranh màu với dữ liệu.
 * Style khác nếu muốn: `.../styles/bright`, `.../styles/liberty`, `.../styles/dark`.
 *
 * VÌ SAO LÀ OPENFREEMAP (đo lại 2026-09-14):
 * - Không API key, không đăng ký, không giới hạn request, cho phép dùng thương
 *   mại. Attribution bắt buộc — MapLibre tự thêm, vì TileJSON `/planet` có sẵn
 *   field `attribution` (đã kiểm: trả về OpenFreeMap © OpenMapTiles + OSM).
 *
 * VÌ SAO KHÔNG PHẢI CARTO (nhà cung cấp cũ, đã bỏ):
 * - CARTO đóng basemap sau API key. Mỗi tile vẫn trả HTTP 200 nên không có lỗi
 *   mạng nào để bắt, nhưng ảnh bị in đè chữ "API KEY REQUIRED / carto.com/
 *   basemaps/apikeys" vắt chéo qua bản đồ ở mọi mức zoom. Kiểm lại 2026-09-14:
 *   vẫn còn nguyên.
 *
 * VÌ SAO KHÔNG PHẢI OPENSTREETMAP:
 * - `tile.openstreetmap.org` chạy trên hạ tầng tình nguyện và chính sách của họ
 *   cấm ứng dụng dùng. Máy chủ họ đã từng trả 403 "App is not following the tile
 *   usage policy" cho app này.
 *
 * VÌ SAO KHÔNG PHẢI ESRI:
 * - `Canvas/World_Light_Gray_Base` không cần khoá và xám sạch, nhưng điều khoản
 *   của Esri cho endpoint tile công khai không nói rõ về app bên thứ ba, mà map
 *   này sẽ đi vào bài báo.
 */
const BASEMAP_STYLE_URL = "https://tiles.openfreemap.org/styles/positron";

/**
 * Trỏ MapLibre vào worker tự phục vụ ở `public/maplibre/`.
 *
 * BẮT BUỘC, và phải chạy trước khi dựng Map đầu tiên. MapLibre 6 tự dò worker
 * theo `import.meta.url` của chunk đã bundle → với Turbopack ra
 * `/_next/static/chunks/maplibre-gl-worker.mjs`, không tồn tại. Khi worker
 * không tải được, MapLibre KHÔNG bắn lỗi: canvas vẫn dựng, attribution vẫn
 * hiện, nhưng mọi tile kẹt `loading` mãi và bản đồ trắng xám. Đã mất một vòng
 * debug vì triệu chứng trông hệt như lỗi nhà cung cấp tile.
 *
 * File trong `public/maplibre/` đồng bộ bằng `tools/sync-maplibre-worker.mjs`
 * (chạy tự động ở `predev`/`prebuild`).
 */
setWorkerUrl("/maplibre/maplibre-gl-worker.mjs");

const SOURCE_ID = "vne-geojson";

const COLOR_POLYGON_FILL = "#3b82f6";
const COLOR_POLYGON_LINE = "#1d4ed8";
const COLOR_LINE = "#3b82f6";
const COLOR_POINT_FILL = "#fbbf24";
const COLOR_POINT_LINE = "#92400e";

/** Id của các layer vẽ dữ liệu — dùng cho hover popup query. */
const DATA_LAYER_IDS = ["vne-fill", "vne-outline", "vne-line", "vne-point"];

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function popupHtml(properties: Record<string, unknown> | null): string {
  const entries = Object.entries(properties ?? {}).slice(0, 5);
  if (entries.length === 0) return "<div><em>Không có properties</em></div>";
  const rows = entries
    .map(([k, v]) => {
      const val = v == null ? "<em>null</em>" : escapeHtml(String(v));
      return `<tr><td style="padding-right:8px;color:#6b7280;font-weight:500">${escapeHtml(k)}</td><td>${val}</td></tr>`;
    })
    .join("");
  return `<table style="font-size:11px;font-family:ui-sans-serif,system-ui">${rows}</table>`;
}

type Bbox = [number, number, number, number];

/**
 * Bbox của FeatureCollection.
 *
 * MapLibre không có sẵn `getBounds()` cho GeoJSON source như Leaflet, nên phải
 * tự duyệt. Duyệt đệ quy mảng lồng nhau để một hàm lo được mọi geometry type
 * (Point → MultiPolygon), kể cả GeometryCollection.
 */
function computeBbox(fc: GeoJSON.FeatureCollection): Bbox | null {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  const walkCoords = (coords: unknown): void => {
    if (!Array.isArray(coords)) return;
    if (typeof coords[0] === "number" && typeof coords[1] === "number") {
      const [x, y] = coords as [number, number];
      if (!Number.isFinite(x) || !Number.isFinite(y)) return;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
      return;
    }
    for (const c of coords) walkCoords(c);
  };

  const walkGeometry = (geom: GeoJSON.Geometry | null | undefined): void => {
    if (!geom) return;
    if (geom.type === "GeometryCollection") {
      for (const g of geom.geometries) walkGeometry(g);
      return;
    }
    walkCoords(geom.coordinates);
  };

  for (const f of fc.features) walkGeometry(f?.geometry);

  if (!Number.isFinite(minX) || !Number.isFinite(minY)) return null;
  return [minX, minY, maxX, maxY];
}

export default function GeoJsonMap({
  data,
  height = 400,
  className,
  showPopup = true,
}: GeoJsonMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [phase, setPhase] = useState<Phase>("loading");
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    if (!containerRef.current) return;
    if (data.features.length === 0) {
      setErrorMsg("GeoJSON không có features.");
      setPhase("error");
      return;
    }

    // Defer 1 tick — đảm bảo container đã có dimension thực khi map init.
    // Nếu init ngay trong useEffect, container có thể vẫn 0×0 (layout chưa tính)
    // → fitBounds tính ra zoom vô nghĩa.
    let disposed = false;
    let map: MapLibreMap | null = null;
    let popup: Popup | null = null;

    const initMap = () => {
      if (disposed || !containerRef.current) return;

      const { clientWidth, clientHeight } = containerRef.current;
      if (clientWidth === 0 || clientHeight === 0) {
        // Container vẫn chưa có size — retry 1 frame nữa
        requestAnimationFrame(initMap);
        return;
      }

      try {
        map = new MapLibreMap({
          container: containerRef.current,
          style: BASEMAP_STYLE_URL,
          center: [107, 16],
          zoom: 4,
          scrollZoom: false,
          attributionControl: { compact: true },
        });
      } catch (err) {
        // MapLibre cần WebGL2 — máy/trình duyệt không có thì constructor throw.
        console.error("[GeoJsonMap] Khởi tạo MapLibre thất bại:", err);
        setErrorMsg(
          err instanceof Error && /webgl/i.test(err.message)
            ? "Trình duyệt không hỗ trợ WebGL để vẽ bản đồ."
            : "Không khởi tạo được bản đồ."
        );
        setPhase("error");
        return;
      }

      const mapInstance = map;
      let styleLoaded = false;

      mapInstance.on("error", (e) => {
        console.warn("[GeoJsonMap] MapLibre error:", e.error);
        // Style hỏng thì `load` không bao giờ bắn → spinner treo vô hạn, không
        // ai biết vì sao. Chỉ nhận lỗi của chính request style: tile lẻ hỏng
        // cũng bắn `error` nhưng bản đồ vẫn dùng được, đừng đánh sập vì một ô.
        const failedUrl = (e.error as Error & { url?: string })?.url;
        if (!styleLoaded && failedUrl?.startsWith(BASEMAP_STYLE_URL)) {
          setErrorMsg("Không tải được nền bản đồ.");
          setPhase("error");
        }
      });

      mapInstance.on("load", () => {
        if (disposed) return;
        styleLoaded = true;
        try {
          mapInstance.addSource(SOURCE_ID, { type: "geojson", data });

          mapInstance.addLayer({
            id: "vne-fill",
            type: "fill",
            source: SOURCE_ID,
            filter: ["==", ["geometry-type"], "Polygon"],
            paint: { "fill-color": COLOR_POLYGON_FILL, "fill-opacity": 0.25 },
          });
          mapInstance.addLayer({
            id: "vne-outline",
            type: "line",
            source: SOURCE_ID,
            filter: ["==", ["geometry-type"], "Polygon"],
            paint: { "line-color": COLOR_POLYGON_LINE, "line-width": 0.5 },
          });
          mapInstance.addLayer({
            id: "vne-line",
            type: "line",
            source: SOURCE_ID,
            filter: ["==", ["geometry-type"], "LineString"],
            paint: { "line-color": COLOR_LINE, "line-width": 1.5 },
          });
          mapInstance.addLayer({
            id: "vne-point",
            type: "circle",
            source: SOURCE_ID,
            filter: ["==", ["geometry-type"], "Point"],
            paint: {
              "circle-radius": 3,
              "circle-color": COLOR_POINT_FILL,
              "circle-opacity": 0.9,
              "circle-stroke-color": COLOR_POINT_LINE,
              "circle-stroke-width": 0.5,
            },
          });

          const bbox = computeBbox(data);
          if (bbox) {
            mapInstance.fitBounds(bbox, { padding: 20, animate: false });
          }

          if (showPopup) {
            popup = new Popup({
              closeButton: false,
              closeOnClick: false,
              offset: 8,
              className: "vne-map-popup",
            });

            mapInstance.on("mousemove", (e) => {
              const hits = mapInstance.queryRenderedFeatures(e.point, {
                layers: DATA_LAYER_IDS.filter((id) => mapInstance.getLayer(id)),
              });
              if (hits.length === 0) {
                popup?.remove();
                mapInstance.getCanvas().style.cursor = "";
                return;
              }
              mapInstance.getCanvas().style.cursor = "pointer";
              popup
                ?.setLngLat(e.lngLat)
                .setHTML(popupHtml(hits[0].properties))
                .addTo(mapInstance);
            });

            mapInstance.on("mouseout", () => {
              popup?.remove();
              mapInstance.getCanvas().style.cursor = "";
            });
          }

          setPhase("ready");
        } catch (err) {
          console.error("[GeoJsonMap] Thêm layer GeoJSON thất bại:", err);
          setErrorMsg(err instanceof Error ? err.message : "Không render được GeoJSON.");
          setPhase("error");
        }
      });
    };

    requestAnimationFrame(initMap);

    return () => {
      disposed = true;
      popup?.remove();
      map?.remove();
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
