# Harness v8 — lý do và quyết định

> 2026-10-09 · Thay v7. Thiết kế nằm ở 4 dạng, file này chỉ giữ LÝ DO:
>
> | Dạng | File |
> |---|---|
> | 1. Sơ đồ (từ vựng mẫu của Anthropic) | `harness.html` mục 1–2 (sinh bằng `build-html.py`) |
> | 2. Thẻ thành phần: mẫu · giả định · sản phẩm · gỡ bỏ khi · bằng chứng | `components.json` → `harness.html` mục 3 |
> | 3. Chữ ký giao diện | `src/lib/insight/v8/interfaces.ts` → `harness.html` mục 4 |
> | 4. Trạng thái / từ vựng dạng máy đọc | `vocab/` (hiện là hạt giống từ kd-data-demand — xem `vocab/README.md`) |

## 1. Bài toán

**Đưa cho phóng viên MỌI ban đúng con số họ cần cho câu chuyện đang viết — đúng giá trị, truy được tới nơi
phát hành gốc, kèm bối cảnh, kịp lúc sự kiện — với MỌI loại dữ liệu và định dạng.**

Đã gọi sai bốn lần, cùng một kiểu lỗi: có một mảng bằng chứng hẹp rồi thiết kế khớp vào nó.

| Lần | Bằng chứng hẹp | Khớp vào |
|---|---|---|
| v6 | kho NSO | bảng tỉnh × năm |
| vòng thử 1–2 | 12 câu tự sinh | luật chữ |
| v7 | dữ liệu thống kê | mô hình Data Cube |
| v8 bản đầu | ban Kinh doanh | 60 nhóm KD, lát "kết quả kinh doanh + giá vàng" |

Bài học: **thiết kế không lấy từ nhu cầu của ai** — lấy từ một mô hình meta không gắn lĩnh vực. Dữ liệu cụ
thể (của kho, của ban nào) chỉ dùng để KIỂM thiết kế, không để định hình nó.

## 1b. Khoảng trống của field

Bài toán thuộc field **data integration** (Lenzerini, PODS 2002: hệ tích hợp = ⟨schema chung, schema nguồn,
ánh xạ⟩) cùng các bài toán con: schema matching, entity resolution, data fusion (Bleiholder & Naumann 2009),
dataspaces "pay-as-you-go" (Franklin, Halevy & Maier 2005), xây kho tri thức (Knowledge Vault 2014, ODKE+
2025). Mỗi hướng giải được nhờ một giả định tòa soạn phá — bảng đầy đủ ở `harness.html` mục 0 (sinh từ
`components.json` → `khoang_trong`). Tổ hợp chưa hướng nào giải: **đa dạng định dạng × lĩnh vực · số dùng một
lần, một nguồn · kịp sự kiện · số có điều kiện (qualifier) · nguồn gốc từng số · đội nhỏ, không mô hình hoá
trước.** Paper newsroom (bản nháp) cũng kết luận: chưa có hệ thống làm sạch và mô hình hoá bảng tòa soạn không
đồng nhất mà không làm tay từng bảng.

## 1c. Giải pháp — tòa soạn trong vòng lặp (`harness.html` mục 0b)

Năm cơ chế, mỗi cơ chế thay một giả định cũ:

| # | Cơ chế | Thay giả định | Tín hiệu ban đầu (chỉ dữ liệu ban KD — cần kiểm lại trên mẫu toàn site) |
|---|---|---|---|
| 1 | **Dòng bài báo làm cảm biến**: mỗi bài đăng được trích (như kd-data-demand) → biết thuộc tính nào đang cần, nơi phát hành nào được trích dẫn, và có sẵn nhận định trung gian làm đầu mối + đáp án tham chiếu | "biết trước nguồn nào quan trọng" | 99,85% số trích có thật trong bài; 41% số không ghi nguồn |
| 2 | **Sổ nguồn gốc + cách đọc theo MẪU tài liệu**: thuộc tính → nơi phát hành → mẫu (BCTC, thông cáo, bảng sàn); học cách đọc một lần mỗi mẫu, dùng lại mọi kỳ. Công người tăng theo số mẫu, không theo số tài liệu | "thiết kế schema trước" / "có đội mapping" | 35 loại nơi phát hành; top 10 phủ 83,9%, top 20 phủ 94,5% |
| 3 | **Xác minh không cần nhiều nguồn**: (a) giá trị có trong đoạn nguồn (code); (b) lần tới nơi phát hành gốc, kiểm lại ở đó; (c) **số học của lượng** — mức ↔ thay đổi, tổng ↔ thành phần, kỳ ↔ kỳ con; (d) so với chuỗi đã lưu. Số không qua được → trạng thái "một nguồn, chưa đối chiếu" hiện rõ cho phóng viên | "fact lặp ở nhiều nguồn để bỏ phiếu" | 20,1% số có cặp mức + thay đổi trong cùng bài — tự kiểm được dù một nguồn |
| 4 | **Qualifier bắt buộc + gate so sánh được**: không so sơ bộ với chính thức, kế hoạch với thực hiện, giá hiện hành với giá so sánh | "fact ít đổi, không điều kiện" | v6: hoà, đổi chuẩn nghèo; KD: 7 loại bản chất con số |
| 5 | **Phóng viên xác nhận khi dùng** ("dùng số này" lúc viết) — xác nhận nâng rank; không hàng đợi, không chặn ai | "có đội chuyên trách" | doanh nghiệp tự công bố là nơi phát hành của 40.708 / 99.069 số có nơi phát hành |

