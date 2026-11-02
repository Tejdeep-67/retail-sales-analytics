// Retail sales dashboard.
// All the numbers come from data.json, which scripts/build_dashboard.py makes by running
// the SQL for every filter combination. This file only picks the right view and draws it.

const state = { year: "All", market: "All", country: "", hideUK: true, page: "overview", segment: "Champions" };
let DATA = null;
const charts = {};
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const C = {
  brand: "#0c5c5e", brand2: "#138a8a", soft: "#d5ebe9", accent: "#f2a33a",
  ink: "#1b2532", muted: "#667085", grid: "#eef1f4",
};
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// ---------- helpers ----------
const $ = (id) => document.getElementById(id);

function money(x, digits) {
  const a = Math.abs(x);
  if (a >= 1e6) return "\u00a3" + (x / 1e6).toFixed(digits ?? 2) + "M";
  if (a >= 1e3) return "\u00a3" + (x / 1e3).toFixed(digits ?? 1) + "K";
  return "\u00a3" + x.toFixed(0);
}
const num = (x) => Math.round(x).toLocaleString("en-GB");
const monthLabel = (m) => MONTHS[+m.slice(5) - 1] + " " + m.slice(2, 4);

function titleCase(s) {
  // product names are all caps in the data
  return s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}
function shortName(s, n = 26) {
  const t = titleCase(s);
  return t.length > n ? t.slice(0, n - 1) + "\u2026" : t;
}

function viewKey() {
  if (state.country) {
    return state.country === "United Kingdom" ? `${state.year}|UK` : `${state.year}|c:${state.country}`;
  }
  return `${state.year}|${state.market}`;
}

// animated number, starts from whatever the tile showed before
function countTo(el, to, fmt) {
  const from = el._v ?? 0;
  el._v = to;
  if (reduceMotion) { el.textContent = fmt(to); return; }
  const start = performance.now();
  const dur = 700;
  cancelAnimationFrame(el._raf);
  const step = (t) => {
    const p = Math.min(1, (t - start) / dur);
    const e = 1 - Math.pow(1 - p, 3);
    el.textContent = fmt(from + (to - from) * e);
    if (p < 1) el._raf = requestAnimationFrame(step);
  };
  el._raf = requestAnimationFrame(step);
}

function sparkline(svg, values) {
  if (!values.length) { svg.innerHTML = ""; return; }
  const w = 120, h = 34, pad = 3;
  const max = Math.max(...values), min = Math.min(...values);
  const pts = values.map((v, i) => [
    values.length === 1 ? w / 2 : (i / (values.length - 1)) * w,
    h - pad - ((v - min) / (max - min || 1)) * (h - pad * 2 - 6),
  ]);
  const line = pts.map((p, i) => (i ? "L" : "M") + p[0].toFixed(1) + " " + p[1].toFixed(1)).join(" ");
  svg.innerHTML = `<path class="area" d="${line} L${w} ${h} L0 ${h} Z"></path><path class="line" d="${line}"></path>`;
  const path = svg.querySelector(".line");
  if (reduceMotion) return;
  const len = path.getTotalLength();
  path.style.strokeDasharray = len;
  path.style.strokeDashoffset = len;
  path.getBoundingClientRect();
  path.style.transition = "stroke-dashoffset .9s cubic-bezier(.2,.8,.2,1)";
  path.style.strokeDashoffset = 0;
}

function baseOpts(extra) {
  return Object.assign({
    animation: !reduceMotion,
    animationDuration: 800,
    animationDurationUpdate: 650,
    animationEasingUpdate: "cubicOut",
    textStyle: { fontFamily: "IBM Plex Sans, Segoe UI, Arial", color: C.ink },
    tooltip: {
      backgroundColor: "#1b2532", borderWidth: 0, padding: [8, 10],
      textStyle: { color: "#fff", fontSize: 12.5 }, extraCssText: "border-radius:8px;box-shadow:0 6px 20px rgba(0,0,0,.18);",
    },
  }, extra);
}

