import React, { useEffect, useRef, useState } from "react";
import { Map as MapLibreMap, Marker, LngLatBounds } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { getPreparedStyle } from "./mapConfig";
import { haversineKm, formatDistance } from "../utils/geo";
import { CITY_COORDS } from "../data/cityCoords";

const LINE_SOURCE_PENDING = "day-map-route-pending";
const LINE_LAYER_PENDING = "day-map-route-pending-line";
const LINE_SOURCE_DONE = "day-map-route-done";
const LINE_LAYER_DONE = "day-map-route-done-line";
// 일정 지도(overview)의 최대 줌. 핀 1개일 때의 flyTo, fitBounds, 번호 원/카드
// 클릭으로 핀 이동(easeTo) 모두 이 값을 넘지 않는다. 위치 지정 지도(LocationPickerModal)는
// 별도 설정을 쓰므로 영향 없음.
const OVERVIEW_MAX_ZOOM = 13;
const HEIGHT_DVH = { default: 30, large: 60, small: 15 };
const NEXT_HEIGHT_MODE = { default: "large", large: "small", small: "default" };
const GRAY = "#9CA3AF";
const DONE_LINE_COLOR = "#D1D5DB";
// 아래쪽은 핀 반지름 + 출처 표시(attribution) 줄 높이를 모두 가리지 않도록
// 위쪽보다 더 크게 둔다(핀이 출처 표시 줄과 겹치는 문제 보정).
const FIT_PADDING = { top: 56, bottom: 72, left: 32, right: 32 };
// 상하 패딩 합이 넘지 않아야 하는 컨테이너 높이 비율, 그리고 그 비율로도 핀이
// 가장자리에 붙지 않도록 보장하는 최소 패딩(한쪽당).
const FIT_PADDING_V_RATIO = 0.4;
const FIT_PADDING_MIN = 8;
// fitBounds의 padding은 지리 좌표 기준 여백이라, 핀 DOM(최대 36px, 반지름 18px +
// 테두리)이 그 여백보다 크면 padding을 지켜도 핀 그래픽 자체가 가장자리 밖으로
// 튀어나올 수 있다(실측: 8px 바닥으로는 "작게" 높이에서 최상단 핀이 위로 약 8px
// 넘침 — getBoundingClientRect로 확인). 그래서 세로 패딩 바닥은 8px이 아니라 이
// 핀 반지름 가드를 쓴다.
const FIT_PADDING_PIN_GUARD = 20;
// 도시 칩: 그날 좌표들의 평균 위치에서 가장 가까운 CITY_COORDS 도시까지 거리가
// 이 값을 넘으면(또는 근처 도시를 못 찾으면) 칩을 숨긴다.
const CITY_CHIP_MAX_KM = 150;

const hasCoords = (s) =>
  typeof s?.lat === "number" && typeof s?.lng === "number";

function truncateTitle(title) {
  const t = title || "";
  return t.length > 12 ? `${t.slice(0, 12)}…` : t;
}

// 그날 좌표가 있는 일정들의 평균 위치에서 가장 가까운 CITY_COORDS 도시 이름(한국어 키)을
// 찾는다. 여행 전체의 tripCity가 아니라 "그날" 좌표 기준이라, 도쿄 여행 중 하루만 서울에
// 다녀오면 그날은 "서울"이 나온다. 가장 가까운 도시도 CITY_CHIP_MAX_KM을 넘게 떨어져
// 있으면(또는 좌표가 없거나 CITY_COORDS가 비어있으면) null을 돌려줘 칩을 숨기게 한다.
function findNearestCity(coordSlots) {
  const cityNames = Object.keys(CITY_COORDS);
  if (coordSlots.length === 0 || cityNames.length === 0) return null;
  const avgLat = coordSlots.reduce((sum, s) => sum + s.lat, 0) / coordSlots.length;
  const avgLng = coordSlots.reduce((sum, s) => sum + s.lng, 0) / coordSlots.length;
  let nearestName = null;
  let nearestKm = Infinity;
  for (const name of cityNames) {
    const km = haversineKm({ lat: avgLat, lng: avgLng }, CITY_COORDS[name]);
    if (km < nearestKm) {
      nearestKm = km;
      nearestName = name;
    }
  }
  return nearestKm <= CITY_CHIP_MAX_KM ? nearestName : null;
}

