"use client";

import { useState } from "react";
import RegionMap from "@/components/RegionMap";
import TrendChart from "@/components/TrendChart";
import { CATEGORY_COLORS } from "@/lib/categories";
import type { LocalPlace, NaverTrend, RegionLatest, RegionMonthly } from "@/lib/supabase";

const fmt = (v: number | null | undefined) => (v == null ? "-" : Number(v).toFixed(1));
const PERIODS = [
  { months: 0, label: "전체 기간" },
  { months: 12, label: "최근 12개월" },
  { months: 6, label: "최근 6개월" },
  { months: 3, label: "최근 3개월" },
];

function Card({ title, className = "", children }: { title: string; className?: string; children: React.ReactNode }) {
  return (
    <section className={`rounded-xl border bg-white p-4 ${className}`}>
      <h2 className="mb-2 text-sm font-semibold text-slate-700">{title}</h2>
      {children}
    </section>
  );
}

function Kpi({ label, value, sub, className }: { label: string; value: string; sub?: string; className: string }) {
  return (
    <div className={`rounded-xl border-2 p-4 text-center ${className}`}>
      <p className="text-xs text-slate-600">{label}</p>
      <p className="mt-1 text-2xl font-bold text-slate-800">{value}</p>
      {sub && <p className="text-xs text-slate-500">{sub}</p>}
    </div>
  );
}

