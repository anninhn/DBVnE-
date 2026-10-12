# Thử nghiệm Claude Code + MCP insight-data — 12 câu dev

| | |
|---|---|
| Ngày chạy | 2026-10-12 |
| Thiết kế | THIET-KE-V8 mục 3b — lớp tool code thuần bọc MCP, client là Claude Code, gate cứng là Stop hook |
| Client | `claude -p`, Claude Code 2.1.296, model `claude-opus-5-5`, cấu hình riêng `~/.claude-insight` (tài khoản Claude của Ninh) |
| Code | commit `cdaafc9` + chưa commit: `src/lib/insight/mcp/`, sửa "cộng được" (`dataset.ts`, `load.ts`), `tools/insight-data-mcp.*`, `tools/insight-stop-hook.*`, `prototypes/insight-demo/claude/` |
| Bộ câu hỏi | giống hệt vòng 1–2 của bậc 1 — `../../questions.json`. Bộ để dành vẫn niêm phong |
| Script | `../../run-claude-mcp.mjs` |
| Dữ liệu thô | `trace.jsonl` (câu trả lời, mọi lần gọi tool, token, chi phí, phán quyết hook), `review.json`, lần 1 ở `../2026-10-12-claude-mcp-lan1/` |

## 1. Lần 1 → sửa → lần 2

Lần 1 chạy trên bản đầu tiên. Hook chặn 4 câu. Đọc transcript thấy cả 4 đều là **bộ kiểm báo nhầm**, không phải
Claude sai. Claude tự viết "ghi chú cho người phát triển" chỉ ra 3 trong số đó, và chẩn đoán đúng cả 3:

| Lỗi của công cụ | Câu | Sửa |
|---|---|---|
| "9.544 nghìn người" bị đọc thành 9.544.000 | q05, q07, q08 | chấp nhận cả số trần lẫn số đã nhân đơn vị |
| "PM2.5" bị coi là số liệu | q11 | mã có chữ số dính chữ (PM2.5, CO2, COVID-19) không phải số liệu |
| Dân số trung bình bị coi là "không cộng được" (chữ "trung bình") | q05 | dữ liệu phân xử: năm mới nhất khớp và ≥ 80% số năm khớp (Hà Tây nhập Hà Nội làm lệch các năm cũ) |
| "Vì vậy … từ 2020" bị bắt là nhân quả | q09 | luật câu chữ chỉ áp cho câu có số liệu (không tính năm và số trong câu hỏi) |
| Câu kể nhiều đoạn bị bắt sai chiều | q06 | chỉ kiểm chiều khi câu có đúng hai mốc số liệu |
| `check_answer` không thấy số trong describe/scope, Stop hook thì thấy | nhiều câu | hai đường dùng chung một tập kết quả |
| "trước sáp nhập 2025" không có nguồn | nhiều câu | ghi rõ trong kết quả: "63 tỉnh cũ, trước sáp nhập năm 2025 (Nghị quyết 202/2025/QH15)" |

Ngoài ra, CLAUDE.md thêm luật: không viết ghi chú cho người phát triển trong câu trả lời.

Trước lần 2, các lỗi trên được kiểm lại bằng 6 ca thử. Kết quả: hết báo nhầm, số bịa và câu sai chiều vẫn bị bắt.
Sửa "cộng được" đổi trạng thái 70/861 chỉ tiêu, đọc lại từng dòng: tỷ lệ/bình quân → không cộng; số đếm → cộng.

## 2. Kết quả lần 2

| Kết luận | Bậc 1 vòng 2 (workflow + GLM) | Claude + MCP lần 2 |
|---|---|---|
| Trả lời đúng | 3 | **8** (q01–q04, q06–q08, q12) |
| Một phần, nói rõ phần thiếu | 4 | 1 (q05) |
| Từ chối đúng | 5 | 3 (q09–q11) |
| Bỏ sót im lặng | 0 | 0 |
| Sai ý | 0 | 0 |

