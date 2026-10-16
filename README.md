# 지역별 관광 수요 대시보드

```
NAVER Search Trend ┐
한국관광공사 수요 강도 ├─ Make (매일 1회: 전처리/검증/Upsert → AI 요약) ─→ Supabase ─→ Next.js (조회만) ─→ Vercel
NAVER Local Search ┘
```

Dashboard는 외부 API를 직접 호출하지 않는다. Supabase 조회만 한다.

| 경로 | 역할 |
|------|------|
| `supabase/schema.sql` | 테이블, 집계 View(`region_daily`, `region_latest`), RLS(anon 읽기 전용) |
| `scripts/initial_load.py` | 초기 대량 CSV 정제 + upsert (pandas) |
| `docs/make-scenario.md` | Make 일일 시나리오 + AI 프롬프트 |
| `src/app/page.tsx` | 대시보드 (서버에서 Supabase 조회, 1시간 캐시) |
| `src/components/` | NAVER 지도, Recharts 차트 |

## 셋업

1. Supabase 프로젝트 생성 → SQL Editor에서 `supabase/schema.sql` 실행
2. `.env.example` → `.env.local` 복사 후 값 입력
3. NCP 콘솔 Maps Application에 `http://localhost:3000`, Vercel 도메인 등록
4. 초기 적재:
   ```
   python -m venv .venv && .venv/Scripts/pip install -r scripts/requirements.txt
   .venv/Scripts/python scripts/initial_load.py regions data/regions.csv
   ```
5. `npm run dev`
6. GitHub push → Vercel import → 환경변수 `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `NEXT_PUBLIC_NAVER_MAP_KEY_ID` 등록
