"use client";

import Script from "next/script";
import { useEffect, useRef, useState } from "react";
import { CATEGORY_COLORS } from "@/lib/categories";
import type { LocalPlace, RegionLatest } from "@/lib/supabase";

/* eslint-disable @typescript-eslint/no-explicit-any */
declare global {
  interface Window { naver: any }
}

const KOREA = { lat: 36.3, lng: 127.8, zoom: 7 };

export default function RegionMap({
  regions,
  places,
  selected,
  onSelect,
}: {
  regions: RegionLatest[];
  places: LocalPlace[];
  selected?: RegionLatest;
  onSelect: (code: string) => void;
}) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<any>(null);
  // 클라이언트 내비게이션으로 재진입 시 스크립트가 이미 로드돼 있을 수 있음
  const [ready, setReady] = useState(() => typeof window !== "undefined" && !!window.naver?.maps);

  useEffect(() => {
    if (!ready || !el.current) return;
    const { maps } = window.naver;
    map.current = new maps.Map(el.current, { center: new maps.LatLng(KOREA.lat, KOREA.lng), zoom: KOREA.zoom });
    return () => {
      map.current.destroy();
      map.current = null;
    };
  }, [ready]);

  // 지역 원(체류 강도 크기, 클릭하면 선택) + 장소 마커(카테고리 색)
  useEffect(() => {
    if (!ready || !map.current) return;
    const { maps } = window.naver;
    const max = Math.max(1, ...regions.map((r) => r.stay_strength ?? 0));
    const circles = regions
      .filter((r) => r.center_lat != null && r.center_lng != null)
      .map((r) => {
        const c = new maps.Circle({
          map: map.current,
          center: new maps.LatLng(r.center_lat, r.center_lng),
          radius: 5000 + 25000 * ((r.stay_strength ?? 0) / max),
          fillColor: r.region_code === selected?.region_code ? "#1d4ed8" : "#60a5fa",
          fillOpacity: 0.3,
          strokeWeight: 0,
          clickable: true,
        });
        maps.Event.addListener(c, "click", () => onSelect(r.region_code));
        return c;
      });
    const markers = places.map(
      (p) =>
        new maps.Marker({
          map: map.current,
          position: new maps.LatLng(p.latitude, p.longitude),
          title: `${p.name} (${p.search_category})`,
          icon: {
            content: `<div style="width:14px;height:14px;border-radius:50%;border:2px solid #fff;box-shadow:0 0 2px #0006;background:${CATEGORY_COLORS[p.search_category] ?? "#64748b"}"></div>`,
            anchor: new maps.Point(7, 7),
          },
        }),
    );
    return () => {
      circles.forEach((c) => c.setMap(null));
      markers.forEach((m) => m.setMap(null));
    };
  }, [ready, regions, places, selected, onSelect]);

  // 선택 지역으로 이동 (장소가 있으면 조금 더 확대)
  useEffect(() => {
    if (!ready || !map.current) return;
    const { maps } = window.naver;
    if (selected?.center_lat != null && selected.center_lng != null) {
      map.current.morph(new maps.LatLng(selected.center_lat, selected.center_lng), places.length ? 9 : 8);
    } else {
      map.current.morph(new maps.LatLng(KOREA.lat, KOREA.lng), KOREA.zoom);
    }
  }, [ready, selected, places.length]);

  return (
    <>
      <Script
        src={`https://oapi.map.naver.com/openapi/v3/maps.js?ncpKeyId=${process.env.NEXT_PUBLIC_NAVER_MAP_KEY_ID}`}
        onReady={() => setReady(true)}
      />
      <div ref={el} className="h-[420px] w-full rounded-xl bg-emerald-50" aria-label="관광 지도" />
    </>
  );
}
