// Giả lập AMA (Hỏi dữ liệu): tìm theo metadata → chọn dataset → harness → thẻ insight.
// Nhánh không tìm thấy dataset → gợi ý góc khác. Mọi dataset và số liệu ở đây là GIẢ LẬP.

const CHATS = [
  {
    id: "c1",
    question: "Thu nhập và mức sinh khác nhau thế nào giữa các vùng?",
    keywords: ["sinh", "thu nhập", "con"],
    found: {
      intro: "Mình tìm thấy 3 dataset liên quan. Chọn những dataset muốn đưa vào phân tích:",
      datasets: [
        { slug: "tong-ty-suat-sinh-theo-tinh", title: "Tổng tỷ suất sinh theo tỉnh", reason: "Số con trung bình mỗi phụ nữ, 63 tỉnh, 2010–2023.", conf: "high", pre: true },
        { slug: "thu-nhap-binh-quan-dau-nguoi-theo-tinh", title: "Thu nhập bình quân đầu người theo tỉnh", reason: "Triệu đồng/người/tháng, 2 năm một lần.", conf: "high", pre: true },
        { slug: "ty-so-gioi-tinh-khi-sinh-theo-tinh", title: "Tỷ số giới tính khi sinh theo tỉnh", reason: "Có thể giúp giải thích chênh lệch giữa các vùng.", conf: "medium" },
      ],
    },
    scenario: "s1",
    followups: ["Kiểm thêm tỷ số giới tính khi sinh?", "Xu hướng này có từ bao giờ?", "Vùng Tây Nguyên thì sao?"],
  },
  {
    id: "c2",
    question: "Tỉnh nào chi cho y tế thấp bất thường so với thu nhập?",
    keywords: ["y tế", "chi tiêu", "bệnh"],
    found: {
      intro: "Mình tìm thấy 2 dataset phù hợp:",
      datasets: [
        { slug: "chi-tieu-y-te-binh-quan-theo-tinh", title: "Chi tiêu cho y tế, chăm sóc sức khoẻ bình quân theo tỉnh", reason: "Nghìn đồng/người/tháng, 2012–2022.", conf: "high", pre: true },
        { slug: "thu-nhap-binh-quan-dau-nguoi-theo-tinh", title: "Thu nhập bình quân đầu người theo tỉnh", reason: "Dùng làm mức chuẩn để so.", conf: "high", pre: true },
      ],
    },
    scenario: "s2",
    followups: ["Chạy lại phân tích", "Tỉnh đó có ít cơ sở y tế không?"],
  },
  {
    id: "c3",
    question: "Người trẻ có đang rời Hà Nội về quê không?",
    keywords: ["người trẻ", "rời", "về quê", "di cư"],
    notFound: {
      intro: "Không có dataset nào trả lời trực tiếp câu này — kho chỉ có di cư <b>tổng</b>, không chia theo nhóm tuổi. Có 3 hướng đi tiếp:",
      alternatives: [
        { icon: "≈", title: "Dùng dữ liệu gần đúng", text: "<b>Tỷ suất di cư thuần theo tỉnh</b> (không chia tuổi).",
          angle: "Hà Nội còn hút người nhập cư như trước không?", scenario: "s7", cta: "Phân tích góc này" },
        { icon: "↻", title: "Đặt lại câu hỏi", text: "Dùng <b>Dân số theo nhóm tuổi và tỉnh</b> để xem nhóm 20–34 tuổi của Hà Nội tăng nhanh hay chậm hơn tổng dân số.",
          angle: "Dân số 20–34 tuổi của Hà Nội đang tăng chậm lại?", scenario: null, cta: "Chưa có trong prototype" },
        { icon: "◇", title: "Ghi nhận dữ liệu còn thiếu", text: "Lưu thành thẻ “cần dữ liệu gì” để ưu tiên bổ sung kho.",
          angle: "Cần dữ liệu: di cư theo nhóm tuổi", scenario: "s4", cta: "Tạo thẻ" },
      ],
    },
  },
];

const CONF = { high: ["Phù hợp cao", "ok"], medium: ["Phù hợp vừa", "warn"], low: ["Có thể liên quan", "muted"] };

