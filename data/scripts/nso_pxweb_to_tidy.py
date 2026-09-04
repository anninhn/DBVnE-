#!/usr/bin/env python3
"""
Chuyển CSV tải từ cổng Cục Thống kê (NSO) sang CSV tidy để upload lên platform.

Vì sao phải xử lý trước — đo trên 483 file ngày 2026-08-27:
  - 483/483 file có dòng 1 là tiêu đề (1 ô), header thật ở dòng 2. Parser của
    platform lấy `rawRows[0]` làm header (src/lib/ai/inspect/csv.ts) → upload
    thô ra dataset 1 cột, mất toàn bộ số liệu.
  - 92 file header lồng 2 tầng (header ngắn hơn dòng dữ liệu).
  - 350 file cột là năm, 17 file cột là tháng.
  - 128 file có dòng nhóm chen trong thân bảng (chỉ ô đầu có giá trị).
  - 239 file dùng `..` cho ô thiếu số liệu.
  - 91 file chạm đúng 30 cột số — cổng cắt ở đó, chỉ tiêu xếp sau mất năm cuối.

Hình dạng đầu ra: **mỗi chỉ tiêu một cột riêng**, mỗi dòng là một quan sát
(địa bàn × năm).

    Địa phương,Năm,Diện tích (Km2),Dân số trung bình (Nghìn người),Mật độ dân số (Người/km2)
    CẢ NƯỚC,2011,"330.957,6","88.145,8","266,3"

Không dồn hết vào một cột `gia_tri`: mỗi chỉ tiêu một đơn vị đo khác nhau, gộp
lại thì `column_stats` và histogram trên trang chi tiết mất nghĩa (trộn Km2 với
người/km2 trong cùng phân bố). Tách cột thì mỗi cột một đơn vị, stats đúng.

Tên cột viết tiếng Việt có dấu, theo quy ước dataset đang có trong kho
(`Tên Cảng hàng không`, `Số lượng thủ tục`).

Số giữ NGUYÊN dạng thô (`1.234,56`); dictionary khai `decimal_char`/`group_char`
theo quyết định Frictionless của dự án. Không convert số.

Usage:
    python3 data/scripts/nso_pxweb_to_tidy.py <thư-mục-vào> <thư-mục-ra>
    python3 data/scripts/nso_pxweb_to_tidy.py <thư-mục-vào> <thư-mục-ra> --limit 5
"""

import csv
import json
import re
import sys
import unicodedata
from collections import Counter, OrderedDict
from datetime import date, timedelta
from pathlib import Path

# Tiền tố NSO gắn vào nhãn năm. Xếp dài trước ngắn: "Ước tính" phải khớp trước
# "Ước", nếu không thì phần " tính" còn lại làm cả biểu thức không khớp — đo thực
# tế: cột "Ước tính 2024" khiến trục 7 giá trị chỉ đạt 6/7 = 0,857 < ngưỡng 0,9,
# nên trục năm bị coi là phân tổ và mất luôn tên "Năm" (2 dataset ngân sách).
YEAR_PREFIX = r"(?:Sơ bộ|So bo|Ước tính|Uoc tinh|Ước|Uoc|Dự báo|Du bao|Chính thức|Chinh thuc)"
YEAR_RE = re.compile(
    rf"^(?P<pre>{YEAR_PREFIX}\s+)?(?P<year>(?:19|20)\d{{2}})(?P<post>\s*\(\*+\))?$"
)
# Mốc thời điểm dạng ngày: "31/12/2023". Không nhận thì trục này bị coi là phân
# tổ, mất tên và lấn chỗ tên của chiều thật (3 dataset đất đai).
DATE_RE = re.compile(r"^(\d{1,2})/(\d{1,2})/((?:19|20)\d{2})$")
# Kỳ so sánh: "2023/2022" — chỉ số năm này so với năm trước.
YOY_RE = re.compile(r"^(19|20)\d{2}\s*/\s*(19|20)\d{2}$")
MONTH_RE = re.compile(r"^(0?[1-9]|1[0-2])$")
# Năm học / năm tài khoá: "1995 -1996", "2005-2006", "Sơ bộ 2024-2025".
# Không nhận dạng được thì trục năm bị coi là phân tổ và pivot thành 30 cột năm.
YEAR_RANGE_RE = re.compile(
    rf"^(?:{YEAR_PREFIX}\s+)?(?P<a>(19|20)\d{{2}})\s*[-–]\s*(?P<b>(19|20)?\d{{2}})(\s*\(\*+\))?$"
)
MISSING = {"..", "...", "-", "…"}
# Nhãn tổng chung chung — làm tên cột thì vô nghĩa, thay bằng tên chỉ tiêu ở tiêu đề
GENERIC_TOTAL = {"tổng số", "tổng", "chung", "chỉ số chung", "tổng cộng", "toàn bộ"}


