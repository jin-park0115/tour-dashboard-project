import { cacheLife } from "next/cache";
import RegionMap from "@/components/RegionMap";
import TrendChart from "@/components/TrendChart";
import { supabase, type RegionDaily, type RegionLatest } from "@/lib/supabase";

async function getData() {
  "use cache";
  cacheLife("hours"); // Make가 하루 1회 적재하므로 충분

  const [latest, daily] = await Promise.all([
    supabase.from("region_latest").select("*").order("demand_index", { ascending: false }),
    supabase.from("region_daily").select("date,region_code,demand_index,search_ratio").order("date").limit(5000),
  ]);
  if (latest.error) throw latest.error;
  if (daily.error) throw daily.error;
  return { regions: latest.data as RegionLatest[], daily: daily.data as RegionDaily[] };
}

export default async function Home() {
  const { regions, daily } = await getData();
  const top = regions[0];

  return (
    <main className="mx-auto w-full max-w-6xl space-y-8 p-4 sm:p-8">
      <h1 className="text-2xl font-bold">지역별 관광 수요 대시보드</h1>

      <section className="grid gap-6 lg:grid-cols-2">
        <RegionMap regions={regions} />
        <ul className="divide-y rounded-lg border">
          {regions.map((r) => (
            <li key={r.region_code} className="p-3">
              <div className="flex justify-between font-medium">
                <span>{r.name}</span>
                <span>{r.demand_index}</span>
              </div>
              {r.summary && <p className="mt-1 text-sm text-zinc-600">{r.summary}</p>}
            </li>
          ))}
        </ul>
      </section>

      {top && (
        <section>
          <h2 className="mb-2 font-semibold">{top.name} 추이</h2>
          <TrendChart data={daily.filter((d) => d.region_code === top.region_code)} />
        </section>
      )}
    </main>
  );
}