const DETECTOR_LABEL = {
  region_reversal: "So quan hệ giữa các vùng",
  partial_corr: "Kiểm biến gây nhiễu",
  outlier_residual: "Tìm tỉnh lệch quy luật",
  trend_break: "Tìm điểm gãy xu hướng",
  gap_trend: "Đo khoảng cách giữa vùng",
};

// Dòng tiến trình trong chat được suy ra TỪ CHÍNH vết chạy của kịch bản — chat và “Xem cách tính” luôn khớp nhau.
function progressLine(st) {
  if (st.kind === "think") return "Lập kế hoạch phân tích";
  if (st.kind === "draft") return "Viết thẻ nháp";
  if (st.kind === "guard") {
    const done = st.checks.filter((c) => c.ok !== null);
    const pass = done.filter((c) => c.ok === true || c.ok === "warn").length;
    const failed = done.some((c) => c.ok === false);
    const warns = done.filter((c) => c.ok === "warn").length;
    return { text: `Rào chắn: ${pass}/${done.length} mục đạt${warns ? ` (${warns} cảnh báo)` : ""}`, bad: failed };
  }
  if (st.kind !== "tool") return null;
  const { name, args } = st.call;
  if (name === "search_series") return `Tìm chuỗi số liệu: “${args.query}”`;
  if (name === "describe_series") return "Đọc mô tả chuỗi";
  if (name === "check_artifacts") return "Kiểm đơn vị, năm thiếu, sáp nhập tỉnh";
  if (name === "run_detector") return (DETECTOR_LABEL[args.kind] ?? "Chạy bộ dò") + (args.year ? ` — năm ${args.year}` : "");
  if (name === "report_insufficient") return "Ghi nhận dữ liệu còn thiếu";
  return name;
}

const chat = { busy: false };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = () => $("#chat-log");

function scrollChat() {
  const el = $("#chat-scroll");
  el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
}

function addMsg(role, html, cls = "") {
  $("#chat-empty").classList.add("hidden");
  log().insertAdjacentHTML("beforeend", `<div class="msg ${role} ${cls}">${html}</div>`);
  scrollChat();
  return log().lastElementChild;
}

async function typing(ms = 700, label = "Đang tìm trong metadata của kho…") {
  const el = addMsg("ai", `<div class="typing">${label}</div>`);
  await sleep(ms);
  el.remove();
}

function stageTag(n, label) {
  return `<div class="stage"><span>Bước ${n}</span>${label}</div>`;
}

async function ask(text) {
  if (chat.busy || !text.trim()) return;
  chat.busy = true;
  addMsg("user", text);
  $("#chat-input").value = "";
  const c = CHATS.find((x) => x.question === text) ??
    CHATS.find((x) => x.keywords.some((k) => text.toLowerCase().includes(k)));
  await typing();
  if (!c) {
    addMsg("ai", `Prototype này chỉ có 3 kịch bản dựng sẵn. Thử một trong các câu gợi ý bên dưới nhé.`);
    chat.busy = false;
    return;
  }
  if (c.found) renderFound(c);
  else renderNotFound(c);
  chat.busy = false;
}

function renderFound(c) {
  const cards = c.found.datasets.map((d, i) => {
    const [label, cls] = CONF[d.conf];
    return `<label class="ds-card">
      <input type="checkbox" data-i="${i}" ${d.pre ? "checked" : ""}>
      <div><div class="ds-top"><b>${d.title}</b><span class="pill ${cls}">${label}</span></div>
      <div class="ds-reason">${d.reason}</div><code class="ds-slug">${d.slug}</code></div></label>`;
  }).join("");
  const el = addMsg("ai", `${stageTag(1, "Tìm theo metadata")}
    <p>${c.found.intro}</p><div class="ds-list">${cards}</div>
    <div class="ds-actions"><button class="primary analyze">Phân tích insight →</button>
    <span class="note">Harness sẽ đọc số liệu thật của các dataset đã chọn.</span></div>`);
  const btn = el.querySelector(".analyze");
  const sync = () => {
    const n = el.querySelectorAll("input:checked").length;
    btn.disabled = n === 0;
    btn.textContent = n ? `Phân tích insight (${n} dataset) →` : "Chọn ít nhất 1 dataset";
  };
  el.querySelectorAll("input").forEach((i) => i.addEventListener("change", sync));
  sync();
  btn.onclick = () => {
    const picked = [...el.querySelectorAll("input:checked")].map((i) => c.found.datasets[+i.dataset.i].title);
    btn.disabled = true;
    el.querySelectorAll("input").forEach((i) => (i.disabled = true));
    runHarness(c.scenario, `Phân tích: ${picked.join(" + ")}`, c.followups);
  };
}

