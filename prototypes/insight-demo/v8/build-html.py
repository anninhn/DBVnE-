"""Sinh harness.html từ components.json + chữ ký trong interfaces.ts — đừng sửa tay harness.html.
Chạy: python3 prototypes/insight-demo/v8/build-html.py
"""
import html
import json
import pathlib
import re

HERE = pathlib.Path(__file__).parent
ROOT = HERE.parents[2]
comp = json.loads((HERE / "components.json").read_text())
iface = (ROOT / "src/lib/insight/v8/interfaces.ts").read_text()
ops = "\n\n".join(re.search(r"export interface %s \{(.*?)\n\}" % n, iface, re.S).group(0) for n in ["QuantityOps", "TimeOps", "EntityOps", "TextOps"])
stmt = "\n\n".join(re.search(r"export (interface|type) %s\b.*?(?=\n\n|\n/\*\*|\n// |\Z)" % n, iface, re.S).group(0) for n in ["Entity", "GeoAsset", "Property", "Value", "Qualifiers", "Reference", "Statement", "Verification", "SourceRegistryEntry", "ReadingSpec", "VisualSpec", "Draft"])

AI = ("#EEEDFE", "#534AB7", "#3C3489")      # tím: bước AI
CODE = ("#E1F5EE", "#0F6E56", "#085041")    # xanh ngọc: code / gate
NEU = ("#F1EFE8", "#888780", "#444441")     # xám: dữ liệu / người
HUM = ("#FAECE7", "#993C1D", "#712B13")     # san hô: người


def box(x, y, w, title, sub, c, h=56):
    fill, stroke, text = c
    s = f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="8" fill="{fill}" stroke="{stroke}" stroke-width="0.6"/>'
    if sub:
        s += f'<text x="{x+w/2}" y="{y+20}" text-anchor="middle" dominant-baseline="central" font-size="14" font-weight="500" fill="{text}">{html.escape(title)}</text>'
        s += f'<text x="{x+w/2}" y="{y+39}" text-anchor="middle" dominant-baseline="central" font-size="12" fill="{stroke}">{html.escape(sub)}</text>'
    else:
        s += f'<text x="{x+w/2}" y="{y+h/2}" text-anchor="middle" dominant-baseline="central" font-size="14" font-weight="500" fill="{text}">{html.escape(title)}</text>'
    return s


def arrow(d):
    return f'<path d="{d}" fill="none" stroke="#888780" stroke-width="1.2" marker-end="url(#a)"/>'


DEFS = '<defs><marker id="a" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M2 1L8 5L2 9" fill="none" stroke="#888780" stroke-width="1.5"/></marker></defs>'


def container(y, h, label):
    return (f'<rect x="30" y="{y}" width="620" height="{h}" rx="12" fill="none" stroke="#B4B2A9" stroke-width="0.6" stroke-dasharray="4 4"/>'
            f'<text x="46" y="{y+18}" dominant-baseline="central" font-size="14" font-weight="500" fill="#2C2C2A">{html.escape(label)}</text>')


xs = [40, 195, 350, 505]
d1 = [DEFS, container(20, 110, "Lúc tiếp nhận — làm một lần cho mỗi tài liệu, lưu lại"),
      box(40, 56, 135, "Nguồn", "mọi định dạng", NEU), box(195, 56, 135, "AI trích", "theo từ vựng", AI),
      box(350, 56, 135, "Kiểm bằng code", "có trong nguồn?", CODE), box(505, 56, 135, "Kho nhận định", "có nguồn gốc", NEU),
      arrow("M175 84 L193 84"), arrow("M330 84 L348 84"), arrow("M485 84 L503 84"),
      box(187, 150, 150, "Từ vựng mở", "lớn dần, có kiểm", NEU), arrow("M262 150 L262 114"), arrow("M262 206 L262 260"),
      arrow("M572 112 L572 216 L417 216 L417 260"),
      container(226, 110, "Lúc phóng viên hỏi"),
      box(40, 262, 135, "AI-1 kế hoạch", "ý định, mốc", AI), box(195, 262, 135, "AI-2 chọn", "trong ứng viên", AI),
      box(350, 262, 135, "Phép tính", "theo kiểu giá trị", CODE), box(505, 262, 135, "AI-3 viết lời", "kiểm từng câu", AI),
      arrow("M175 290 L193 290"), arrow("M330 290 L348 290"), arrow("M485 290 L503 290"),
      box(505, 352, 135, "Bản nháp", "", NEU, 44), arrow("M572 318 L572 350")]
