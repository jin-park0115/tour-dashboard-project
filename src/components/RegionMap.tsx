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
const fmt = (v: number | null | undefined) => (v == null ? "-" : Number(v).toFixed(1));

// 외부(NAVER 검색) 데이터가 InfoWindow HTML에 들어가므로 이스케이프
const esc = (v: unknown) =>
  String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

const box = (title: string, rows: string[]) =>
  `<div style="padding:10px 12px;min-width:180px;max-width:260px;font-size:12px;line-height:1.5;color:#334155">
    <div style="font-weight:700;font-size:14px;color:#0f172a;margin-bottom:4px">${title}</div>${rows.join("")}</div>`;
const row = (label: string, value: string) => `<div><span style="color:#94a3b8">${label}</span> ${value}</div>`;

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
  const info = useRef<any>(null);
  const openedAt = useRef(0);
  // 클라이언트 내비게이션으로 재진입 시 스크립트가 이미 로드돼 있을 수 있음
  const [ready, setReady] = useState(() => typeof window !== "undefined" && !!window.naver?.maps);

  const max = Math.max(1, ...regions.map((r) => r.stay_strength ?? 0));
  const radius = (r: RegionLatest) => 5000 + 25000 * ((r.stay_strength ?? 0) / max);

  // 지역 원 + 그 지역 장소들이 화면에 꽉 차도록 확대
  const focusRegion = (r: RegionLatest) => {
    if (!map.current || r.center_lat == null || r.center_lng == null) return;
    const { maps } = window.naver;
    const dLat = radius(r) / 111320;
    const dLng = radius(r) / (111320 * Math.cos((r.center_lat * Math.PI) / 180));
    const bounds = new maps.LatLngBounds(
      new maps.LatLng(r.center_lat - dLat, r.center_lng - dLng),
      new maps.LatLng(r.center_lat + dLat, r.center_lng + dLng),
    );
    for (const p of places) if (p.region_code === r.region_code) bounds.extend(new maps.LatLng(p.latitude, p.longitude));
    const margin = { top: 40, right: 40, bottom: 40, left: 40 };
    if (typeof map.current.panToBounds === "function") {
      map.current.panToBounds(bounds, { duration: 600, easing: "easeOutCubic" }, margin);
    } else {
      map.current.fitBounds(bounds, margin);
    }
  };

  useEffect(() => {
    if (!ready || !el.current) return;
    const { maps } = window.naver;
    map.current = new maps.Map(el.current, { center: new maps.LatLng(KOREA.lat, KOREA.lng), zoom: KOREA.zoom });
    info.current = new maps.InfoWindow({ borderColor: "#cbd5e1", borderWidth: 1, anchorSize: new maps.Size(10, 10) });
    // 빈 곳 누르면 닫기. 점 클릭이 지도 클릭으로도 전달되는 경우가 있어 방금 연 창은 무시
    maps.Event.addListener(map.current, "click", () => {
      if (Date.now() - openedAt.current > 300) info.current.close();
    });
    return () => {
      map.current.destroy();
      map.current = null;
    };
  }, [ready]);

  // 지역 원(체류 강도 크기, 누르면 그 지역으로 확대) + 장소 점(카테고리 색, 누르면 말풍선 + 확대)
  useEffect(() => {
    if (!ready || !map.current) return;
    const { maps } = window.naver;
    const circles = regions
      .filter((r) => r.center_lat != null && r.center_lng != null)
      .map((r) => {
        const c = new maps.Circle({
          map: map.current,
          center: new maps.LatLng(r.center_lat, r.center_lng),
          radius: radius(r),
          fillColor: r.region_code === selected?.region_code ? "#1d4ed8" : "#60a5fa",
          fillOpacity: 0.3,
          strokeWeight: 0,
          clickable: true,
          cursor: "pointer",
        });
        maps.Event.addListener(c, "click", () => {
          info.current.close();
          onSelect(r.region_code);
          focusRegion(r); // 이미 선택된 지역을 다시 눌러도 확대되도록 직접 호출
        });
        return c;
      });
    const markers = places.map((p) => {
      const m = new maps.Marker({
        map: map.current,
        position: new maps.LatLng(p.latitude, p.longitude),
        title: `${p.name} (${p.search_category})`,
        clickable: true,
        zIndex: 100, // 지역 원보다 위
        cursor: "pointer",
        icon: {
          content: `<div style="width:14px;height:14px;border-radius:50%;border:2px solid #fff;box-shadow:0 0 2px #0006;background:${CATEGORY_COLORS[p.search_category] ?? "#64748b"}"></div>`,
          anchor: new maps.Point(7, 7),
        },
      });
      maps.Event.addListener(m, "click", () => {
        const link = /^https?:\/\//.test(p.source_link ?? "")
          ? `<a href="${esc(p.source_link)}" target="_blank" rel="noopener noreferrer" style="color:#2563eb">상세 보기 ↗</a>`
          : "";
        info.current.setContent(
          box(esc(p.name), [
            row("분류", `${esc(p.search_category)}${p.category ? ` · ${esc(p.category)}` : ""}`),
            row("주소", esc(p.road_address || "-")),
            link && `<div style="margin-top:4px">${link}</div>`,
          ]),
        );
        map.current.setCenter(m.getPosition());
        map.current.setZoom(Math.max(map.current.getZoom(), 15), true);
        openedAt.current = Date.now();
        info.current.open(map.current, m);
      });
      return m;
    });
    return () => {
      circles.forEach((c) => c.setMap(null));
      markers.forEach((m) => m.setMap(null));
    };
    // radius/focusRegion은 regions·places에서 파생 → 매 렌더 새로 만들어지므로 deps에서 제외
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, regions, places, selected, onSelect]);

  // 드롭다운으로 지역을 바꿔도 같은 방식으로 확대
  useEffect(() => {
    if (ready && selected) focusRegion(selected);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, selected?.region_code]);

  return (
    <div className="relative">
      <Script
        src={`https://oapi.map.naver.com/openapi/v3/maps.js?ncpKeyId=${process.env.NEXT_PUBLIC_NAVER_MAP_KEY_ID}`}
        onReady={() => setReady(true)}
      />
      <div ref={el} className="h-[420px] w-full rounded-xl bg-emerald-50" aria-label="관광 지도" />
      {selected && (
        <div className="pointer-events-none absolute left-3 top-3 z-10 w-44 rounded-lg border border-slate-200 bg-white/95 p-3 text-xs shadow-md">
          <p className="text-sm font-bold text-slate-800">{selected.region_name}</p>
          <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5 text-slate-600">
            <dt className="text-slate-400">체류 강도</dt>
            <dd>
              {fmt(selected.stay_strength)} <span className="text-slate-400">({selected.reference_date.slice(0, 7)})</span>
            </dd>
            <dt className="text-slate-400">소비 강도</dt>
            <dd>{fmt(selected.consumption_strength)}</dd>
            <dt className="text-slate-400">장소</dt>
            <dd>{places.filter((p) => p.region_code === selected.region_code).length}곳</dd>
          </dl>
        </div>
      )}
    </div>
  );
}
