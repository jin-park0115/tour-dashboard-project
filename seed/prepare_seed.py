"""STEP 6. Seed 기본 전처리: raw → processed (Supabase Table Editor > Import data from CSV 용)

raw/tour_api_responses.csv   관광공사 API 원본 (collect_tour_api.py 로 수집)
→ processed/tourism_demand_seed.csv   tourism_demand 표준 구조

region_code는 시군구 코드(signguCd)를 그대로 쓴다. 시도 집계는 Supabase View가 한다.
stay_strength = 종합 관광체류강도(지표 21). consumption_strength는 소비 강도 API 연결 전까지 비움.

추가 적재(이미 Supabase에 있는 달 제외):  python prepare_seed.py 202601
→ processed/tourism_demand_from_202601.csv  (2026-01 이후만. 겹치는 달이 있으면 CSV Import가 unique 오류로 실패함)
"""
from pathlib import Path

import pandas as pd

BASE_DIR = Path(__file__).resolve().parent
RAW_DIR = BASE_DIR / "raw"
OUT_DIR = BASE_DIR / "processed"
OUT_DIR.mkdir(parents=True, exist_ok=True)

COLUMNS = ["reference_date", "region_code", "stay_strength", "consumption_strength"]


def clean_text(series):
    return series.astype("string").str.strip()


def to_tourism(raw: pd.DataFrame) -> pd.DataFrame:
    missing = [c for c in ["baseYm", "signguCd", "tarSjrnDsIxCd", "tarSjrnDsIxVal"] if c not in raw.columns]
    if missing:
        raise ValueError("필수 컬럼 없음: " + ", ".join(missing))

    df = raw[clean_text(raw["tarSjrnDsIxCd"]) == "21"].copy()
    df["reference_date"] = pd.to_datetime(clean_text(df["baseYm"]), format="%Y%m", errors="coerce").dt.date
    df["region_code"] = clean_text(df["signguCd"])
    df["stay_strength"] = pd.to_numeric(df["tarSjrnDsIxVal"], errors="coerce")
    df["consumption_strength"] = pd.NA

    df = df.dropna(subset=["reference_date", "region_code", "stay_strength"])
    df = df[df["stay_strength"] >= 0]
    df = df.drop_duplicates(subset=["reference_date", "region_code"], keep="last")
    return df[COLUMNS]


def prepare_tourism(from_ym: str | None = None):
    src = RAW_DIR / "tour_api_responses.csv"
    if not src.exists():
        print("[SKIP] tour_api_responses.csv 없음")
        return
    df = to_tourism(pd.read_csv(src, dtype=str, encoding="utf-8-sig"))
    output = OUT_DIR / "tourism_demand_seed.csv"
    if from_ym:
        df = df[pd.to_datetime(df["reference_date"]) >= pd.to_datetime(from_ym, format="%Y%m")]
        output = OUT_DIR / f"tourism_demand_from_{from_ym}.csv"
    print("months:", sorted({str(d)[:7] for d in df["reference_date"]}))
    df.to_csv(output, index=False, encoding="utf-8-sig")
    print("[PASS]", output)
    print("rows:", len(df))


def _check():
    raw = pd.DataFrame({
        "baseYm": ["202509", "202509", "bad", "202509", "202509"],
        "signguCd": ["11110", "11110", "11140", "11140", "11170"],
        "tarSjrnDsIxCd": ["21", "21", "21", "2103", "21"],
        "tarSjrnDsIxVal": ["80", "84.26", "70", "50", "-1"],
    })
    out = to_tourism(raw)
    assert out[["region_code", "stay_strength"]].values.tolist() == [["11110", 84.26]], out
    assert str(out["reference_date"].iloc[0]) == "2025-09-01"


if __name__ == "__main__":
    import sys
    if sys.argv[1:] == ["--check"]:
        _check()
        print("ok")
    else:
        prepare_tourism(sys.argv[1] if len(sys.argv) > 1 else None)
