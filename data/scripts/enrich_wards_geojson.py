#!/usr/bin/env python3
"""
Enrich vietnam_wards.geojson với provinceCode + provinceName.

Source file geojson gốc KHÔNG có province_code trong properties — phải join
với lookup table từ thanglequoc/vietnamese-provinces-database.

Output: file geojson enriched (tự chứa, không cần lookup kèm).

Cách dùng:
    python3 data/scripts/enrich_wards_geojson.py [INPUT_GEOJSON] [LOOKUP_JSON] [OUTPUT_GEOJSON]

Mặc định:
    INPUT  = ~/Downloads/vietnam_wards.geojson
    LOOKUP = /tmp/vn_units_simplified.json
    OUTPUT = ~/Downloads/vietnam_wards_enriched.geojson
"""

import json
import sys
from pathlib import Path


def load_lookup(lookup_path):
    with open(lookup_path, "r", encoding="utf-8") as f:
        units = json.load(f)
    province_name_by_code = {p["Code"]: p["FullName"] for p in units}
    ward_to_province = {}
    for prov in units:
        for ward in prov.get("Wards", []):
            ward_to_province[ward["Code"]] = prov["Code"]
    return ward_to_province, province_name_by_code


def main():
    input_path = Path(sys.argv[1] if len(sys.argv) > 1 else "~/Downloads/vietnam_wards.geojson").expanduser()
    lookup_path = Path(sys.argv[2] if len(sys.argv) > 2 else "/tmp/vn_units_simplified.json")
    output_path = Path(sys.argv[3] if len(sys.argv) > 3 else "~/Downloads/vietnam_wards_enriched.geojson").expanduser()

    if not input_path.exists():
        sys.exit(f"❌ Không tìm thấy file input: {input_path}")
    if not lookup_path.exists():
        sys.exit(f"❌ Không tìm thấy file lookup: {lookup_path}")

    print(f"📖 Lookup: {lookup_path}")
    ward_to_province, province_name_by_code = load_lookup(lookup_path)
    print(f"   {len(ward_to_province)} ward mappings, {len(province_name_by_code)} provinces")

    print(f"📖 Đọc: {input_path} ({input_path.stat().st_size / 1024 / 1024:.1f} MB)")
    with open(input_path, "r", encoding="utf-8") as f:
        data = json.load(f)

    features = data.get("features", [])
    print(f"✅ Tổng số features: {len(features)}")

    enriched = 0
    orphan = []
    for feat in features:
        props = feat.get("properties", {})
        code = props.get("code", "")
        province_code = ward_to_province.get(code)
        if province_code:
            props["provinceCode"] = province_code
            props["provinceName"] = province_name_by_code.get(province_code, "")
            enriched += 1
        else:
            orphan.append(code)

    print(f"✅ Enriched: {enriched}/{len(features)}")
    if orphan:
        print(f"⚠️  {len(orphan)} ward không khớp lookup (giữ nguyên, không có provinceCode): {orphan[:5]}...")

    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False)

    size_mb = output_path.stat().st_size / 1024 / 1024
    print(f"✅ Ghi: {output_path} ({size_mb:.1f} MB)")

    # Sanity check: in đếm theo province
    from collections import Counter
    counts = Counter(f["properties"].get("provinceCode") for f in features)
    top5 = counts.most_common(5)
    print(f"   Top 5 province theo số ward: {top5}")


if __name__ == "__main__":
    main()