// charts are created the first time they are drawn (not while their page is hidden)
function chart(id, onCreate) {
  if (!charts[id]) {
    charts[id] = echarts.init($(id), null, { renderer: "canvas" });
    if (onCreate) onCreate(charts[id]);
  }
  return charts[id];
}

// ---------- overview page ----------
function drawKpis(v) {
  const k = v.kpi;
  countTo($("k-revenue"), k.revenue, (x) => money(x));
  countTo($("k-orders"), k.orders, num);
  countTo($("k-aov"), k.aov, (x) => "\u00a3" + x.toFixed(0));
  countTo($("k-customers"), k.customers, num);
  countTo($("k-repeat"), k.repeat_rate, (x) => x.toFixed(1) + "%");
  $("ring").style.strokeDashoffset = (113.1 * (1 - k.repeat_rate / 100)).toFixed(1);

  sparkline($("s-revenue"), v.monthly.map((m) => m.revenue));
  sparkline($("s-orders"), v.monthly.map((m) => m.orders));
  sparkline($("s-aov"), v.monthly.map((m) => m.aov));
  sparkline($("s-customers"), v.monthly.map((m) => m.customers));

  // year over year only makes sense when 2011 is picked
  const prev = state.year === "2011" ? DATA.views[viewKey().replace("2011|", "2010|")] : null;
  for (const key of ["revenue", "orders", "aov", "customers"]) {
    const el = $("d-" + key);
    if (prev && prev.kpi[key]) {
      const ch = (100 * (k[key] - prev.kpi[key])) / prev.kpi[key];
      el.className = "kpi-delta " + (ch >= 0 ? "up" : "down");
      el.innerHTML = (ch >= 0 ? "\u25b2 " : "\u25bc ") + Math.abs(ch).toFixed(1) + '% <span class="muted">vs 2010</span>';
      el.title = "2011 data stops on 9 Dec, so December is not a full month";
    } else {
      el.className = "kpi-delta muted";
      el.textContent = state.year === "All" ? "Dec 2009 \u2013 Dec 2011" : state.year === "2010" ? "Jan \u2013 Dec 2010" : "";
      el.title = "";
    }
  }
}

function drawMonthly(v) {
  const rows = v.monthly;
  chart("c-monthly").setOption(baseOpts({
    grid: { left: 52, right: 46, top: 30, bottom: 30 },
    legend: { top: 0, right: 0, itemWidth: 12, itemHeight: 8, textStyle: { color: C.muted } },
    tooltip: {
      ...baseOpts().tooltip, trigger: "axis",
      formatter: (ps) => `<b>${ps[0].axisValue}</b><br>` + ps.map((p) =>
        `${p.marker}${p.seriesName}: ${p.seriesIndex === 0 ? money(p.value) : num(p.value)}`).join("<br>"),
    },
    xAxis: {
      type: "category", data: rows.map((r) => monthLabel(r.month)),
      axisLine: { lineStyle: { color: "#cfd6de" } }, axisTick: { show: false },
      axisLabel: { color: C.muted, hideOverlap: true },
    },
    yAxis: [
      { type: "value", axisLabel: { color: C.muted, formatter: (x) => money(x, 1) }, splitLine: { lineStyle: { color: C.grid } } },
      { type: "value", axisLabel: { color: C.muted, formatter: (x) => (x >= 1000 ? x / 1000 + "K" : x) }, splitLine: { show: false } },
    ],
    series: [
      {
        name: "Revenue", type: "bar", data: rows.map((r) => r.revenue), barMaxWidth: 26,
        itemStyle: {
          borderRadius: [4, 4, 0, 0],
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [{ offset: 0, color: C.brand2 }, { offset: 1, color: C.brand }]),
        },
        emphasis: { itemStyle: { color: C.accent } },
      },
      {
        name: "Orders", type: "line", yAxisIndex: 1, smooth: true, symbol: "circle", symbolSize: 6,
        data: rows.map((r) => r.orders), lineStyle: { width: 2.5, color: C.accent }, itemStyle: { color: C.accent },
      },
    ],
  }), { notMerge: false });
}