svg1 = f'<svg viewBox="0 0 680 410" width="100%" role="img" aria-label="Harness v8 hai pha">{"".join(d1)}</svg>'

d2 = [DEFS,
      box(40, 30, 135, "Người ra đề", "mẫu toàn site", AI), box(195, 30, 135, "Chạy harness", "ghi transcript", NEU),
      box(350, 30, 135, "Chấm", "code trước", CODE), box(505, 30, 135, "Đọc transcript", "nguyên nhân gốc", AI),
      arrow("M175 58 L193 58"), arrow("M330 58 L348 58"), arrow("M485 58 L503 58"),
      box(505, 130, 135, "Sửa", "worktree riêng", AI), arrow("M572 86 L572 128"),
      box(350, 130, 135, "Nghiệm thu", "bộ để dành", CODE), arrow("M505 158 L487 158"),
      box(195, 130, 135, "Người duyệt", "báo cáo vòng", HUM), arrow("M350 158 L332 158"),
      box(40, 130, 135, "Vòng sau", "", NEU, 56), arrow("M195 158 L177 158"),
      '<text x="107" y="210" text-anchor="middle" font-size="12" fill="#5F5E5A">↻ quay lại ra đề</text>']
d3 = [DEFS,
      box(40, 30, 135, "Dòng bài báo", "cảm biến nhu cầu", AI), box(195, 30, 135, "Sổ nguồn gốc", "thuộc tính → nơi", NEU),
      box(350, 30, 135, "Đọc theo mẫu", "học một lần / mẫu", AI), box(505, 30, 135, "Xác minh", "không cần 2 nguồn", CODE),
      arrow("M175 58 L193 58"), arrow("M330 58 L348 58"), arrow("M485 58 L503 58"),
      box(505, 130, 135, "Kho nhận định", "kèm trạng thái", NEU), arrow("M572 86 L572 128"),
      box(350, 130, 135, "Thẻ trả lời", "số + nguồn gốc", NEU), arrow("M505 158 L487 158"),
      box(195, 130, 135, "Phóng viên dùng", "xác nhận → rank", HUM), arrow("M350 158 L332 158"),
      box(40, 130, 135, "Bài mới đăng", "", NEU, 56), arrow("M195 158 L177 158"),
      '<text x="107" y="210" text-anchor="middle" font-size="12" fill="#5F5E5A">↻ bài mới vào cảm biến</text>']
svg3 = f'<svg viewBox="0 0 680 230" width="100%" role="img" aria-label="Vòng giải pháp: tòa soạn trong vòng lặp">{"".join(d3)}</svg>'
svg2 = f'<svg viewBox="0 0 680 230" width="100%" role="img" aria-label="Vòng cải tiến multi-agent">{"".join(d2)}</svg>'

gap_rows = "".join("<tr>" + "".join(f"<td>{html.escape(g[k])}</td>" for k in ["huong","gia_dinh_cu","toa_soan_pha","co_che_thay","bang_chung"]) + "</tr>" for g in comp.get("khoang_trong", []))
rows = []
for p in comp["pha"]:
    rows.append(f'<tr class="ph"><td colspan="6">{html.escape(p["ten"])} <span>· {html.escape(p["kieu"])}</span></td></tr>')
    for t in p["thanh_phan"]:
        tag = '<span class="ai">AI</span>' if t["ai"] else '<span class="code">code</span>'
        rows.append("<tr>" + "".join(f"<td>{c}</td>" for c in [
            f'{tag} <b>{html.escape(t["ten"])}</b><div class="mono">{html.escape(t["chu_ky"])}</div>',
            html.escape(t["mau"]), html.escape(t["gia_dinh"]), html.escape(t["san_pham"]),
            html.escape(t["go_bo_khi"]), html.escape(t["bang_chung"])]) + "</tr>")

