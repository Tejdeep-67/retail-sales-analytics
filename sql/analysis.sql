-- Business questions answered with SQL.
-- Each query starts with a "-- name:" line so run_queries.py can pick it up
-- and save the result to outputs/<name>.csv

-- name: kpi_summary
-- Overall numbers for the KPI cards
SELECT
    ROUND(SUM(ii.quantity * ii.unit_price), 2)                         AS total_revenue,
    COUNT(DISTINCT ii.invoice_no)                                      AS total_orders,
    ROUND(SUM(ii.quantity * ii.unit_price) / COUNT(DISTINCT ii.invoice_no), 2) AS avg_order_value,
    COUNT(DISTINCT i.customer_id)                                      AS customers,
    SUM(ii.quantity)                                                   AS units_sold
FROM invoice_items ii
JOIN invoices i ON i.invoice_no = ii.invoice_no;


-- name: monthly_revenue
-- Revenue per month with month-over-month growth (window function LAG)
WITH m AS (
    SELECT
        strftime('%Y-%m', i.invoice_date)         AS month,
        SUM(ii.quantity * ii.unit_price)          AS revenue,
        COUNT(DISTINCT i.invoice_no)              AS orders
    FROM invoices i
    JOIN invoice_items ii ON ii.invoice_no = i.invoice_no
    GROUP BY 1
)
SELECT
    month,
    ROUND(revenue, 2) AS revenue,
    orders,
    ROUND(100.0 * (revenue - LAG(revenue) OVER (ORDER BY month))
          / LAG(revenue) OVER (ORDER BY month), 1) AS mom_growth_pct
FROM m
ORDER BY month;


-- name: yoy_by_month
-- 2010 vs 2011 for the same month (Dec 2011 is only 9 days so leave it out)
SELECT
    strftime('%m', i.invoice_date) AS month_no,
    ROUND(SUM(CASE WHEN strftime('%Y', i.invoice_date) = '2010' THEN ii.quantity * ii.unit_price END), 2) AS rev_2010,
    ROUND(SUM(CASE WHEN strftime('%Y', i.invoice_date) = '2011' THEN ii.quantity * ii.unit_price END), 2) AS rev_2011
FROM invoices i
JOIN invoice_items ii ON ii.invoice_no = i.invoice_no
WHERE i.invoice_date < '2011-12-01'
GROUP BY 1
ORDER BY 1;


-- name: top_products
-- Top 15 products by revenue
SELECT
    p.stock_code,
    p.description,
    SUM(ii.quantity)                          AS units,
    ROUND(SUM(ii.quantity * ii.unit_price), 2) AS revenue
FROM invoice_items ii
JOIN products p ON p.stock_code = ii.stock_code
GROUP BY p.stock_code, p.description
ORDER BY revenue DESC
LIMIT 15;


-- name: revenue_by_country
SELECT
    i.country,
    COUNT(DISTINCT i.invoice_no)               AS orders,
    COUNT(DISTINCT i.customer_id)              AS customers,
    ROUND(SUM(ii.quantity * ii.unit_price), 2) AS revenue,
    ROUND(100.0 * SUM(ii.quantity * ii.unit_price)
          / (SELECT SUM(quantity * unit_price) FROM invoice_items), 2) AS revenue_share_pct
FROM invoices i
JOIN invoice_items ii ON ii.invoice_no = i.invoice_no
GROUP BY i.country
ORDER BY revenue DESC;


-- name: weekday_hour
-- When do people order? (strftime %w: 0 = Sunday)
SELECT
    CAST(strftime('%w', i.invoice_date) AS INTEGER) AS weekday,
    CAST(strftime('%H', i.invoice_date) AS INTEGER) AS hour,
    COUNT(DISTINCT i.invoice_no)                    AS orders,
    ROUND(SUM(ii.quantity * ii.unit_price), 2)      AS revenue
FROM invoices i
JOIN invoice_items ii ON ii.invoice_no = i.invoice_no
GROUP BY 1, 2
ORDER BY 1, 2;


-- name: customer_rfm
-- RFM scores per customer. Recency is measured from the day after the last invoice in the data.
WITH ref AS (
    SELECT DATE(MAX(invoice_date), '+1 day') AS ref_date FROM invoices
),
base AS (
    SELECT
        i.customer_id,
        CAST(julianday((SELECT ref_date FROM ref)) - julianday(MAX(i.invoice_date)) AS INTEGER) AS recency_days,
        COUNT(DISTINCT i.invoice_no)                AS frequency,
        ROUND(SUM(ii.quantity * ii.unit_price), 2)  AS monetary
    FROM invoices i
    JOIN invoice_items ii ON ii.invoice_no = i.invoice_no
    WHERE i.customer_id IS NOT NULL
    GROUP BY i.customer_id
),
scored AS (
    SELECT *,
        NTILE(5) OVER (ORDER BY recency_days DESC) AS r_score,  -- recent = 5
        NTILE(5) OVER (ORDER BY frequency)         AS f_score,
        NTILE(5) OVER (ORDER BY monetary)          AS m_score
    FROM base
)
SELECT *,
    CASE
        WHEN r_score >= 4 AND f_score >= 4                 THEN 'Champions'
        WHEN r_score >= 3 AND f_score >= 3                 THEN 'Loyal'
        WHEN r_score >= 4 AND f_score <= 2                 THEN 'New / Promising'
        WHEN r_score <= 2 AND f_score >= 3                 THEN 'At Risk'
        WHEN r_score <= 2 AND f_score <= 2                 THEN 'Lost / Hibernating'
        ELSE 'Need Attention'
    END AS segment
