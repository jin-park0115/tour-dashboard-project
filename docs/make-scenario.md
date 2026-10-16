# Make 시나리오 (강의 STEP 10~18)

Source별 Scenario 4개. 처음엔 전부 **Run once**로 테스트하고, 예약(매일 1회)은 마지막에 켠다.
전처리는 **Plan C** (Make Code 없이: 원본에 가까운 값 → Supabase, 검증은 DB 제약 + View).
Make Code를 쓸 수 있으면 강의 STEP 14/17의 순수 Python 코드를 Text aggregator 자리에 넣어도 된다.

| Scenario | 이름 | 테이블 |
|---|---|---|
| 1 | CH14-2 NAVER Trend Daily | `naver_trend` |
| 2 | CH14-2 Tourism Demand Daily | `tourism_demand` |
| 3 | CH14-2 NAVER Local | `local_places` |
| 4 | CH14-2 AI Analysis | `ai_region_analysis` |

모든 Scenario 끝에 `collection_runs` 기록.

## 공통: Supabase Upsert (HTTP > Make a request)

```
POST https://<PROJECT-REF>.supabase.co/rest/v1/<table>?on_conflict=<unique 컬럼>
apikey: <SUPABASE_SECRET_KEY>
Authorization: Bearer <SUPABASE_SECRET_KEY>
Content-Type: application/json
Prefer: resolution=merge-duplicates,return=representation
Body (Raw, JSON): [{{Text aggregator.text}}]
```

`return=representation`이라 응답 `data`가 저장된 행 배열 → 행 수는 `{{length(<upsert 모듈>.data)}}`.

## 공통: collection_runs 기록

Scenario 마지막 모듈 (HTTP POST `collection_runs?on_conflict=run_id`):
```
[{"run_id":"{{executionId}}","source":"naver_trend","started_at":"{{formatDate(now; "YYYY-MM-DDTHH:mm:ssZ")}}","finished_at":"{{formatDate(now; "YYYY-MM-DDTHH:mm:ssZ")}}","status":"success","row_count":{{length(<upsert 모듈>.data)}}}]
```
- `executionId`: 매핑 패널 > System variables > **Execution ID**
- 실패 기록: 수집 HTTP 모듈 우클릭 > **Add error handler** > 같은 HTTP POST, `"status":"failed","error_message":"{{error.message}}"` 후 **Ignore**

---

## Scenario 1. NAVER Trend (STEP 13~15)

| # | 모듈 | 설정 |
|---|---|---|
| 1 | Scheduler | (테스트 중엔 끔) |
| 2 | HTTP POST | `https://naverapihub.apigw.ntruss.com/search-trend/v1/search`<br>헤더 `X-NCP-APIGW-API-KEY-ID`, `X-NCP-APIGW-API-KEY`, `Content-Type: application/json` |
| 3 | Iterator | `{{2.data.results}}` |
| 4 | Iterator | `{{3.data}}` |
| 5 | Text aggregator | Source: **3**, Row separator `,` (advanced) |
| 6 | Upsert | `naver_trend?on_conflict=reference_date,keyword` |
| 7 | collection_runs | source `naver_trend` |

2번 Body:
```
{"startDate":"2024-10-01","endDate":"{{formatDate(now; "YYYY-MM-DD")}}","timeUnit":"month","keywordGroups":[{"groupName":"여행","keywords":["여행"]},{"groupName":"축제","keywords":["축제"]},{"groupName":"캠핑","keywords":["캠핑"]},{"groupName":"맛집","keywords":["맛집"]}]}
```
ratio는 **요청 안에서 최댓값=100**으로 정규화된다. 그래서 매번 전체 기간을 다시 받아 덮어쓴다(그래야 값이 서로 일관됨).

5번 Text:
```
{"reference_date":"{{4.period}}","keyword":"{{3.title}}","ratio":{{4.ratio}}}
```

## Scenario 2. 관광공사 API (STEP 16~18)

관광 데이터는 **월 단위**이고 API는 호출 1번에 시군구 1곳 1행만 준다. 그래서 매일 돌되, **다음 달 데이터가 나왔는지 1번만 탐색**하고 없으면 끝낸다 (하루 ~4크레딧).