# Ngày trong Excel là số ngày kể từ 30/12/1899. Khoảng 39000–50000 ≈ 2006–2036.
EXCEL_EPOCH = date(1899, 12, 30)


def excel_serial_to_date(v: str) -> str | None:
    """
    '44926' → '31/12/2022'.

    Cổng NSO đôi khi xuất một ô ngày thành số serial thô. Để nguyên thì nó vào
    kho làm TÊN CỘT là `44926` — đo thực tế 1 dataset (cơ cấu đất sử dụng), lẫn
    giữa các cột `31/12/2018 … 31/12/2023`.
    """
    v = v.strip()
    if not re.fullmatch(r"\d{5}", v):
        return None
    n = int(v)
    if not 39000 <= n <= 50000:
        return None
    d = EXCEL_EPOCH + timedelta(days=n)
    return f"{d.day:02d}/{d.month:02d}/{d.year}"


def normalize_time_axis(vals: list[str]) -> list[str]:
    """
    Chữa serial Excel trong một trục — CHỈ khi trục đó thật sự là trục ngày.

    Điều kiện "có ít nhất một ô đúng dạng ngày" là chốt chặn cần thiết: một trục
    phân tổ bình thường cũng có thể chứa số 5 chữ số (dân số, số vụ), đổi nó
    thành ngày là bịa dữ liệu.
    """
    if not any(DATE_RE.match(v.strip()) for v in vals):
        return vals
    return [excel_serial_to_date(v) or v for v in vals]


def strip_accents(s: str) -> str:
    return "".join(c for c in unicodedata.normalize("NFD", s) if unicodedata.category(c) != "Mn")


# `isValidSlug` (src/lib/slugify.ts) chặn slug > 60 ký tự. Cắt ở 60 RỒI mới thêm
# hậu tố `-2` là ra 62 ký tự → commit trả HTTP 400. Đo thực tế 2026-08-27:
# 17/150 file trong một lô hỏng đúng vì lỗi này.
SLUG_MAX = 60


def slugify_dataset(s: str, suffix: str = "") -> str:
    s = strip_accents(s.replace("đ", "d").replace("Đ", "D")).lower()
    s = re.sub(r"[^a-z0-9]+", "-", s).strip("-")
    s = re.sub(r"-+", "-", s)
    return (s[: SLUG_MAX - len(suffix)].strip("-") + suffix).strip("-")


def clean_header(s: str) -> str:
    """'Diện tích(Km2)(*)' → 'Diện tích (Km2)'. Giữ đơn vị, bỏ dấu chú thích."""
    s = re.sub(r"\(\*+\)", "", s)          # bỏ (*), (**)
    s = re.sub(r"(?<=\S)\(", " (", s)      # thêm khoảng trắng trước ngoặc
    s = re.sub(r"\s*[-–]\s*%\s*$", " (%)", s)  # 'Tỷ lệ tăng -%' → 'Tỷ lệ tăng (%)'
    s = re.sub(r"\s+", " ", s).strip(" ,;")
    return s


# Dấu hiệu một giá trị mang đơn vị đo: '(Nghìn người)', '(Km2)', '- %', '-%'.
UNIT_MARKER_RE = re.compile(r"\([^)]*[%\wÀ-ỹ][^)]*\)\s*$|[-–]\s*%\s*$")


def has_unit_marker(v: str) -> bool:
    return bool(UNIT_MARKER_RE.search(v.strip()))


def short_measure(indicator: str) -> str:
    """
    Tên chỉ tiêu ngắn để làm tên cột.

    Tiêu đề NSO gộp cả cách phân tổ vào tên: "Dân số trung bình phân theo địa
    phương, giới tính và thành thị nông thôn". Cách phân tổ đã nằm ở các cột
    chiều rồi, nhét vào tên cột nữa thì header dài vô ích.
    """
    s = re.split(r"\s+(?:phân theo|chia theo|theo)\s+", indicator)[0]
    return clean_header(s) or clean_header(indicator)