function drawMarket() {
  const y = state.year;
  const uk = DATA.views[`${y}|UK`].kpi.revenue;
  const intl = DATA.views[`${y}|International`].kpi.revenue;
  const sel = state.country ? (state.country === "United Kingdom" ? "UK" : "International") : state.market;
  const total = uk + intl;
  chart("c-market", (c) => c.on("click", (p) => {
    state.country = "";
    state.market = state.market === p.name ? "All" : p.name;
    render();
  })).setOption(baseOpts({
    tooltip: { ...baseOpts().tooltip, trigger: "item", formatter: (p) => `${p.marker}${p.name}<br><b>${money(p.value)}</b> (${p.percent}%)` },
    legend: { bottom: 0, itemWidth: 10, itemHeight: 10, textStyle: { color: C.muted } },
    title: {
      text: money(total), subtext: "total revenue", left: "center", top: "37%",
      textStyle: { fontSize: 20, fontWeight: 700, color: C.ink }, subtextStyle: { color: C.muted, fontSize: 12 }, itemGap: 2,
    },
    series: [{
      type: "pie", radius: ["52%", "74%"], center: ["50%", "45%"], avoidLabelOverlap: true,
      selectedMode: "single", selectedOffset: 8,
      label: { show: false }, labelLine: { show: false },
      itemStyle: { borderColor: "#fff", borderWidth: 3, borderRadius: 6 },
      data: [
        { name: "UK", value: uk, selected: sel === "UK", itemStyle: { color: C.brand } },
        { name: "International", value: intl, selected: sel === "International", itemStyle: { color: C.accent } },
      ],
    }],
  }));
}

function drawProducts(v) {
  const rows = v.products.slice().reverse();
  $("products-hint").textContent = "by revenue" + (state.country ? " in " + titleCase(state.country) : "");
  chart("c-products").setOption(baseOpts({
    grid: { left: 8, right: 54, top: 6, bottom: 20, containLabel: true },
    tooltip: { ...baseOpts().tooltip, trigger: "item", formatter: (p) => `${titleCase(rows[p.dataIndex].product)}<br><b>${money(p.value)}</b>` },
    xAxis: { type: "value", axisLabel: { color: C.muted, formatter: (x) => money(x, 0) }, splitLine: { lineStyle: { color: C.grid } } },
    yAxis: { type: "category", data: rows.map((r) => shortName(r.product, window.innerWidth < 640 ? 18 : 26)), axisTick: { show: false }, axisLine: { show: false }, axisLabel: { color: C.ink } },
    series: [{
      type: "bar", data: rows.map((r) => r.revenue), barMaxWidth: 18,
      label: { show: true, position: "right", color: C.muted, fontSize: 11, formatter: (p) => money(p.value, 0) },
      itemStyle: { borderRadius: [0, 4, 4, 0], color: new echarts.graphic.LinearGradient(0, 0, 1, 0, [{ offset: 0, color: C.brand }, { offset: 1, color: C.brand2 }]) },
      emphasis: { itemStyle: { color: C.accent } },
    }],
  }));
}