FROM scored;


-- name: rfm_segments
-- Same RFM logic, summarised per segment
WITH ref AS (
    SELECT DATE(MAX(invoice_date), '+1 day') AS ref_date FROM invoices
),
base AS (
    SELECT
        i.customer_id,
        julianday((SELECT ref_date FROM ref)) - julianday(MAX(i.invoice_date)) AS recency_days,
        COUNT(DISTINCT i.invoice_no)       AS frequency,
        SUM(ii.quantity * ii.unit_price)   AS monetary
    FROM invoices i
    JOIN invoice_items ii ON ii.invoice_no = i.invoice_no
    WHERE i.customer_id IS NOT NULL
    GROUP BY i.customer_id
),
scored AS (
    SELECT *,
        NTILE(5) OVER (ORDER BY recency_days DESC) AS r_score,
        NTILE(5) OVER (ORDER BY frequency)         AS f_score
    FROM base
),
seg AS (
    SELECT *,
        CASE
            WHEN r_score >= 4 AND f_score >= 4 THEN 'Champions'
            WHEN r_score >= 3 AND f_score >= 3 THEN 'Loyal'
            WHEN r_score >= 4 AND f_score <= 2 THEN 'New / Promising'
            WHEN r_score <= 2 AND f_score >= 3 THEN 'At Risk'
            WHEN r_score <= 2 AND f_score <= 2 THEN 'Lost / Hibernating'
            ELSE 'Need Attention'
        END AS segment
    FROM scored
)
SELECT
    segment,
    COUNT(*)                                   AS customers,
    ROUND(AVG(recency_days), 0)                AS avg_recency_days,
    ROUND(AVG(frequency), 1)                   AS avg_orders,
    ROUND(SUM(monetary), 2)                    AS revenue,
    ROUND(100.0 * SUM(monetary) / SUM(SUM(monetary)) OVER (), 1) AS revenue_share_pct
FROM seg
GROUP BY segment
ORDER BY revenue DESC;


-- name: repeat_customers
-- How many customers ordered more than once
WITH c AS (
    SELECT customer_id, COUNT(*) AS orders
    FROM invoices
    WHERE customer_id IS NOT NULL
    GROUP BY customer_id
)
SELECT
    COUNT(*)                                             AS customers,
    SUM(CASE WHEN orders > 1 THEN 1 ELSE 0 END)          AS repeat_customers,
    ROUND(100.0 * SUM(CASE WHEN orders > 1 THEN 1 ELSE 0 END) / COUNT(*), 1) AS repeat_rate_pct
FROM c;


-- name: pareto_customers
-- What share of revenue comes from the top 20% of customers?
WITH c AS (
    SELECT i.customer_id, SUM(ii.quantity * ii.unit_price) AS revenue
    FROM invoices i
    JOIN invoice_items ii ON ii.invoice_no = i.invoice_no
    WHERE i.customer_id IS NOT NULL
    GROUP BY i.customer_id
),
ranked AS (
    SELECT revenue, NTILE(5) OVER (ORDER BY revenue DESC) AS quintile FROM c
)
SELECT
    quintile,
    COUNT(*)                 AS customers,
    ROUND(SUM(revenue), 2)   AS revenue,
    ROUND(100.0 * SUM(revenue) / (SELECT SUM(revenue) FROM c), 1) AS revenue_share_pct
FROM ranked
GROUP BY quintile
ORDER BY quintile;


-- name: cohort_retention
-- Monthly cohorts: % of customers from each first-purchase month who came back in later months
WITH first_buy AS (
    SELECT customer_id, MIN(strftime('%Y-%m', invoice_date)) AS cohort
    FROM invoices
    WHERE customer_id IS NOT NULL
    GROUP BY customer_id
),
activity AS (
    SELECT DISTINCT i.customer_id, f.cohort, strftime('%Y-%m', i.invoice_date) AS active_month
    FROM invoices i
    JOIN first_buy f ON f.customer_id = i.customer_id
),
diffs AS (
    SELECT cohort,
        (CAST(substr(active_month, 1, 4) AS INTEGER) - CAST(substr(cohort, 1, 4) AS INTEGER)) * 12
        + (CAST(substr(active_month, 6, 2) AS INTEGER) - CAST(substr(cohort, 6, 2) AS INTEGER)) AS month_offset,
        customer_id
    FROM activity
)
SELECT
    d.cohort,
    d.month_offset,
    COUNT(DISTINCT d.customer_id) AS active_customers,
    ROUND(100.0 * COUNT(DISTINCT d.customer_id) / s.cohort_size, 1) AS retention_pct
FROM diffs d
JOIN (SELECT cohort, COUNT(*) AS cohort_size FROM first_buy GROUP BY cohort) s ON s.cohort = d.cohort
GROUP BY d.cohort, d.month_offset
ORDER BY d.cohort, d.month_offset;


-- name: returns_summary
-- Cancelled / returned value compared to sales, per year
SELECT
    strftime('%Y', invoice_date)                    AS year,
    COUNT(DISTINCT invoice_no)                      AS cancelled_invoices,
    ROUND(-SUM(quantity * unit_price), 2)           AS cancelled_value
FROM returns
WHERE quantity < 0
GROUP BY 1
ORDER BY 1;
