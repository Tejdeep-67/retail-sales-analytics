"""
Cleans the raw Online Retail II data and loads it into data/retail.db

Cleaning rules (decided after looking at the data in the notebook):
  - cancelled invoices (start with 'C') go to the returns table
  - drop rows with quantity <= 0 or price <= 0 (adjustments, damaged stock etc.)
  - drop non-product stock codes like POST, DOT, M, BANK CHARGES, AMAZONFEE
  - drop exact duplicate rows
  - drop the 2 giant orders that were cancelled straight away (see clean())
  - rows without Customer ID are kept for revenue numbers but they
    are not linked to a customer
"""
import os
import sqlite3

import pandas as pd

BASE = os.path.join(os.path.dirname(__file__), "..")
RAW_FILE = os.path.join(BASE, "data", "raw", "online_retail_II.xlsx")
DB_FILE = os.path.join(BASE, "data", "retail.db")
SCHEMA_FILE = os.path.join(BASE, "sql", "schema.sql")

# stock codes that are not real products
NON_PRODUCT_CODES = ["POST", "DOT", "M", "C2", "D", "S", "B", "CRUK", "PADS",
                     "BANK CHARGES", "AMAZONFEE", "ADJUST", "ADJUST2", "TEST001",
                     "TEST002", "GIFT"]


def load_raw():
    # the excel has one sheet per year
    sheets = pd.read_excel(RAW_FILE, sheet_name=None, dtype={"Invoice": str, "StockCode": str})
    df = pd.concat(sheets.values(), ignore_index=True)
    df = df.rename(columns={
        "Invoice": "invoice_no",
        "StockCode": "stock_code",
        "Description": "description",
        "Quantity": "quantity",
        "InvoiceDate": "invoice_date",
        "Price": "unit_price",
        "Customer ID": "customer_id",
        "Country": "country",
    })
    return df


def clean(df):
    stats = {"raw_rows": len(df)}

    df["stock_code"] = df["stock_code"].str.strip().str.upper()
    df["description"] = df["description"].str.strip()

    df = df.drop_duplicates()
    stats["after_dedup"] = len(df)

    is_cancel = df["invoice_no"].str.startswith("C")
    returns = df[is_cancel].copy()
    sales = df[~is_cancel].copy()

    sales = sales[(sales["quantity"] > 0) & (sales["unit_price"] > 0)]
    stats["after_qty_price"] = len(sales)

    # two huge orders (80,995 and 74,215 units) were cancelled right after they were placed.
    # they distort every "top product" chart, so drop a sale if the same customer
    # cancelled the exact same quantity of the same item
    big = returns[returns["quantity"] <= -10000][["customer_id", "stock_code", "quantity"]].copy()
    big["quantity"] = -big["quantity"]
    big["_cancelled"] = True
    sales = sales.merge(big, on=["customer_id", "stock_code", "quantity"], how="left")
    stats["big_cancelled_orders"] = int(sales["_cancelled"].fillna(False).astype(bool).sum())
    sales = sales[sales["_cancelled"].isna()].drop(columns="_cancelled")

    # some codes look like "gift_0001_10" so check the prefix as well
    bad = sales["stock_code"].isin(NON_PRODUCT_CODES) | sales["stock_code"].str.startswith("GIFT_")
    sales = sales[~bad]
    stats["clean_rows"] = len(sales)
    stats["returns_rows"] = len(returns)
    return sales, returns, stats


def build_tables(sales):
    # one description per stock code -> take the most common one
    products = (sales.dropna(subset=["description"])
                .groupby("stock_code")["description"]
                .agg(lambda s: s.value_counts().index[0])
                .reset_index())

    # a few customers appear with 2 countries, keep the latest one
    cust = sales.dropna(subset=["customer_id"]).sort_values("invoice_date")
    customers = cust.groupby("customer_id")["country"].last().reset_index()
    customers["customer_id"] = customers["customer_id"].astype(int)

    invoices = (sales.sort_values("invoice_date")
                .groupby("invoice_no")
                .agg(invoice_date=("invoice_date", "first"),
                     customer_id=("customer_id", "first"),
                     country=("country", "first"))
                .reset_index())
    invoices["customer_id"] = invoices["customer_id"].astype("Int64")

    items = sales[["invoice_no", "stock_code", "quantity", "unit_price"]]
    return customers, products, invoices, items


def main():
    print("reading excel (takes a minute)...")
    df = load_raw()
    sales, returns, stats = clean(df)
    customers, products, invoices, items = build_tables(sales)

    for k, v in stats.items():
        print(f"{k:>20}: {v:,}")

    conn = sqlite3.connect(DB_FILE)
    with open(SCHEMA_FILE) as f:
        conn.executescript(f.read())

    invoices["invoice_date"] = invoices["invoice_date"].dt.strftime("%Y-%m-%d %H:%M:%S")
    returns["invoice_date"] = returns["invoice_date"].dt.strftime("%Y-%m-%d %H:%M:%S")

    customers.to_sql("customers", conn, if_exists="append", index=False)
    products.to_sql("products", conn, if_exists="append", index=False)
    invoices.to_sql("invoices", conn, if_exists="append", index=False)
    items.to_sql("invoice_items", conn, if_exists="append", index=False)
    returns[["invoice_no", "invoice_date", "customer_id", "stock_code",
             "quantity", "unit_price", "country"]].to_sql("returns", conn, if_exists="append", index=False)
    conn.commit()

    for t in ["customers", "products", "invoices", "invoice_items", "returns"]:
        n = conn.execute(f"SELECT COUNT(*) FROM {t}").fetchone()[0]
        print(f"{t:>20}: {n:,} rows")
    conn.close()
    print("done ->", DB_FILE)


if __name__ == "__main__":
    main()