def read_rows(path: Path) -> list[list[str]]:
    return list(csv.reader(path.read_text(encoding="utf-8-sig").splitlines()))


def modal_width(rows: list[list[str]]) -> int:
    widths = [len(r) for r in rows if len(r) > 1]
    return Counter(widths).most_common(1)[0][0] if widths else 0


def split_title(title: str) -> tuple[str, str]:
    m = re.search(r"\s+chia theo\s+(.+)$", title)
    if not m:
        return title.strip(), ""
    return title[: m.start()].strip(), m.group(1).strip()


TIME_DIM_WORDS = {"nam", "thang", "nam hoc", "ky", "quy", "giai doan", "thoi diem", "ky so sanh"}


def year_range_name(vals: list[str]) -> str:
    """
    Phân biệt NIÊN KHOÁ với GIAI ĐOẠN — hai thứ khác nhau, cùng dạng "a-b".

    "2020-2021" là năm học; "2011-2015" là giai đoạn 5 năm. Gán chung một tên là
    nói sai về dữ liệu: đo thực tế, dataset TFP có cột `Năm học` chứa
    2011-2015 / 2016-2020 / 2021-2023 trong khi tiêu đề gốc ghi rõ "chia theo
    Giai đoạn".

    Quy tắc: hai đầu liền năm nhau → niên khoá; cách nhau hơn một năm → giai đoạn.
    """
    for v in vals:
        m = YEAR_RANGE_RE.match(v.strip())
        if not m:
            continue
        a, b = m.group("a"), m.group("b")
        end = int(b) if len(b) == 4 else int(a[:2] + b)
        if end - int(a) != 1:
            return "Giai đoạn"
    return "Năm học"


def reserved_name(kind: str, vals: list[str]) -> str | None:
    """Tên cho trục thời gian, suy từ chính giá trị của trục — không lấy từ tiêu đề."""
    if kind == "year":
        return "Năm"
    if kind == "month":
        return "Tháng"
    if kind == "date":
        return "Thời điểm"
    if kind == "year_over_year":
        return "Kỳ so sánh"
    if kind == "year_range":
        return year_range_name(vals)
    return None


def split_dims(dim_clause: str, n_needed: int) -> list[str]:
    """
    Tách mệnh đề `chia theo ...` thành đúng n_needed tên chiều KHÔNG PHẢI thời gian.

    Khó ở chỗ tên chiều có thể chứa dấu phẩy: "Tỉnh, thành phố" là MỘT chiều.
    Cắt máy móc theo dấu phẩy cuối cùng thì sai:

        "Năm, Tỉnh, thành phố và Tháng"  →  ["Năm, Tỉnh", "thành phố"]   ✗
                                             (đã tạo ra cột tên `Năm, Tỉnh`)

    Quy tắc dùng chính tả tiếng Việt: tên chiều luôn bắt đầu bằng chữ HOA, nên
    mảnh bắt đầu bằng chữ thường ("thành phố") là phần nối của mảnh ngay trước.
    Bỏ luôn các token thời gian vì trục thời gian đã được đặt tên riêng
    ("Năm"/"Tháng") theo nội dung, không lấy từ tiêu đề.

        "Năm, Tỉnh, thành phố và Tháng"        → ["Tỉnh, thành phố"]
        "Tỉnh, thành phố, Dân số trung bình và Năm" → ["Tỉnh, thành phố", "Dân số trung bình"]
    """
    if not dim_clause:
        return []

    tokens = [t.strip() for t in re.split(r"\s+và\s+|,", dim_clause) if t.strip()]

    merged: list[str] = []
    for tok in tokens:
        prev_is_time = bool(merged) and strip_accents(merged[-1]).lower() in TIME_DIM_WORDS
        # Không nối vào token thời gian: "Năm" không bao giờ có phần nối, nên
        # trong "Năm, nhóm hàng và Vùng" thì "nhóm hàng" là chiều riêng dù NSO
        # viết thường.
        if merged and tok[:1].islower() and not prev_is_time:
            merged[-1] = f"{merged[-1]}, {tok}"
        else:
            merged.append(tok)

    names = [m for m in merged if strip_accents(m).lower() not in TIME_DIM_WORDS]

    # Vẫn dư thì gộp từ phải sang cho khớp số trục cần đặt tên
    while len(names) > n_needed and len(names) > 1:
        names[-2] = f"{names[-2]}, {names[-1]}"
        names.pop()
    return names


