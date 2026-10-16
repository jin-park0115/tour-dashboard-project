-- 1회성: 이전 구조(tour_demand 등)를 지우고 강의 구조로 전환.
-- 기존 관광 데이터는 seed/raw/tour_api_responses.csv 로 백업돼 있어 CSV Import로 복구한다.
-- 실행 후: schema.sql → seed_regions.sql → tourism_demand CSV Import
drop view if exists public.region_latest, public.region_monthly, public.region_daily, public.signgu_list;
drop table if exists public.tour_demand, public.search_trend, public.places, public.ai_summaries, public.regions;