function drawCountries() {
  // always drawn from the view without the country filter, so the picked bar can be highlighted
  const base = DATA.views[`${state.year}|${state.country ? "All" : state.market}`];
  let rows = base.countries.filter((r) => DATA.countries.includes(r.country));
  if (state.hideUK) rows = rows.filter((r) => r.country !== "United Kingdom");
  rows = rows.slice().reverse();
  chart("c-countries", (c) => c.on("click", (p) => {
    const name = p.data.country;
    state.country = state.country === name ? "" : name; // second click clears it, like Power BI
    render();
  })).setOption(baseOpts({
    grid: { left: 8, right: 58, top: 6, bottom: 20, containLabel: true },
    tooltip: { ...baseOpts().tooltip, trigger: "item", formatter: (p) => `${p.name}<br><b>${money(p.value)}</b><br><span style="opacity:.7">click to filter</span>` },
    xAxis: { type: "value", axisLabel: { color: C.muted, formatter: (x) => money(x, 0) }, splitLine: { lineStyle: { color: C.grid } } },
    yAxis: { type: "category", data: rows.map((r) => r.country === "EIRE" ? "Ireland (EIRE)" : r.country), axisTick: { show: false }, axisLine: { show: false } },
    series: [{
      type: "bar", barMaxWidth: 18, cursor: "pointer",
      label: { show: true, position: "right", color: C.muted, fontSize: 11, formatter: (p) => money(p.value, 0) },
      data: rows.map((r) => ({
        value: r.revenue, country: r.country,
        itemStyle: {
          borderRadius: [0, 4, 4, 0],
          color: !state.country || state.country === r.country ? (state.country ? C.accent : C.brand2) : "#cfe3e1",
        },
      })),
    }],
  }), { replaceMerge: ["series"] });
}

function drawHeat(v) {
  const hours = [];
  for (let h = 7; h <= 20; h++) hours.push(h);
  const days = [1, 2, 3, 4, 5, 0]; // the shop had no orders on Saturdays
  const cells = [];
  let max = 1;
  days.forEach((d, yi) => hours.forEach((h, xi) => {
    const r = v.heat.find((x) => x.weekday === d && x.hour === h);
    const val = r ? r.orders : 0;
    max = Math.max(max, val);
    cells.push([xi, yi, val]);
  }));
  chart("c-heat").setOption(baseOpts({
    grid: { left: 42, right: 12, top: 8, bottom: 62 },
    tooltip: { ...baseOpts().tooltip, formatter: (p) => `${DAYS[days[p.value[1]]]} ${hours[p.value[0]]}:00\u2013${hours[p.value[0]] + 1}:00<br><b>${num(p.value[2])}</b> orders` },
    xAxis: { type: "category", data: hours.map((h) => h + ":00"), splitArea: { show: false }, axisTick: { show: false }, axisLine: { show: false }, axisLabel: { color: C.muted, hideOverlap: true } },
    yAxis: { type: "category", data: days.map((d) => DAYS[d]), inverse: true, axisTick: { show: false }, axisLine: { show: false }, axisLabel: { color: C.muted } },
    visualMap: {
      min: 0, max, calculable: false, orient: "horizontal", left: "center", bottom: 4, itemHeight: 140, itemWidth: 10,
      inRange: { color: ["#f3f7f7", "#9fd0cc", C.brand2, C.brand] }, textStyle: { color: C.muted, fontSize: 11 },
      formatter: (x) => num(x),
    },
    series: [{
      type: "heatmap", data: cells, itemStyle: { borderColor: "#fff", borderWidth: 2, borderRadius: 3 },
      emphasis: { itemStyle: { borderColor: C.accent, borderWidth: 2 } },
    }],
  }));
}

function drawHighlights(v) {
  const scope = [state.year !== "All" ? state.year : "", state.country ? titleCase(state.country) : state.market !== "All" ? state.market : ""].filter(Boolean).join(" \u00b7 ");
  $("hl-scope").textContent = scope || "all data";
  const months = v.monthly;
  const best = months.reduce((a, b) => (b.revenue > a.revenue ? b : a), months[0]);
  const slot = v.heat.reduce((a, b) => (b.orders > a.orders ? b : a), v.heat[0]);
  const top = v.products[0];
  const q4 = months.filter((m) => ["09", "10", "11"].includes(m.month.slice(5))).reduce((s, m) => s + m.revenue, 0);
  const all = months.reduce((s, m) => s + m.revenue, 0);
  const items = [
    ["\u2191", "Best month: " + monthLabel(best.month), money(best.revenue) + " from " + num(best.orders) + " orders"],
    ["\u25f7", `Busiest hour: ${DAYS[slot.weekday]} ${slot.hour}:00`, num(slot.orders) + " orders in that hour slot"],
    ["\u2605", "Best seller: " + shortName(top.product, 30), money(top.revenue) + " \u00b7 " + ((100 * top.revenue) / v.kpi.revenue).toFixed(1) + "% of revenue"],
    ["%", "Sep\u2013Nov: " + ((100 * q4) / all).toFixed(0) + "% of revenue", "the Christmas stock-up season"],
  ];
  $("highlights").innerHTML = items.map(([i, b, s]) => `<li><span class="hl-icon">${i}</span><div><b>${b}</b><span>${s}</span></div></li>`).join("");
}

