"use client";

import { Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

const COLORS = ["#2563eb", "#f97316", "#16a34a", "#9333ea", "#dc2626", "#0891b2"];

export default function TrendChart({
  data,
  lines,
  height = 300,
}: {
  data: Record<string, string | number | null>[];
  lines: { key: string; name: string }[];
  height?: number;
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data}>
        <XAxis dataKey="reference_date" tickFormatter={(d: string) => d.slice(0, 7)} />
        <YAxis />
        <Tooltip />
        <Legend />
        {lines.map((l, i) => (
          <Line key={l.key} dataKey={l.key} name={l.name} stroke={COLORS[i % COLORS.length]} dot={false} connectNulls />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}