// 방문 완료가 아닌(=좌표 있는 일정 중) 첫 번째 일정 id. "다음에 갈 일정" 강조용.
function getNextUpId(slots) {
  const next = slots.find((s) => hasCoords(s) && !s.visited);
  return next ? next.id : null;
}

// 핀 1개면 해당 좌표로 중심 이동, 2개 이상이면 칩/출처 표시를 피해 fitBounds.
// 모바일 "작게"(15dvh)처럼 컨테이너 자체가 매우 낮으면 top+bottom 패딩 합이
// 컨테이너 높이를 넘어서 오히려 핀이 밖으로 밀려날 수 있다. 이때는 아래쪽
// (출처 표시 줄)을 먼저 지키고 위쪽(칩)부터 줄인다 — 상하 패딩 예산을 컨테이너
// 높이의 40%로 제한한 뒤, bottom이 그 예산을 우선 가져가고 top은 남는 만큼만 쓴다.
// 다만 예산이 아무리 작아도 한쪽당 최소 FIT_PADDING_MIN(8px)은 보장해 핀이
// 컨테이너 가장자리에 완전히 붙지 않게 한다.
function fitAllPins(map, coordSlots) {
  if (!map || coordSlots.length === 0) return;
  if (coordSlots.length === 1) {
    map.flyTo({ center: [coordSlots[0].lng, coordSlots[0].lat], zoom: OVERVIEW_MAX_ZOOM, duration: 0 });
    return;
  }
  const canvas = map.getCanvas();
  const w = canvas?.clientWidth || 0;
  const h = canvas?.clientHeight || 0;
  const vBudget = h ? h * FIT_PADDING_V_RATIO : FIT_PADDING.top + FIT_PADDING.bottom;
  const vFloor = Math.max(FIT_PADDING_MIN, FIT_PADDING_PIN_GUARD);
  const bottom = h
    ? Math.max(vFloor, Math.min(FIT_PADDING.bottom, vBudget))
    : FIT_PADDING.bottom;
  const top = h
    ? Math.max(vFloor, Math.min(FIT_PADDING.top, Math.max(0, vBudget - bottom)))
    : FIT_PADDING.top;
  const padding = {
    top,
    bottom,
    left: w ? Math.min(FIT_PADDING.left, w * 0.3) : FIT_PADDING.left,
    right: w ? Math.min(FIT_PADDING.right, w * 0.3) : FIT_PADDING.right,
  };
  const lineCoords = coordSlots.map((s) => [s.lng, s.lat]);
  const bounds = lineCoords.reduce(
    (b, c) => b.extend(c),
    new LngLatBounds(lineCoords[0], lineCoords[0]),
  );
  map.fitBounds(bounds, { padding, maxZoom: OVERVIEW_MAX_ZOOM, duration: 0 });
}

// 좌표 있는 일정을 순서대로 잇는 구간을, 양 끝이 모두 방문완료인 구간(done)과
// 그렇지 않은 구간(pending)으로 나눠 두 개의 FeatureCollection으로 반환한다.
function buildSegments(coordSlots) {
  const pending = [];
  const done = [];
  for (let i = 1; i < coordSlots.length; i++) {
    const a = coordSlots[i - 1];
    const b = coordSlots[i];
    const feature = {
      type: "Feature",
      geometry: { type: "LineString", coordinates: [[a.lng, a.lat], [b.lng, b.lat]] },
      properties: {},
    };
    (a.visited && b.visited ? done : pending).push(feature);
  }
  return {
    pending: { type: "FeatureCollection", features: pending },
    done: { type: "FeatureCollection", features: done },
  };
}

// 선택/다음-일정/방문 여부에 따라 핀 DOM을 직접 갱신한다(마커를 다시 만들지 않기 위해).
// selected와 isNext는 서로 다른 스타일(테두리색·box-shadow)로 겹치지 않게 구분한다.
function setMarkerAppearance(entry, { selected, isNext }) {
  const { el, labelEl, numberEl, visited, number } = entry;
  let size = 28;
  let border = "2px solid #fff";
  let boxShadow = "0 1px 4px rgba(0,0,0,0.35)";
  let fontSize = "12.5px";
  if (selected) {
    size = 36;
    border = "3px solid var(--t-primary-dark, var(--t-primary))";
    fontSize = "14px";
  } else if (isNext) {
    size = 34;
    border = "3px solid #fff";
    boxShadow = "0 1px 4px rgba(0,0,0,0.35), 0 0 0 3px var(--t-primary)";
    fontSize = "13.5px";
  }
  el.style.width = `${size}px`;
  el.style.height = `${size}px`;
  el.style.fontSize = fontSize;
  el.style.background = visited ? GRAY : "var(--t-primary)";
  el.style.border = border;
  el.style.boxShadow = boxShadow;
  el.style.zIndex = selected ? "5" : isNext ? "4" : "1";
  numberEl.textContent = visited ? "✓" : String(number);
  labelEl.style.display = selected ? "block" : "none";
}