// ---------- customers page ----------
const SEG_COLORS = {
  "Champions": "#0c5c5e", "Loyal": "#138a8a", "At Risk": "#f2a33a",
  "Lost / Hibernating": "#9aa5b1", "New / Promising": "#5fb8ad", "Need Attention": "#e9c07a",
};
const SEG_ADVICE = {
  "Champions": "Bought recently, often and a lot. Keep them happy: early access to new ranges and a key-account contact.",
  "Loyal": "Order regularly but spend less than Champions. Bundles and volume discounts could move them up.",
  "At Risk": "Used to order often but have not bought in about a year. First group for a win-back offer.",
  "Lost / Hibernating": "One or two old orders. Cheap reactivation email at most; not worth much effort.",
  "New / Promising": "Recent first orders. A good second-order experience decides if they stay.",
  "Need Attention": "Middling recency and frequency. A reminder or seasonal catalogue before Q4.",
};

function drawCustomerKpis() {
  const champ = DATA.rfm.find((r) => r.segment === "Champions");
  const risk = DATA.rfm.find((r) => r.segment === "At Risk");
  countTo($("k-champ"), champ.revenue_share_pct, (x) => x.toFixed(1) + "%");
  $("d-champ").textContent = num(champ.customers) + " customers";
  countTo($("k-pareto"), DATA.pareto[0].revenue_share_pct, (x) => x.toFixed(1) + "%");
  countTo($("k-risk"), risk.customers, num);
  $("d-risk").textContent = money(risk.revenue) + " spent before going quiet";
  const cancel = DATA.returns.reduce((s, r) => s + r.cancelled_value, 0);
  const inv = DATA.returns.reduce((s, r) => s + r.cancelled_invoices, 0);
  countTo($("k-cancel"), cancel, (x) => money(x));
  $("d-cancel").textContent = num(inv) + " cancelled invoices";
}

function drawRfm() {
  chart("c-rfm", (c) => c.on("click", (p) => { state.segment = p.name; drawRfm(); drawSegmentCard(); })).setOption(baseOpts({
    tooltip: { ...baseOpts().tooltip, formatter: (p) => `<b>${p.name}</b><br>${money(p.value)} \u00b7 ${p.data.share}% of revenue<br>${num(p.data.customers)} customers` },
    series: [{
      type: "treemap", roam: false, nodeClick: false, breadcrumb: { show: false },
      width: "100%", height: "100%", top: 4, left: 0, right: 0, bottom: 0,
      label: {
        show: true, formatter: (p) => `{n|${p.name}}\n{v|${p.data.share}%}`,
        rich: { n: { fontSize: 13, fontWeight: 600, color: "#fff" }, v: { fontSize: 12, color: "rgba(255,255,255,.85)", padding: [4, 0, 0, 0] } },
      },
      upperLabel: { show: false },
      itemStyle: { borderColor: "#fff", borderWidth: 3, gapWidth: 3, borderRadius: 6 },
      data: DATA.rfm.map((r) => ({
        name: r.segment, value: r.revenue, share: r.revenue_share_pct, customers: r.customers,
        itemStyle: { color: SEG_COLORS[r.segment] || C.brand2, opacity: state.segment === r.segment ? 1 : 0.82, borderColor: state.segment === r.segment ? C.ink : "#fff" },
      })),
    }],
  }));
}