def classify_axis(values: list[str]) -> str:
    vals = [v.strip() for v in values if v.strip()]
    if not vals:
        return "other"
    if sum(1 for v in vals if YEAR_RE.match(v)) >= len(vals) * 0.9:
        return "year"
    # Kiểm YOY TRƯỚC date: "2023/2022" không khớp DATE_RE nhưng để lẫn vào nhóm
    # "other" thì trục này bị đem đặt tên bằng tên của chiều thật, và chiều thật
    # rơi xuống fallback — đúng lỗi của dataset chỉ số biến động diện tích đất.
    if sum(1 for v in vals if YOY_RE.match(v)) >= len(vals) * 0.9:
        return "year_over_year"
    if sum(1 for v in vals if DATE_RE.match(v)) >= len(vals) * 0.9:
        return "date"
    if sum(1 for v in vals if YEAR_RANGE_RE.match(v)) >= len(vals) * 0.9:
        return "year_range"
    if len(vals) >= 6 and sum(1 for v in vals if MONTH_RE.match(v)) >= len(vals) * 0.9:
        return "month"
    return "other"


def parse_time_cell(v: str, kind: str) -> tuple[str, str]:
    """'Sơ bộ 2024' → ('2024', 'Sơ bộ'). '2019 (*)' → ('2019', '(*)')."""
    if kind == "year_range":
        # Năm học giữ nguyên dạng "2024-2025", chỉ bóc phần chú thích ra
        raw = v.strip()
        m = re.match(r"^(?:(Sơ bộ|So bo|Ước|Uoc)\s+)?(.*?)(\s*\(\*+\))?$", raw)
        if m:
            note = ((m.group(1) or "") + " " + (m.group(3) or "")).strip()
            return m.group(2).strip(), note
        return raw, ""
    if kind != "year":
        return v.strip(), ""
    m = YEAR_RE.match(v.strip())
    if not m:
        return v.strip(), ""
    note = ((m.group("pre") or "").strip() + " " + (m.group("post") or "").strip()).strip()
    return m.group("year"), note


def clean_value(v: str) -> str:
    v = v.strip()
    return "" if v in MISSING else v


def detect_number_style(rows: list[list[str]]) -> tuple[str, str]:
    blob = "\n".join(",".join(r) for r in rows)
    vi_full = len(re.findall(r"\d{1,3}(?:\.\d{3})+,\d", blob))
    en_full = len(re.findall(r"\d{1,3}(?:,\d{3})+\.\d", blob))
    vi_simple = len(re.findall(r"(?<![\d.])\d{1,3},\d{1,2}(?![\d,])", blob))
    if vi_full or (vi_simple and not en_full):
        return ",", "." if vi_full else ""
    if en_full:
        return ".", ","
    return "", ""