| Chỉ số | Bậc 1 vòng 2 | Claude + MCP lần 1 | Lần 2 |
|---|---|---|---|
| Thời gian / câu (trung vị) | 14,1 giây | 48 giây | **35 giây** (26–54) |
| Lần gọi tool / câu | — | 8,4 | 7,9 |
| Hook chặn / lọt | — | 4 / 0 (cả 4 là báo nhầm) | 0 / 0 |
| Chi phí quy đổi API (12 câu) | — | 4,40 USD | 3,99 USD (~0,33 USD/câu) |
| Token vào / ra (12 câu) | — | 3,17 triệu / 52 nghìn | 2,67 triệu / 38,5 nghìn (phần lớn token vào là cache) |
| Bẫy chữ gần nghĩa bị từ chối | 3/3 | 3/3 | 3/3 |
| Số sai trong câu trả lời | 0 | 0 | 0 — kiểm lại bằng tool: xếp hạng q01, chuỗi q06, ly hôn q03 |

Chi phí tính vào hạn mức gói Claude của tài khoản, không trừ tiền; cột USD là con số Claude Code báo theo giá API.

## 3. Đọc kết quả cho đúng

**Phép so lẫn hai yếu tố.** 6 trong 8 câu "trả lời đúng" (q01, q03, q04, q06, q07, q08) tốt hơn bậc 1 **chủ yếu nhờ
phép mới**: xếp hạng, so sánh nơi, drill down theo vùng, theo đầu người. Bậc 1 không có các phép này. Muốn tách
phần đóng góp của client thì phải nối các phép mới vào workflow bậc 1 rồi chạy lại. Lần này chưa làm.

**Phần đóng góp thấy được của client (Claude):**
- Tự ghép nhiều phép cho một câu hỏi, ví dụ q04: thứ hạng hai năm + so từng tỉnh + so số chung của vùng + chuỗi.
- Tự đưa "góc" đáng viết, ví dụ q03: ly hôn tính theo dân số, Cà Mau đứng đầu.
- Phạm vi trả lời viết tự nhiên, đúng chỗ, ví dụ q04: "kho không có số riêng cho 6 tỉnh Bắc Trung Bộ".
- Chẩn đoán đúng lỗi của chính công cụ (lần 1).

**Bậc 1 vẫn hơn ở:** thời gian (14 so với 35 giây); kết quả tất định (Claude mỗi lần chạy ra một bài viết khác);
chạy được trong app cho mọi phóng viên mà không cần tài khoản Claude.

## 4. Lỗi còn lại

| Mã | Lỗi | Câu | Đề xuất |
|---|---|---|---|
| M1 | Kiến thức riêng của model lọt gate khi trùng năm có số ("chuẩn nghèo điều chỉnh từ 2022") | q04 | Năm chỉ được nhận nếu có trong kết quả **kèm ngữ cảnh** — hoặc chấp nhận, vì nằm ở "Cần kiểm thêm" |
| M2 | Chưa quy đổi 63 → 34 tỉnh qua tool (code có sẵn trong `sliceTable`) | q05 | Thêm tham số `scheme` cho `compute` |
| M3 | Tít hơi quá: "đang giảm dần" khi năm cuối nhích lên | q06 | Hook kiểm chiều của đoạn cuối chuỗi khi câu nói "đang …" |
| M4 | Nhắc "bộ kiểm" trong câu trả lời | q02 | Luật CLAUDE.md đã có; thêm từ cấm vào bộ kiểm |
| M5 | Số lẻ quá chi tiết (0,08794) | q03 | Làm tròn kết quả theo đơn đo đầu người (3 chữ số có nghĩa) |

## 5. Hạn chế

- Mỗi câu chạy một lần; Claude không tất định — cần chạy lặp để đo độ dao động.
- Bộ 12 câu đã dùng ở bậc 1 và lần này sửa công cụ sau khi xem lần 1 → thiên lệch về phía bộ này. Bước tiếp:
  bộ để dành (niêm phong) hoặc câu hỏi thật của phóng viên.
- Người chấm là một model. Các số chính đã tính lại bằng tool, nhưng chưa kiểm hết mọi con số của 12 câu.
- Client chạy headless (`-p`). Phóng viên dùng tương tác (có hỏi lại, có hội thoại nhiều lượt) chưa đo.
- Chỉ đo Claude Code. Claude Desktop / claude.ai dùng được cùng MCP nhưng **không có hook** → không có gate cứng.
