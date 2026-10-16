import "server-only";
import { createClient } from "@supabase/supabase-js";

// Dashboard는 조회만 한다: anon 키 + RLS select 정책.
export const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_ANON_KEY!,
  { auth: { persistSession: false } },
);

export type RegionLatest = {
  month: string;
  region_code: string;
  name: string;
  indicator_code: string;
  indicator_name: string | null;
  demand_index: number;
  search_ratio: number | null;
  lat: number | null;
  lng: number | null;
  summary: string | null;
};

export type RegionMonthly = Pick<RegionLatest, "month" | "region_code" | "indicator_code" | "demand_index" | "search_ratio">;
