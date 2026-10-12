// 지도 서비스 설정을 이 파일 한 곳에만 둔다.
// 서비스를 바꿀 때(예: OpenFreeMap → 다른 타일 서비스)는 이 파일만 수정하면 된다.
// 스타일 주소 출처: https://openfreemap.org/quick_start/ (2026-10 확인)
export const MAP_STYLE_URL = {
  light: "https://tiles.openfreemap.org/styles/positron",
  dark: "https://tiles.openfreemap.org/styles/dark",
};

// OpenFreeMap이 요구하는 출처 표시. MapLibre의 attributionControl이 스타일 JSON에
// 포함된 attribution을 그려주지만, 혹시 스타일에 값이 없을 때를 위한 안전장치로 보관한다.
// 숨기지 않는다 — LocationPickerModal에서 attributionControl을 비활성화하지 말 것.
export const MAP_ATTRIBUTION =
  '<a href="https://openfreemap.org" target="_blank" rel="noopener noreferrer">OpenFreeMap</a> ' +
  '<a href="https://www.openmaptiles.org/" target="_blank" rel="noopener noreferrer">© OpenMapTiles</a> ' +
  'Data from <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a>';

// 앱의 8종 테마(light/dark/계절/커스텀)와 결합 없이, 현재 실제로 적용된 배경색(--t-bg)의
// 밝기를 직접 읽어서 다크 여부를 판단한다. App.jsx의 테마 선택 로직과 중복 구현하지 않기 위함.
function isDarkBackground() {
  if (typeof document === "undefined") return false;
  const raw = getComputedStyle(document.documentElement)
    .getPropertyValue("--t-bg")
    .trim();
  const hex = raw.replace("#", "");
  if (hex.length !== 6) return false;
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  if ([r, g, b].some(Number.isNaN)) return false;
  // 상대 휘도 근사치. 0.5 미만이면 어두운 배경으로 판단.
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance < 0.5;
}

export function getMapStyleUrl() {
  return isDarkBackground() ? MAP_STYLE_URL.dark : MAP_STYLE_URL.light;
}