function createMarkerEntry(slot, opts) {
  const el = document.createElement("div");
  // maplibre-gl.css가 .maplibregl-marker에 기대하는 position:absolute를 유지해야
  // 지도 컨테이너 기준으로 정확히 배치된다(relative로 두면 문서 흐름에 남아 마커가
  // 쌓이며 밀린다). labelEl(말풍선)의 absolute 기준점으로도 그대로 쓸 수 있다.
  el.style.position = "absolute";
  el.style.display = "flex";
  el.style.alignItems = "center";
  el.style.justifyContent = "center";
  el.style.borderRadius = "50%";
  el.style.color = "#fff";
  el.style.fontWeight = "700";
  el.style.fontFamily = "inherit";
  el.style.cursor = "pointer";
  el.style.userSelect = "none";

  const numberEl = document.createElement("span");
  numberEl.style.pointerEvents = "none";
  el.appendChild(numberEl);

  const labelEl = document.createElement("div");
  labelEl.style.position = "absolute";
  labelEl.style.bottom = "calc(100% + 6px)";
  labelEl.style.left = "50%";
  labelEl.style.transform = "translateX(-50%)";
  labelEl.style.background = "var(--t-bg-card)";
  labelEl.style.color = "var(--t-text)";
  labelEl.style.border = "1px solid var(--t-border)";
  labelEl.style.borderRadius = "6px";
  labelEl.style.padding = "3px 8px";
  labelEl.style.fontSize = "11.5px";
  labelEl.style.fontWeight = "700";
  labelEl.style.whiteSpace = "nowrap";
  labelEl.style.boxShadow = "0 1px 4px rgba(0,0,0,0.2)";
  labelEl.style.display = "none";
  labelEl.style.pointerEvents = "none";
  labelEl.textContent = truncateTitle(slot.title);
  el.appendChild(labelEl);

  const entry = { el, labelEl, numberEl, visited: !!slot.visited, number: slot.number };
  setMarkerAppearance(entry, opts);
  return entry;
}