def build_with_pivot(
    pivot_key, axes, kinds, names, header_axes, blocks, data_rows,
    nested, group_depth, is_group_row, indicator,
):
    """
    Dựng bản ghi với một trục pivot cho trước, rồi tự kiểm toàn vẹn.

    Raise ValueError nếu có ô nguồn không xuất hiện ở output — caller thử trục
    khác. Đếm trên chính bản ghi cuối (không dùng biến trung gian) vì một ô có
    thể được "ghi" rồi mất ở bước xuất khi hai tên cột trùng nhau sau khi làm
    sạch ('Điện' và 'Điện(****)' đều thành 'Điện').
    """
    header_keys = [k for k in axes if k.startswith("header")]
    row_header_keys = [k for k in header_keys if k != pivot_key]

    if pivot_key:
        raw_measures = list(dict.fromkeys(axes[pivot_key]))
        measures = [clean_header(v) for v in raw_measures]
        if len(measures) == 1 and measures[0].lower() in GENERIC_TOTAL:
            measures = [short_measure(indicator)]
        # Ô header TRỐNG → cột không có tên nào cả. Đo thực tế 7/495 dataset lên
        # kho với một cột tên rỗng: dictionary hiện ô trắng, và AI của wizard phải
        # tự mô tả "cột này có tên trống". Lấy tên chỉ tiêu ở tiêu đề thay vào —
        # đó chính là thứ cột đó đang đo.
        measures = [m or short_measure(indicator) for m in measures]
        measure_of = dict(zip(raw_measures, measures))
    else:
        measures = [short_measure(indicator)]
        measure_of = {}

    key_keys = [
        k for k in ([f"group{d}" for d in range(group_depth)] + ["label"] + row_header_keys)
        if k != pivot_key
    ]
    key_names = [names[k] for k in key_keys]

    records: "OrderedDict[tuple, dict]" = OrderedDict()
    notes_seen = False
    collisions = 0

    def put(axis_values, value):
        nonlocal notes_seen, collisions
        parts, note = [], ""
        for k in key_keys:
            v, n = parse_time_cell(axis_values[k], kinds[k])
            parts.append(v)
            note = note or n
        rec = records.setdefault(tuple(parts), {})
        measure = measure_of.get(axis_values[pivot_key], measures[0]) if pivot_key else measures[0]
        new = clean_value(value)
        if rec.get(measure) not in (None, "") and new != "":
            collisions += 1
        rec[measure] = new
        if note:
            rec["Ghi chú"] = note
            notes_seen = True

    stack = [""] * group_depth
    idx = 0
    while idx < len(data_rows):
        r = data_rows[idx]
        if not r or not r[0].strip():
            idx += 1
            continue
        if is_group_row(r):
            run = []
            while idx < len(data_rows) and is_group_row(data_rows[idx]):
                run.append(data_rows[idx][0].strip())
                idx += 1
            stack[group_depth - len(run):] = run
            continue
        idx += 1
        cells = r[1:]
        base = {"label": r[0].strip()}
        for d in range(group_depth):
            base[f"group{d}"] = stack[d]

        if nested:
            for bi, (lo, hi) in enumerate(blocks):
                for j in range(lo, min(hi, len(cells))):
                    put({**base, "header0": header_axes[0][bi], "header1": header_axes[1][j]}, cells[j])
        else:
            for j, cell in enumerate(cells):
                if j >= len(header_axes[0]):
                    break
                put({**base, "header0": header_axes[0][j]}, cell)

    out_cols = list(key_names) + (["Ghi chú"] if notes_seen else []) + measures
    seen: Counter = Counter()
    final_cols = []
    for c in out_cols:
        seen[c] += 1
        final_cols.append(c if seen[c] == 1 else f"{c} ({seen[c]})")
    rename = dict(zip(out_cols, final_cols))

    out_records = []
    for key, vals in records.items():
        rec = {rename[k]: v for k, v in zip(key_names, key)}
        if notes_seen:
            rec[rename["Ghi chú"]] = vals.get("Ghi chú", "")
        for m in measures:
            rec[rename[m]] = vals.get(m, "")
        out_records.append(rec)

    measure_cols = final_cols[-len(measures):]
    emitted = sum(1 for rec in out_records for c in measure_cols if (rec.get(c) or "").strip())
    available = sum(
        1
        for r in data_rows
        if r and not is_group_row(r)
        for c in r[1:]
        if clean_value(c) != ""
    )
    if emitted != available:
        raise ValueError(
            f"nguồn {available} ô, output {emitted} ô"
            + (f", {collisions} ô bị ghi đè" if collisions else ", ô bị bỏ qua")
        )

    return {"measures": measures, "final_cols": final_cols, "out_records": out_records}


