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

-- 한국관광공사 지역별 관광 수요 강도
create table if not exists tour_demand (
  date         date not null,
  region_code  text not null references regions(code),
  demand_index numeric not null check (demand_index >= 0),
  primary key (date, region_code)
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
  date        date not null,
  region_code text not null references regions(code),
  summary     text not null,
  model       text,
  created_at  timestamptz not null default now(),
  primary key (date, region_code)
);

-- 분석용 집계 View ------------------------------------------------------

create or replace view region_daily with (security_invoker = on) as
select d.date, d.region_code, r.name,
       d.demand_index,
       avg(t.ratio) as search_ratio
from tour_demand d
join regions r on r.code = d.region_code
left join search_trend t on t.region_code = d.region_code and t.date = d.date
group by d.date, d.region_code, r.name, d.demand_index;

create or replace view region_latest with (security_invoker = on) as
select distinct on (rd.region_code)
       rd.*, r.lat, r.lng, s.summary
from region_daily rd
join regions r on r.code = rd.region_code
left join ai_summaries s on s.region_code = rd.region_code and s.date = rd.date
order by rd.region_code, rd.date desc;

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