page = f"""<!doctype html><html lang="vi"><head><meta charset="utf-8"><title>Harness v8</title>
<style>
body{{font-family:-apple-system,system-ui,sans-serif;max-width:1100px;margin:32px auto;padding:0 20px;color:#2C2C2A;line-height:1.55}}
h1{{font-size:22px;font-weight:500}} h2{{font-size:18px;font-weight:500;margin-top:36px}}
.card{{border:1px solid #D3D1C7;border-radius:12px;padding:16px;margin:12px 0}}
.legend span{{display:inline-block;width:12px;height:12px;border-radius:3px;margin:0 6px 0 16px;vertical-align:-1px}}
table{{border-collapse:collapse;width:100%;font-size:13px}} td{{border-top:1px solid #E5E3DA;padding:8px 6px;vertical-align:top}}
tr.ph td{{background:#F1EFE8;font-weight:500;font-size:14px}} tr.ph span{{font-weight:400;color:#5F5E5A}}
.ai{{background:#EEEDFE;color:#3C3489;border-radius:4px;padding:1px 6px;font-size:11px}}
.code{{background:#E1F5EE;color:#085041;border-radius:4px;padding:1px 6px;font-size:11px}}
.mono,pre{{font-family:ui-monospace,Menlo,monospace;font-size:12px;color:#444441}} pre{{background:#F7F6F2;border-radius:8px;padding:12px;overflow:auto}}
th{{text-align:left;font-weight:500;font-size:12px;color:#5F5E5A;padding:6px}}
</style></head><body>
<h1>Harness v8 — số liệu có nguồn gốc cho phóng viên, mọi loại data, mọi ban</h1>
<p>Sinh từ <code>components.json</code> và <code>src/lib/insight/v8/interfaces.ts</code>. Lý do và quyết định: <code>THIET-KE-V8.md</code>.</p>
<h2>0. Khoảng trống của field và cơ chế thay thế</h2>
<div class="card"><table><tr><th>Hướng</th><th>Giải được nhờ giả định</th><th>Tòa soạn phá giả định</th><th>Cơ chế thay trong v8</th><th>Bằng chứng</th></tr>{gap_rows}</table></div>
<h2>0b. Giải pháp — tòa soạn trong vòng lặp</h2>
<div class="card">{svg3}</div>
<h2>1. Sơ đồ — workflow hai pha</h2>
<div class="card">{svg1}<div class="legend"><span style="background:#EEEDFE;border:1px solid #534AB7"></span>AI: chỉ trích, chọn, viết<span style="background:#E1F5EE;border:1px solid #0F6E56"></span>Code: tính và kiểm (gate)<span style="background:#F1EFE8;border:1px solid #888780"></span>Dữ liệu</div></div>
<h2>2. Vòng cải tiến — multi-agent</h2>
<div class="card">{svg2}</div>
<h2>3. Thẻ thành phần</h2>
<div class="card"><table><tr><th>Thành phần · chữ ký</th><th>Mẫu</th><th>Giả định nó mã hoá</th><th>Sản phẩm trao tay</th><th>Gỡ bỏ khi</th><th>Bằng chứng</th></tr>{''.join(rows)}</table></div>
<h2>4. Giao diện</h2>
<div class="card"><b>Mô hình meta (khung Wikibase): thực thể · thuộc tính · giá trị · qualifier · nguồn · nhận định</b><pre>{html.escape(stmt)}</pre><b>Phép tính theo kiểu giá trị</b><pre>{html.escape(ops)}</pre></div>
</body></html>"""
(HERE / "harness.html").write_text(page)
print("ok", len(page))
