"use client";

import { useState } from "react";
import RegionMap from "@/components/RegionMap";
import TrendChart from "@/components/TrendChart";
import type { RegionLatest, RegionMonthly } from "@/lib/supabase";

// 관광 체류 강도 지표 (tarSjrnDsIxCd). 21(전체)은 API 요청용이라 화면에는 없음
const INDICATORS = {
  "2101": "타권역 방문자 비중",
  "2102": "숙박 비중",
  "2103": "1박 방문자수",
  "2104": "2박 방문자수",
  "2105": "3박 방문자수",
} as const;

export default function Dashboard({ latest, monthly }: { latest: RegionLatest[]; monthly: RegionMonthly[] }) {
  const [indicator, setIndicator] = useState("2103");
  const regions = latest.filter((r) => r.indicator_code === indicator);
  const top = regions[0];

  return (
    <>
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <label htmlFor="indicator" className="font-medium">지표</label>
        <select
          id="indicator"
          value={indicator}
          onChange={(e) => setIndicator(e.target.value)}
          className="rounded border px-2 py-1"
        >
          {Object.entries(INDICATORS).map(([code, name]) => (
            <option key={code} value={code}>{name}</option>
          ))}
        </select>
        {top && <span className="text-zinc-500">{top.month.slice(0, 7)} 기준</span>}
      </div>

      <section className="grid gap-6 lg:grid-cols-2">
        <RegionMap regions={regions} />
        <ul className="divide-y rounded-lg border">
          {regions.map((r) => (
            <li key={r.region_code} className="p-3">
              <div className="flex justify-between font-medium">
                <span>{r.name}</span>
                <span>{Number(r.demand_index).toFixed(1)}</span>
              </div>
              {r.summary && <p className="mt-1 text-sm text-zinc-600">{r.summary}</p>}
            </li>
          ))}
          {!top && <li className="p-3 text-sm text-zinc-500">데이터가 아직 없습니다.</li>}
        </ul>
      </section>

      {top && (
        <section>
          <h2 className="mb-2 font-semibold">{top.name} 월별 추이 · {INDICATORS[indicator as keyof typeof INDICATORS]}</h2>
          <TrendChart
            data={monthly.filter((d) => d.region_code === top.region_code && d.indicator_code === indicator)}
          />
        </section>
      )}
    </>
  );
}