function drawSegmentCard() {
  const r = DATA.rfm.find((x) => x.segment === state.segment);
  $("seg-name").textContent = r.segment;
  $("seg-name").style.color = SEG_COLORS[r.segment];
  $("seg-stats").innerHTML = [
    ["Customers", num(r.customers)],
    ["Revenue", money(r.revenue)],
    ["Avg days since last order", num(r.avg_recency_days)],
    ["Avg orders per customer", r.avg_orders.toFixed(1)],
  ].map(([t, d], i) => `<div style="animation-delay:${i * 0.05}s"><dt>${t}</dt><dd>${d}</dd></div>`).join("");
  const allCust = DATA.rfm.reduce((s, x) => s + x.customers, 0);
  const custPct = (100 * r.customers) / allCust;
  $("seg-bars").innerHTML = [["of customers", custPct], ["of revenue", r.revenue_share_pct]].map(([t, p]) =>
    `<div class="bar-row"><span>${p.toFixed(1)}% ${t}</span><div class="bar"><i style="--w:${p}%;background:${SEG_COLORS[r.segment]}"></i></div></div>`).join("");
  $("seg-advice").textContent = SEG_ADVICE[r.segment] || "";
}

function drawCohorts() {
  // the last cohort (Dec 2011) has no later months yet, so leave it out
  const cohorts = [...new Set(DATA.cohorts.filter((r) => r.month_offset >= 1).map((r) => r.cohort))];
  const maxOff = 12;
  const cells = DATA.cohorts.filter((r) => r.month_offset >= 1 && r.month_offset <= maxOff)
    .map((r) => [r.month_offset - 1, cohorts.indexOf(r.cohort), r.retention_pct]);
  const small = window.innerWidth < 640;
  chart("c-cohort").setOption(baseOpts({
    grid: { left: 58, right: 10, top: 24, bottom: 50 },
    tooltip: { ...baseOpts().tooltip, formatter: (p) => `Joined ${monthLabel(cohorts[p.value[1]])}<br>${p.value[0] + 1} month(s) later: <b>${p.value[2]}%</b> ordered again` },
    xAxis: { type: "category", position: "top", data: Array.from({ length: maxOff }, (_, i) => "+" + (i + 1)), axisTick: { show: false }, axisLine: { show: false }, axisLabel: { color: C.muted } },
    yAxis: { type: "category", inverse: true, data: cohorts.map(monthLabel), axisTick: { show: false }, axisLine: { show: false }, axisLabel: { color: C.muted, fontSize: 11 } },
    visualMap: {
      min: 0, max: 45, orient: "horizontal", left: "center", bottom: 4, itemHeight: 160, itemWidth: 10,
      inRange: { color: ["#f3f7f7", "#9fd0cc", C.brand2, C.brand] }, textStyle: { color: C.muted, fontSize: 11 }, formatter: (x) => Math.round(x) + "%",
    },
    series: [{
      type: "heatmap", data: cells,
      label: { show: !small, fontSize: 10, color: "#1b2532", formatter: (p) => Math.round(p.value[2]) },
      itemStyle: { borderColor: "#fff", borderWidth: 1.5, borderRadius: 2 },
    }],
  }));
}

function drawPareto() {
  const rows = DATA.pareto;
  let cum = 0;
  const cumul = rows.map((r) => +(cum += r.revenue_share_pct).toFixed(1));
  chart("c-pareto").setOption(baseOpts({
    grid: { left: 46, right: 46, top: 30, bottom: 30 },
    legend: { top: 0, right: 0, itemWidth: 12, itemHeight: 8, textStyle: { color: C.muted } },
    tooltip: { ...baseOpts().tooltip, trigger: "axis" },
    xAxis: { type: "category", data: ["Top 20%", "20\u201340%", "40\u201360%", "60\u201380%", "Bottom 20%"], axisTick: { show: false }, axisLabel: { color: C.muted } },
    yAxis: { type: "value", max: 100, axisLabel: { color: C.muted, formatter: "{value}%" }, splitLine: { lineStyle: { color: C.grid } } },
    series: [
      { name: "Share of revenue", type: "bar", barMaxWidth: 46, color: C.brand, data: rows.map((r) => r.revenue_share_pct),
        label: { show: true, position: "top", formatter: "{c}%", color: C.ink, fontWeight: 600 },
        itemStyle: { borderRadius: [5, 5, 0, 0], color: (p) => (p.dataIndex === 0 ? C.brand : "#9fd0cc") } },
      { name: "Cumulative", type: "line", data: cumul, smooth: true, symbolSize: 7, lineStyle: { color: C.accent, width: 2.5 }, itemStyle: { color: C.accent } },
    ],
  }));
}

