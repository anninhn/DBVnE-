// Điều khiển prototype: chọn đầu vào → phát lại từng bước harness → hiện thẻ kết quả.

const $ = (s) => document.querySelector(s);
const state = { sc: null, i: 0, timer: null, mode: "all", done: new Set() };

// ── danh sách đầu vào ──────────────────────────────
function renderFilter() {
  const opts = [["all", "Tất cả"], ...Object.entries(MODES)];
  $("#mode-filter").innerHTML = opts
    .map(([k, v]) => `<button data-mode="${k}" class="${state.mode === k ? "active" : ""}">${v}</button>`)
    .join("");
}

function renderList() {
  const list = SCENARIOS.filter((s) => state.mode === "all" || s.mode === state.mode);
  $("#scenario-list").innerHTML = list
    .map((s) => {
      const o = OUTCOMES[s.outcome];
      const badge = state.done.has(s.id) ? `<span class="pill ${o.cls}">${o.label}</span>` : `<span class="pill muted">chưa chạy</span>`;
      return `<li data-id="${s.id}" class="${state.sc?.id === s.id ? "active" : ""}">
        <div class="mode-tag">${MODES[s.mode]}</div>
        <div>${s.input}</div>${badge}</li>`;
    })
    .join("");
}

// ── vết chạy ───────────────────────────────────────
function argStr(args) {
  return Object.entries(args).map(([k, v]) => `${k}=<span class="str">"${v}"</span>`).join(", ");
}

function table(rows) {
  const [h, ...b] = rows;
  return `<table class="mini"><tr>${h.map((c) => `<th>${c}</th>`).join("")}</tr>${b
    .map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join("")}</tr>`)
    .join("")}</table>`;
}

const KIND_LABEL = { input: "ĐẦU VÀO", think: "AI", tool: "TOOL", draft: "AI", guard: "RÀO CHẮN", human: "NGƯỜI KIỂM" };

function renderStep(st, idx) {
  let body = "";
  if (st.kind === "tool") {
    body = `<div class="call"><span class="fn">${st.call.name}</span>(${argStr(st.call.args)})</div>`;
    if (st.result.table) body += table(st.result.table);
    if (st.result.text) body += `<div class="res">${st.result.text}</div>`;
    if (st.result.chart) body += `<div class="chart-box">${renderChart(st.result.chart)}</div>`;
  } else if (st.kind === "guard") {
    body = `<ul class="checks">${st.checks
      .map((c) => {
        const icon = c.ok === true ? "✓" : c.ok === false ? "✗" : c.ok === "warn" ? "!" : "–";
        const cls = c.ok === true ? "ok" : c.ok === false ? "bad" : c.ok === "warn" ? "warn" : "muted";
        return `<li><span class="ck ${cls}">${icon}</span><b>${c.name}</b><span class="det">${c.detail}</span></li>`;
      })
      .join("")}</ul>`;
  } else {
    body = `<div class="res">${st.body}</div>`;
  }
  const title = st.kind === "tool" ? "Gọi tool" : st.title;
  return `<li class="step k-${st.kind}"><div class="step-head"><span class="k">${KIND_LABEL[st.kind]}</span>
    <span class="n">${idx + 1}</span>${title}</div>${body}</li>`;
}

function highlight(comp) {
  document.querySelectorAll("#arch .node").forEach((n) => {
    n.classList.toggle("on", n.dataset.comp === comp || (comp === "tools" && n.dataset.comp === "data"));
  });
}

function step() {
  const sc = state.sc;
  if (!sc || state.i >= sc.steps.length) return;
  const st = sc.steps[state.i];
  $("#trace").insertAdjacentHTML("beforeend", renderStep(st, state.i));
  $("#trace").lastElementChild.scrollIntoView({ behavior: "smooth", block: "nearest" });
  highlight(st.comp);
  state.i++;
  if (state.i >= sc.steps.length) finish();
}

function finish() {
  stopPlay();
  highlight("output");
  state.done.add(state.sc.id);
  renderResult(state.sc.card);
  renderList();
  renderSummary();
  $("#btn-step").disabled = $("#btn-play").disabled = true;
}

function play() {
  if (state.timer) return;
  step();
  state.timer = setInterval(step, 900);
  $("#btn-play").textContent = "Đang chạy…";
}
function stopPlay() {
  clearInterval(state.timer);
  state.timer = null;
  $("#btn-play").textContent = "Chạy hết ▸▸";
}

function load(id) {
  stopPlay();
  state.sc = SCENARIOS.find((s) => s.id === id);
  state.i = 0;
  $("#trace").innerHTML = "";
  $("#run-input").innerHTML = `<span class="mode-tag">${MODES[state.sc.mode]}</span> ${state.sc.input}`;
  $("#result").className = "result empty";
  $("#result").textContent = "Chưa chạy xong.";
  highlight(null);
  $("#btn-step").disabled = $("#btn-play").disabled = $("#btn-reset").disabled = false;
  renderList();
}

// ── thẻ kết quả ────────────────────────────────────
function renderResult(c) {
  const el = $("#result");
  el.className = `result card-${c.kind}`;
  el.innerHTML = cardHTML(c);
}

function cardHTML(c) {
  if (c.kind === "pass") {
    return `<div class="card-tag ok">✓ Thẻ đề tài · ${c.pattern}</div>
      <h4>${c.title}</h4>
      <p>${c.why}</p>
      <table class="mini nums">${c.numbers.map((n) => `<tr><td>${n[0]}</td><td class="v">${n[1]}</td><td class="rid">${n[2]}</td></tr>`).join("")}</table>
      ${c.chart ? `<div class="chart-box">${renderChart(c.chart)}</div>` : ""}
      <dl>
        <dt>Nguồn</dt><dd>${c.sources.map((s) => `<code>${s}</code>`).join(" ")}</dd>
        <dt>Cần kiểm thêm</dt><dd>${c.verify}</dd>
        <dt>Lưu ý</dt><dd>${c.caveat}</dd>
        <dt>Độ tin cậy</dt><dd>${c.confidence}</dd>
      </dl>`;
  } else if (c.kind === "insufficient") {
    return `<div class="card-tag info">◇ Cần dữ liệu gì</div>
      <h4>${c.title}</h4>
      <dl>
        <dt>Đề tài muốn làm</dt><dd>${c.want}</dd>
        <dt>Còn thiếu</dt><dd><ul>${c.missing.map((m) => `<li>${m}</li>`).join("")}</ul></dd>
        <dt>Nơi có thể lấy</dt><dd>${c.sources}</dd>
        <dt>Nếu có thì làm được</dt><dd>${c.unlock}</dd>
      </dl>`;
  } else {
    const tag = c.kind === "rejected_guard" ? `<div class="card-tag bad">✗ Rào chắn loại</div>` : `<div class="card-tag warn">! Người kiểm loại</div>`;
    return `${tag}<h4>${c.title}</h4><p>${c.reason}</p><p class="lesson">${c.lesson}</p>`;
  }
}

// ── tổng kết ───────────────────────────────────────
function renderSummary() {
  const count = (o) => SCENARIOS.filter((s) => s.outcome === o).length;
  const pass = SCENARIOS.filter((s) => s.outcome === "pass");
  const modesCovered = new Set(pass.map((s) => s.mode)).size;
  const tiles = [
    ["Đầu vào", SCENARIOS.length, ""],
    ["Thẻ đạt", count("pass"), "ok"],
    ["Rào chắn loại", count("rejected_guard"), "bad"],
    ["Lọt rào chắn, người loại", count("rejected_human"), "warn"],
    ["Cần dữ liệu", count("insufficient"), "info"],
  ];
  $("#tiles").innerHTML = tiles.map(([l, v, c]) => `<div class="tile ${c}"><div class="tv">${v}</div><div class="tl">${l}</div></div>`).join("");
  $("#summary-table").innerHTML =
    `<tr><th>#</th><th>Chế độ</th><th>Đầu vào</th><th>Số bước</th><th>Kết quả</th><th>Đã xem</th></tr>` +
    SCENARIOS.map((s, i) => {
      const o = OUTCOMES[s.outcome];
      return `<tr><td>${i + 1}</td><td>${MODES[s.mode]}</td><td>${s.input}</td><td>${s.steps.length}</td>
        <td><span class="pill ${o.cls}">${o.label}</span></td><td>${state.done.has(s.id) ? "✓" : ""}</td></tr>`;
    }).join("");
  const ok = pass.length >= 3 && modesCovered >= 2;
  $("#verdict").innerHTML = ok
    ? `<b class="ok">LÀM ĐƯỢC</b> — ${pass.length} thẻ đạt, phủ ${modesCovered}/3 chế độ.`
    : `<b class="bad">CHƯA ĐẠT NGƯỠNG</b> — ${pass.length} thẻ đạt (cần ≥ 3), phủ ${modesCovered}/3 chế độ (cần ≥ 2). ` +
      `Demo sẽ chuyển trọng tâm sang: (1) phân tích lỗi do harness hay do dữ liệu, (2) danh sách “cần dữ liệu gì” xếp theo số đề tài mở khoá được.`;
}

