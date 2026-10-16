-- 이미 schema.sql을 실행한 DB용 1회성 마이그레이션 (tour_demand/ai_summaries가 비어있을 때만)
drop view if exists region_latest;
drop view if exists region_daily;
drop table if exists tour_demand;
drop table if exists ai_summaries;
-- 이후 schema.sql 전체를 다시 실행 (if not exists / or replace 라 나머지는 그대로)
