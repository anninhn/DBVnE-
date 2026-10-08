// Giả lập “Bản tin sáng”: CMS pageview + quét báo chí → cụm chủ đề → tìm dataset → harness → góc nhìn.
// Chủ đề, số bài, pageview, góc nhìn — TẤT CẢ là giả lập.

const BRIEF = {
  date: "Thứ Ba, 06/10/2026 · 6:00",
  sources: [
    ["CMS VnExpress", "pageview 24 giờ của 1.240 bài"],
    ["Quét báo chí thị trường", "38 trang · 6.512 bài · chỉ lấy tít + sapo"],
    ["Kho dữ liệu", "494 dataset"],
  ],
  pipeline: [
    "Gom bài thành cụm chủ đề",
    "Xếp hạng độ nóng (pageview VnE + độ phủ thị trường)",
    "Tìm dataset theo metadata",
    "Harness phân tích, tìm góc KHÁC các bài đã đăng",
    "Rào chắn + biên tập viên duyệt",
  ],
  // status: angle = có góc nhìn đạt · need = nóng nhưng thiếu dữ liệu · skip = ngoài phạm vi
  clusters: [
    { topic: "Chính sách khuyến khích sinh con", articles: 214, vneViews: "1,9 tr", status: "angle", scenario: "s1", chat: "c1",
      covered: "Các báo đang đưa: nội dung chính sách, mức hỗ trợ, ý kiến người dân.",
      angle: "Ở đồng bằng Bắc Bộ, tỉnh khá giả sinh nhiều hơn — miền Tây thì ngược lại. Một chính sách chung có hợp cho hai vùng?" },
    { topic: "Giá nhà Hà Nội, người trẻ rời thành phố", articles: 167, vneViews: "1,2 tr", status: "angle", scenario: "s7", chat: "c3",
      covered: "Các báo đang đưa: giá căn hộ, câu chuyện cá nhân.",
      angle: "Sức hút nhập cư của Hà Nội và TP.HCM chỉ còn khoảng một phần tư so với 2015." },
    { topic: "Điểm chuẩn đại học, mùa tuyển sinh bổ sung", articles: 302, vneViews: "2,4 tr", status: "angle", scenario: "s5",
      covered: "Các báo đang đưa: điểm chuẩn từng trường, ngành hot.",
      angle: "Khoảng cách đại học giữa đồng bằng Bắc Bộ và miền Tây tăng từ 1,9 lên 3,1 lần trong 11 năm." },
    { topic: "Bão đổ bộ miền Trung", articles: 488, vneViews: "3,1 tr", status: "need", days: 4,
      covered: "Kho có diện tích rừng theo tỉnh/năm, nhưng không có thiệt hại theo từng cơn bão.",
      need: "Thiệt hại thiên tai theo sự kiện, cấp xã (Ban chỉ đạo phòng chống thiên tai)." },
    { topic: "Giá vàng lập đỉnh", articles: 251, vneViews: "2,2 tr", status: "need", days: 11,
      covered: "Kho chỉ có chỉ số giá theo năm.",
      need: "Giá vàng theo ngày (SJC, thế giới) — chuỗi thời gian tần suất cao." },
    { topic: "Đại án ngân hàng xét xử phúc thẩm", articles: 176, vneViews: "1,6 tr", status: "need", days: 7,
      covered: "Kho không có dữ liệu tư pháp.",
      need: "Danh mục vụ án, bản án công bố (cổng bản án Toà án)." },
    { topic: "Vòng loại World Cup", articles: 395, vneViews: "2,8 tr", status: "skip",
      covered: "Ngoài phạm vi kho dữ liệu kinh tế – xã hội." },
  ],
};

const STATUS = {
  angle: ["Có góc nhìn", "ok"],
  need: ["Thiếu dữ liệu", "info"],
  skip: ["Ngoài phạm vi", "muted"],
};

function renderBrief() {
  const b = BRIEF;
  const angles = b.clusters.filter((c) => c.status === "angle");
  const needs = b.clusters.filter((c) => c.status === "need").sort((x, y) => y.days - x.days);

  $("#brief").innerHTML = `
    <div class="brief-head">
      <div><div class="mode-tag">Bản tin góc nhìn hằng ngày · gửi biên tập viên</div>
      <h2>Sáng nay có ${angles.length} góc nhìn mới từ dữ liệu</h2>
      <div class="note">${b.date}</div></div>
    </div>

    <div class="brief-pipe">
      ${b.sources.map(([k, v]) => `<div class="src"><b>${k}</b><span>${v}</span></div>`).join("")}
      <div class="pipe-steps">${b.pipeline.map((p, i) => `<span>${i + 1}. ${p}</span>`).join("<i>→</i>")}</div>
    </div>

    <h3>Góc nhìn đề xuất</h3>
    <div class="angles">
      ${angles.map((c, i) => `
        <div class="angle-card">
          <div class="mode-tag">Chủ đề nóng · ${c.articles} bài trên thị trường · ${c.vneViews} lượt xem VnE</div>
          <div class="topic">${c.topic}</div>
          <div class="covered">${c.covered}</div>
          <div class="new-angle"><span>Góc mới từ dữ liệu</span>${c.angle}</div>
          <div class="card-actions">
            <button class="trace-link" data-s="${c.scenario}">Xem cách tính →</button>
            ${c.chat ? `<button data-chat="${c.chat}">Hỏi tiếp trong AMA</button>` : ""}
          </div>
        </div>`).join("")}
    </div>

    <h3>Nóng nhưng kho chưa có dữ liệu</h3>
    <p class="note">Cộng dồn theo ngày — chủ đề xuất hiện càng nhiều ngày thì càng nên ưu tiên bổ sung dữ liệu.</p>
    <table class="tbl">
      <tr><th>Chủ đề</th><th>Bài thị trường</th><th>Số ngày nóng</th><th>Kho hiện có</th><th>Cần bổ sung</th></tr>
      ${needs.map((c) => `<tr><td><b>${c.topic}</b></td><td>${c.articles}</td><td><b>${c.days}</b> ngày</td>
        <td>${c.covered}</td><td>${c.need}</td></tr>`).join("")}
    </table>

    <h3>Toàn bộ cụm chủ đề hôm nay</h3>
    <table class="tbl">
      <tr><th>Chủ đề</th><th>Bài thị trường</th><th>Lượt xem VnE</th><th>Kết quả</th></tr>
      ${b.clusters.map((c) => {
        const [l, cls] = STATUS[c.status];
        return `<tr><td>${c.topic}</td><td>${c.articles}</td><td>${c.vneViews}</td><td><span class="pill ${cls}">${l}</span></td></tr>`;
      }).join("")}
    </table>`;

  $("#brief").querySelectorAll("[data-s]").forEach((btn) => (btn.onclick = () => openTrace(btn.dataset.s)));
  $("#brief").querySelectorAll("[data-chat]").forEach((btn) =>
    (btn.onclick = () => {
      const c = CHATS.find((x) => x.id === btn.dataset.chat);
      switchView("chat");
      resetChat();
      ask(c.question);
    })
  );
}

renderBrief();
