"""
Downloads the Online Retail II dataset from the UCI ML repository.
The zip is around 45 MB so it is not kept in the repo.
"""
import io
import os
import zipfile

import requests

URL = "https://archive.ics.uci.edu/static/public/502/online+retail+ii.zip"
RAW_DIR = os.path.join(os.path.dirname(__file__), "..", "data", "raw")


def main():
    os.makedirs(RAW_DIR, exist_ok=True)
    out_file = os.path.join(RAW_DIR, "online_retail_II.xlsx")
    if os.path.exists(out_file):
        print("already downloaded:", out_file)
        return

    print("downloading from UCI...")
    resp = requests.get(URL, timeout=300)
    resp.raise_for_status()

    with zipfile.ZipFile(io.BytesIO(resp.content)) as z:
        z.extractall(RAW_DIR)
    print("saved to", out_file)


if __name__ == "__main__":
    main()