Thêm **đường vào tức thời**: tài liệu chưa có cách đọc (phóng viên dán / upload lúc cần) vẫn sinh nhận định
ngay với trạng thái "tài liệu mới, chưa xác minh"; mẫu được học sau, kỳ sau dùng lại.

Hai câu hỏi thực nghiệm quyết định giải pháp có đứng được không (cũng là hai thước đo của paper newsroom):
**(a)** khi chỉ có một nguồn, cơ chế 3 xác minh được bao nhiêu % số và độ chính xác còn bao nhiêu;
**(b)** công người cho mỗi mẫu tài liệu mới và tỷ lệ tài liệu dùng lại được mẫu đã học.

## 2. Học từ đâu

| Nguồn | Lấy gì |
|---|---|
| Build v1–v7 + vòng thử 1–2 | AI chọn trong phương án đã xác minh, không suy sự thật; code tính số + nhận định; dữ liệu phân xử, không phải tên; phạm vi trung thực; đo trên bộ để dành |
| Wikibase DataModel (Wikidata) | Mô hình meta dùng cho mọi lĩnh vực: thực thể, thuộc tính mở rộng được, claim + qualifier ("further describe or refine the value"), references, rank |
| ODKE+ (Apple, arXiv 2509.04696) | Ontology snippet trong prompt; grounder; corroborator; kiểm mẫu định kỳ có ngưỡng; thuộc tính mới thêm bằng khai báo |
| Paper newsroom (bản nháp mục 1–4) | Fixed query trên dữ liệu có mã chung; chuyển bảng + code mapping là nút thắt; làm trước và lưu |
| Anthropic engineering | Từ vựng mẫu (workflow, gate, routing, voting, evaluator-optimizer); "harness encodes assumptions about what Claude can't do"; bỏ từng thành phần để kiểm; JSON cho trạng thái; vòng cải tiến bằng Claude Code + held-out |
| kd-data-demand | Khái niệm qualifier không gắn lĩnh vực (`kind`, `meas`, `cmp`, loại nơi phát hành); bằng chứng rằng danh sách duyệt + AI ánh xạ chính xác hơn AI tự đặt tên |

## 3. Quyết định

1. **Mô hình meta theo khung Wikibase:** thực thể · thuộc tính · giá trị có kiểu (lượng, thời điểm, tham chiếu
   thực thể, chữ, toạ độ) · qualifier (kỳ/hiệu lực, bản chất con số, loại số đo, mốc so sánh, phạm vi) ·
   nguồn (nơi phát hành gốc + trung gian + vị trí) · rank. Không có enum lĩnh vực / nhóm / ban trong lõi.
2. **Từ vựng mở, lớn dần có kiểm:** bước trích chỉ dùng thuộc tính đã có; cái mới thành ĐỀ XUẤT kèm bằng
   chứng; code kiểm trùng nghĩa (id gần nhất, kiểu giá trị, đơn vị) rồi mới thêm; người kiểm mẫu định kỳ.
3. **Phép tính theo kiểu giá trị**, không theo lĩnh vực: lượng (mới nhất, thay đổi, kỷ lục, diễn biến, xếp
   hạng, so sánh, kế hoạch vs thực hiện, quan hệ, gộp theo partOf), thời điểm (khoảng, đang hiệu lực), thực
   thể (quan hệ), chữ (trích dẫn). Điều kiện cần khai bằng `Property` và `Entity`.
