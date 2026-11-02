"""
Builds the static dashboard in docs/ (served with GitHub Pages).

The page has slicers for year and market, and clicking a country in the
country chart filters the other visuals (like cross-filtering in Power BI).
The site is static (Netlify just serves docs/), so this script runs the SQL
for every combination the page can ask for and saves the results to
docs/data.json. The page then just reads that file.
"""
import json
import os
import sqlite3

BASE = os.path.join(os.path.dirname(__file__), "..")
DB_FILE = os.path.join(BASE, "data", "retail.db")
DOCS = os.path.join(BASE, "docs")

YEARS = ["All", "2010", "2011"]
MARKETS = ["All", "UK", "International"]
# countries you can click on in the dashboard (top 10 by revenue)
N_COUNTRIES = 10


def where_clause(year, market):
    conds = []
    params = []
    if year != "All":
        conds.append("strftime('%Y', i.invoice_date) = ?")
        params.append(year)
    if market == "UK":
        conds.append("i.country = 'United Kingdom'")
    elif market == "International":
        conds.append("i.country <> 'United Kingdom'")
    elif market.startswith("c:"):
        conds.append("i.country = ?")
        params.append(market[2:])
    sql = ("WHERE " + " AND ".join(conds)) if conds else ""
    return sql, params


def q(conn, sql, params=()):
    cur = conn.execute(sql, params)
    cols = [c[0] for c in cur.description]
    return [dict(zip(cols, row)) for row in cur.fetchall()]


def build_one(conn, year, market):
    w, p = where_clause(year, market)
    base = f"FROM invoices i JOIN invoice_items ii ON ii.invoice_no = i.invoice_no {w}"

    kpi = q(conn, f"""
        SELECT ROUND(SUM(ii.quantity * ii.unit_price), 2) AS revenue,
               COUNT(DISTINCT i.invoice_no)                AS orders,
               COUNT(DISTINCT i.customer_id)               AS customers,
               SUM(ii.quantity)                            AS units
        {base}""", p)[0]
    kpi["aov"] = round(kpi["revenue"] / kpi["orders"], 2) if kpi["orders"] else 0

    # repeat rate inside the selected period
    rep = q(conn, f"""
        SELECT COUNT(*) AS c, SUM(CASE WHEN n > 1 THEN 1 ELSE 0 END) AS r FROM (
            SELECT i.customer_id, COUNT(DISTINCT i.invoice_no) AS n
            {base} {"AND" if w else "WHERE"} i.customer_id IS NOT NULL
            GROUP BY i.customer_id)""", p)[0]
    kpi["repeat_rate"] = round(100 * rep["r"] / rep["c"], 1) if rep["c"] else 0

    monthly = q(conn, f"""
        SELECT strftime('%Y-%m', i.invoice_date) AS month,
               ROUND(SUM(ii.quantity * ii.unit_price), 2) AS revenue,
               COUNT(DISTINCT i.invoice_no) AS orders,
               COUNT(DISTINCT i.customer_id) AS customers,
               SUM(ii.quantity) AS units
        {base} GROUP BY 1 ORDER BY 1""", p)
    for m in monthly:
        m["aov"] = round(m["revenue"] / m["orders"], 2) if m["orders"] else 0

    products = q(conn, f"""
        SELECT pr.description AS product, ROUND(SUM(ii.quantity * ii.unit_price), 2) AS revenue
        {base.replace("JOIN invoice_items ii ON ii.invoice_no = i.invoice_no",
                      "JOIN invoice_items ii ON ii.invoice_no = i.invoice_no JOIN products pr ON pr.stock_code = ii.stock_code")}
        GROUP BY pr.stock_code ORDER BY revenue DESC LIMIT 10""", p)

    countries = q(conn, f"""
        SELECT i.country, ROUND(SUM(ii.quantity * ii.unit_price), 2) AS revenue
        {base} GROUP BY 1 ORDER BY 2 DESC LIMIT 10""", p)

    heat = q(conn, f"""
        SELECT CAST(strftime('%w', i.invoice_date) AS INTEGER) AS weekday,
               CAST(strftime('%H', i.invoice_date) AS INTEGER) AS hour,
               COUNT(DISTINCT i.invoice_no) AS orders
        {base} GROUP BY 1, 2""", p)

    return {"kpi": kpi, "monthly": monthly, "products": products,
            "countries": countries, "heat": heat}


def rfm_segments(conn):
    # reuse the query from analysis.sql
    with open(os.path.join(BASE, "sql", "analysis.sql")) as f:
        text = f.read()
    start = text.index("-- name: rfm_segments")
    end = text.index("-- name:", start + 10)
    return q(conn, text[start:end])


def main():
    conn = sqlite3.connect(DB_FILE)
    top = q(conn, f"""
        SELECT i.country FROM invoices i JOIN invoice_items ii ON ii.invoice_no = i.invoice_no
        GROUP BY 1 ORDER BY SUM(ii.quantity * ii.unit_price) DESC LIMIT {N_COUNTRIES}""")
    countries = [r["country"] for r in top]
    markets = MARKETS + ["c:" + c for c in countries if c != "United Kingdom"]

    data = {"views": {}, "countries": countries}
    for y in YEARS:
        for m in markets:
            data["views"][f"{y}|{m}"] = build_one(conn, y, m)
            print("built", y, m)
    data["rfm"] = rfm_segments(conn)
    data["date_range"] = q(conn, "SELECT MIN(invoice_date) AS start, MAX(invoice_date) AS end FROM invoices")[0]
    conn.close()

    os.makedirs(DOCS, exist_ok=True)
    with open(os.path.join(DOCS, "data.json"), "w") as f:
        json.dump(data, f, separators=(",", ":"))
    print("saved docs/data.json")


if __name__ == "__main__":
    main()
