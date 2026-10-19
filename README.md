# 지역별 관광 수요 대시보드 (Chapter 14-2)

```
NAVER Search Trend ┐
한국관광공사 체류 강도 ├─ Make (Source별 Scenario, 매일 1회) ─→ Supabase ─→ AI(Make) ─→ Supabase
NAVER Local Search ┘                                              └─→ Next.js (조회만) ─→ Vercel
```

Dashboard는 외부 API를 직접 호출하지 않는다. Supabase 조회만 한다.

| 경로 | 역할 |
|------|------|
| `supabase/schema.sql` | STEP 2 테이블 6개, STEP 3 RLS, 분석용 View |
| `supabase/seed_regions.sql` | 시도 코드/좌표 |
| `seed/prepare_seed.py` | STEP 6 Seed 전처리 (raw → processed CSV) |
| `seed/collect_tour_api.py` | (선택) Seed 원본 수집: 관광공사 API → raw CSV |
| `docs/make-scenario.md` | STEP 10~ Make Scenario 상세 설정 (모듈별) |
| `src/` | Next.js Dashboard (NAVER Maps + Recharts) |

## Make 시나리오

외부 API 수집과 AI 요약은 전부 Make가 한다. 무료 플랜은 **활성 Scenario 2개, 월 1,000 크레딧**이라
Scenario 1·2·4를 하나(Daily)로 합치고, NAVER Local은 따로 둔다.
Blueprint(JSON)는 `make/` 폴더에 있다 (API 키가 들어 있어 Git 제외).

| 활성 Scenario | 주기 | 크레딧 |
|---|---|---|
| **CH14-2 Daily Collect + AI** (`make/daily_all.json`) | 매일 06:00 | 평소 ~20 / 새 관광 달이 나온 날 ~260 |
| **CH14-2 NAVER Local Daily** (`make/scenario3_local.json`) | 월 1회 권장 | 1회 ~16 (3개 지역) / ~80 (전 지역) |

Daily는 Router 경로를 위에서부터 순서대로 실행한다. 그래서 AI 요약이 항상 수집 뒤에 돈다.

### 경로 1. NAVER 검색 트렌드 → `naver_trend`

1. NAVER API Hub 검색어 트렌드 호출 (키워드 여행·축제·캠핑·맛집, 2024-10 ~ 오늘, 월 단위)
2. 키워드별 → 월별로 풀어서 `{reference_date, keyword, ratio}` 행으로 만든다
3. `naver_trend` upsert (같은 날짜+키워드는 덮어쓰기)
4. `collection_runs`에 `naver_trend / SUCCESS / 행 수` 기록

ratio는 요청 안에서 최댓값을 100으로 맞춘 **상대 관심도**다. 그래서 매번 전체 기간을 다시 받아 덮어쓴다.

### 경로 2. 한국관광공사 관광 체류 강도 → `tourism_demand`

관광 데이터는 **월 단위**이고, API는 호출 1번에 시군구 1곳 1행만 준다.

1. Supabase에서 이미 있는 최신 월을 조회하고, 그다음 달(`nextYm`)을 계산한다
2. 시군구 1곳(종로구)으로 그 달 데이터가 나왔는지 **탐색 호출**
3. Router
   - **새 달 있음**: `signgu_list`(시군구 249곳)를 하나씩 호출 → `tourism_demand` upsert → `collection_runs` `SUCCESS`
   - **새 달 없음**: `collection_runs`에 `NO_NEW_DATA`만 기록하고 끝 (~3 크레딧)
4. 관광공사 호출은 타임아웃 120초, 실패한 시군구는 건너뛴다 (Ignore)

한 번에 한 달씩만 받는다. 여러 달이 밀렸으면 Make 대신 `seed/collect_tour_api.py`로 채운다 (크레딧 0).

### 경로 3. AI 지역 요약 → `ai_region_analysis`

1. View `ai_region_input` 조회: 지역별 최신·직전 월 체류 강도, 소비 강도, 장소 카테고리별 개수, 최근 3개월 검색 관심도
2. Gemini 호출 1번으로 17개 지역 요약 (JSON 출력 모드, 타임아웃 300초)
   - summary: 주요 특징 / 관찰 내용 / 추가로 확인할 것
   - limitations: 현재 데이터만으로 단정할 수 없는 것
   - 규칙: 입력에 없는 숫자 금지, 검색 관심도 ≠ 검색 건수, 인과관계 단정 금지
3. `ai_region_analysis` upsert (같은 날짜+지역은 덮어쓰기, 날짜가 바뀌면 새 행)
4. `collection_runs`에 `ai_region_analysis / SUCCESS` 기록

### NAVER Local → `local_places` (별도 Scenario)

1. `regions`에서 지역 목록 조회 (지금은 제주·강원·부산만: URL의 `region_code=in.(50,51,26)`)
2. 지역 × 카테고리(관광지·맛집)마다 NAVER API Hub 지역 검색, 5곳씩
3. 장소마다 HTML 태그 제거, `place_key` = sha256(지역|카테고리|이름|주소), 좌표 `mapx/mapy` ÷ 10⁷
4. `local_places` upsert (`place_key` 기준) → `collection_runs` `SUCCESS`

전 지역으로 늘리려면 1번 URL을 `region_code=neq.12`로 바꾼다.

### 실행 기록 확인

```sql
select started_at, source, status, row_count
from public.collection_runs
order by started_at desc
limit 20;
```

## 셋업

1. Supabase SQL Editor: `schema.sql` → `seed_regions.sql`
2. Seed:
   ```
   python -m venv .venv
   .venv\Scripts\python -m pip install pandas
   cd seed
   ..\.venv\Scripts\python prepare_seed.py
   ```
   Table Editor → `tourism_demand` → Import data from CSV → `seed/processed/tourism_demand_seed.csv`
3. `.env.example` → `.env.local`
4. `npm run dev`
5. Vercel: 환경변수 `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `NEXT_PUBLIC_NAVER_MAP_KEY_ID`
