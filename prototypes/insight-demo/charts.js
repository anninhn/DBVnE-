// Biểu đồ SVG nhỏ cho prototype — không dùng thư viện.
// Quy ước: nét mảnh, lưới nhạt, chữ dùng màu chữ (không dùng màu series), có tooltip khi rê chuột.

const fmt = (v, d = 1) => v.toLocaleString("vi-VN", { minimumFractionDigits: d, maximumFractionDigits: d });

function scale(d0, d1, r0, r1) {
  return (v) => r0 + ((v - d0) / (d1 - d0)) * (r1 - r0);
}

function niceTicks(min, max, n = 4) {
  const step0 = (max - min) / n;
  const mag = Math.pow(10, Math.floor(Math.log10(step0)));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= step0);
  const ticks = [];
  for (let v = Math.floor(min / step) * step; v <= max + 1e-9; v += step) ticks.push(+v.toFixed(6));
  return ticks;
}

function fit(points) {
  const n = points.length;
  const mx = points.reduce((s, p) => s + p[1], 0) / n;
  const my = points.reduce((s, p) => s + p[2], 0) / n;
  let sxy = 0, sxx = 0;
  for (const p of points) { sxy += (p[1] - mx) * (p[2] - my); sxx += (p[1] - mx) ** 2; }
  const b = sxy / sxx;
  return { b, a: my - b * mx };
}

function frame(W, H, M, xs, ys, xLabel, yLabel, xFmt, yFmt) {
  let g = "";
  for (const t of ys.ticks) {
    const y = ys.s(t);
    g += `<line x1="${M.l}" x2="${W - M.r}" y1="${y}" y2="${y}" class="grid"/>`;
    g += `<text x="${M.l - 6}" y="${y + 3}" class="tick" text-anchor="end">${yFmt(t)}</text>`;
  }
  for (const t of xs.ticks) {
    const x = xs.s(t);
    g += `<text x="${x}" y="${H - M.b + 14}" class="tick" text-anchor="middle">${xFmt(t)}</text>`;
  }
  g += `<line x1="${M.l}" x2="${W - M.r}" y1="${H - M.b}" y2="${H - M.b}" class="axis"/>`;
  if (xLabel) g += `<text x="${(M.l + W - M.r) / 2}" y="${H - 4}" class="label" text-anchor="middle">${xLabel}</text>`;
  if (yLabel) g += `<text x="${M.l}" y="11" class="label">${yLabel}</text>`;
  return g;
}

function legend(items) {
  return `<div class="legend">${items.map((i) => `<span><i style="background:${i.color}"></i>${i.name}</span>`).join("")}</div>`;
}

function renderScatter(c, W = 340, H = 220) {
  const M = { t: 20, r: 54, b: 34, l: 34 };
  const all = c.groups.flatMap((g) => g.points);
  const xr = [Math.min(...all.map((p) => p[1])), Math.max(...all.map((p) => p[1]))];
  const yr = [Math.min(...all.map((p) => p[2])), Math.max(...all.map((p) => p[2]))];
  const xt = niceTicks(xr[0] - 0.2, xr[1] + 0.2), yt = niceTicks(yr[0] - 0.1, yr[1] + 0.1);
  const xs = { ticks: xt, s: scale(xt[0], xt.at(-1), M.l, W - M.r) };
  const ys = { ticks: yt, s: scale(yt[0], yt.at(-1), H - M.b, M.t) };
  let g = frame(W, H, M, xs, ys, c.xLabel, c.yLabel, (v) => fmt(v, 0), (v) => fmt(v, 1));
  for (const grp of c.groups) {
    const { a, b } = fit(grp.points);
    const x0 = Math.min(...grp.points.map((p) => p[1])), x1 = Math.max(...grp.points.map((p) => p[1]));
    g += `<line x1="${xs.s(x0)}" y1="${ys.s(a + b * x0)}" x2="${xs.s(x1)}" y2="${ys.s(a + b * x1)}" stroke="${grp.color}" stroke-width="2" stroke-dasharray="4 3"/>`;
    // nhãn trực tiếp ở cuối đường hồi quy
    g += `<text x="${xs.s(x1) + 5}" y="${ys.s(a + b * x1) + 3}" class="dlabel">${grp.name}</text>`;
    for (const p of grp.points) {
      g += `<circle cx="${xs.s(p[1])}" cy="${ys.s(p[2])}" r="4" fill="${grp.color}" stroke="var(--surface-1)" stroke-width="2"
        data-tip="<b>${p[0]}</b> (${grp.name})<br>Thu nhập: ${fmt(p[1])}<br>Mức sinh: ${fmt(p[2], 2)}"/>`;
      g += `<circle cx="${xs.s(p[1])}" cy="${ys.s(p[2])}" r="9" fill="transparent" class="hit"
        data-tip="<b>${p[0]}</b> (${grp.name})<br>Thu nhập: ${fmt(p[1])}<br>Mức sinh: ${fmt(p[2], 2)}"/>`;
    }
  }
  return legend(c.groups) + `<svg viewBox="0 0 ${W} ${H}" class="chart">${g}</svg>`;
}

