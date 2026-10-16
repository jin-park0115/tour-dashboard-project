# Make 시나리오 (매일 1회)

Schedule: 매일 06:00 (Asia/Seoul)

| # | 모듈 | 내용 |
|---|------|------|
| 1 | HTTP | NAVER DataLab 검색어 트렌드 `POST https://openapi.naver.com/v1/datalab/search` (헤더 `X-Naver-Client-Id`, `X-Naver-Client-Secret`), 전일 기준 |
| 2 | HTTP | 한국관광공사 지역별 관광 수요 강도 API (data.go.kr `serviceKey`). **월 단위(`baseYm`)** 데이터라 최신 월을 조회, 매일 돌아도 upsert라 무해. 지표 코드 `21`(전체)로 요청하면 2101~2105가 함께 옴 |
| 3 | HTTP | NAVER 지역 검색 `GET https://openapi.naver.com/v1/search/local.json?query={지역} 관광지&display=5` |
| 4 | Iterator + Tools | 가벼운 전처리: 공백 trim, 날짜 `YYYY-MM-DD`, `baseYm` 202509 → `2025-09-01`, `tarSjrnDsIxVal` 문자열 → 숫자, HTML 태그 제거(`<b>`), 지역 검색 `mapx/mapy` ÷ 1e7 → `lng/lat` |
| 5 | Filter | 검증: 키 컬럼 null 제외, 숫자 < 0 제외 (DB `check` 제약이 최종 방어선) |
| 6 | HTTP | Supabase upsert (아래) — `search_trend`, `tour_demand`, `places` |
| 7 | HTTP | Supabase `GET /rest/v1/region_monthly?month=eq.{최신월}` — 검증된 집계만 AI에 전달 |
| 8 | HTTP | AI API 호출 (아래 프롬프트) |
| 9 | HTTP | 결과를 `ai_summaries` upsert (`month`, `region_code`) |

## Supabase upsert (HTTP 모듈)

```
POST {SUPABASE_URL}/rest/v1/{table}
apikey: {SERVICE_ROLE_KEY}
Authorization: Bearer {SERVICE_ROLE_KEY}
Content-Type: application/json
Prefer: resolution=merge-duplicates,return=minimal

[ {...}, {...} ]   ← Array aggregator로 배열 한 번에 전송
```

PK가 충돌 키 역할을 하므로 같은 날 재실행해도 중복되지 않는다.

## 관광공사 필드 → `tour_demand` 컬럼

| API | 컬럼 |
|-----|------|
| `baseYm` | `month` (YYYY-MM-01) |
| `areaCd` | `region_code` |
| `signguCd` / `signguNm` | `signgu_code` / `signgu_name` |
| `tarSjrnDsIxCd` / `tarSjrnDsIxNm` | `indicator_code` / `indicator_name` |
| `tarSjrnDsIxVal` | `value` |

## AI 요약 프롬프트

```
다음은 {month} 지역별 관광 수요 강도 지표(indicator_name, demand_index)와 검색 트렌드(search_ratio) 월 집계다.
주어진 수치만 근거로 각 지역을 한두 문장으로 요약하라. 수치에 없는 내용은 추측하지 말 것.
JSON 배열로만 응답: [{"region_code": "...", "summary": "..."}]

{region_monthly JSON}
```

`model` 컬럼에 사용한 모델 ID를 함께 저장한다.
