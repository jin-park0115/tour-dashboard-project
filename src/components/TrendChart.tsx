"use client";

import { Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { RegionMonthly } from "@/lib/supabase";

export default function TrendChart({ data }: { data: RegionMonthly[] }) {
  return (
    <ResponsiveContainer width="100%" height={320}>
      <LineChart data={data}>
        <XAxis dataKey="month" tickFormatter={(m: string) => m.slice(0, 7)} />
        <YAxis />
        <Tooltip />
        <Legend />
        <Line dataKey="demand_index" name="체류 강도 지표" stroke="#2563eb" dot={false} />
        <Line dataKey="search_ratio" name="검색 트렌드" stroke="#f97316" dot={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}