| # | 모듈 | 설정 |
|---|---|---|
| 1 | Scheduler | |
| 2 | HTTP GET | `.../rest/v1/region_tourism_monthly?select=reference_date&order=reference_date.desc&limit=1` (Secret Key 헤더) |
| 3 | Tools > Set variable | `nextYm` = `{{formatDate(addMonths(parseDate(2.data[1].reference_date; "YYYY-MM-DD"); 1); "YYYYMM")}}` |
| 4 | HTTP GET (탐색) | 관광공사 API, `baseYm={{nextYm}}`, `areaCd=11`, `signguCd=11110` |
| 5 | Router | 경로 A: filter `4.data.response.body.totalCount` > 0 / 경로 B: fallback |
| A1 | HTTP GET | `.../rest/v1/signgu_list?select=area_code,signgu_code` |
| A2 | Iterator | `{{A1.data}}` |
| A3 | HTTP GET | 관광공사 API, `baseYm={{nextYm}}`, `areaCd={{A2.area_code}}`, `signguCd={{A2.signgu_code}}` |
| — | Filter "검증" | `A3.data.response.body.totalCount` > 0 |
| A4 | Text aggregator | Source: A2, Row separator `,` |
| A5 | Upsert | `tourism_demand?on_conflict=reference_date,region_code` |
| A6 | collection_runs | source `tourism_demand`, status `success` |
| B1 | collection_runs | source `tourism_demand`, status `no_new_data`, row_count `0` |

관광공사 API:
- URL `https://apis.data.go.kr/B551011/AreaTarDemDsService/areaTarSjrnDsList`
- 공통 Query: `serviceKey`(Decoding 키), `pageNo=1`, `numOfRows=10`, `MobileOS=ETC`, `MobileApp=tour-dashboard`, `_type=json`, `tarSjrnDsIxCd=21` (종합 관광체류강도)
- `baseYm`, `areaCd`, `signguCd`, `tarSjrnDsIxCd` 모두 필수 (빠지면 resultCode 11 또는 빈 응답)

A4 Text (`I` = `A3.data.response.body.items.item[1]`):
```
{"reference_date":"{{substring(nextYm; 0; 4)}}-{{substring(nextYm; 4; 6)}}-01","region_code":"{{I.signguCd}}","stay_strength":"{{I.tarSjrnDsIxVal}}"}
```
`consumption_strength`는 소비 강도 API를 연결하면 같은 방식으로 추가.

## Scenario 3. NAVER Local

| # | 모듈 | 설정 |
|---|---|---|
| 1 | Scheduler | 크레딧 절약 위해 매주 권장 |
| 2 | HTTP GET | `.../rest/v1/regions?select=region_code,region_name` |
| 3 | Iterator | `{{2.data}}` |
| 4 | HTTP GET | NAVER 지역 검색 (강의 URL/헤더), `query={{3.region_name}} 관광지`, `display=5` |
| 5 | Iterator | `{{4.data.items}}` |
| 6 | Text aggregator | Source: 3, Row separator `,` |
| 7 | Upsert | `local_places?on_conflict=place_key` |
| 8 | collection_runs | source `local_places` |

6번 Text (좌표 `mapx/mapy`는 WGS84 x 10^7):
```
{"place_key":"{{md5(5.title + 5.address)}}","region_code":"{{3.region_code}}","search_category":"관광지","name":"{{stripHTML(5.title)}}","category":"{{5.category}}","address":"{{5.address}}","road_address":"{{5.roadAddress}}","longitude":{{5.mapx / 10000000}},"latitude":{{5.mapy / 10000000}},"source_link":"{{5.link}}","updated_at":"{{formatDate(now; "YYYY-MM-DDTHH:mm:ssZ")}}"}
```

## Scenario 4. AI 분석

AI에는 **검증된 집계(View)만** 넘긴다.

| # | 모듈 | 설정 |
|---|---|---|
| 1 | Scheduler | Scenario 2 이후 시간 |
| 2 | HTTP GET | `.../rest/v1/region_latest?select=region_code,region_name,reference_date,stay_strength,consumption_strength,signgu_count` |
| 3 | Anthropic Claude > Create a Prompt | 모델: 최신 Sonnet, 프롬프트 아래 |
| 4 | Upsert | `ai_region_analysis?on_conflict=analysis_date,region_code`, Body: `{{3.텍스트 응답}}` (배열 그대로) |
| 5 | collection_runs | source `ai_region_analysis` |

프롬프트:
```
다음은 지역별 관광 체류 강도(stay_strength, 시군구 평균 지수)와 소비 강도(consumption_strength) 최신 월 집계다.
주어진 수치만 근거로 각 지역을 한두 문장으로 요약하라. 수치에 없는 원인이나 전망은 추측하지 말 것.
limitations에는 이 데이터로 알 수 없는 점을 한 문장으로 적어라.
설명 없이 JSON 배열만 출력:
[{"analysis_date":"{{formatDate(now; "YYYY-MM-DD")}}","region_code":"...","summary":"...","limitations":"...","llm_provider":"anthropic","model_name":"<사용 모델 ID>"}]

{{2.data}}
```

---

## 크레딧 (무료 플랜 월 1,000)

대략 Scenario 1 ~180, 2 ~120(+새 달 나온 달 ~260), 3 매주 ~400, 4 ~120. 빠듯하면 3을 격주로.
