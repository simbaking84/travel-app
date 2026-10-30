import React, { useEffect, useRef, useState } from "react";
import { Map as MapLibreMap, Marker } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
// maplibre-gl 워커 경로 설정(WORKER_URL)은 mapConfig.js에서 import 시점에 한 번 적용된다.
import { getPreparedStyle } from "./mapConfig";
import { getTripCenter } from "../data/cityCoords";

const DEFAULT_ZOOM = 14;

function round5(n) {
  return Math.round(n * 100000) / 100000;
}

// 같은 여행 안에서 장소명이 같고 좌표가 지정된 다른 일정을 찾는다.
function findPreviousLocation(state, slot) {
  const place = (slot?.place || "").trim();
  if (!place) return null;
  const match = (state?.itinerary || []).find(
    (s) =>
      s.id !== slot?.id &&
      (s.place || "").trim() === place &&
      typeof s.lat === "number" &&
      typeof s.lng === "number",
  );
  return match ? { lat: match.lat, lng: match.lng } : null;
}

// 전체 화면 지도 모달. 일정의 lat/lng를 탭으로 지정/수정/해제한다.
// 외부로 나가는 요청은 MapLibre가 발생시키는 지도 타일 이미지 요청뿐이며,
// 일정 제목·장소·메모는 어떤 네트워크 요청에도 포함하지 않는다.
// hint/progress/onSkip/skipLabel/primaryLabel은 모두 선택 props다. 기존처럼 넘기지
// 않으면 지금과 똑같이 동작한다 — AI 추정 위치 확인·위치 없는 일정 일괄 지정처럼
// 이 모달을 순서대로 여러 번 여는 얇은 래퍼(AiLocationPanel)가 넘겨준다.
export default function LocationPickerModal({
  slot,
  state,
  onSave,
  onClear,
  onClose,
  hint,
  progress,
  onSkip,
  skipLabel,
  primaryLabel,
}) {
  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);
  const markerRef = useRef(null);
  const [mapError, setMapError] = useState(false);
  const [retryKey, setRetryKey] = useState(0);
  const [pending, setPending] = useState(
    typeof slot?.lat === "number" && typeof slot?.lng === "number"
      ? { lat: slot.lat, lng: slot.lng }
      : null,
  );

  const hasInitial = typeof slot?.lat === "number" && typeof slot?.lng === "number";
  const previousLocation = findPreviousLocation(state, slot);

  // 스타일 가공(getPreparedStyle)이 비동기(fetch)라, 그 사이 모달이 닫히는 경우를
  // cancelled 플래그로 막는다. map은 IIFE 밖에서 선언해 클린업 클로저가 최신 값을 읽는다.
  useEffect(() => {
    const center = hasInitial
      ? { lat: slot.lat, lng: slot.lng }
      : getTripCenter(state, slot);

    let cancelled = false;
    let map = null;

    (async () => {
      let style;
      try {
        style = await getPreparedStyle("detail");
      } catch (e) {
        if (!cancelled) setMapError(true);
        return;
      }
      if (cancelled) return;

      try {
        map = new MapLibreMap({
          container: mapContainerRef.current,
          style,
          center: [center.lng, center.lat],
          zoom: DEFAULT_ZOOM,
          attributionControl: true,
        });
      } catch (e) {
        setMapError(true);
        return;
      }

      mapRef.current = map;

      map.on("error", () => setMapError(true));

      map.on("load", () => {
        // 모달이 열리는 과정에서 컨테이너 크기가 늦게 확정되면 첫 화면이
        // 빈 채로 남는 경우가 있어, load 시점에 한 번 더 리사이즈/리페인트한다.
        map.resize();
        map.triggerRepaint();
        if (hasInitial) {
          markerRef.current = new Marker({ color: "#2563EB" })
            .setLngLat([slot.lng, slot.lat])
            .addTo(map);
        }
      });

      map.on("click", (e) => {
        const { lng, lat } = e.lngLat;
        setPending({ lat: round5(lat), lng: round5(lng) });
        if (markerRef.current) {
          markerRef.current.setLngLat([lng, lat]);
        } else {
          markerRef.current = new Marker({ color: "#2563EB" })
            .setLngLat([lng, lat])
            .addTo(map);
        }
      });
    })();

    return () => {
      cancelled = true;
      if (map) {
        map.remove();
        mapRef.current = null;
        markerRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [retryKey]);

  const handleRetry = () => {
    setMapError(false);
    setRetryKey((k) => k + 1);
  };

  const movePin = (coord) => {
    setPending(coord);
    if (mapRef.current) {
      mapRef.current.flyTo({ center: [coord.lng, coord.lat], zoom: DEFAULT_ZOOM });
      if (markerRef.current) {
        markerRef.current.setLngLat([coord.lng, coord.lat]);
      } else if (!mapError) {
        markerRef.current = new Marker({ color: "#2563EB" })
          .setLngLat([coord.lng, coord.lat])
          .addTo(mapRef.current);
      }
    }
  };

  const handleSave = () => {
    if (!pending) return;
    onSave({ lat: round5(pending.lat), lng: round5(pending.lng) });
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 2000,
        background: "var(--t-bg)",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div
        style={{
          padding: "14px 16px",
          borderBottom: "1px solid var(--t-border)",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          background: "var(--t-bg-card)",
          flexShrink: 0,
        }}
      >
        <div style={{ minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <div
              style={{
                fontSize: "15px",
                fontWeight: 700,
                color: "var(--t-text)",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
                minWidth: 0,
              }}
            >
              {slot?.title || "일정"}
            </div>
            {progress && (
              <span
                style={{
                  fontSize: "12px",
                  fontWeight: 700,
                  color: "var(--t-text-sub)",
                  background: "var(--t-bg-input)",
                  padding: "2px 8px",
                  borderRadius: "9999px",
                  flexShrink: 0,
                }}
              >
                {progress}
              </span>
            )}
          </div>
          {slot?.place && (
            <div style={{ fontSize: "13px", color: "var(--t-text-sub)", marginTop: "2px" }}>
              {slot.place}
            </div>
          )}
          {hint && (
            <div style={{ fontSize: "12.5px", color: "var(--t-primary)", marginTop: "6px", lineHeight: 1.5 }}>
              {hint}
            </div>
          )}
        </div>
        <button
          onClick={onClose}
          style={{
            background: "none",
            border: "none",
            fontSize: "20px",
            cursor: "pointer",
            color: "var(--t-text-light)",
            flexShrink: 0,
            padding: "4px",
          }}
          aria-label="닫기"
        >
          ✕
        </button>
      </div>

      <div style={{ position: "relative", flex: 1, minHeight: 0 }}>
        <div ref={mapContainerRef} style={{ width: "100%", height: "100%" }} />

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
              padding: "24px",
              textAlign: "center",
            }}
          >
            <div style={{ color: "var(--t-text-sub)", fontSize: "14px", lineHeight: 1.6 }}>
              지도를 불러오지 못했어요.
              <br />
              인터넷 연결을 확인해 주세요.
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

        {previousLocation && (
          <button
            onClick={() => movePin(previousLocation)}
            style={{
              position: "absolute",
              top: "12px",
              left: "12px",
              padding: "8px 14px",
              borderRadius: "9999px",
              border: "1px solid var(--t-border)",
              background: "var(--t-bg-card)",
              color: "var(--t-primary)",
              fontSize: "12.5px",
              fontWeight: 700,
              cursor: "pointer",
              boxShadow: "0 1px 3px rgba(0,0,0,0.12)",
            }}
          >
            📍 이전에 지정한 위치 사용
          </button>
        )}
      </div>

      <div
        style={{
          display: "flex",
          gap: "8px",
          padding: "12px 16px",
          borderTop: "1px solid var(--t-border)",
          background: "var(--t-bg-card)",
          flexShrink: 0,
        }}
      >
        <button
          onClick={handleSave}
          disabled={!pending}
          style={{
            flex: 1,
            padding: "12px",
            borderRadius: "8px",
            border: "none",
            background: pending ? "var(--t-primary)" : "var(--t-border)",
            color: "#fff",
            fontSize: "14px",
            fontWeight: 700,
            cursor: pending ? "pointer" : "not-allowed",
          }}
        >
          {primaryLabel || "이 위치로 저장"}
        </button>
        <button
          onClick={onClear}
          style={{
            flex: 1,
            padding: "12px",
            borderRadius: "8px",
            border: "1px solid var(--t-border)",
            background: "var(--t-bg-card)",
            color: "var(--t-text-sub)",
            fontSize: "14px",
            fontWeight: 700,
            cursor: "pointer",
          }}
        >
          위치 지정 해제
        </button>
        {onSkip && (
          <button
            onClick={onSkip}
            style={{
              flex: 1,
              padding: "12px",
              borderRadius: "8px",
              border: "1px solid var(--t-border)",
              background: "var(--t-bg-card)",
              color: "var(--t-text-sub)",
              fontSize: "14px",
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            {skipLabel || "건너뛰기"}
          </button>
        )}
        <button
          onClick={onClose}
          style={{
            flex: 1,
            padding: "12px",
            borderRadius: "8px",
            border: "1px solid var(--t-border)",
            background: "var(--t-bg-card)",
            color: "var(--t-text-sub)",
            fontSize: "14px",
            fontWeight: 700,
            cursor: "pointer",
          }}
        >
          닫기
        </button>
      </div>
    </div>
  );
}
