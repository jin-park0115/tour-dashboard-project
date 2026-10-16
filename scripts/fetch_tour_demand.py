"""관광공사 관광 체류 강도 과거 데이터 대량 수집 → Supabase.

API는 호출 1번에 (시군구 1곳 x 지표 1개 x 1개월) 1행만 준다. 그래서 전부 반복 호출한다.
하루 호출 한도에 걸리면 멈춘다. 다음 날 같은 명령을 다시 실행하면
Supabase에 이미 있는 것과 빈 응답(.tour_demand_empty.txt)을 건너뛰고 이어서 받는다.

사용법:
  python scripts/fetch_tour_demand.py <법정동코드.txt> 202410 202509 [지표코드 ...]   (지표 기본값: 21)
  python scripts/fetch_tour_demand.py --check

법정동코드.txt: code.go.kr > 법정동코드 전체자료 다운로드 (탭 구분, cp949)
환경변수(.env.local): DATA_GO_KR_KEY(Decoding 키), SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
"""
import json
import os
import sys
import urllib.parse
import urllib.error
import urllib.request
from pathlib import Path

import pandas as pd

from initial_load import clean, upsert

ROOT = Path(__file__).resolve().parent.parent
API = "https://apis.data.go.kr/B551011/AreaTarDemDsService/areaTarSjrnDsList"
# 2026년 광주(29)+전남(46) → 전남광주통합특별시(12). 법정동상 폐지지만 과거 관광 데이터는 옛 코드를 씀
LEGACY_AREAS = ("29", "46")
# ponytail: 아직 발표 안 된 월도 빈 응답으로 기록됨. 다시 받으려면 이 파일을 지울 것
EMPTY = Path(__file__).with_name(".tour_demand_empty.txt")


class QuotaExceeded(Exception):
    pass


def load_env() -> None:
    env = ROOT / ".env.local"
    if env.exists():
        for line in env.read_text(encoding="utf-8").splitlines():
            k, sep, v = line.partition("=")
            if sep and not k.startswith("#"):
                os.environ.setdefault(k.strip(), v.strip())


def signgu_codes(path: str) -> list[str]:
    """법정동코드 전체자료에서 시군구 5자리 코드 (현존 + LEGACY_AREAS, 시와 구 둘 다 포함, 없는 건 빈 응답으로 걸러짐)."""
    df = pd.read_csv(path, sep="\t", encoding="cp949", dtype=str).iloc[:, :3]
    df.columns = ["code", "name", "status"]
    df = df[((df["status"] == "존재") | df["code"].str[:2].isin(LEGACY_AREAS)) & df["code"].str.endswith("00000") & (df["code"].str[2:5] != "000")]
    return sorted(df["code"].str[:5].unique())


def parse(text: str) -> list[dict]:
    if "LIMITED_NUMBER_OF_SERVICE_REQUESTS" in text:
        raise QuotaExceeded
    try:
        data = json.loads(text)
    except ValueError:
        raise RuntimeError(text[:300])
    res = data.get("response", data)
    code = res.get("header", res).get("resultCode")
    if code == "22":
        raise QuotaExceeded
    if code != "0000":
        raise RuntimeError(text[:300])
    items = res.get("body", {}).get("items") or {}
    item = items.get("item", []) if isinstance(items, dict) else []
    return item if isinstance(item, list) else [item]


def fetch(ym: str, sg: str, ind: str) -> list[dict]:
    q = urllib.parse.urlencode({
        "serviceKey": os.environ["DATA_GO_KR_KEY"], "pageNo": 1, "numOfRows": 10,
        "MobileOS": "ETC", "MobileApp": "tour-dashboard", "_type": "json",
        "baseYm": ym, "areaCd": sg[:2], "signguCd": sg, "tarSjrnDsIxCd": ind,
    })
    try:
        with urllib.request.urlopen(f"{API}?{q}", timeout=30) as r:
            return parse(r.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        if e.code == 429:  # 게이트웨이가 한도 초과를 HTTP 429로 줄 때
            raise QuotaExceeded
        raise


def existing() -> set[tuple[str, str, str]]:
    key = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
    url = f"{os.environ['SUPABASE_URL']}/rest/v1/tour_demand?select=month,signgu_code,indicator_code&limit=1000"
    out, off = set(), 0
    while True:
        req = urllib.request.Request(f"{url}&offset={off}", headers={"apikey": key, "Authorization": f"Bearer {key}"})
        with urllib.request.urlopen(req) as r:
            rows = json.load(r)
        out |= {(x["month"][:7].replace("-", ""), x["signgu_code"], x["indicator_code"]) for x in rows}
        if len(rows) < 1000:
            return out
        off += 1000


def flush(rows: list[dict]) -> None:
    if rows:
        df = clean(pd.DataFrame(rows), "tour_demand")
        upsert("tour_demand", json.loads(df.to_json(orient="records", force_ascii=False)))
        rows.clear()


def main(path: str, start: str, end: str, inds: list[str]) -> None:
    months = [p.strftime("%Y%m") for p in pd.period_range(f"{start[:4]}-{start[4:]}", f"{end[:4]}-{end[4:]}", freq="M")]
    done = existing()
    if EMPTY.exists():
        done |= {tuple(line.split(",")) for line in EMPTY.read_text().splitlines()}
    todo = [(ym, sg, ind) for ym in months for sg in signgu_codes(path) for ind in inds if (ym, sg, ind) not in done]
    print(f"호출 예정 {len(todo)}건")

    rows: list[dict] = []
    try:
        with EMPTY.open("a") as empty:
            for i, (ym, sg, ind) in enumerate(todo, 1):
                items = fetch(ym, sg, ind)
                if items:
                    rows += items
                else:
                    empty.write(f"{ym},{sg},{ind}\n")
                if len(rows) >= 100:
                    flush(rows)
                if i % 50 == 0:
                    print(f"{i}/{len(todo)}")
    except QuotaExceeded:
        print("하루 호출 한도 도달. 내일 같은 명령으로 다시 실행하면 이어서 받습니다.")
    finally:
        flush(rows)


def _check() -> None:
    row = {"baseYm": "202509", "areaCd": "11", "signguCd": "11530", "tarSjrnDsIxCd": "21", "tarSjrnDsIxVal": "76.73"}
    ok = lambda items: json.dumps({"response": {"header": {"resultCode": "0000"}, "body": {"items": items}}})
    assert parse(ok({"item": [row]})) == [row]
    assert parse(ok({"item": row})) == [row]  # 1건이면 배열이 아닌 객체로 오는 경우
    assert parse(ok("")) == []
    try:
        parse(json.dumps({"resultCode": "11", "resultMsg": "NO_MANDATORY_REQUEST_PARAMETERS_ERROR"}))
        raise AssertionError("error not raised")
    except RuntimeError:
        pass
    try:
        parse("<returnAuthMsg>LIMITED_NUMBER_OF_SERVICE_REQUESTS_EXCEEDS_ERROR</returnAuthMsg>")
        raise AssertionError("quota not raised")
    except QuotaExceeded:
        pass


if __name__ == "__main__":
    if sys.argv[1:] == ["--check"]:
        _check()
        print("ok")
    else:
        load_env()
        main(sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4:] or ["21"])
