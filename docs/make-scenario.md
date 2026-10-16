# Make 시나리오

관광 데이터가 **월 단위**라 매일 돌릴 필요가 없다. 크레딧 절약을 위해 주기를 나눈다.

| 시나리오 | 주기 | 하는 일 | 월 크레딧(대략) |
|---|---|---|---|
| A. 관광 체류 강도 + AI 요약 | 매주 | 새 달 데이터가 나왔으면 시군구 전부 수집 → AI 요약 | 새 달 없을 때 3/주, 있을 때 ~260 |
| B. 검색 트렌드 | 매월 1회 | 17개 시도 NAVER DataLab | ~40 |
| C. 지역 장소 (NAVER Local) | 보류 | 대시보드에서 아직 안 씀 | - |

공통 Supabase upsert (HTTP > Make a request):

```
POST {SUPABASE_URL}/rest/v1/{table}
apikey: {SERVICE_ROLE_KEY}
Authorization: Bearer {SERVICE_ROLE_KEY}
Content-Type: application/json
Prefer: resolution=merge-duplicates,return=minimal
Body (Raw, JSON): [{{aggregator.text}}]
```

PK가 충돌 키라서 다시 돌려도 중복되지 않는다.

---

## A. 관광 체류 강도 (매주)

API는 호출 1번에 시군구 1곳 x 지표 1개 x 1개월 = 1행. 종합 지표 `21`만 받는다.

| # | 모듈 | 설정 |
|---|------|------|
| 1 | HTTP GET | `{SUPABASE_URL}/rest/v1/region_monthly?select=month&order=month.desc&limit=1` (헤더 apikey/Authorization) |
| 2 | Tools > Set variable | `nextYm` = `{{formatDate(addMonths(parseDate(1.data[1].month; "YYYY-MM-DD"); 1); "YYYYMM")}}` |
| 3 | HTTP GET (탐색) | 관광공사 API, `baseYm={{nextYm}}`, `areaCd=11`, `signguCd=11110`, `tarSjrnDsIxCd=21` |
| — | Filter "새 달 있음" | `3.data.response.body.totalCount` Numeric greater than `0` → 없으면 여기서 종료 (3크레딧) |
| 4 | HTTP GET | `{SUPABASE_URL}/rest/v1/signgu_list?select=region_code,signgu_code` |
| 5 | Iterator | `{{4.data}}` |
| 6 | HTTP GET | 관광공사 API, `baseYm={{nextYm}}`, `areaCd={{5.region_code}}`, `signguCd={{5.signgu_code}}`, `tarSjrnDsIxCd=21` |
| — | Filter "검증" | `6.data.response.body.totalCount` > 0 |
| 7 | Text aggregator | Source: 5, Row separator `,`, Text: 아래 |
| 8 | HTTP POST | upsert `tour_demand` |
| 9~ | AI 요약 | 아래 |

관광공사 API 공통 파라미터: `serviceKey`(Decoding 키), `pageNo=1`, `numOfRows=10`, `MobileOS=ETC`, `MobileApp=tour-dashboard`, `_type=json`
URL: `https://apis.data.go.kr/B551011/AreaTarDemDsService/areaTarSjrnDsList`

7번 Text:
```
{"month":"{{substring(nextYm; 0; 4)}}-{{substring(nextYm; 4; 6)}}-01","region_code":"{{6.data.response.body.items.item[1].areaCd}}","signgu_code":"{{6.data.response.body.items.item[1].signguCd}}","signgu_name":"{{6.data.response.body.items.item[1].signguNm}}","indicator_code":"21","indicator_name":"{{6.data.response.body.items.item[1].tarSjrnDsIxNm}}","value":"{{6.data.response.body.items.item[1].tarSjrnDsIxVal}}"}
```

### AI 요약 (A에 이어서)

| # | 모듈 | 설정 |
|---|------|------|
| 9 | HTTP GET | `{SUPABASE_URL}/rest/v1/region_monthly?select=region_code,name,demand_index,search_ratio&indicator_code=eq.21&month=eq.{{substring(nextYm; 0; 4)}}-{{substring(nextYm; 4; 6)}}-01` |
| 10 | Anthropic Claude > Create a Prompt | 모델: 최신 Sonnet, 프롬프트 아래 |
| 11 | HTTP POST | upsert `ai_summaries`, Body: `{{10.텍스트 응답}}` (프롬프트가 배열 그대로 내도록 함) |

```
다음은 {{nextYm}} 지역별 관광 체류 강도(demand_index, 시군구 평균)와 검색 트렌드(search_ratio, 지역별 0~100 상대값) 월 집계다.
주어진 수치만 근거로 각 지역을 한두 문장으로 요약하라. 수치에 없는 내용은 추측하지 말 것.
설명 없이 JSON 배열만 출력:
[{"month": "{{substring(nextYm; 0; 4)}}-{{substring(nextYm; 4; 6)}}-01", "region_code": "...", "summary": "...", "model": "<사용 모델 ID>"}]

{{9.data}}
```

---

## B. 검색 트렌드 (매월 1회)

DataLab `ratio`는 **요청 안에서 최댓값=100으로 정규화**된다. 그래서 지역마다 따로 호출하고, 매번 2024-10부터 지난달까지 전체 기간을 다시 받아 덮어쓴다. 그래야 지역별 추이가 일관된다. 지역끼리 값 비교는 의미 없음.

| # | 모듈 | 설정 |
|---|------|------|
| 1 | HTTP GET | `{SUPABASE_URL}/rest/v1/regions?select=code,name` |
| 2 | Iterator | `{{1.data}}` |
| 3 | HTTP POST | `https://openapi.naver.com/v1/datalab/search`, 헤더 `X-Naver-Client-Id`, `X-Naver-Client-Secret`, Body 아래 |
| 4 | Iterator | `{{3.data.results[1].data}}` |
| 5 | Text aggregator | Source: 2, Row separator `,`, Text 아래 |
| 6 | HTTP POST | upsert `search_trend` |

3번 Body (Raw, JSON):
```
{"startDate":"2024-10-01","endDate":"{{formatDate(addDays(setDate(now; 1); -1); "YYYY-MM-DD")}}","timeUnit":"month","keywordGroups":[{"groupName":"{{2.code}}","keywords":["{{2.name}} 여행","{{2.name}} 관광"]}]}
```

5번 Text:
```
{"date":"{{4.period}}","region_code":"{{2.code}}","keyword":"여행","ratio":{{4.ratio}}}
```