function drawReturns() {
  const rows = DATA.returns;
  chart("c-returns").setOption(baseOpts({
    grid: { left: 56, right: 16, top: 24, bottom: 30 },
    tooltip: { ...baseOpts().tooltip, trigger: "axis", formatter: (ps) => `<b>${ps[0].axisValue}</b><br>${money(ps[0].value)} from ${num(rows[ps[0].dataIndex].cancelled_invoices)} invoices` },
    xAxis: { type: "category", data: rows.map((r) => (r.year === "2009" ? "2009 (Dec only)" : r.year === "2011" ? "2011 (to 9 Dec)" : r.year)), axisTick: { show: false }, axisLabel: { color: C.muted } },
    yAxis: { type: "value", axisLabel: { color: C.muted, formatter: (x) => money(x, 0) }, splitLine: { lineStyle: { color: C.grid } } },
    series: [{ type: "bar", barMaxWidth: 54, data: rows.map((r) => r.cancelled_value),
      label: { show: true, position: "top", color: C.ink, fontWeight: 600, formatter: (p) => money(p.value) },
      itemStyle: { borderRadius: [5, 5, 0, 0], color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [{ offset: 0, color: "#f5b75d" }, { offset: 1, color: "#e08e1c" }]) } }],
  }));
}

// ---------- filters ----------
function syncControls() {
  for (const id of ["year", "market"]) {
    $(id).querySelectorAll("button").forEach((b) => b.setAttribute("aria-checked", String(b.dataset.v === state[id])));
  }
  $("market").classList.toggle("is-disabled", !!state.country);
  $("country").value = state.country;

  const chips = [];
  if (state.year !== "All") chips.push(["year", "Year: " + state.year]);
  if (state.country) chips.push(["country", "Country: " + (state.country === "EIRE" ? "Ireland" : state.country)]);
  else if (state.market !== "All") chips.push(["market", "Market: " + state.market]);
  $("chips").innerHTML = chips.map(([k, t]) => `<span class="chip">${t}<button type="button" data-clear="${k}" aria-label="Remove ${t}">\u00d7</button></span>`).join("");
  $("reset").hidden = chips.length === 0;

  const p = new URLSearchParams();
  if (state.year !== "All") p.set("year", state.year);
  if (state.market !== "All") p.set("market", state.market);
  if (state.country) p.set("country", state.country);
  if (state.page !== "overview") p.set("page", state.page);
  history.replaceState(null, "", p.toString() ? "?" + p : location.pathname);
}

function render() {
  syncControls();
  if (state.page === "overview") {
    const v = DATA.views[viewKey()];
    drawKpis(v);
    drawMonthly(v);
    drawMarket();
    drawProducts(v);
    drawCountries();
    drawHeat(v);
    drawHighlights(v);
  } else {
    drawCustomerKpis();
    drawRfm();
    drawSegmentCard();
    drawCohorts();
    drawPareto();
    drawReturns();
  }
}

function setFilter(k, val) {
  state[k] = val;
  if (k === "market") state.country = "";
  render();
}

function showPage(name) {
  state.page = name;
  document.querySelectorAll(".page").forEach((p) => p.classList.toggle("is-active", p.id === "page-" + name));
  document.querySelectorAll(".tab").forEach((t) => {
    const on = t.dataset.page === name;
    t.classList.toggle("is-active", on);
    if (on) t.setAttribute("aria-current", "page"); else t.removeAttribute("aria-current");
  });
  document.querySelector(".filters").style.display = name === "overview" ? "" : "none";
  moveInk();
  revealVisible();
  render();
  requestAnimationFrame(() => Object.values(charts).forEach((c) => c.resize()));
}

