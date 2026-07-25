#!/usr/bin/env python3
"""
Filter vietnam_wards.geojson → file riêng theo tỉnh, dùng province_code
từ thanglequoc/vietnamese-provinces-database (lookup table JSON).

Cách dùng:
    python3 data/scripts/split_wards_geojson.py [INPUT_GEOJSON] [LOOKUP_JSON] [OUTPUT_DIR]

Mặc định:
    INPUT  = ~/Downloads/vietnam_wards.geojson
    LOOKUP = /tmp/vn_units_simplified.json
    OUTPUT = ~/Downloads/vietnam_wards_split/

Lý do KHÔNG dùng prefix code[:2]:
    Mã phường 5 chữ số KHÔNG có cấu trúc province+district+ward.
    Hà Nội (province_code "01") có ward code bắt đầu bằng 00/04/08/09/10/49/89/...
    → phải join ward.code với wards.province_code trong lookup table.

Output được enrich thêm properties.provinceCode và properties.provinceName.
"""

import json
import sys
from pathlib import Path

# province_code (theo schema repo thanglequoc) → (tên hiển thị, tên file output)
PROVINCE_FILTERS = {
    "01": ("Hà Nội", "hanoi_wards_full.geojson"),
    "79": ("Hồ Chí Minh", "tphcm_wards_full.geojson"),
}


def load_lookup(lookup_path):
    """Load simplified_json_generated_data_vn_units.json → {ward_code: province_code}"""
    with open(lookup_path, "r", encoding="utf-8") as f:
        units = json.load(f)

    province_name_by_code = {p["Code"]: p["Name"] for p in units}
    ward_to_province = {}
    for prov in units:
        for ward in prov.get("Wards", []):
            ward_to_province[ward["Code"]] = prov["Code"]
    return ward_to_province, province_name_by_code


def calc_bbox(features):
    """Tính bbox từ list features (cho MultiPolygon/Polygon)."""
    lng_min = lat_min = float("inf")
    lng_max = lat_max = float("-inf")

    def walk(coords):
        nonlocal lng_min, lat_min, lng_max, lat_max
        for c in coords:
            if isinstance(c[0], (int, float)):
                lng, lat = c[0], c[1]
                if lng < lng_min:
                    lng_min = lng
                if lng > lng_max:
                    lng_max = lng
                if lat < lat_min:
                    lat_min = lat
                if lat > lat_max:
                    lat_max = lat
            else:
                walk(c)

    for feat in features:
        geom = feat.get("geometry") or {}
        coords = geom.get("coordinates")
        if coords:
            walk(coords)

    return [lng_min, lat_min, lng_max, lat_max]


def main():
    input_path = Path(sys.argv[1] if len(sys.argv) > 1 else "~/Downloads/vietnam_wards.geojson").expanduser()
    lookup_path = Path(sys.argv[2] if len(sys.argv) > 2 else "/tmp/vn_units_simplified.json")
    out_dir = Path(sys.argv[3] if len(sys.argv) > 3 else "~/Downloads/vietnam_wards_split").expanduser()

    if not input_path.exists():
        sys.exit(f"❌ Không tìm thấy file input: {input_path}")
    if not lookup_path.exists():
        sys.exit(f"❌ Không tìm thấy file lookup: {lookup_path}")

    out_dir.mkdir(parents=True, exist_ok=True)
    print(f"📖 Lookup: {lookup_path}")
    ward_to_province, province_name_by_code = load_lookup(lookup_path)
    print(f"   {len(ward_to_province)} ward mappings loaded")

    print(f"📖 Đọc: {input_path} ({input_path.stat().st_size / 1024 / 1024:.1f} MB)")
    with open(input_path, "r", encoding="utf-8") as f:
        data = json.load(f)

    features = data.get("features", [])
    print(f"✅ Tổng số features: {len(features)}")

    buckets = {pc: [] for pc in PROVINCE_FILTERS}
    orphan_codes = []

    for feat in features:
        code = feat.get("properties", {}).get("code", "")
        province_code = ward_to_province.get(code)
        if not province_code:
            orphan_codes.append(code)
            continue
        if province_code in buckets:
            # Enrich properties
            feat["properties"]["provinceCode"] = province_code
            feat["properties"]["provinceName"] = province_name_by_code.get(province_code, "")
            buckets[province_code].append(feat)

    if orphan_codes:
        print(f"⚠️  {len(orphan_codes)} ward không có trong lookup (bị bỏ): {orphan_codes[:5]}...")

    for pc, (label, filename) in PROVINCE_FILTERS.items():
        feats = buckets[pc]
        if not feats:
            print(f"⚠️  {label} (province_code {pc}): không có feature nào")
            continue

        out_path = out_dir / filename
        out_data = {
            "type": "FeatureCollection",
            "bbox": calc_bbox(feats),
            "features": feats,
        }
        with open(out_path, "w", encoding="utf-8") as f:
            json.dump(out_data, f, ensure_ascii=False)

        size_mb = out_path.stat().st_size / 1024 / 1024
        print(f"✅ {label} (province_code {pc}): {len(feats)} features → {out_path} ({size_mb:.1f} MB)")
        print(f"   bbox: {out_data['bbox']}")


if __name__ == "__main__":
    main()
