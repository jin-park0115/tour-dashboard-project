import { cacheLife } from "next/cache";
import Dashboard from "@/components/Dashboard";
import { supabase, type LocalPlace, type NaverTrend, type RegionLatest, type RegionMonthly } from "@/lib/supabase";

async function getData() {
  "use cache";
  cacheLife("hours"); // Make가 하루 1회 적재

  const [latest, monthly, trend, places] = await Promise.all([
    supabase.from("region_latest").select("*").order("stay_strength", { ascending: false }),
    supabase
      .from("region_tourism_monthly")
      .select("reference_date,region_code,stay_strength,consumption_strength")
      .order("reference_date"),
    supabase.from("naver_trend").select("reference_date,keyword,ratio").order("reference_date").limit(5000),
    supabase
      .from("local_places")
      .select("place_key,region_code,name,search_category,category,road_address,source_link,latitude,longitude")
      .not("latitude", "is", null)
      .limit(1000),
  ]);
  for (const r of [latest, monthly, trend, places]) if (r.error) throw r.error;
  return {
    latest: latest.data as RegionLatest[],
    monthly: monthly.data as RegionMonthly[],
    trend: trend.data as NaverTrend[],
    places: places.data as LocalPlace[],
  };
}

export default async function Home() {
  const data = await getData();

  return (
    <main className="mx-auto w-full max-w-7xl space-y-6 p-4 sm:p-8">
      <h1 className="text-2xl font-bold text-slate-800 sm:text-3xl">지도 기반 관광 데이터 Dashboard</h1>
      <p className="rounded-2xl bg-blue-50 px-4 py-3 text-center text-sm font-medium text-slate-700">
        지역을 선택하고 지도·KPI·트렌드·AI 요약을 한 화면에서 확인합니다
      </p>
      <Dashboard {...data} />
      <p className="mx-auto w-fit rounded-xl border border-amber-300 bg-amber-50 px-4 py-2 text-center text-sm text-slate-700">
        Dashboard는 조회와 시각화만 하고, 데이터 수집은 Make가 담당합니다.
      </p>
    </main>
  );
}
