"""
Runs every query in sql/analysis.sql and saves the results as csv in outputs/
"""
import os
import re
import sqlite3

import pandas as pd

BASE = os.path.join(os.path.dirname(__file__), "..")
DB_FILE = os.path.join(BASE, "data", "retail.db")
SQL_FILE = os.path.join(BASE, "sql", "analysis.sql")
OUT_DIR = os.path.join(BASE, "outputs")


def read_queries(path):
    """split the .sql file on the '-- name:' lines"""
    with open(path) as f:
        text = f.read()
    parts = re.split(r"^-- name:\s*(\w+)\s*$", text, flags=re.M)
    # parts = [header, name1, sql1, name2, sql2, ...]
    return {parts[i]: parts[i + 1].strip() for i in range(1, len(parts), 2)}


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    conn = sqlite3.connect(DB_FILE)
    queries = read_queries(SQL_FILE)

    for name, sql in queries.items():
        df = pd.read_sql_query(sql, conn)
        df.to_csv(os.path.join(OUT_DIR, f"{name}.csv"), index=False)
        print(f"{name:<20} {len(df):>6} rows")

    conn.close()


if __name__ == "__main__":
    main()
