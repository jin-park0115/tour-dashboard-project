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

// 외부(NAVER 검색) 데이터가 InfoWindow HTML에 들어가므로 이스케이프
const esc = (v: unknown) =>
  String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

const box = (title: string, rows: string[]) =>
  `<div style="padding:10px 12px;min-width:180px;max-width:260px;font-size:12px;line-height:1.5;color:#334155">
    <div style="font-weight:700;font-size:14px;color:#0f172a;margin-bottom:4px">${title}</div>${rows.join("")}</div>`;
const row = (label: string, value: string) =>
  `<div><span style="color:#94a3b8">${label}</span> ${value}</div>`;

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
  // 클라이언트 내비게이션으로 재진입 시 스크립트가 이미 로드돼 있을 수 있음
  const [ready, setReady] = useState(() => typeof window !== "undefined" && !!window.naver?.maps);

  useEffect(() => {
    if (!ready || !el.current) return;
    const { maps } = window.naver;
    map.current = new maps.Map(el.current, { center: new maps.LatLng(KOREA.lat, KOREA.lng), zoom: KOREA.zoom });
    info.current = new maps.InfoWindow({ borderColor: "#cbd5e1", borderWidth: 1, anchorSize: new maps.Size(10, 10) });
    maps.Event.addListener(map.current, "click", () => info.current.close()); // 빈 곳 누르면 닫기
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
        maps.Event.addListener(c, "click", (e: any) => {
          onSelect(r.region_code);
          info.current.setContent(
            box(esc(r.region_name), [
              row("체류 강도", `${r.stay_strength == null ? "-" : Number(r.stay_strength).toFixed(1)} (${esc(r.reference_date.slice(0, 7))})`),
              row("소비 강도", r.consumption_strength == null ? "-" : Number(r.consumption_strength).toFixed(1)),
              row("평균 시군구", `${r.signgu_count}곳`),
            ]),
          );
          info.current.open(map.current, e.coord);
        });
        return c;
      });
    const markers = places.map((p) => {
      const m = new maps.Marker({
        map: map.current,
        position: new maps.LatLng(p.latitude, p.longitude),
        title: `${p.name} (${p.search_category})`,
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
        info.current.open(map.current, m);
      });
      return m;
    });
    // 정보창은 여기서 닫지 않는다: 원 클릭 → 지역 선택 → 다시 그리기가 일어나도 방금 연 창이 유지되도록
    return () => {
      circles.forEach((c) => c.setMap(null));
      markers.forEach((m) => m.setMap(null));
    };
  }, [ready, regions, places, selected, onSelect]);

  // 선택 지역으로 이동 (장소가 있으면 조금 더 확대). morph 애니메이션은 중간에 멈추는 경우가 있어 즉시 이동
  useEffect(() => {
    if (!ready || !map.current) return;
    const { maps } = window.naver;
    const hasCenter = selected?.center_lat != null && selected.center_lng != null;
    map.current.setCenter(
      hasCenter ? new maps.LatLng(selected.center_lat, selected.center_lng) : new maps.LatLng(KOREA.lat, KOREA.lng),
    );
    map.current.setZoom(hasCenter ? (places.length ? 9 : 8) : KOREA.zoom, false);
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
