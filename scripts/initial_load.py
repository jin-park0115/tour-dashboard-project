"""초기 대량 적재: CSV → pandas 정제/검증 → Supabase upsert.

사용법:
  python scripts/initial_load.py regions      data/regions.csv
  python scripts/initial_load.py search_trend data/search_trend.csv
  python scripts/initial_load.py tour_demand  data/tour_demand.csv

CSV 컬럼명은 supabase/schema.sql 의 테이블 컬럼명, 또는 관광공사 API 원본 필드명(baseYm, areaCd ...).
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
    "tour_demand": (["month", "signgu_code", "indicator_code"], ["value"]),
}

# 관광공사 API 원본 필드 → 테이블 컬럼
RENAME = {
    "baseYm": "month", "areaCd": "region_code", "signguCd": "signgu_code", "signguNm": "signgu_name",
    "tarSjrnDsIxCd": "indicator_code", "tarSjrnDsIxNm": "indicator_name", "tarSjrnDsIxVal": "value",
}


def clean(df: pd.DataFrame, table: str) -> pd.DataFrame:
    keys, nums = TABLES[table]
    df = df.rename(columns=str.strip).rename(columns=RENAME)
    if table == "tour_demand":  # API 응답의 areaNm 등 테이블에 없는 필드 제거
        df = df[[c for c in RENAME.values() if c in df]]
    if "date" in df:
        df["date"] = pd.to_datetime(df["date"], errors="coerce").dt.strftime("%Y-%m-%d")
    if "month" in df:  # 202509 / 2025-09 / 2025-09-01 → 2025-09-01
        ym = df["month"].astype(str).str.replace("-", "").str[:6]
        df["month"] = pd.to_datetime(ym, format="%Y%m", errors="coerce").dt.strftime("%Y-%m-%d")
    for c in ("region_code", "signgu_code", "indicator_code"):
        if c in df:
            df[c] = df[c].astype(str).str.strip()
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
            "baseYm": [202509, 202509, "bad", 202510],
            "areaCd": [11, 11, 11, 26],
            "areaNm": ["서울특별시"] * 4,
            "signguCd": [11530, 11530, 11530, 26110],
            "signguNm": ["구로구"] * 4,
            "tarSjrnDsIxCd": [2103] * 4,
            "tarSjrnDsIxNm": ["1박 방문자수"] * 4,
            "tarSjrnDsIxVal": ["70", "75.45", "1", "-1"],
        }
    )
    out = clean(raw, "tour_demand")
    assert out.to_dict("records") == [
        {"month": "2025-09-01", "region_code": "11", "signgu_code": "11530", "signgu_name": "구로구",
         "indicator_code": "2103", "indicator_name": "1박 방문자수", "value": 75.45}
    ], out


if __name__ == "__main__":
    if len(sys.argv) == 2 and sys.argv[1] == "--check":
        _check()
        print("ok")
    else:
        table, path = sys.argv[1], sys.argv[2]
        df = clean(pd.read_csv(path), table)
        upsert(table, json.loads(df.to_json(orient="records", force_ascii=False)))
