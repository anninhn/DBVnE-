#!/usr/bin/env python3
"""
Merge Vietnamese administrative boundary GeoJSON files from
thanglequoc/vietnamese-provinces-database into 2 single FeatureCollections.

Output:
  vietnam_provinces.geojson  — 34 province-level MultiPolygons
  vietnam_wards.geojson      — ~3321 ward/commune-level MultiPolygons

Source layout (per repo):
  json/geojson/{code}_{slug}/{code}_{slug}.geojson       — 1 province/file
  json/geojson/{code}_{slug}/wards/{ward}_{slug}.geojson — 1 ward/file

Strategy:
  1. List json/geojson/ via GitHub Contents API (1 call).
  2. For each province dir: download province file + list wards/ subfolder.
  3. Download all ward files in parallel (ThreadPoolExecutor).
  4. Strip per-feature bbox; compute top-level bbox from coordinates.
  5. Write 2 single FeatureCollections.

Run:
  GITHUB_TOKEN=... python3 tools/merge-vn-admin-units.py
  # or auto-load .env.local:
  python3 tools/merge-vn-admin-units.py
"""
from __future__ import annotations

import json
import os
import sys
import time
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

REPO = "thanglequoc/vietnamese-provinces-database"
BRANCH = "master"
API_BASE = f"https://api.github.com/repos/{REPO}/contents"
RAW_BASE = f"https://raw.githubusercontent.com/{REPO}/{BRANCH}"
OUTPUT_DIR = Path("/Users/ninhnguyen/Desktop/Research/raw_data/vn-admin")

# Optional: load .env.local from project root (best-effort, no dep on python-dotenv)
ENV_LOCAL = Path(__file__).resolve().parent.parent / ".env.local"
if ENV_LOCAL.exists():
    for line in ENV_LOCAL.read_text().splitlines():
        if line.startswith("GITHUB_TOKEN="):
            os.environ.setdefault("GITHUB_TOKEN", line.split("=", 1)[1].strip('"').strip("'"))
            break

GITHUB_TOKEN = os.environ.get("GITHUB_TOKEN")


def _headers() -> dict[str, str]:
    h = {"User-Agent": "vn-admin-merge-script", "Accept": "application/vnd.github+json"}
    if GITHUB_TOKEN:
        h["Authorization"] = f"Bearer {GITHUB_TOKEN}"
    return h


def gh_list(url: str) -> list[dict]:
    """List a folder via GitHub Contents API. Returns list of entries."""
    req = urllib.request.Request(url, headers=_headers())
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.loads(resp.read().decode("utf-8"))


def raw_download(url: str) -> dict:
    """Download a raw file with retry. Returns parsed JSON."""
    req = urllib.request.Request(url, headers={"User-Agent": "vn-admin-merge-script"})
    last_err: Exception | None = None
    for attempt in range(3):
        try:
            with urllib.request.urlopen(req, timeout=60) as resp:
                return json.loads(resp.read().decode("utf-8"))
        except (urllib.error.URLError, urllib.error.HTTPError, ConnectionError) as e:
            last_err = e
            time.sleep(1 + attempt)
    raise RuntimeError(f"download failed after 3 retries: {last_err}")


def update_bbox(bbox: list[float], coords) -> None:
    """Walk a GeoJSON coordinate nest, update bbox in place."""
    if not coords:
        return
    if isinstance(coords[0], (int, float)):
        lng, lat = coords[0], coords[1]
        if lng < bbox[0]:
            bbox[0] = lng
        if lat < bbox[1]:
            bbox[1] = lat
        if lng > bbox[2]:
            bbox[2] = lng
        if lat > bbox[3]:
            bbox[3] = lat
    else:
        for sub in coords:
            update_bbox(bbox, sub)


def compute_bbox(features: list[dict]) -> list[float]:
    bbox = [float("inf"), float("inf"), float("-inf"), float("-inf")]
    for f in features:
        geom = f.get("geometry") or {}
        update_bbox(bbox, geom.get("coordinates") or [])
    return bbox


def fetch_features(raw_url: str) -> tuple[list[dict], str | None]:
    """Download a single GeoJSON file → (features, error_msg). Strips per-feature bbox."""
    try:
        data = raw_download(raw_url)
    except Exception as e:  # noqa: BLE001
        return [], str(e)
    feats = data.get("features", []) if isinstance(data, dict) else []
    for f in feats:
        f.pop("bbox", None)
    return feats, None


