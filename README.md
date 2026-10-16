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
| `docs/make-scenario.md` | STEP 10~ Make Scenario 4개 |
| `src/` | Next.js Dashboard (NAVER Maps + Recharts) |

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
