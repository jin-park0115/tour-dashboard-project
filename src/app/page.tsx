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
      .select("place_key,name,search_category,latitude,longitude")
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
    <main className="mx-auto w-full max-w-6xl space-y-8 p-4 sm:p-8">
      <h1 className="text-2xl font-bold">지역별 관광 수요 대시보드</h1>
      <Dashboard {...data} />
    </main>
  );
}
