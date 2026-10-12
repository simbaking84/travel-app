// 두 좌표 사이의 하버사인(대원) 직선거리를 구하는 유틸리티.
// 외부 경로 API를 쓰지 않는 "직선거리" 표시 전용이며, 도로 기준 이동거리가 아니다.

const EARTH_RADIUS_KM = 6371;

function toRad(deg) {
  return (deg * Math.PI) / 180;
}

// a, b: { lat, lng } 형태의 좌표. 반환값: km 단위 직선거리(소수점 포함).
export function haversineKm(a, b) {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);

  const sinLat = Math.sin(dLat / 2);
  const sinLng = Math.sin(dLng / 2);
  const h =
    sinLat * sinLat + Math.cos(lat1) * Math.cos(lat2) * sinLng * sinLng;

  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

// km 값을 "약 850m" / "약 1.2km" / "약 230km" 형태의 한글 문자열로 변환.
// 두 지점이 10m 미만이면 "같은 위치"로 본다.
export function formatDistance(km) {
  const meters = km * 1000;
  if (meters < 10) {
    return "📏 같은 위치";
  }
  if (meters < 995) {
    return `약 ${Math.round(meters / 10) * 10}m`;
  }
  if (km < 99.95) {
    return `약 ${km.toFixed(1)}km`;
  }
  return `약 ${Math.round(km)}km`;
}
