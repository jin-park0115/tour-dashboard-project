"use client";

import { Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { RegionDaily } from "@/lib/supabase";

export default function TrendChart({ data }: { data: RegionDaily[] }) {
  return (
    <ResponsiveContainer width="100%" height={320}>
      <LineChart data={data}>
        <XAxis dataKey="date" />
        <YAxis />
        <Tooltip />
        <Legend />
        <Line dataKey="demand_index" name="관광 수요 강도" stroke="#2563eb" dot={false} />
        <Line dataKey="search_ratio" name="검색 트렌드" stroke="#f97316" dot={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}