4. **Bộ tiếp nhận theo định dạng / kênh**, không theo ban: csv, xlsx, pdf, html, feed, geojson, chữ trong bài.
5. **Có kho nhận định** — đảo quyết định "không kho chuỗi" của v5: PDF, văn bản, bài báo không đọc tại chỗ
   đáng tin; trích một lần, kiểm, lưu.
6. **Workflow, không phải agent** trong luồng chuẩn (đặt lại thành câu hỏi thực nghiệm — mục 3b); không text-to-SQL; agent khám phá để sau, chỉ trên API
   đã kiểm định.
7. **Nguồn không bắt buộc là bảng.** GeoJSON có hai vai: DỮ LIỆU (mỗi feature là thực thể có geometry + thuộc
   tính → nhận định; vd 114.001 điểm hạ tầng truyền tải điện) và THAM CHIẾU (ranh giới có phiên bản → quy thực
   thể, gộp không gian, vẽ). Thực thể trỏ tới geometry trong tài sản GeoJSON, không chép hình học vào nhận định.
8. **Bản nháp bài = thẻ + hình + nguồn.** Hình minh hoạ do CODE chọn theo phép và kiểu thực thể (diễn biến →
   đường; xếp hạng / so sánh → cột; so sánh địa phương có ranh giới → bản đồ tô màu; danh sách có toạ độ → bản đồ
   điểm). Gate: số và ranh giới phải cùng danh mục — kho có ranh giới 34 tỉnh + xã 2025 nhưng KHÔNG có 63 tỉnh,
   trong khi số NSO theo 63 → quy đổi (chỉ khi cộng được / có mẫu số) hoặc nạp ranh giới 63. Bản nháp cho phóng
   viên, không tự đăng.
9. **Vòng cải tiến multi-agent** (sơ đồ 2): người ra đề (cách ly) → chạy → chấm (code trước) → đọc transcript
   (nguyên nhân gốc) → sửa (worktree riêng) → nghiệm thu (bộ để dành) → người duyệt. Harness chạy GLM; vòng
   cải tiến chạy Claude. Chỉ chạy khi Ninh yêu cầu.

## 3b. Lớp tool cho agent (MCP + Claude Code) — thử nghiệm 2026-10-12

Quyết định 6 ("workflow, không phải agent") được **đặt lại thành câu hỏi thực nghiệm**. Harness tự build
thiếu gần hết thành phần mà Claude Code có sẵn (tool, quản lý context, memory, permission, hook, sub-agent,
CLAUDE.md). Phần riêng của tòa soạn là **lớp dữ liệu + tool**: lớp này giống nhau dù client là workflow
tự build hay Claude. Thử: bọc lớp tool thành MCP, chạy bằng Claude Code, so với bậc 1 trên cùng bộ câu hỏi.

**Token.** Phần suy nghĩ, gọi tool và viết của Claude tính vào tài khoản người dùng. Tool chỉ được là **code
thuần**: ba bước AI của bậc 1 (hiểu, chọn, viết) giao cho Claude. Nếu tool gọi LLM bên trong thì token đó vẫn
tính cho nền tảng.

**Loại chuyện → phép tính.** Khung *seven types of data stories* (change over time, drill down, zoom out,
contrast, intersections, factors, outliers) trùng với bảng họ trong lit review, và thêm hai điều:

| Loại chuyện | Phép (`compute.op`) | Điều kiện cần về dữ liệu |
|---|---|---|
| Change over time | `trend`, `change`, `record` | chuỗi thời gian ≥ 4 năm |
| Contrast | `rank`, `compare` (cả tổng lẫn tỷ lệ khi có mẫu số) | nhiều chủ thể cùng loại, cùng cách đo |
| Outliers | `outlier` (trung vị + MAD) | ≥ 10 chủ thể |
| Factors | `composition` | các phần **cộng lại thành tổng** (chiều có giá trị "Tổng số", số đo cộng được) |
| Intersections | `crossing` | ≥ 2 chuỗi cùng đơn vị, cùng trục thời gian |
| Drill down / Zoom out | **tham số `level` + `within`** cho mọi phép; `aggregate` | cây phân cấp (`P:thuoc`) + phép gộp hợp lệ |
| (quan hệ — lit review) | `relation` | 2 chỉ tiêu cùng cấp, có năm chung |

1. **Drill down / zoom out là một trục, không phải phép.** Đổi cấp rồi áp lại các loại khác. Gộp chỉ hợp lệ
   khi cộng được; tỷ lệ phải có mẫu số — gộp tỷ lệ không mẫu số là lỗi zoom out hay gặp nhất.
2. **Mỗi loại có điều kiện cần.** `describe_measure` trả "kể được loại nào, thiếu gì cho loại còn lại" — chính
   là phạm vi trả lời, suy từ dữ liệu, không từ chữ trong câu hỏi.
