// Reads data.json (made by scripts/build_dashboard.py) and draws the charts.
// Changing a slicer just picks a different pre-computed view.

let DATA = null;
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const BLUE = "#1f6fb2";
const config = { displayModeBar: false, responsive: true };

function money(x) {
  if (x >= 1e6) return "\u00a3" + (x / 1e6).toFixed(2) + "M";
  if (x >= 1e3) return "\u00a3" + (x / 1e3).toFixed(1) + "K";
  return "\u00a3" + x.toFixed(0);
}

function baseLayout(extra) {
  return Object.assign({
    margin: { l: 50, r: 15, t: 15, b: 40 },
    font: { family: "Segoe UI, Roboto, Arial", size: 12 },
    paper_bgcolor: "#fff",
    plot_bgcolor: "#fff",
  }, extra);
}

function drawKpis(k) {
  document.getElementById("k-revenue").textContent = money(k.revenue);
  document.getElementById("k-orders").textContent = k.orders.toLocaleString();
  document.getElementById("k-aov").textContent = "\u00a3" + k.aov.toFixed(0);
  document.getElementById("k-customers").textContent = k.customers.toLocaleString();
  document.getElementById("k-repeat").textContent = k.repeat_rate + "%";
}

function drawMonthly(rows) {
  Plotly.react("c-monthly", [{
    x: rows.map(r => r.month),
    y: rows.map(r => r.revenue),
    type: "scatter",
    mode: "lines+markers",
    line: { color: BLUE, width: 3 },
    hovertemplate: "%{x}<br>\u00a3%{y:,.0f}<extra></extra>",
  }], baseLayout({ yaxis: { tickprefix: "\u00a3", gridcolor: "#eee" } }), config);
}

function shortName(s) {
  // product names are all caps in the data, make them easier to read
  let t = s.toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
  return t.length > 28 ? t.slice(0, 27) + "\u2026" : t;
}

function drawBarH(id, labels, values, color) {
  // horizontal bars, biggest on top
  Plotly.react(id, [{
    x: values.slice().reverse(),
    y: labels.map(shortName).reverse(),
    type: "bar",
    orientation: "h",
    marker: { color: color },
    hovertemplate: "%{y}<br>\u00a3%{x:,.0f}<extra></extra>",
  }], baseLayout({ margin: { l: 10, r: 15, t: 10, b: 30 }, yaxis: { automargin: true }, xaxis: { tickprefix: "\u00a3", gridcolor: "#eee" } }), config);
}

function drawHeat(rows) {
  const hours = [];
  for (let h = 7; h <= 20; h++) hours.push(h);
  // no orders on Saturday in this data, so only show Mon-Fri and Sun
  const days = [1, 2, 3, 4, 5, 0];
  const z = days.map(d => hours.map(h => {
    const r = rows.find(x => x.weekday === d && x.hour === h);
    return r ? r.orders : 0;
  }));
  Plotly.react("c-heat", [{
    z: z,
    x: hours.map(h => h + ":00"),
    y: days.map(d => DAYS[d]),
    type: "heatmap",
    colorscale: [[0, "#f3f6fb"], [1, BLUE]],
    hovertemplate: "%{y} %{x}<br>%{z} orders<extra></extra>",
  }], baseLayout({ margin: { l: 45, r: 10, t: 10, b: 40 }, yaxis: { autorange: "reversed" } }), config);
}

function drawRfm(rows) {
  Plotly.react("c-rfm", [{
    labels: rows.map(r => r.segment),
    values: rows.map(r => r.revenue),
    customdata: rows.map(r => r.customers),
    type: "pie",
    hole: 0.55,
    marker: { colors: ["#1f6fb2", "#4ea1d3", "#f2c811", "#e66c37", "#a0a0a0", "#6b007b"] },
    hovertemplate: "%{label}<br>%{customdata} customers<br>\u00a3%{value:,.0f} (%{percent})<extra></extra>",
  }], baseLayout({ margin: { l: 10, r: 10, t: 10, b: 10 }, legend: window.innerWidth < 600 ? { orientation: "h", y: -0.1 } : { orientation: "v" } }), config);
}

function render() {
  const key = document.getElementById("year").value + "|" + document.getElementById("market").value;
  const v = DATA.views[key];
  drawKpis(v.kpi);
  drawMonthly(v.monthly);
  drawBarH("c-products", v.products.map(p => p.product), v.products.map(p => p.revenue), BLUE);
  drawBarH("c-countries", v.countries.map(c => c.country), v.countries.map(c => c.revenue), "#e66c37");
  drawHeat(v.heat);
}

fetch("data.json")
  .then(r => r.json())
  .then(d => {
    DATA = d;
    drawRfm(d.rfm);
    render();
    document.getElementById("year").addEventListener("change", render);
    document.getElementById("market").addEventListener("change", render);
  })
  .catch(err => {
    document.querySelector("main").insertAdjacentHTML("afterbegin",
      "<p>Could not load data.json. If you opened the file directly, run a local server: python -m http.server</p>");
    console.error(err);
  });
