"""초기 대량 적재: CSV → pandas 정제/검증 → Supabase upsert.

사용법:
  python scripts/initial_load.py regions      data/regions.csv
  python scripts/initial_load.py search_trend data/search_trend.csv
  python scripts/initial_load.py tour_demand  data/tour_demand.csv

CSV 컬럼명은 supabase/schema.sql 의 테이블 컬럼명과 같아야 한다.
환경변수: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
"""
import json
import os
import sys
import urllib.request

import pandas as pd

# 테이블별 (PK 컬럼, 0 이상이어야 하는 숫자 컬럼)
TABLES = {
    "regions": (["code"], []),
    "search_trend": (["date", "region_code", "keyword"], ["ratio"]),
    "tour_demand": (["date", "region_code"], ["demand_index"]),
}


def clean(df: pd.DataFrame, table: str) -> pd.DataFrame:
    keys, nums = TABLES[table]
    df = df.rename(columns=str.strip)
    if "date" in df:
        df["date"] = pd.to_datetime(df["date"], errors="coerce").dt.strftime("%Y-%m-%d")
    if "region_code" in df:
        df["region_code"] = df["region_code"].astype(str).str.strip()
    for c in nums:
        df[c] = pd.to_numeric(df[c], errors="coerce")
    df = df.dropna(subset=keys + nums)
    for c in nums:
        df = df[df[c] >= 0]
    return df.drop_duplicates(subset=keys, keep="last")


def upsert(table: str, rows: list[dict], chunk: int = 1000) -> None:
    url = f"{os.environ['SUPABASE_URL']}/rest/v1/{table}"
    key = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
    for i in range(0, len(rows), chunk):
        req = urllib.request.Request(
            url,
            data=json.dumps(rows[i : i + chunk]).encode(),
            method="POST",
            headers={
                "apikey": key,
                "Authorization": f"Bearer {key}",
                "Content-Type": "application/json",
                "Prefer": "resolution=merge-duplicates,return=minimal",
            },
        )
        urllib.request.urlopen(req).close()
        print(f"{table}: {min(i + chunk, len(rows))}/{len(rows)}")


def _check() -> None:
    raw = pd.DataFrame(
        {
            "date": ["2026-01-01", "2026-01-01", "bad", "2026-01-02"],
            "region_code": [11, 11, 11, 26],
            "demand_index": [1, 2, 3, -1],
        }
    )
    out = clean(raw, "tour_demand")
    assert out.to_dict("records") == [
        {"date": "2026-01-01", "region_code": "11", "demand_index": 2}
    ], out


if __name__ == "__main__":
    if len(sys.argv) == 2 and sys.argv[1] == "--check":
        _check()
        print("ok")
    else:
        table, path = sys.argv[1], sys.argv[2]
        df = clean(pd.read_csv(path), table)
        upsert(table, json.loads(df.to_json(orient="records", force_ascii=False)))