3. **Lý giải điểm cắt (intersections) không phải việc của tool.** Tool tìm điểm cắt; vì sao cắt là việc của
   Claude và phóng viên.

**Bộ tool (tên tiếng Anh — tên tool MCP chỉ nhận ASCII; dữ liệu trả về giữ tiếng Việt):**

| Tool | Làm gì |
|---|---|
| `find_measures` | tìm chỉ tiêu cho một khái niệm (vector + từ khoá) |
| `describe_measure` | hình dạng, cấp có sẵn, năm thật có số, loại chuyện kể được / không kèm lý do |
| `scan` | chạy **mọi** loại hợp lệ, trả phát hiện xếp hạng — giữ nguyên tắc v6 "chạy tất cả, không để AI đoán họ" |
| `compute` | chạy đúng một phép: `op` × `level` × `within` |
| `answer_scope` | đối chiếu câu hỏi (nơi, mốc thời gian, danh mục 34/63) với dữ liệu: phần trả lời được / chưa / thiếu |
| `check_answer` | kiểm bản trả lời: mọi số phải có trong kết quả tool, luật câu chữ (nhân quả, so sánh nhất, lời bình) |

**Gate cứng = Stop hook.** Hook chạy CÙNG hàm kiểm với `check_answer` trên câu trả lời cuối, đối chiếu với kết
quả tool trong transcript; sai thì chặn và trả lỗi cho Claude sửa. Hook chỉ có ở Claude Code — Claude Desktop /
claude.ai không ép được.

**Đo.** 12 câu dev, chấm như vòng 2, so với bậc 1: số sai, số bỏ sót im lặng, thời gian, token. Bộ để dành vẫn
niêm phong.

**Kết quả lần đầu (2026-10-12, `bench/runs/2026-10-12-claude-mcp-lan2/BAO-CAO.md`):** trả lời đúng 8/12 (bậc 1:
3/12), bỏ sót im lặng 0, sai ý 0, số sai 0; 35 giây/câu (bậc 1: 14); ~0,33 USD/câu quy đổi API. Phần lớn cải thiện
đến từ **phép mới** (xếp hạng, so sánh nơi, vùng, theo đầu người), chưa tách được phần của client. Hook ở lần chạy
đầu chặn 4 lần — cả 4 là bộ kiểm báo nhầm, Claude tự chỉ ra 3; sửa xong, lần 2 không chặn lần nào.

## 4. Kiểm tính tổng quát — không cần đo nhu cầu từng ban

"Đáp ứng mọi loại data" không chứng minh được, chỉ bác bỏ được bằng dữ liệu người thiết kế chưa thấy.

| Phép kiểm | Cách làm |
|---|---|
| **Biểu diễn được** | Mẫu NGẪU NHIÊN ~500 bài toàn VnExpress (không chia ban) → trích mọi con số với từ vựng mở → % con số biểu diễn được trong mô hình meta mà không mất nghĩa. Mỗi ca không biểu diễn được = lỗ hổng mô hình |
| **Lát thử theo ma trận** | Chọn lát theo **kiểu giá trị × định dạng nguồn** (vd lượng theo quý từ PDF; lượng theo ngày từ feed; quy định có hiệu lực từ văn bản; danh sách sự kiện từ xlsx; toạ độ từ geojson) — không theo ban hay nhóm |
| **Không sửa lõi** | Thêm một lát chưa dùng khi thiết kế → số dòng lõi phải sửa = 0 |
| **Bộ để dành** | Câu hỏi + đáp án từ số thật trong mẫu ngẫu nhiên, niêm phong |

Thứ tự nạp nguồn nào trước là quyết định sản phẩm (của Ninh), không phải thiết kế harness.

## 4b. Quy tắc ổn định và nhật ký sửa lõi

Nguồn / vấn đề mới chỉ được làm thay đổi **từ vựng** (khai báo) hoặc **plugin** (bộ đọc, phép tính, hình minh
hoạ — thêm, không sửa). Sửa **lõi** (thực thể, nhận định, kiểu giá trị, qualifier, nguồn, xác minh) = thiết kế
sai, phải ghi vào bảng dưới. Theo Wikidata: tên, bí danh, mã ngoài, "thuộc", ranh giới đều là NHẬN ĐỊNH.

