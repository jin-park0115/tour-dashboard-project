-- Supabase SQL Editor에서 한 번 실행.
-- 쓰기: Make / Python (service_role 키, RLS 우회)
-- 읽기: Dashboard (anon 키, select 전용 정책)

create table if not exists regions (
  code text primary key,            -- 시도/시군구 코드
  name text not null,
  lat  double precision,
  lng  double precision
);

-- NAVER DataLab 검색어 트렌드
create table if not exists search_trend (
  date        date not null,
  region_code text not null references regions(code),
  keyword     text not null,
  ratio       numeric not null check (ratio >= 0),
  primary key (date, region_code, keyword)
);

-- 한국관광공사 지역별 관광 수요 강도 (월 단위, 시군구 x 지표)
create table if not exists tour_demand (
  month          date not null,                       -- baseYm 202509 → 2025-09-01
  region_code    text not null references regions(code), -- areaCd (법정동 시도)
  signgu_code    text not null,                       -- signguCd
  signgu_name    text,                                -- signguNm
  indicator_code text not null,                       -- tarSjrnDsIxCd
  indicator_name text,                                -- tarSjrnDsIxNm
  value          numeric not null check (value >= 0), -- tarSjrnDsIxVal
  primary key (month, signgu_code, indicator_code)
);

-- NAVER 지역 검색 결과 (장소)
create table if not exists places (
  id          text primary key,     -- title+address 해시 등 Make에서 생성
  region_code text not null references regions(code),
  title       text not null,
  category    text,
  address     text,
  lat         double precision,
  lng         double precision,
  updated_at  timestamptz not null default now()
);

-- AI 요약 (검증된 집계 데이터 기반)
create table if not exists ai_summaries (
  month       date not null,
  region_code text not null references regions(code),
  summary     text not null,
  model       text,
  created_at  timestamptz not null default now(),
  primary key (month, region_code)
);

-- 분석용 집계 View ------------------------------------------------------

-- 수요 강도는 월 단위라 검색 트렌드도 월 평균으로 맞춘다.
-- ponytail: 시군구 단순 평균. 인구/면적 가중이 필요하면 여기서 바꿀 것
create or replace view region_monthly with (security_invoker = on) as
with demand as (
  select month, region_code, indicator_code, indicator_name, avg(value) as demand_index
  from tour_demand
  group by month, region_code, indicator_code, indicator_name
), trend as (
  select date_trunc('month', date)::date as month, region_code, avg(ratio) as search_ratio
  from search_trend
  group by 1, 2
)
select d.*, r.name, t.search_ratio
from demand d
join regions r on r.code = d.region_code
left join trend t using (month, region_code);

create or replace view region_latest with (security_invoker = on) as
select distinct on (m.region_code, m.indicator_code)
       m.*, r.lat, r.lng, s.summary
from region_monthly m
join regions r on r.code = m.region_code
left join ai_summaries s on s.region_code = m.region_code and s.month = m.month
order by m.region_code, m.indicator_code, m.month desc;

-- RLS: anon은 읽기만 ----------------------------------------------------

do $$
declare t text;
begin
  foreach t in array array['regions','search_trend','tour_demand','places','ai_summaries'] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists anon_read on %I', t);
    execute format('create policy anon_read on %I for select to anon using (true)', t);
  end loop;
end $$;