function moveInk() {
  const t = document.querySelector(".tab.is-active");
  const ink = document.querySelector(".tab-ink");
  ink.style.left = t.offsetLeft + "px";
  ink.style.width = t.offsetWidth + "px";
}

// cards fade up as they scroll into view
let io;
function revealVisible() {
  const els = document.querySelectorAll(".page.is-active .reveal:not(.in)");
  if (reduceMotion || !("IntersectionObserver" in window)) { els.forEach((e) => e.classList.add("in")); return; }
  if (!io) {
    io = new IntersectionObserver((entries) => entries.forEach((en) => {
      if (en.isIntersecting) { en.target.classList.add("in"); io.unobserve(en.target); }
    }), { threshold: 0.08 });
  }
  els.forEach((e, i) => { e.style.transitionDelay = Math.min(i, 6) * 60 + "ms"; io.observe(e); });
}

function bindEvents() {
  ["year", "market"].forEach((id) => $(id).addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (b) setFilter(id, b.dataset.v);
  }));
  $("country").addEventListener("change", (e) => { state.country = e.target.value; render(); });
  $("chips").addEventListener("click", (e) => {
    const k = e.target.dataset.clear;
    if (!k) return;
    state[k] = k === "country" ? "" : "All";
    render();
  });
  $("reset").addEventListener("click", () => { Object.assign(state, { year: "All", market: "All", country: "" }); render(); });
  $("exclude-uk").addEventListener("change", (e) => { state.hideUK = e.target.checked; drawCountries(); });


  document.querySelectorAll(".tab").forEach((t) => t.addEventListener("click", () => showPage(t.dataset.page)));

  let timer;
  window.addEventListener("resize", () => {
    clearTimeout(timer);
    timer = setTimeout(() => { Object.values(charts).forEach((c) => c.resize()); moveInk(); }, 120);
  });
}

function readUrl() {
  const p = new URLSearchParams(location.search);
  if (["2010", "2011"].includes(p.get("year"))) state.year = p.get("year");
  if (["UK", "International"].includes(p.get("market"))) state.market = p.get("market");
  if (DATA.countries.includes(p.get("country"))) state.country = p.get("country");
  if (p.get("page") === "customers") state.page = "customers";
}

async function init() {
  document.body.classList.add("is-loading");
  // shared gradient for the sparklines
  document.body.insertAdjacentHTML("beforeend",
    '<svg width="0" height="0" style="position:absolute" aria-hidden="true"><defs><linearGradient id="sparkfill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#138a8a" stop-opacity=".32"/><stop offset="1" stop-color="#138a8a" stop-opacity="0"/></linearGradient></defs></svg>');
  try {
    const res = await fetch("data.json");
    DATA = await res.json();
  } catch (err) {
    document.querySelector("main").insertAdjacentHTML("afterbegin", '<p class="page-note">Could not load data.json. If you opened the file directly, run a local server (python -m http.server) inside docs/.</p>');
    return;
  }
  document.body.classList.remove("is-loading");

  const fmt = (d) => { const t = new Date(d.replace(" ", "T")); return t.getDate() + " " + MONTHS[t.getMonth()] + " " + t.getFullYear(); };
  $("subtitle").textContent = `Online Retail II (UCI) \u00b7 ${fmt(DATA.date_range.start)} \u2013 ${fmt(DATA.date_range.end)} \u00b7 values in GBP`;
  $("country").insertAdjacentHTML("beforeend", DATA.countries.map((c) => `<option value="${c}">${c === "EIRE" ? "Ireland (EIRE)" : c}</option>`).join(""));

  readUrl();
  bindEvents();
  showPage(state.page);
}

if (typeof echarts === "undefined") {
  window.addEventListener("load", init);
} else {
  init();
}