const field = "w-full rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-sm";

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
  const [code, setCode] = useState(latest[0]?.region_code ?? "");
  const [months, setMonths] = useState(12);
  const [category, setCategory] = useState("");

  if (!latest.length) return <p className="text-slate-500">데이터가 아직 없습니다.</p>;

  const selected = latest.find((r) => r.region_code === code);
  const categories = [...new Set(places.map((p) => p.search_category))];
  const regionPlaces = places.filter((p) => p.region_code === code);
  const shownPlaces = regionPlaces.filter((p) => !category || p.search_category === category);
  const analysisDate = latest.map((r) => r.analysis_date).filter(Boolean).sort().at(-1);
  const history = monthly.filter((m) => m.region_code === code);

  // 기간 필터 → naver_trend (날짜, 키워드, 값) 를 차트용 (날짜, 키워드1, 키워드2, ...) 로
  const lastDate = trend.at(-1)?.reference_date;
  const cutoff = (() => {
    if (!months || !lastDate) return "";
    const d = new Date(lastDate);
    d.setMonth(d.getMonth() - months + 1);
    return d.toISOString().slice(0, 10);
  })();
  const keywords = [...new Set(trend.map((t) => t.keyword))];
  const byDate = new Map<string, Record<string, string | number>>();
  for (const t of trend) {
    if (t.reference_date < cutoff) continue;
    const row = byDate.get(t.reference_date) ?? { reference_date: t.reference_date };
    row[t.keyword] = Number(t.ratio);
    byDate.set(t.reference_date, row);
  }

  return (
    <div className="grid gap-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 lg:grid-cols-[240px_1fr]">
      {/* 필터 + AI 지역 요약 */}
      <aside className="space-y-4 rounded-xl border bg-white p-4">
        <h2 className="font-bold text-slate-800">필터</h2>
        <label className="block space-y-1 text-sm">
          <span className="text-slate-600">지역 선택</span>
          <select className={field} value={code} onChange={(e) => setCode(e.target.value)}>
            {latest.map((r) => (
              <option key={r.region_code} value={r.region_code}>
                {r.region_name}
              </option>
            ))}
          </select>
        </label>
        <label className="block space-y-1 text-sm">
          <span className="text-slate-600">기간 선택 (검색 관심도)</span>
          <select className={field} value={months} onChange={(e) => setMonths(Number(e.target.value))}>
            {PERIODS.map((p) => (
              <option key={p.months} value={p.months}>
                {p.label}
              </option>
            ))}
          </select>
        </label>
        <label className="block space-y-1 text-sm">
          <span className="text-slate-600">장소 카테고리</span>
          <select className={field} value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="">전체</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>

        <div className="border-t pt-4">
          <h2 className="font-bold text-slate-800">AI 지역 요약</h2>
          {selected?.summary ? (
            <>
              <p className="mt-2 text-sm leading-relaxed text-slate-700">{selected.summary}</p>
              {selected.limitations && (
                <p className="mt-2 rounded-lg bg-slate-50 p-2 text-xs text-slate-500">한계: {selected.limitations}</p>
              )}
            </>
          ) : (
            <p className="mt-2 text-sm text-slate-500">이 지역의 AI 요약이 아직 없습니다.</p>
          )}
        </div>
      </aside>

      <div className="space-y-4">
        {/* KPI */}
        <div className="grid gap-4 sm:grid-cols-3">
          <Kpi label="최근 분석일" value={analysisDate ?? "-"} className="border-emerald-300 bg-emerald-50/50" />
          <Kpi
            label="체류 강도"
            value={fmt(selected?.stay_strength)}
            sub={selected && `${selected.region_name} · ${selected.reference_date.slice(0, 7)} · 시군구 ${selected.signgu_count}곳 평균`}
            className="border-blue-300 bg-blue-50/50"
          />
          <Kpi
            label="소비 강도 / 장소 수"
            value={`${fmt(selected?.consumption_strength)} / ${regionPlaces.length}곳`}
            sub="소비 강도는 수집 전이면 -"
            className="border-violet-300 bg-violet-50/50"
          />
        </div>

        <div className="grid gap-4 xl:grid-cols-[3fr_2fr]">
          {/* 지도 */}
          <Card title="NAVER MAPS" className="border-emerald-200">
            <RegionMap regions={latest} places={shownPlaces} selected={selected} onSelect={setCode} />
            <ul className="mt-2 flex flex-wrap gap-3 text-xs text-slate-600">
              {Object.entries(CATEGORY_COLORS).map(([c, color]) => (
                <li key={c} className="flex items-center gap-1">
                  <span className="inline-block size-3 rounded-full" style={{ background: color }} />
                  {c}
                </li>
              ))}
              <li className="text-slate-400">· 파란 원 = 체류 강도 (클릭해서 지역 선택)</li>
            </ul>
          </Card>

          <div className="space-y-4">
            <Card title="NAVER Trend (상대 관심도)" className="border-blue-200">
              {keywords.length ? (
                <TrendChart data={[...byDate.values()]} lines={keywords.map((k) => ({ key: k, name: k }))} height={200} />
              ) : (
                <p className="text-sm text-slate-500">검색 관심도 데이터가 없습니다.</p>
              )}
            </Card>

            <Card title={`선택 지역 상세 · ${selected?.region_name ?? ""}`} className="border-emerald-200">
              <dl className="grid grid-cols-2 gap-2 text-sm">
                <dt className="text-slate-500">체류 / 소비 강도</dt>
                <dd>
                  {fmt(selected?.stay_strength)} / {fmt(selected?.consumption_strength)}
                </dd>
              </dl>
              {history.length > 1 && (
                <TrendChart data={history} lines={[{ key: "stay_strength", name: "체류 강도" }]} height={120} />
              )}
              <h3 className="mt-2 text-sm text-slate-500">대표 장소{category && ` · ${category}`}</h3>
              {shownPlaces.length ? (
                <ul className="mt-1 max-h-40 space-y-1 overflow-y-auto text-sm">
                  {shownPlaces.map((p) => (
                    <li key={p.place_key} className="flex items-center gap-2">
                      <span
                        className="inline-block size-2 shrink-0 rounded-full"
                        style={{ background: CATEGORY_COLORS[p.search_category] ?? "#64748b" }}
                      />
                      <span className="truncate">{p.name}</span>
                      <span className="ml-auto shrink-0 text-xs text-slate-400">{p.search_category}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-1 text-sm text-slate-400">이 지역은 아직 수집된 장소가 없습니다.</p>
              )}
              {selected?.analysis_date && (
                <p className="mt-2 text-xs text-slate-400">최신 AI 요약: {selected.analysis_date} (왼쪽 패널)</p>
              )}
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
