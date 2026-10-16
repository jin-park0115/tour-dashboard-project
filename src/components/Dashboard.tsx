"use client";

import { useState } from "react";
import RegionMap from "@/components/RegionMap";
import TrendChart from "@/components/TrendChart";
import type { LocalPlace, NaverTrend, RegionLatest, RegionMonthly } from "@/lib/supabase";

const fmt = (v: number | null) => (v == null ? "-" : Number(v).toFixed(1));

export default function Dashboard({
  latest,
  monthly,
  trend,
  places,
}: {
  latest: RegionLatest[];
  monthly: RegionMonthly[];
  trend: NaverTrend[];
  places: LocalPlace[];
}) {
  const [code, setCode] = useState(latest[0]?.region_code);
  const selected = latest.find((r) => r.region_code === code);

  // naver_trend (날짜, 키워드, 값) → 차트용 (날짜, 키워드1, 키워드2, ...)
  const keywords = [...new Set(trend.map((t) => t.keyword))];
  const byDate = new Map<string, Record<string, string | number>>();
  for (const t of trend) {
    const row = byDate.get(t.reference_date) ?? { reference_date: t.reference_date };
    row[t.keyword] = Number(t.ratio);
    byDate.set(t.reference_date, row);
  }

  if (!latest.length) return <p className="text-zinc-500">데이터가 아직 없습니다.</p>;

  return (
    <>
      <p className="text-sm text-zinc-500">
        관광 체류 강도 (시군구 평균) · {latest[0].reference_date.slice(0, 7)} 기준 · 지역을 누르면 추이가 바뀝니다
      </p>

      <section className="grid gap-6 lg:grid-cols-2">
        <RegionMap regions={latest} places={places} />
        <ul className="max-h-[480px] divide-y overflow-y-auto rounded-lg border">
          {latest.map((r) => (
            <li key={r.region_code}>
              <button
                onClick={() => setCode(r.region_code)}
                aria-pressed={r.region_code === code}
                className={`w-full p-3 text-left hover:bg-zinc-50 ${r.region_code === code ? "bg-blue-50" : ""}`}
              >
                <div className="flex justify-between font-medium">
                  <span>{r.region_name}</span>
                  <span>
                    체류 {fmt(r.stay_strength)}
                    {r.consumption_strength != null && ` · 소비 ${fmt(r.consumption_strength)}`}
                  </span>
                </div>
                {r.summary && <p className="mt-1 text-sm text-zinc-600">{r.summary}</p>}
                {r.limitations && <p className="mt-1 text-xs text-zinc-400">한계: {r.limitations}</p>}
              </button>
            </li>
          ))}
        </ul>
      </section>

      {selected && (
        <section>
          <h2 className="mb-2 font-semibold">{selected.region_name} 월별 추이</h2>
          <TrendChart
            data={monthly.filter((m) => m.region_code === code)}
            lines={[
              { key: "stay_strength", name: "체류 강도" },
              { key: "consumption_strength", name: "소비 강도" },
            ]}
          />
        </section>
      )}

      {keywords.length > 0 && (
        <section>
          <h2 className="mb-2 font-semibold">NAVER 검색 트렌드</h2>
          <TrendChart data={[...byDate.values()]} lines={keywords.map((k) => ({ key: k, name: k }))} />
        </section>
      )}
    </>
  );
}
