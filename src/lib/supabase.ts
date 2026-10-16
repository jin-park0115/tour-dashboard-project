import "server-only";
import { createClient } from "@supabase/supabase-js";

// Dashboard는 조회만 한다: Publishable Key + RLS select 정책.
export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
  { auth: { persistSession: false } },
);

export type RegionMonthly = {
  reference_date: string;
  region_code: string;
  stay_strength: number | null;
  consumption_strength: number | null;
};

export type RegionLatest = RegionMonthly & {
  region_name: string;
  signgu_count: number;
  center_lat: number | null;
  center_lng: number | null;
  summary: string | null;
  limitations: string | null;
};

export type NaverTrend = { reference_date: string; keyword: string; ratio: number };

export type LocalPlace = { place_key: string; name: string; search_category: string; latitude: number; longitude: number };
