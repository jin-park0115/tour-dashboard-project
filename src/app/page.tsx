import { cacheLife } from "next/cache";
import Dashboard from "@/components/Dashboard";
import { supabase, type RegionMonthly, type RegionLatest } from "@/lib/supabase";

async function getData() {
  "use cache";
  cacheLife("hours"); // Make가 하루 1회 적재

  // 지표 5개를 한 번에 받아 클라이언트에서 선택 (17개 시도 x 5개 지표 x 월 수라 작음)
  const [latest, monthly] = await Promise.all([
    supabase.from("region_latest").select("*").order("demand_index", { ascending: false }),
    supabase
      .from("region_monthly")
      .select("month,region_code,indicator_code,demand_index,search_ratio")
      .order("month")
      .limit(5000),
  ]);
  if (latest.error) throw latest.error;
  if (monthly.error) throw monthly.error;
  return { latest: latest.data as RegionLatest[], monthly: monthly.data as RegionMonthly[] };
}

export default async function Home() {
  const { latest, monthly } = await getData();

  return (
    <main className="mx-auto w-full max-w-6xl space-y-8 p-4 sm:p-8">
      <h1 className="text-2xl font-bold">지역별 관광 체류 강도 대시보드</h1>
      <Dashboard latest={latest} monthly={monthly} />
    </main>
  );
}