// 일정 지도 보기. 좌표가 있는 일정이 하나 이상일 때만 부모가 렌더링한다(React.lazy).
// 외부로 나가는 요청은 MapLibre가 발생시키는 지도 타일 이미지 요청뿐이며,
// 일정 제목·장소·메모는 어떤 네트워크 요청에도 포함하지 않는다(HTML 마커는 DOM에만 쓰임).
export default function DayMapView({ slots, selectedSlotId, onSelectSlot, variant = "mobile" }) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const markersRef = useRef({});
  const prevSelectedRef = useRef(null);
  const onSelectSlotRef = useRef(onSelectSlot);
  onSelectSlotRef.current = onSelectSlot;
  // ResizeObserver 콜백(마운트 시 1회 생성)이 최신 좌표 목록/선택 상태를 읽을 수 있도록
  // 렌더마다 갱신해두는 참조. 선택된 핀이 있으면 리사이즈로 다시 화면을 맞추지 않는다.
  const coordSlotsRef = useRef([]);
  const selectedSlotIdRef = useRef(null);
  selectedSlotIdRef.current = selectedSlotId;

  const [mapReady, setMapReady] = useState(false);
  const [mapError, setMapError] = useState(false);
  const [retryKey, setRetryKey] = useState(0);
  const [heightMode, setHeightMode] = useState("default");
  const [showInfo, setShowInfo] = useState(false);

  // 좌표 구성이 실제로 바뀔 때만(=일차 전환 등) 마커/선/화면 맞춤을 다시 계산한다.
  // 방문 체크·제목 변경처럼 좌표와 무관한 갱신에는 반응하지 않아, 지도를 다시
  // 만들지 않고도(또한 화면을 불필요하게 다시 맞추지 않고도) 값만 갱신할 수 있다.
  const coordsKey = slots
    .map((s) => `${s.id}:${hasCoords(s) ? `${s.lat},${s.lng}` : ""}`)
    .join("|");
  const contentKey = slots
    .map((s) => `${s.id}:${s.number}:${s.title}:${s.visited ? 1 : 0}`)
    .join("|");

  // 합계는 점선과 같은 구간(좌표 있는 일정을 순서대로 잇는 모든 쌍, 위치 없는
  // 일정을 건너뛰는 구간 포함)을 더한다 — 지도 위 점선이 정확히 이 합계와 일치한다.
  const renderCoordSlots = slots.filter(hasCoords);
  let sumKm = 0;
  for (let i = 1; i < renderCoordSlots.length; i++) {
    sumKm += haversineKm(
      { lat: renderCoordSlots[i - 1].lat, lng: renderCoordSlots[i - 1].lng },
      { lat: renderCoordSlots[i].lat, lng: renderCoordSlots[i].lng },
    );
  }
  const coordCount = renderCoordSlots.length;
  const hasPair = coordCount >= 2;
  const cityChipName = findNearestCity(renderCoordSlots);
  const totalLabel = hasPair ? formatDistance(sumKm) : null;
  const locationlessCount = slots.length - coordCount;
  // 칩이 좁은 모바일 화면에서 길어지지 않도록, M곳 기준 표기는 모바일에서만
  // ⓘ 설명 쪽으로 옮긴다(PC 패널은 폭이 넉넉해 칩에 그대로 둔다).
  const chipText =
    variant === "mobile"
      ? `하루 직선 합계 ${totalLabel}`
      : `하루 직선 합계 ${totalLabel} · ${coordCount}곳 기준`;
  const infoText =
    variant === "mobile"
      ? `카드 사이 거리는 지도상 직선거리예요. 실제 이동 거리는 도로 상황에 따라 더 길 수 있어요. 좌표가 있는 일정 ${coordCount}곳을 기준으로 계산했어요. 정확한 위치는 일정의 지도 링크로 확인하세요.`
      : "카드 사이 거리는 지도상 직선거리예요. 실제 이동 거리는 도로 상황에 따라 더 길 수 있어요. 정확한 위치는 일정의 지도 링크로 확인하세요.";

  // 지도 생성(마운트/재시도 시 1회). 일차 전환으로는 다시 만들지 않는다.
  // 스타일 가공(getPreparedStyle)이 비동기(fetch)라, 컴포넌트가 그 사이 언마운트되거나
  // 재시도로 이 effect가 다시 실행될 수 있다 — cancelled 플래그로 그 뒤에 온 지도 생성/
  // 상태 갱신을 막는다. map/ro는 IIFE 밖에서 선언해 클린업 클로저가 최신 값을 읽게 한다.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let cancelled = false;
    let map = null;
    let ro = null;

    (async () => {
      let style;
      try {
        style = await getPreparedStyle("overview");
      } catch (e) {
        if (!cancelled) setMapError(true);
        return;
      }
      if (cancelled) return;

      try {
        map = new MapLibreMap({
          container,
          style,
          center: [0, 0],
          zoom: 2,
          attributionControl: true,
        });
      } catch (e) {
        setMapError(true);
        return;
      }

      mapRef.current = map;
      map.on("error", () => setMapError(true));
      map.on("load", () => {
        map.resize();
        map.addSource(LINE_SOURCE_PENDING, {
          type: "geojson",
          data: { type: "FeatureCollection", features: [] },
        });
        map.addLayer({
          id: LINE_LAYER_PENDING,
          type: "line",
          source: LINE_SOURCE_PENDING,
          paint: { "line-color": GRAY, "line-width": 2.5, "line-dasharray": [2, 2] },
        });
        map.addSource(LINE_SOURCE_DONE, {
          type: "geojson",
          data: { type: "FeatureCollection", features: [] },
        });
        map.addLayer({
          id: LINE_LAYER_DONE,
          type: "line",
          source: LINE_SOURCE_DONE,
          paint: { "line-color": DONE_LINE_COLOR, "line-width": 2 },
        });
        setMapReady(true);
      });

      // 모달/탭 전환 중 컨테이너 크기가 늦게 확정되는 경우, 그리고 모바일 손잡이로
      // 지도 높이가 바뀌는 경우를 위한 보강. 선택된 핀이 있는 동안은(그 핀으로 이동
      // 중이므로) 전체 핀 재맞춤을 하지 않는다.
      ro = new ResizeObserver(() => {
        map.resize();
        if (!selectedSlotIdRef.current) {
          fitAllPins(map, coordSlotsRef.current);
        }
      });
      ro.observe(container);
    })();

    return () => {
      cancelled = true;
      if (ro) ro.disconnect();
      if (map) {
        map.remove();
        mapRef.current = null;
        markersRef.current = {};
      }
      setMapReady(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [retryKey]);

  // 마커/점선 재구성 + 화면 맞춤(핀 1개=줌 고정, 2개 이상=fitBounds).
  useEffect(() => {
    const map = mapRef.current;
    if (!mapReady || !map) return;

    Object.values(markersRef.current).forEach(({ marker }) => marker.remove());
    markersRef.current = {};

    const coordSlots = slots.filter(hasCoords);
    coordSlotsRef.current = coordSlots;
    const nextUpId = getNextUpId(slots);

    coordSlots.forEach((slot) => {
      const entry = createMarkerEntry(slot, {
        selected: slot.id === selectedSlotId,
        isNext: slot.id === nextUpId,
      });
      const marker = new Marker({ element: entry.el, anchor: "center" })
        .setLngLat([slot.lng, slot.lat])
        .addTo(map);
      entry.marker = marker;
      entry.el.addEventListener("click", (e) => {
        e.stopPropagation();
        onSelectSlotRef.current?.(slot.id);
      });
      markersRef.current[slot.id] = entry;
    });

    const { pending, done } = buildSegments(coordSlots);
    map.getSource(LINE_SOURCE_PENDING)?.setData(pending);
    map.getSource(LINE_SOURCE_DONE)?.setData(done);

    fitAllPins(map, coordSlots);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapReady, coordsKey]);

  // 제목/방문 여부만 바뀐 경우: 지도를 다시 만들거나 재맞춤하지 않고 마커 모양·
  // 연결선 구간 스타일(완료/미완료)·다음 일정 강조만 즉시 갱신한다.
  useEffect(() => {
    const map = mapRef.current;
    if (!mapReady || !map) return;
    const coordSlots = slots.filter(hasCoords);
    coordSlotsRef.current = coordSlots;
    const nextUpId = getNextUpId(slots);

    slots.forEach((slot) => {
      const entry = markersRef.current[slot.id];
      if (!entry) return;
      entry.visited = !!slot.visited;
      entry.number = slot.number;
      entry.labelEl.textContent = truncateTitle(slot.title);
      setMarkerAppearance(entry, {
        selected: slot.id === selectedSlotId,
        isNext: slot.id === nextUpId,
      });
    });

    const { pending, done } = buildSegments(coordSlots);
    map.getSource(LINE_SOURCE_PENDING)?.setData(pending);
    map.getSource(LINE_SOURCE_DONE)?.setData(done);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contentKey, mapReady]);

  // 선택된 핀 강조 + 그 핀으로 이동(목록에서 번호 원을 탭했을 때).
  useEffect(() => {
    if (!mapReady) return;
    const nextUpId = getNextUpId(slots);
    const prevId = prevSelectedRef.current;
    if (prevId && prevId !== selectedSlotId && markersRef.current[prevId]) {
      setMarkerAppearance(markersRef.current[prevId], { selected: false, isNext: prevId === nextUpId });
    }
    if (selectedSlotId && markersRef.current[selectedSlotId]) {
      setMarkerAppearance(markersRef.current[selectedSlotId], {
        selected: true,
        isNext: selectedSlotId === nextUpId,
      });
      const slot = slots.find((s) => s.id === selectedSlotId);
      if (slot && hasCoords(slot) && mapRef.current) {
        const map = mapRef.current;
        mapRef.current.easeTo({
          center: [slot.lng, slot.lat],
          zoom: Math.min(map.getZoom(), OVERVIEW_MAX_ZOOM),
          duration: 400,
        });
      }
    }
    prevSelectedRef.current = selectedSlotId;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSlotId, mapReady, coordsKey]);

  const handleRetry = () => {
    setMapError(false);
    setRetryKey((k) => k + 1);
  };

  const mapBoxHeight = variant === "mobile" ? `${HEIGHT_DVH[heightMode]}dvh` : "360px";

  const chipBaseStyle = {
    display: "inline-flex",
    alignItems: "center",
    gap: "4px",
    padding: "6px 10px",
    borderRadius: "9999px",
    background: "var(--t-bg-card)",
    border: "1px solid var(--t-border)",
    color: "var(--t-text)",
    fontSize: "12px",
    fontWeight: "700",
    boxShadow: "0 1px 4px rgba(0,0,0,0.15)",
    pointerEvents: "auto",
    flexShrink: 0,
  };

  // 칩들을 절대위치 한 묶음(세로 flex)으로 쌓는다: 1행(합계·위치없음, 가로로 붙었다가
  // 좁으면 자동 줄바꿈), 거리 안내 패널, 도시 칩 순. flex-wrap이 "줄바꿈" 대신 칩
  // "자체를 다음 줄로 내리는" 역할을 하므로 합계 칩 문구는 줄이지 않고 한 줄을 유지하면서도
  // 자리가 없으면 칩 전체가 아래로 내려간다. 빈 공간에서는 지도 드래그가 막히지 않도록
  // 바깥 묶음은 pointerEvents:none, 각 칩에만 auto를 준다.
  const chipStackStyle = {
    position: "absolute",
    top: "10px",
    left: "10px",
    right: "10px",
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-start",
    gap: "6px",
    zIndex: 10,
    pointerEvents: "none",
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", width: "100%" }}>
      <div
        style={{
          position: "relative",
          width: "100%",
          height: mapBoxHeight,
          background: "var(--t-bg-input)",
          overflow: "hidden",
          borderRadius: variant === "mobile" ? 0 : "12px",
        }}
      >
        <div ref={containerRef} style={{ width: "100%", height: "100%" }} />

        <div style={chipStackStyle}>
          {(totalLabel || locationlessCount > 0) && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", width: "100%", justifyContent: "space-between" }}>
              {totalLabel && (
                <div style={chipBaseStyle}>
                  <span style={{ whiteSpace: "nowrap" }}>{chipText}</span>
                  <button
                    type="button"
                    onClick={() => setShowInfo((v) => !v)}
                    aria-label="거리 안내"
                    style={{
                      background: "none",
                      border: "none",
                      cursor: "pointer",
                      color: "var(--t-text-sub)",
                      fontSize: "12px",
                      padding: 0,
                      lineHeight: 1,
                      flexShrink: 0,
                    }}
                  >
                    ⓘ
                  </button>
                </div>
              )}

              {locationlessCount > 0 && (
                <div style={chipBaseStyle}>📍 위치 없는 일정 {locationlessCount}개</div>
              )}
            </div>
          )}

          {showInfo && (
            <div
              style={{
                ...chipBaseStyle,
                width: "100%",
                fontSize: "11.5px",
                fontWeight: "500",
                color: "var(--t-text-sub)",
                lineHeight: 1.5,
                whiteSpace: "normal",
              }}
            >
              {infoText}
            </div>
          )}

          {cityChipName && <div style={chipBaseStyle}>📍 {cityChipName}</div>}
        </div>

        {mapError && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: "12px",
              background: "var(--t-bg)",
              padding: "20px",
              textAlign: "center",
              zIndex: 20,
            }}
          >
            <div style={{ color: "var(--t-text-sub)", fontSize: "13px", lineHeight: 1.6 }}>
              지도를 불러오지 못했어요
            </div>
            <button
              type="button"
              onClick={handleRetry}
              style={{
                padding: "8px 20px",
                borderRadius: "8px",
                border: "none",
                background: "var(--t-primary)",
                color: "#fff",
                fontSize: "13px",
                fontWeight: "700",
                cursor: "pointer",
              }}
            >
              다시 시도
            </button>
          </div>
        )}
      </div>

      {variant === "mobile" && (
        <button
          type="button"
          onClick={() => setHeightMode((m) => NEXT_HEIGHT_MODE[m])}
          aria-label="지도 높이 조절"
          style={{
            width: "100%",
            height: "18px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "var(--t-bg-card)",
            border: "none",
            borderBottom: "1px solid var(--t-border)",
            cursor: "pointer",
            flexShrink: 0,
          }}
        >
          <span
            style={{
              width: "36px",
              height: "4px",
              borderRadius: "2px",
              background: "var(--t-border)",
            }}
          />
        </button>
      )}
    </div>
  );
}
