// Kịch bản GIẢ LẬP cho prototype harness tìm insight.
// MỌI con số ở đây là bịa để minh hoạ luồng — KHÔNG phải số liệu thật, không được trích.
// Mỗi kịch bản = một lần harness chạy: đầu vào → AI ⇄ tools → thẻ nháp → rào chắn → người kiểm.

// comp: thành phần kiến trúc sáng lên khi bước này chạy
//   input | ai | tools | data | guard | human | output

const DBSH = [
  ["Hà Nội", 6.9, 2.18], ["Hải Phòng", 6.1, 2.21], ["Quảng Ninh", 6.3, 2.29],
  ["Bắc Ninh", 6.6, 2.42], ["Hưng Yên", 5.4, 2.31], ["Hải Dương", 5.2, 2.24],
  ["Thái Bình", 4.4, 2.05], ["Nam Định", 4.3, 2.01], ["Ninh Bình", 4.8, 2.12],
  ["Hà Nam", 4.6, 2.09], ["Vĩnh Phúc", 5.9, 2.36],
];
const DBSCL = [
  ["Cần Thơ", 5.3, 1.46], ["Long An", 5.6, 1.55], ["Tiền Giang", 4.7, 1.71],
  ["Bến Tre", 4.3, 1.78], ["Vĩnh Long", 4.5, 1.69], ["Trà Vinh", 3.9, 1.83],
  ["Đồng Tháp", 4.1, 1.80], ["An Giang", 4.0, 1.86], ["Kiên Giang", 4.4, 1.74],
  ["Hậu Giang", 4.0, 1.77], ["Sóc Trăng", 3.7, 1.88], ["Bạc Liêu", 4.2, 1.81],
  ["Cà Mau", 4.3, 1.79],
];

const SCATTER_FERTILITY = {
  type: "scatter",
  xLabel: "Thu nhập bình quân (triệu đ/người/tháng)",
  yLabel: "Tổng tỷ suất sinh (con/phụ nữ)",
  groups: [
    { name: "ĐBSH", color: "var(--series-1)", points: DBSH },
    { name: "ĐBSCL", color: "var(--series-2)", points: DBSCL },
  ],
};

