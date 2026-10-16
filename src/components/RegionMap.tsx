"use client";

import Script from "next/script";
import { useEffect, useRef, useState } from "react";
import type { RegionLatest } from "@/lib/supabase";

/* eslint-disable @typescript-eslint/no-explicit-any */
declare global {
  interface Window { naver: any }
}

export default function RegionMap({ regions }: { regions: RegionLatest[] }) {
  const el = useRef<HTMLDivElement>(null);
  // 클라이언트 내비게이션으로 재진입 시 스크립트가 이미 로드돼 있을 수 있음
  const [ready, setReady] = useState(() => typeof window !== "undefined" && !!window.naver?.maps);

  useEffect(() => {
    if (!ready || !el.current) return;
    const { maps } = window.naver;
    const map = new maps.Map(el.current, { center: new maps.LatLng(36.3, 127.8), zoom: 7 });
    const max = Math.max(1, ...regions.map((r) => r.demand_index));
    const circles = regions
      .filter((r) => r.lat != null && r.lng != null)
      .map((r) =>
        new maps.Circle({
          map,
          center: new maps.LatLng(r.lat, r.lng),
          radius: 5000 + 25000 * (r.demand_index / max),
          fillColor: "#2563eb",
          fillOpacity: 0.35,
          strokeWeight: 0,
        }),
      );
    return () => {
      circles.forEach((c) => c.setMap(null));
      map.destroy();
    };
  }, [ready, regions]);

  return (
    <>
      <Script
        src={`https://oapi.map.naver.com/openapi/v3/maps.js?ncpKeyId=${process.env.NEXT_PUBLIC_NAVER_MAP_KEY_ID}`}
        onReady={() => setReady(true)}
      />
      <div ref={el} className="h-[480px] w-full rounded-lg bg-zinc-100" aria-label="지역별 관광 수요 지도" />
    </>
  );
}