def main() -> int:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    print(f"Output dir: {OUTPUT_DIR}")
    print(f"GitHub auth: {'token loaded' if GITHUB_TOKEN else 'anonymous (60/hr API limit)'}")

    print(f"\n[1/4] Listing {REPO}/json/geojson/ ...")
    top = gh_list(f"{API_BASE}/json/geojson")
    province_dirs = [p for p in top if p.get("type") == "dir"]
    print(f"      → {len(province_dirs)} province directories")

    province_features: list[dict] = []
    ward_features: list[dict] = []
    errors: list[str] = []

    with ThreadPoolExecutor(max_workers=8) as pool:
        # Phase A: download province files + list ward folders in parallel
        prov_jobs: dict = {}
        ward_list_jobs: dict = {}
        for p in province_dirs:
            slug = p["name"]
            prov_jobs[
                pool.submit(fetch_features, f"{RAW_BASE}/json/geojson/{slug}/{slug}.geojson")
            ] = slug
            ward_list_jobs[
                pool.submit(gh_list, f"{API_BASE}/json/geojson/{slug}/wards")
            ] = slug

        print(f"\n[2/4] Downloading {len(prov_jobs)} province files + listing ward folders...")
        ward_dl_jobs: dict = {}
        for fut in as_completed(prov_jobs):
            slug = prov_jobs[fut]
            feats, err = fut.result()
            if err:
                errors.append(f"province {slug}: {err}")
                print(f"      ! province {slug}: {err}")
            else:
                province_features.extend(feats)
                print(f"      ✓ province {slug}: +{len(feats)} features")

        for fut in as_completed(ward_list_jobs):
            slug = ward_list_jobs[fut]
            try:
                listing = fut.result()
            except Exception as e:  # noqa: BLE001
                errors.append(f"wards list {slug}: {e}")
                print(f"      ! wards list {slug}: {e}")
                continue
            for w in listing:
                if w.get("type") != "file" or not w["name"].endswith(".geojson"):
                    continue
                raw_url = f"{RAW_BASE}/json/geojson/{slug}/wards/{w['name']}"
                ward_dl_jobs[pool.submit(fetch_features, raw_url)] = (slug, w["name"])

        # Phase B: download all ward files
        total_wards = len(ward_dl_jobs)
        print(f"\n[3/4] Downloading {total_wards} ward files (8 parallel)...")
        done = 0
        for fut in as_completed(ward_dl_jobs):
            slug, fname = ward_dl_jobs[fut]
            feats, err = fut.result()
            done += 1
            if err:
                errors.append(f"ward {slug}/{fname}: {err}")
            else:
                ward_features.extend(feats)
            if done % 200 == 0 or done == total_wards:
                pct = done * 100 // total_wards
                print(f"      [{pct:3d}%] {done}/{total_wards} — {len(ward_features)} features so far")

    print(f"\n[4/4] Writing merged files...")
    prov_fc = {
        "type": "FeatureCollection",
        "bbox": compute_bbox(province_features),
        "features": province_features,
    }
    wards_fc = {
        "type": "FeatureCollection",
        "bbox": compute_bbox(ward_features),
        "features": ward_features,
    }

    prov_path = OUTPUT_DIR / "vietnam_provinces.geojson"
    wards_path = OUTPUT_DIR / "vietnam_wards.geojson"

    with open(prov_path, "w", encoding="utf-8") as f:
        json.dump(prov_fc, f, ensure_ascii=False)
    with open(wards_path, "w", encoding="utf-8") as f:
        json.dump(wards_fc, f, ensure_ascii=False)

    prov_mb = prov_path.stat().st_size / 1024 / 1024
    wards_mb = wards_path.stat().st_size / 1024 / 1024
    print(f"\n✓ {prov_path.name}: {len(province_features)} features, bbox={prov_fc['bbox']}, {prov_mb:.1f}MB")
    print(f"✓ {wards_path.name}: {len(ward_features)} features, bbox={wards_fc['bbox']}, {wards_mb:.1f}MB")

    if errors:
        print(f"\n⚠ {len(errors)} errors (features still merged, just incomplete):")
        for e in errors[:10]:
            print(f"  - {e}")
        if len(errors) > 10:
            print(f"  ... +{len(errors) - 10} more")
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