def transform(path: Path) -> dict:
    rows = read_rows(path)
    if len(rows) < 3:
        raise ValueError("file quá ngắn")

    title_raw = rows[0][0] if rows[0] else ""
    indicator, dim_clause = split_title(title_raw)

    width = modal_width(rows[2:])
    header1 = rows[1]
    nested = len(header1) < width

    if nested:
        l1 = [c.strip() for c in header1[1:] if c.strip()]
        l2 = [c.strip() for c in rows[2]]
        starts = [i for i, v in enumerate(l2) if v == l2[0]]
        if len(starts) != len(l1):
            raise ValueError(f"header lồng không suy được khối: {len(starts)} khối vs {len(l1)} nhãn")
        blocks = list(zip(starts, starts[1:] + [len(l2)]))
        header_axes = [l1, l2]
        data_rows = rows[3:]
    else:
        blocks = None
        header_axes = [[c.strip() for c in header1[1:]]]
        data_rows = rows[2:]

    # ── dòng nhóm, có thể LỒNG NHIỀU TẦNG ─────────────────────────────────────
    #
    # 9/483 file có phân cấp 2 tầng trong cột nhãn, ví dụ:
    #     [nhóm] Số lớp, giáo viên và học sinh     ← tầng 1
    #     [nhóm]   Lớp                             ← tầng 2
    #             Tổng số / Tiểu học / THCS / THPT ← dữ liệu
    #     [nhóm]   Giáo viên                       ← tầng 2 mới, tầng 1 giữ nguyên
    #
    # Coi tất cả là MỘT biến thì "Tổng số" của "Lớp" và của "Giáo viên" trùng
    # khoá dòng, ghi đè nhau — mất đúng 50% số liệu, im lặng.
    #
    # Quy tắc suy tầng: một chuỗi liên tiếp k dòng nhóm thay k TẦNG CUỐI của
    # phân cấp. Chuỗi đầu tiên dài nhất xác định độ sâu.
    def is_group_row(r):
        return bool(r) and bool(r[0].strip()) and all(not c.strip() for c in r[1:])

    group_runs = []
    i = 0
    while i < len(data_rows):
        if is_group_row(data_rows[i]):
            run = []
            while i < len(data_rows) and is_group_row(data_rows[i]):
                run.append(data_rows[i][0].strip())
                i += 1
            group_runs.append(run)
        else:
            i += 1

    group_depth = max((len(r) for r in group_runs), default=0)
    has_group = group_depth > 0
    group_level_values: list[list[str]] = [[] for _ in range(group_depth)]
    stack = [""] * group_depth
    for run in group_runs:
        stack[group_depth - len(run):] = run
        for d in range(group_depth):
            group_level_values[d].append(stack[d])

    # ── đặt tên các trục ──────────────────────────────────────────────────────
    axes: "OrderedDict[str, list[str]]" = OrderedDict()
    for d in range(group_depth):
        axes[f"group{d}"] = group_level_values[d]
    axes["label"] = [r[0].strip() for r in data_rows if r and r[0].strip()]
    for i, vals in enumerate(header_axes):
        # Chữa tại chỗ: `axes` và `header_axes` dùng chung đúng một list, nên phải
        # sửa chính list đó, không tạo bản mới — `put()` đọc từ `header_axes`.
        vals[:] = normalize_time_axis(vals)
        axes[f"header{i}"] = vals

    kinds = {k: classify_axis(v) for k, v in axes.items()}

    # Trục thời gian đặt tên theo NỘI DUNG, không lấy từ tiêu đề. Nên chỉ cần
    # tách tiêu đề ra đúng số trục còn lại — truyền tổng số trục sẽ khiến
    # split_dims cắt dư và sinh tên rác kiểu "Năm, Tỉnh".
    names: dict[str, str] = {}
    for key in axes:
        nm = reserved_name(kinds[key], axes[key])
        if nm:
            names[key] = nm

    n_other = sum(1 for k in axes if k not in names)
    dims = split_dims(dim_clause, n_other)

    # Tiêu đề không đủ tên cho mọi trục → dùng "Phân tổ", KHÔNG dùng khoá nội bộ.
    # Trước đây fallback là `key`, nên `label`/`header0`/`header1` lọt thẳng vào
    # kho làm tên cột — đo thực tế 12/495 dataset. Người đọc mở data dictionary
    # ra thấy cột tên `header0` thì không hiểu gì, mà cột đó vẫn là chiều thật.
    # "Phân tổ" là từ NSO tự dùng trong các bảng khác của chính bộ dữ liệu này.
    pool = list(dims)
    fallback_used = 0
    for key in axes:
        if key in names:
            continue
        if pool:
            names[key] = pool.pop(0)
        else:
            fallback_used += 1
            names[key] = "Phân tổ" if fallback_used == 1 else f"Phân tổ {fallback_used}"

    # ── trục nào thành cột, trục nào thành dòng ───────────────────────────────
    #
    # Nguyên tắc: trục MANG ĐƠN VỊ ĐO phải thành cột, vì hai đơn vị khác nhau
    # trong cùng một cột số làm column_stats/histogram vô nghĩa.
    #
    # Trục mang đơn vị không nhất thiết nằm ở header. Ví dụ thật: file dân số
    # theo giới tính có header là phân tổ (Tổng số/Nam/Nữ/Thành thị/Nông thôn),
    # còn đơn vị nằm ở DÒNG NHÓM: "Tổng số (Nghìn người)", "Tỷ lệ tăng -%",
    # "Cơ cấu - %". Chỉ xét header thì pivot sai trục, mỗi cột vẫn trộn nghìn
    # người với phần trăm.
    header_keys = [k for k in axes if k.startswith("header")]
    non_time = [k for k in axes if kinds[k] == "other"]

    def unit_ratio(key):
        vals = [v for v in dict.fromkeys(axes[key]) if v]
        return (sum(1 for v in vals if has_unit_marker(v)) / len(vals)) if vals else 0

    # Trục ngoài header chỉ được xét khi phần lớn giá trị mang đơn vị và ít giá
    # trị — tránh pivot cột địa bàn thành 63 cột tỉnh.
    candidates = [
        k for k in non_time
        if k in header_keys or (unit_ratio(k) >= 0.5 and len(set(axes[k])) <= 8)
    ]
    # Ưu tiên trục mang đơn vị, rồi tới trục ít giá trị. Nhưng heuristic một mình
    # không đủ: pivot trục này thì trục kia thành cột khoá, mà trục kia có thể lặp
    # giá trị nên khoá dòng không phân biệt được → ghi đè. Nên THỬ lần lượt và giữ
    # phương án đầu tiên không mất ô nào; phép kiểm toàn vẹn là trọng tài.
    ordered = sorted(candidates, key=lambda k: (-unit_ratio(k), len(set(axes[k]))))
    if None not in ordered:
        ordered = ordered + [None]  # phương án cuối: không pivot, chỉ 1 cột chỉ tiêu

    attempts = []
    for pivot_key in ordered:
        try:
            built = build_with_pivot(
                pivot_key, axes, kinds, names, header_axes, blocks, data_rows,
                nested, group_depth, is_group_row, indicator,
            )
        except ValueError as exc:
            attempts.append((pivot_key, str(exc)))
            continue
        break
    else:
        raise ValueError(
            "không có cách tách cột nào giữ đủ số liệu ("
            + "; ".join(f"{k or 'không pivot'}: {e}" for k, e in attempts)
            + ") — cần xử lý riêng, không upload file này"
        )

    measures = built["measures"]
    final_cols = built["final_cols"]
    out_records = built["out_records"]

    dec, grp = detect_number_style(data_rows)
    return {
        "indicator": indicator,
        "title_raw": title_raw,
        "dims": dims,
        "nested": nested,
        "has_group_rows": has_group,
        "measures": measures,
        "columns": final_cols,
        "decimal_char": dec,
        "group_char": grp,
        "row_count": len(out_records),
        "records": out_records,
    }