| Ngày | Gặp gì | Đã sửa lõi | Đúng ra thuộc tầng | Trạng thái |
|---|---|---|---|---|
| 2026-10-09 | Mã CK / MST, "thuộc tỉnh", sáp nhập | thêm `externalIds`, `partOf` vào `Entity` | từ vựng (`P:ma_ck`, `P:thuoc` + qualifier thời gian) | đã gỡ khỏi lõi |
| 2026-10-09 | GeoJSON ranh giới, vẽ bản đồ | thêm `geometry` vào `Entity` | từ vựng (`P:ranh_gioi`, giá trị kiểu `shape`) + plugin (`GeoAsset`, `Visualize`) | đã gỡ khỏi lõi |
| 2026-10-09 | Hình đa giác, mã ngoài | thêm kiểu giá trị `shape`, `id` | lõi — kiểu giá trị là phần lõi thật | giữ (kiểu giá trị là danh sách đóng, nhỏ) |
| 2026-10-09 | Số chỉ có một nguồn | thêm `Verification` | lõi — gắn với nguyên tắc nguồn gốc | giữ |

## 5. Thước đo

| Thước đo | Đo thế nào |
|---|---|
| Biểu diễn được | % con số trong mẫu ngẫu nhiên toàn site biểu diễn được trong mô hình meta |
| Phủ | % con số trong mẫu mà hệ thống trả lời đúng **kèm nơi phát hành gốc** |
| Độ chính xác nhận định | kiểm mẫu ngẫu nhiên, ngưỡng (ODKE+ dùng ≥ 95%) |
| Chất lượng nguồn | % nhận định truy tới nơi phát hành gốc |
| Từ vựng | số đề xuất / số thêm / số gộp trùng; tỷ lệ trùng nghĩa lọt qua (kiểm mẫu) |
| Câu trả lời + phạm vi | thang 5 mức của vòng thử v6 |
| **Overfit** | số lần sửa lõi (bảng 4b) và số dòng lõi phải sửa khi thêm một lát; số luật chữ — phải tiến về 0 |

## 6. Thứ tự

| Bước | Làm | Xong khi |
|---|---|---|
| 0 | Mẫu ngẫu nhiên ~500 bài trên TOÀN BỘ chuyên mục VnExpress, không lọc theo ban (cần file xuất; chỉ định dạng file giống kd-data-demand để dùng lại script đọc). Loại khỏi mẫu mọi bài đã dùng trong kd-data-demand — dữ liệu đã thấy khi thiết kế không dùng để đo | có mẫu |
| 1 | Trích với từ vựng mở trên mẫu → đo **biểu diễn được**; đo lại tín hiệu của cơ chế 2 (độ tập trung nơi phát hành) và 3 (% số kiểm được bằng số học) trên mẫu toàn site; sửa mô hình meta theo các ca không biểu diễn được | tỷ lệ biểu diễn được đủ cao; danh sách lỗ hổng; hai tín hiệu đo trên mẫu toàn site |
| 1b | Thử cơ chế 2 + 3 trên một nơi phát hành có mẫu lặp (vd thông cáo Cục Thống kê hoặc bảng HoSE): học mẫu từ 1 kỳ, chạy kỳ sau không sửa; xác minh bằng số học | % tài liệu kỳ sau đọc đúng không sửa; % số xác minh được; độ chính xác |
| 2 | Lõi: kho nhận định, từ vựng lớn dần, 4 họ phép tính, phạm vi; bộ tiếp nhận **chữ trong bài** (nguồn trung gian) | trả lời được câu hỏi trên mẫu, chỉ rõ "nguồn trung gian" |
| 3 | Vòng cải tiến multi-agent lần đầu | báo cáo vòng 1 |
| 4 | Lát theo ma trận: 2–3 bộ tiếp nhận nguồn gốc (pdf, feed, xlsx) | % nhận định có nơi phát hành gốc tăng; số dòng lõi sửa = 0 khi thêm lát |

## 7. Rủi ro

- Mô hình meta tổng quát; **chất lượng trích theo định dạng và lĩnh vực** mới là chỗ gãy — đo riêng từng lát.
- Từ vựng mở có thể phình trùng nghĩa → gate kiểm trùng + kiểm mẫu định kỳ.
- Bài báo là nguồn trung gian (có thể sai, làm tròn) → chỉ làm đầu mối và đáp án tham chiếu.
- Người ra đề, đọc transcript, sửa đều là Claude → đáp án từ số thật, chấm bằng code, bộ để dành niêm phong, người duyệt.
- Danh sách kiểu giá trị (lượng, thời điểm, thực thể, chữ, toạ độ) theo hiểu biết về Wikidata — trang Primer đã đọc chưa liệt kê chi tiết kiểu giá trị.