function renderLine(c, W = 340, H = 200) {
  const M = { t: 20, r: 60, b: 26, l: 34 };
  const pts = c.series.flatMap((s) => s.points);
  const xr = [Math.min(...pts.map((p) => p[0])), Math.max(...pts.map((p) => p[0]))];
  const yr = [Math.min(0, ...pts.map((p) => p[1])), Math.max(...pts.map((p) => p[1]))];
  const yt = niceTicks(yr[0], yr[1]);
  const xs = { ticks: niceTicks(xr[0], xr[1], 4).filter((t) => t >= xr[0] && t <= xr[1]), s: scale(xr[0], xr[1], M.l, W - M.r) };
  const ys = { ticks: yt, s: scale(yt[0], yt.at(-1), H - M.b, M.t) };
  let g = frame(W, H, M, xs, ys, null, c.yLabel, (v) => v, (v) => fmt(v, 0));
  for (const s of c.series) {
    const d = s.points.map((p, i) => `${i ? "L" : "M"}${xs.s(p[0])},${ys.s(p[1])}`).join("");
    g += `<path d="${d}" fill="none" stroke="${s.color}" stroke-width="2"/>`;
    const last = s.points.at(-1);
    g += `<text x="${xs.s(last[0]) + 6}" y="${ys.s(last[1]) + 3}" class="dlabel">${s.name}</text>`;
    for (const p of s.points) {
      g += `<circle cx="${xs.s(p[0])}" cy="${ys.s(p[1])}" r="3" fill="${s.color}" stroke="var(--surface-1)" stroke-width="2"/>`;
      g += `<circle cx="${xs.s(p[0])}" cy="${ys.s(p[1])}" r="9" fill="transparent" class="hit" data-tip="<b>${s.name}</b> · ${p[0]}<br>${fmt(p[1], 0)}"/>`;
    }
  }
  const lg = c.series.length > 1 ? legend(c.series) : "";
  return lg + `<svg viewBox="0 0 ${W} ${H}" class="chart">${g}</svg>`;
}

function renderBars(c, W = 340) {
  const rowH = 22, M = { l: 70, r: 50 };
  const H = c.items.length * rowH + 8;
  const max = Math.max(...c.items.map((i) => Math.abs(i[1])));
  const s = scale(0, max, 0, W - M.l - M.r);
  let g = "";
  c.items.forEach((it, i) => {
    const y = 4 + i * rowH, w = s(Math.abs(it[1]));
    const fill = it[2] ? "var(--series-2)" : "var(--map-unit)";
    g += `<text x="${M.l - 6}" y="${y + 13}" class="tick" text-anchor="end">${it[0]}</text>`;
    g += `<rect x="${M.l}" y="${y + 3}" width="${w}" height="${rowH - 8}" rx="3" fill="${fill}" data-tip="<b>${it[0]}</b><br>${fmt(it[1])} ${c.unit}"/>`;
    if (it[2]) g += `<text x="${M.l + w + 5}" y="${y + 13}" class="dlabel">${fmt(it[1])}</text>`;
  });
  return `<div class="chart-unit">${c.unit}</div><svg viewBox="0 0 ${W} ${H}" class="chart">${g}</svg>`;
}

function renderChart(c) {
  if (!c) return "";
  if (c.type === "scatter") return renderScatter(c);
  if (c.type === "line") return renderLine(c);
  if (c.type === "bars") return renderBars(c);
  return "";
}