def main() -> int:
    if len(sys.argv) < 3:
        print(__doc__)
        return 2
    src, dst = Path(sys.argv[1]), Path(sys.argv[2])
    limit = int(sys.argv[sys.argv.index("--limit") + 1]) if "--limit" in sys.argv else None

    dst.mkdir(parents=True, exist_ok=True)
    files = sorted(src.rglob("*.csv"))[:limit]
    manifest, errors = [], []

    for p in files:
        try:
            res = transform(p)
        except Exception as exc:  # noqa: BLE001 — gom lỗi báo cuối, không dừng cả lô
            errors.append({"file": str(p.relative_to(src)), "error": str(exc)})
            continue

        out = dst / f"{slugify_dataset(res['indicator'])}.csv"
        n = 2
        while out.exists():
            out = dst / f"{slugify_dataset(res['indicator'], f'-{n}')}.csv"
            n += 1
        with out.open("w", encoding="utf-8", newline="") as fh:
            w = csv.DictWriter(fh, fieldnames=res["columns"])
            w.writeheader()
            w.writerows(res["records"])

        manifest.append({
            "source_file": str(p.relative_to(src)),
            "source_folder": p.parent.name,
            "output_file": out.name,
            "slug": out.stem,
            "title": res["indicator"],
            "title_raw": res["title_raw"],
            "dims": res["dims"],
            "measures": res["measures"],
            "columns": res["columns"],
            "decimal_char": res["decimal_char"],
            "group_char": res["group_char"],
            "nested_header": res["nested"],
            "group_rows": res["has_group_rows"],
            "row_count": res["row_count"],
        })

    (dst / "manifest.json").write_text(
        json.dumps({"datasets": manifest, "errors": errors}, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    print(f"chuyển được : {len(manifest)}/{len(files)} file")
    print(f"lỗi         : {len(errors)}")
    for e in errors[:12]:
        print(f"  - {e['file'][:64]}: {e['error']}")
    print(f"manifest    : {dst / 'manifest.json'}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
