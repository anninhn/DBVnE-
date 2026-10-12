"""
Kiểm chéo bộ dò TS (src/lib/insight/detectors.ts) với statsmodels.

Đầu vào: file JSON `chart` của region_reversal (danh sách điểm {geo, region, x, y}).
In độ dốc và r theo từng vùng + gộp — so với kết quả TS. Lệch > 1e-6 thì TS sai.

    python3 prototypes/insight-demo/crosscheck.py <chart.json>
"""
import json
import sys
from collections import defaultdict

import numpy as np
import statsmodels.api as sm

chart = json.load(open(sys.argv[1]))
pts = chart["points"]


def fit(rows):
    x = np.array([p["x"] for p in rows], dtype=float)
    y = np.array([p["y"] for p in rows], dtype=float)
    res = sm.OLS(y, sm.add_constant(x)).fit()
    return len(rows), res.params[1], np.corrcoef(x, y)[0, 1]


groups = defaultdict(list)
for p in pts:
    groups[p["region"]].append(p)

n, b, r = fit(pts)
print(f"{'gộp':10s} n={n:3d} slope={b:.6g} r={r:.4f}")
for region, rows in sorted(groups.items()):
    if len(rows) >= 3:
        n, b, r = fit(rows)
        print(f"{region:10s} n={n:3d} slope={b:.6g} r={r:.4f}")