// ── tooltip ────────────────────────────────────────
document.addEventListener("mousemove", (e) => {
  const t = e.target.closest?.("[data-tip]");
  const tip = $("#tooltip");
  if (!t) return tip.classList.add("hidden");
  tip.innerHTML = t.dataset.tip;
  tip.classList.remove("hidden");
  tip.style.left = e.clientX + 12 + "px";
  tip.style.top = e.clientY + 12 + "px";
});

// ── sự kiện ────────────────────────────────────────
$("#mode-filter").addEventListener("click", (e) => {
  const b = e.target.closest("button");
  if (!b) return;
  state.mode = b.dataset.mode;
  renderFilter();
  renderList();
});
$("#scenario-list").addEventListener("click", (e) => {
  const li = e.target.closest("li");
  if (li) load(li.dataset.id);
});
$("#btn-step").onclick = () => { stopPlay(); step(); };
$("#btn-play").onclick = play;
$("#btn-reset").onclick = () => state.sc && load(state.sc.id);
function switchView(view) {
  document.querySelectorAll(".tab").forEach((x) => x.classList.toggle("active", x.dataset.view === view));
  document.querySelectorAll(".view").forEach((v) => v.classList.toggle("hidden", v.id !== `view-${view}`));
}
document.querySelectorAll(".tab").forEach((t) => t.addEventListener("click", () => switchView(t.dataset.view)));

// Mở vết chạy đầy đủ của một kịch bản (nút "Xem cách tính" trong chat / bản tin)
function openTrace(id) {
  switchView("run");
  load(id);
  while (state.i < state.sc.steps.length) step();
  $("#trace").scrollTop = 0;
  $(".col-mid").scrollTop = 0;
}

renderFilter();
renderList();
renderSummary();
