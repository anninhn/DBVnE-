"use client";

import { useEffect, useMemo, useState } from "react";
import type { Dataset, Resource } from "@/lib/types/dataset";

const PREVIEW_ROW_LIMIT = 1000;

type Row = Record<string, string | number | boolean | null>;

export interface ClientFetchState {
  state: "idle" | "loading" | "ready" | "error";
  data?: { structuredData: Row[]; columns: string[] };
  errorMsg?: string;
}

/**
 * Quản lý client-side GeoJSON fetch khi SSR skip (file >10MB → withPreviewData
 * early-return, không set structured_data). DatasetViewer tự fetch trong browser
 * (không block Vercel), populate local state → render đầy đủ features.
 */
export function useDatasetPreview(dataset: Dataset): {
  ssrViewableResources: Resource[];
  geoResourceForFetch: Resource | null;
  clientFetch: ClientFetchState;
  viewableResources: Resource[];
} {
  const ssrViewableResources = useMemo(
    () =>
      dataset.resources.filter(
        (r) => r.structured_data && r.structured_data.length > 0,
      ),
    [dataset.resources],
  );

  const geoResourceForFetch = useMemo(
    () =>
      ssrViewableResources.length > 0
        ? null
        : (dataset.resources.find(
            (r) => r.file_type === "geojson" && r.file_url,
          ) ?? null),
    [ssrViewableResources.length, dataset.resources],
  );

  const [clientFetch, setClientFetch] = useState<ClientFetchState>({
    state: "idle",
  });

  useEffect(() => {
    if (!geoResourceForFetch?.file_url) {
      return;
    }
    const fileUrl = geoResourceForFetch.file_url;
    let cancelled = false;
    setClientFetch({ state: "loading" });

    (async () => {
      try {
        const res = await fetch(fileUrl);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = (await res.json()) as GeoJSON.FeatureCollection;
        const features = Array.isArray(json?.features) ? json.features : [];
        if (features.length === 0) throw new Error("GeoJSON không có features");

        // Collect headers từ tất cả features (mỗi feature có thể có props khác nhau)
        const headerSet = new Set<string>();
        for (const f of features) {
          for (const k of Object.keys(f?.properties ?? {})) headerSet.add(k);
        }
        const columns = Array.from(headerSet);

        const structuredData: Row[] = features
          .slice(0, PREVIEW_ROW_LIMIT)
          .map((f) => {
            const props = (f?.properties ?? {}) as Record<string, unknown>;
            const obj: Row = {};
            for (const h of columns) {
              const v = props[h];
              if (v == null) obj[h] = null;
              else if (typeof v === "number" || typeof v === "boolean")
                obj[h] = v;
              else if (typeof v === "string") obj[h] = v;
              else obj[h] = JSON.stringify(v);
            }
            return obj;
          });

        if (!cancelled) {
          setClientFetch({
            state: "ready",
            data: { structuredData, columns },
          });
        }
      } catch (err) {
        if (!cancelled) {
          setClientFetch({
            state: "error",
            errorMsg: err instanceof Error ? err.message : "Không xác định",
          });
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [geoResourceForFetch?.file_url]);

  const viewableResources = useMemo<Resource[]>(() => {
    if (ssrViewableResources.length > 0) return ssrViewableResources;
    if (clientFetch.state === "ready" && clientFetch.data && geoResourceForFetch) {
      return [
        {
          ...geoResourceForFetch,
          structured_data: clientFetch.data.structuredData,
          columns: clientFetch.data.columns,
        },
      ];
    }
    return [];
  }, [ssrViewableResources, clientFetch, geoResourceForFetch]);

  return { ssrViewableResources, geoResourceForFetch, clientFetch, viewableResources };
}