const SCENARIOS = [
  // ───────────────────────────── 1. ĐẠT
  {
    id: "s1",
    mode: "chu-dong",
    input: "Giả thuyết: quan hệ giữa thu nhập và mức sinh có giống nhau giữa các vùng không?",
    outcome: "pass",
    steps: [
      { kind: "input", comp: "input", title: "Đầu vào — chế độ Chủ động",
        body: "Giả thuyết do AI đề xuất từ danh mục chuỗi, <b>Ninh đã duyệt</b> trước khi chạy." },
      { kind: "think", comp: "ai", title: "AI lập kế hoạch",
        body: "Cần 2 chuỗi cấp tỉnh: thu nhập bình quân và tổng tỷ suất sinh. Dạng pattern phù hợp: <code>region_reversal</code> — xem quan hệ có đổi chiều giữa vùng không." },
      { kind: "tool", comp: "tools", call: { name: "search_series", args: { query: "tỷ suất sinh tỉnh" } },
        result: { table: [["series_id", "Độ phủ", "Năm"], ["tfr_tinh", "63 tỉnh", "2010–2023"], ["cbr_tinh", "63 tỉnh", "2010–2023"]] } },
      { kind: "tool", comp: "tools", call: { name: "search_series", args: { query: "thu nhập bình quân đầu người tỉnh" } },
        result: { table: [["series_id", "Độ phủ", "Năm"], ["thunhap_tinh", "63 tỉnh", "2010–2022 (2 năm/lần)"]] } },
      { kind: "tool", comp: "tools", call: { name: "check_artifacts", args: { id: "thunhap_tinh" } },
        result: { text: "⚠ Giá hiện hành (chưa khử lạm phát). Năm 2021 đổi phương pháp điều tra.<br>→ Chỉ so sánh <b>giữa tỉnh trong cùng năm</b> thì an toàn." } },
      { kind: "tool", comp: "tools", call: { name: "run_detector", args: { kind: "region_reversal", x: "thunhap_tinh", y: "tfr_tinh", year: 2022 } },
        result: {
          text: "<code>r_042</code> · Cả nước: r = +0,08 (không rõ quan hệ)<br>ĐBSH: độ dốc <b>+0,13</b> · ĐBSCL: độ dốc <b>−0,21</b> → <b>đổi dấu</b>",
          chart: SCATTER_FERTILITY } },
      { kind: "tool", comp: "tools", call: { name: "run_detector", args: { kind: "partial_corr", x: "thunhap_tinh", y: "tfr_tinh", control: "ty_le_do_thi", by: "vung" } },
        result: { text: "<code>r_043</code> · Sau khi kiểm soát tỷ lệ đô thị hoá: ĐBSH vẫn dương (+0,51), ĐBSCL vẫn âm (−0,47)." } },
      { kind: "tool", comp: "tools", call: { name: "run_detector", args: { kind: "region_reversal", x: "thunhap_tinh", y: "tfr_tinh", year: 2016 } },
        result: { text: "<code>r_044</code> · Lặp lại ở năm 2016: ĐBSH +0,09 · ĐBSCL −0,18 → <b>vẫn đổi dấu</b>." } },
      { kind: "draft", comp: "ai", title: "AI nộp thẻ nháp",
        body: "Tít: <i>“Ở đồng bằng Bắc Bộ, tỉnh khá giả sinh nhiều hơn — miền Tây thì ngược lại”</i><br>Số liệu: +0,13 [r_042], −0,21 [r_042], +0,51 [r_043], −0,47 [r_043]" },
      { kind: "guard", comp: "guard", title: "Rào chắn (code)",
        checks: [
          { ok: true, name: "Khớp số", detail: "4/4 con số khớp log tool" },
          { ok: "warn", name: "Artefact", detail: "Giá hiện hành → đã giới hạn so sánh trong cùng năm" },
          { ok: true, name: "Lặp lại theo thời gian", detail: "2016 và 2022 cùng chiều" },
          { ok: true, name: "Thống kê", detail: "n = 11 / 13 tỉnh; qua BH (q = 0,03)" },
          { ok: true, name: "Câu chữ", detail: "Nói về tỉnh, không nói về cá nhân; không dùng từ nhân quả" },
        ] },
      { kind: "human", comp: "human", title: "Người kiểm",
        body: "Nhãn: <b class='ok'>ĐẠT</b>. Ghi chú: góc bài mới, cần chuyên gia dân số giải thích (ưa con trai? chi phí nuôi con?)." },
    ],
    card: {
      kind: "pass",
      title: "Ở đồng bằng Bắc Bộ, tỉnh khá giả sinh nhiều hơn — miền Tây thì ngược lại",
      pattern: "Quan hệ đổi chiều giữa vùng",
      why: "Nếu gộp cả nước thì thu nhập và mức sinh gần như không liên quan. Tách theo vùng thì hai đồng bằng đi ngược chiều nhau, và điều này lặp lại ở cả 2016 lẫn 2022.",
      numbers: [["Độ dốc ĐBSH", "+0,13", "r_042"], ["Độ dốc ĐBSCL", "−0,21", "r_042"], ["Sau khi kiểm soát đô thị hoá", "+0,51 / −0,47", "r_043"]],
      chart: SCATTER_FERTILITY,
      sources: ["thu-nhap-binh-quan-dau-nguoi-theo-tinh", "tong-ty-suat-sinh-theo-tinh"],
      verify: "Phỏng vấn chuyên gia dân số; kiểm tỷ số giới tính khi sinh ở các tỉnh ĐBSH có thu nhập cao.",
      caveat: "Số liệu cấp tỉnh — không suy ra hành vi từng gia đình. Thu nhập theo giá hiện hành, chỉ so trong cùng năm.",
      confidence: "Trung bình–cao",
    },
  },

  // ───────────────────────────── 2. RÀO CHẮN LOẠI — sai số
  {
    id: "s2",
    mode: "hoi",
    input: "“Tỉnh nào chi cho y tế thấp bất thường so với mức thu nhập?”",
    outcome: "rejected_guard",
    steps: [
      { kind: "input", comp: "input", title: "Đầu vào — chế độ Phóng viên hỏi", body: "Câu hỏi tự do của phóng viên." },
      { kind: "think", comp: "ai", title: "AI lập kế hoạch",
        body: "Dạng <code>outlier_residual</code>: hồi quy chi tiêu y tế theo thu nhập, tìm tỉnh có phần dư âm lớn nhất." },
      { kind: "tool", comp: "tools", call: { name: "search_series", args: { query: "chi tiêu y tế bình quân" } },
        result: { table: [["series_id", "Độ phủ", "Năm"], ["chi_yte_tinh", "63 tỉnh", "2012–2022"]] } },
      { kind: "tool", comp: "tools", call: { name: "run_detector", args: { kind: "outlier_residual", x: "thunhap_tinh", y: "chi_yte_tinh", year: 2022 } },
        result: {
          text: "<code>r_071</code> · Tỉnh X chi thấp hơn mức dự đoán <b>1,6 lần</b>; tỉnh Y thấp hơn 1,4 lần.",
          chart: { type: "bars", unit: "Chi thấp hơn mức dự đoán (lần)", items: [["Tỉnh X", 1.6, true], ["Tỉnh Y", 1.4, true], ["Tỉnh Z", 1.2], ["Tỉnh T", 1.1], ["Tỉnh U", 1.05]] } } },
      { kind: "draft", comp: "ai", title: "AI nộp thẻ nháp",
        body: "Tít: <i>“Tỉnh X chi cho y tế thấp hơn gần <b>1,8 lần</b> so với mức thu nhập”</i> [r_071]" },
      { kind: "guard", comp: "guard", title: "Rào chắn (code)",
        checks: [
          { ok: false, name: "Khớp số", detail: "Thẻ ghi “1,8 lần”, nhưng r_071 trả về 1,6 → AI tự làm tròn/bịa" },
          { ok: true, name: "Artefact", detail: "Không có cảnh báo" },
          { ok: null, name: "Lặp lại theo thời gian", detail: "Không chạy — đã loại ở bước trước" },
        ] },
    ],
    card: {
      kind: "rejected_guard",
      title: "Bị rào chắn loại: số trong thẻ không khớp tool",
      reason: "AI viết “1,8 lần” trong khi bộ dò trả về 1,6 lần. Đây đúng là lỗi mà nguyên tắc “AI không tự tính số” muốn chặn: prompt đã dặn, nhưng chỉ có validator bằng code mới bắt được.",
      lesson: "Bài học cho harness: giữ bước khớp số làm rào chắn cứng; có thể cho AI chạy lại 1 lần kèm thông báo lỗi.",
    },
  },

  // ───────────────────────────── 3. NGƯỜI KIỂM LOẠI — hiển nhiên
  {
    id: "s3",
    mode: "bam-tin",
    input: "Bài nhiều lượt xem: “Hàng nghìn công nhân rời khu công nghiệp về quê” (giả lập)",
    outcome: "rejected_human",
    steps: [
      { kind: "input", comp: "input", title: "Đầu vào — chế độ Bám tin nóng",
        body: "Lấy từ danh sách bài nhiều lượt xem. Nhiệm vụ: tìm dữ liệu mở ra góc bài tiếp theo." },
      { kind: "think", comp: "ai", title: "AI lập kế hoạch",
        body: "Chủ đề lao động – di cư. Tìm chuỗi di cư thuần và lao động khu công nghiệp, dạng <code>trend_break</code>." },
      { kind: "tool", comp: "tools", call: { name: "search_series", args: { query: "tỷ suất di cư thuần tỉnh" } },
        result: { table: [["series_id", "Độ phủ", "Năm"], ["dicu_thuan_tinh", "63 tỉnh", "2010–2023"]] } },
      { kind: "tool", comp: "tools", call: { name: "run_detector", args: { kind: "trend_break", id: "dicu_thuan_tinh", geo: "Bình Dương" } },
        result: {
          text: "<code>r_105</code> · Bình Dương: di cư thuần giảm từ +20‰ (2019) xuống +4‰ (2023) — thấp nhất 14 năm.",
          chart: { type: "line", yLabel: "Tỷ suất di cư thuần (‰)", series: [{ name: "Bình Dương", color: "var(--series-1)",
            points: [[2010, 24], [2012, 26], [2014, 22], [2016, 25], [2018, 21], [2019, 20], [2020, 12], [2021, 8], [2022, 6], [2023, 4]] }] } } },
      { kind: "draft", comp: "ai", title: "AI nộp thẻ nháp",
        body: "Tít: <i>“Dòng người đổ về Bình Dương chậm nhất 14 năm”</i> [r_105]" },
      { kind: "guard", comp: "guard", title: "Rào chắn (code)",
        checks: [
          { ok: true, name: "Khớp số", detail: "3/3 khớp" },
          { ok: true, name: "Artefact", detail: "Không có cảnh báo" },
          { ok: true, name: "Lặp lại theo thời gian", detail: "Giảm liên tục 4 năm" },
          { ok: true, name: "Thống kê", detail: "Điểm gãy 2020 có ý nghĩa" },
        ] },
      { kind: "human", comp: "human", title: "Người kiểm",
        body: "Nhãn: <b class='bad'>HIỂN NHIÊN</b>. Bài gốc đã nói đúng điều này; số liệu chỉ xác nhận lại, không mở ra góc mới." },
    ],
    card: {
      kind: "rejected_human",
      title: "Lọt rào chắn nhưng người kiểm loại: hiển nhiên",
      reason: "Số đúng, thống kê ổn, nhưng không có gì mới so với bài gốc. Rào chắn bằng code không đo được mức độ “mới”.",
      lesson: "Bài học cho harness: ở chế độ Bám tin nóng, đưa nội dung bài gốc vào ngữ cảnh và yêu cầu AI tìm góc KHÁC bài gốc (ví dụ: công nhân về đâu — tỉnh nào nhận người).",
    },
  },

  // ───────────────────────────── 4. CẦN DỮ LIỆU GÌ
  {
    id: "s4",
    mode: "hoi",
    input: "“Người trẻ có đang rời Hà Nội về quê không?”",
    outcome: "insufficient",
    steps: [
      { kind: "input", comp: "input", title: "Đầu vào — chế độ Phóng viên hỏi", body: "Câu hỏi cần dữ liệu theo nhóm tuổi." },
      { kind: "think", comp: "ai", title: "AI lập kế hoạch", body: "Cần di cư theo nhóm tuổi, cấp tỉnh, càng mới càng tốt." },
      { kind: "tool", comp: "tools", call: { name: "search_series", args: { query: "di cư theo nhóm tuổi" } },
        result: { text: "Không có chuỗi nào. Gần nhất: <code>dicu_thuan_tinh</code> (không chia tuổi), <code>dan_so_nhom_tuoi</code> (không có di cư)." } },
      { kind: "tool", comp: "tools", call: { name: "describe_series", args: { id: "dicu_thuan_tinh" } },
        result: { table: [["Thuộc tính", "Giá trị"], ["Chiều", "tỉnh × năm"], ["Chia tuổi", "Không"], ["Năm mới nhất", "2023"]] } },
      { kind: "think", comp: "ai", title: "AI cân nhắc",
        body: "Có thể suy gián tiếp từ dân số nhóm tuổi thay đổi qua năm, nhưng lẫn với tử vong và sinh — không đủ tin cậy để viết. → Báo không đủ dữ liệu." },
      { kind: "tool", comp: "tools", call: { name: "report_insufficient", args: { reason: "không có di cư theo tuổi", data_needed: "..." } },
        result: { text: "Đã tạo thẻ “cần dữ liệu gì”." } },
      { kind: "guard", comp: "guard", title: "Rào chắn (code)",
        checks: [{ ok: true, name: "Đủ trường bắt buộc", detail: "Có đề tài, thứ còn thiếu, và đề tài mở khoá được nếu có dữ liệu" }] },
    ],
    card: {
      kind: "insufficient",
      title: "Cần dữ liệu: di cư theo nhóm tuổi",
      want: "Người trẻ có đang rời Hà Nội về quê không?",
      missing: ["Di cư chia theo nhóm tuổi (kho chỉ có tổng)", "Số liệu mới hơn 2023", "Cấp quận/huyện nơi đi – nơi đến"],
      sources: "Nguồn có thể có: Điều tra biến động dân số (NSO, vi mô), Tổng điều tra dân số 2019 (bảng chéo tuổi × di cư), dữ liệu đăng ký tạm trú.",
      unlock: "Mở khoá thêm: “thành phố nào hút người trẻ nhất”, “làn sóng về quê sau COVID có thật không”.",
    },
  },

  // ───────────────────────────── 5. ĐẠT — khoảng cách vùng
  {
    id: "s5",
    mode: "chu-dong",
    input: "Giả thuyết: khoảng cách tỷ lệ học đại học giữa các vùng đang thu hẹp hay nới rộng?",
    outcome: "pass",
    steps: [
      { kind: "input", comp: "input", title: "Đầu vào — chế độ Chủ động", body: "Giả thuyết đã duyệt." },
      { kind: "think", comp: "ai", title: "AI lập kế hoạch", body: "Dạng <code>gap_trend</code>: so vùng cao nhất với vùng thấp nhất theo thời gian." },
      { kind: "tool", comp: "tools", call: { name: "search_series", args: { query: "tỷ lệ sinh viên trên dân số" } },
        result: { table: [["series_id", "Độ phủ", "Năm"], ["sv_van_dan", "6 vùng", "2012–2023"]] } },
      { kind: "tool", comp: "tools", call: { name: "check_artifacts", args: { id: "sv_van_dan" } },
        result: { text: "Không có cảnh báo. Đơn vị nhất quán (SV/vạn dân)." } },
      { kind: "tool", comp: "tools", call: { name: "run_detector", args: { kind: "gap_trend", id: "sv_van_dan", top: "ĐBSH", bottom: "ĐBSCL" } },
        result: {
          text: "<code>r_088</code> · Khoảng cách tăng từ 1,9 lần (2012) lên <b>3,1 lần</b> (2023).",
          chart: { type: "line", yLabel: "Sinh viên / vạn dân", series: [
            { name: "ĐBSH", color: "var(--series-1)", points: [[2012, 310], [2014, 330], [2016, 350], [2018, 372], [2020, 390], [2022, 410], [2023, 418]] },
            { name: "ĐBSCL", color: "var(--series-2)", points: [[2012, 163], [2014, 158], [2016, 150], [2018, 146], [2020, 140], [2022, 137], [2023, 135]] }] } } },
      { kind: "draft", comp: "ai", title: "AI nộp thẻ nháp",
        body: "Tít: <i>“Miền Tây ngày càng tụt lại trong cuộc đua đại học”</i> — 1,9 lần → 3,1 lần [r_088]" },
      { kind: "guard", comp: "guard", title: "Rào chắn (code)",
        checks: [
          { ok: true, name: "Khớp số", detail: "2/2 khớp" },
          { ok: true, name: "Artefact", detail: "Sạch" },
          { ok: true, name: "Lặp lại theo thời gian", detail: "Xu hướng một chiều suốt 11 năm" },
          { ok: "warn", name: "Câu chữ", detail: "“tụt lại” mang tính đánh giá → đề nghị người kiểm xem" },
        ] },
      { kind: "human", comp: "human", title: "Người kiểm",
        body: "Nhãn: <b class='ok'>ĐẠT</b>. Sửa tít trung tính hơn. Cần kiểm: sinh viên được tính theo nơi học hay nơi thường trú?" },
    ],
    card: {
      kind: "pass",
      title: "Khoảng cách đại học giữa đồng bằng Bắc Bộ và miền Tây tăng từ 1,9 lên 3,1 lần",
      pattern: "Khoảng cách vùng nới rộng",
      why: "Một vùng tăng đều, vùng kia giảm đều suốt 11 năm. Đây là xu hướng cấu trúc, không phải biến động một năm.",
      numbers: [["Năm 2012", "1,9 lần", "r_088"], ["Năm 2023", "3,1 lần", "r_088"]],
      chart: null,
      sources: ["so-sinh-vien-dai-hoc-theo-vung"],
      verify: "Sinh viên tính theo nơi học → người miền Tây học ở TP.HCM có bị đếm vào Đông Nam Bộ không?",
      caveat: "Nếu đếm theo nơi học, khoảng cách có thể phản ánh nơi đặt trường hơn là trình độ dân cư.",
      confidence: "Trung bình",
    },
  },

  // ───────────────────────────── 6. CẦN DỮ LIỆU GÌ — bám tin
  {
    id: "s6",
    mode: "bam-tin",
    input: "Bài nhiều lượt xem: “Chủ tịch UBND tỉnh đột ngột vắng mặt” (giả lập)",
    outcome: "insufficient",
    steps: [
      { kind: "input", comp: "input", title: "Đầu vào — chế độ Bám tin nóng", body: "Tin về nhân sự lãnh đạo." },
      { kind: "think", comp: "ai", title: "AI lập kế hoạch", body: "Cần danh mục nhân sự lãnh đạo, nhiệm kỳ, lịch sử kỷ luật." },
      { kind: "tool", comp: "tools", call: { name: "search_series", args: { query: "lãnh đạo UBND tỉnh nhiệm kỳ" } },
        result: { text: "Không có chuỗi nào. Kho chủ yếu là thống kê kinh tế – xã hội của NSO." } },
      { kind: "tool", comp: "tools", call: { name: "report_insufficient", args: { reason: "không có dữ liệu nhân sự", data_needed: "..." } },
        result: { text: "Đã tạo thẻ “cần dữ liệu gì”." } },
      { kind: "guard", comp: "guard", title: "Rào chắn (code)",
        checks: [{ ok: true, name: "Đủ trường bắt buộc", detail: "OK" }] },
    ],
    card: {
      kind: "insufficient",
      title: "Cần dữ liệu: nhân sự lãnh đạo địa phương",
      want: "Bao nhiêu lãnh đạo tỉnh bị kỷ luật hoặc thay giữa nhiệm kỳ? Tỉnh nào thay nhiều nhất?",
      missing: ["Danh mục lãnh đạo tỉnh theo nhiệm kỳ", "Quyết định kỷ luật, miễn nhiệm"],
      sources: "Nguồn có thể có: cổng thông tin các tỉnh, thông cáo của Ủy ban Kiểm tra Trung ương, kho bài VnExpress đã đăng (tự trích xuất).",
      unlock: "Mở khoá thêm một nhóm tin có lượt xem cao nhưng hiện không có dữ liệu nào trong kho.",
    },
  },

  // ───────────────────────────── 7. ĐẠT — góc thay thế từ AMA khi không có dataset trực tiếp
  {
    id: "s7",
    mode: "hoi",
    input: "Góc thay thế: Hà Nội còn hút người nhập cư như trước không?",
    outcome: "pass",
    steps: [
      { kind: "input", comp: "input", title: "Đầu vào — góc thay thế do AMA gợi ý",
        body: "Câu gốc (“người trẻ rời Hà Nội”) không có dữ liệu theo tuổi. Phóng viên chọn góc gần đúng mà kho trả lời được." },
      { kind: "think", comp: "ai", title: "AI lập kế hoạch",
        body: "Dùng di cư thuần cấp tỉnh. Dạng <code>trend_break</code> cho Hà Nội, so với TP.HCM làm mốc." },
      { kind: "tool", comp: "tools", call: { name: "check_artifacts", args: { id: "dicu_thuan_tinh" } },
        result: { text: "⚠ Năm 2019 là năm Tổng điều tra — phương pháp khác các năm điều tra mẫu. Đánh dấu điểm này." } },
      { kind: "tool", comp: "tools", call: { name: "run_detector", args: { kind: "trend_break", id: "dicu_thuan_tinh", geo: "Hà Nội", compare: "TP.HCM" } },
        result: {
          text: "<code>r_131</code> · Hà Nội: +9,1‰ (2015) → <b>+2,3‰</b> (2023). TP.HCM: +11,4‰ → +1,8‰. Cả hai cùng giảm, gãy rõ từ 2020.",
          chart: { type: "line", yLabel: "Tỷ suất di cư thuần (‰)", series: [
            { name: "Hà Nội", color: "var(--series-1)", points: [[2015, 9.1], [2016, 8.4], [2017, 8.8], [2018, 7.9], [2019, 7.2], [2020, 4.1], [2021, 2.6], [2022, 2.9], [2023, 2.3]] },
            { name: "TP.HCM", color: "var(--series-2)", points: [[2015, 11.4], [2016, 10.9], [2017, 10.2], [2018, 9.6], [2019, 8.8], [2020, 3.5], [2021, 0.9], [2022, 1.6], [2023, 1.8]] }] } } },
      { kind: "draft", comp: "ai", title: "AI nộp thẻ nháp",
        body: "Tít: <i>“Sức hút nhập cư của Hà Nội và TP.HCM chỉ còn khoảng một phần tư so với 2015”</i> [r_131]" },
      { kind: "guard", comp: "guard", title: "Rào chắn (code)",
        checks: [
          { ok: true, name: "Khớp số", detail: "4/4 khớp" },
          { ok: "warn", name: "Artefact", detail: "2019 khác phương pháp — xu hướng vẫn giữ khi bỏ điểm này" },
          { ok: true, name: "Lặp lại theo thời gian", detail: "Giảm giữ nguyên 2020–2023" },
          { ok: "warn", name: "Câu chữ", detail: "Không nói “người trẻ” — dữ liệu không chia tuổi" },
        ] },
      { kind: "human", comp: "human", title: "Người kiểm", body: "Nhãn: <b class='ok'>ĐẠT</b>. Phóng viên bổ sung phỏng vấn để có góc người trẻ." },
    ],
    card: {
      kind: "pass",
      title: "Sức hút nhập cư của Hà Nội và TP.HCM chỉ còn khoảng một phần tư so với 2015",
      pattern: "Xu hướng gãy",
      why: "Hai đô thị lớn nhất cùng giảm mạnh, gãy rõ từ 2020 và chưa hồi lại. Đây là nền số liệu cho câu chuyện “rời thành phố”, dù chưa nói được về độ tuổi.",
      numbers: [["Hà Nội 2015 → 2023", "+9,1‰ → +2,3‰", "r_131"], ["TP.HCM 2015 → 2023", "+11,4‰ → +1,8‰", "r_131"]],
      chart: null,
      sources: ["ty-suat-di-cu-thuan-theo-tinh"],
      verify: "Phỏng vấn người trẻ đã rời đi; hỏi chuyên gia về vai trò của giá nhà và làm việc từ xa.",
      caveat: "Không có số theo tuổi — không được viết “người trẻ rời đi” như một kết quả số liệu.",
      confidence: "Trung bình",
    },
  },
];

const MODES = {
  "chu-dong": "Chủ động",
  "bam-tin": "Bám tin nóng",
  "hoi": "Phóng viên hỏi",
};

const OUTCOMES = {
  pass: { label: "Đạt", cls: "ok" },
  rejected_guard: { label: "Rào chắn loại", cls: "bad" },
  rejected_human: { label: "Người kiểm loại", cls: "warn" },
  insufficient: { label: "Cần dữ liệu", cls: "info" },
};