function renderNotFound(c) {
  const alts = c.notFound.alternatives.map((a, i) => `
    <div class="alt">
      <div class="alt-icon">${a.icon}</div>
      <div class="alt-body"><b>${a.title}</b><div>${a.text}</div>
        <div class="alt-angle">Góc: <i>${a.angle}</i></div></div>
      <button data-i="${i}" ${a.scenario ? "" : "disabled"}>${a.cta}</button>
    </div>`).join("");
  const el = addMsg("ai", `${stageTag(1, "Tìm theo metadata")}<p>${c.notFound.intro}</p>
    ${stageTag("1b", "Gợi ý góc khác")}<div class="alts">${alts}</div>`);
  el.querySelectorAll("button[data-i]").forEach((b) =>
    b.addEventListener("click", () => {
      const a = c.notFound.alternatives[+b.dataset.i];
      el.querySelectorAll("button").forEach((x) => (x.disabled = true));
      runHarness(a.scenario, a.angle, []);
    })
  );
}

async function runHarness(scenarioId, userLine, followups) {
  chat.busy = true;
  const sc = SCENARIOS.find((s) => s.id === scenarioId);
  addMsg("user", userLine, "action");
  const el = addMsg("ai", `${stageTag(2, "Harness đang phân tích")}<ul class="progress"></ul>`);
  const ul = el.querySelector(".progress");
  for (const st of sc.steps) {
    const line = progressLine(st);
    if (!line) continue;
    const { text, bad } = typeof line === "string" ? { text: line } : line;
    ul.insertAdjacentHTML("beforeend", `<li class="run"><span class="spin"></span>${text}</li>`);
    scrollChat();
    await sleep(650);
    const li = ul.lastElementChild;
    li.className = bad ? "bad" : "done";
    li.querySelector(".spin").outerHTML = `<span class="ck">${bad ? "✗" : "✓"}</span>`;
  }
  await sleep(300);
  const retryNote = sc.card.kind === "rejected_guard"
    ? `<p class="note">Trong bản thật: harness tự chạy lại 1 lần kèm thông báo lỗi trước khi báo cho bạn. Prototype dừng ở đây để bạn thấy rào chắn hoạt động.</p>` : "";
  const review = sc.card.kind === "pass"
    ? `<div class="review"><span>Bạn là người kiểm:</span><button>✓ Đạt</button><button>Hiển nhiên</button><button>Sai số</button><button>Diễn giải quá đà</button></div>` : "";
  const fu = followups.length
    ? `<div class="followups">${followups.map((f) => `<button title="Chưa có trong prototype">${f}</button>`).join("")}</div>` : "";
  const out = addMsg("ai", `${stageTag(3, "Kết quả")}
    <div class="result card-${sc.card.kind}">${cardHTML(sc.card)}</div>${retryNote}
    <div class="card-actions"><button class="trace-link">Xem cách tính →</button>
    <span class="note">${sc.steps.length} bước · mọi con số đều trích từ kết quả tool</span></div>${review}${fu}`);
  out.querySelector(".trace-link").onclick = () => openTrace(scenarioId);
  out.querySelectorAll(".review button").forEach((b) =>
    b.addEventListener("click", () => {
      out.querySelectorAll(".review button").forEach((x) => x.classList.toggle("picked", x === b));
    })
  );
  chat.busy = false;
}

function resetChat() {
  log().innerHTML = "";
  $("#chat-empty").classList.remove("hidden");
}

// ── khởi tạo ───────────────────────────────────────
$("#chat-suggest").innerHTML = CHATS.map((c) => `<button>${c.question}</button>`).join("");
$("#chat-suggest").addEventListener("click", (e) => {
  const b = e.target.closest("button");
  if (b) ask(b.textContent);
});
$("#chat-form").addEventListener("submit", (e) => {
  e.preventDefault();
  ask($("#chat-input").value);
});
$("#chat-reset").onclick = resetChat;
