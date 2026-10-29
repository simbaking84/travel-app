import { config as maplibreConfig } from "maplibre-gl";
import { prepareOverviewStyle, prepareDetailStyle } from "./mapStyleTransform";

// 지도 서비스 설정을 이 파일 한 곳에만 둔다.
// 서비스를 바꿀 때(예: OpenFreeMap → 다른 타일 서비스)는 이 파일만 수정하면 된다.
// 스타일 주소 출처: https://openfreemap.org/quick_start/ (2026-10 확인)

// CRA(webpack 5)는 maplibre-gl이 import.meta.url로 계산하는 워커 경로를 정적으로
// 분석하지 못해 기본값으로는 워커 로드가 실패한다("Worker failed to load").
// node_modules/maplibre-gl/dist/maplibre-gl-worker.mjs를 public/에 .js로 확장자만 바꿔
// 그대로 복사해두고(내용 동일) 그 경로를 직접 지정해 우회한다.
// maplibre-gl을 업그레이드하면 이 파일도 다시 복사(후 .js로 리네임)해야 한다.
// 지도를 쓰는 모든 모듈(LocationPickerModal, DayMapView)이 이 파일을 import하므로
// 여기 한 곳에서만 설정하면 된다.
maplibreConfig.WORKER_URL = `${process.env.PUBLIC_URL}/maplibre-gl-worker.js`;

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

// 공식 스타일 JSON은 테마당(light/dark) 세션에서 한 번만 받아오고, 이후 가공 결과도
// mode+theme 조합별로 캐시해 재사용한다(동일 스타일을 여러 지도 인스턴스가 열 때마다
// 다시 받아오거나 다시 가공하지 않기 위함).
const rawStyleFetchCache = new Map(); // theme -> Promise<object>
const preparedStyleCache = new Map(); // `${mode}:${theme}` -> object

// fetch 실패(네트워크 오류)·응답 오류(res.ok false)·JSON 파싱 오류 중 하나라도 나면
// 캐시 항목을 지운다 — 지우지 않으면 실패한 Promise를 계속 재사용해 새로고침 전까지
// 재시도(다시 시도 버튼)가 전부 같은 실패를 즉시 반환하게 된다.
function fetchRawStyle(theme) {
  if (!rawStyleFetchCache.has(theme)) {
    const promise = fetch(MAP_STYLE_URL[theme])
      .then((res) => {
        if (!res.ok) throw new Error(`style fetch failed: ${res.status}`);
        return res.json();
      })
      .catch((err) => {
        rawStyleFetchCache.delete(theme);
        throw err;
      });
    rawStyleFetchCache.set(theme, promise);
  }
  return rawStyleFetchCache.get(theme);
}

// mode: "overview"(일정 지도, 간소화) | "detail"(위치 지정 지도, 전체 디테일 유지).
// theme을 생략하면 getMapStyleUrl()과 같은 방식(현재 배경색)으로 자동 판단한다.
// 반환값은 캐시된 가공 결과의 복제본이다 — 여러 지도 인스턴스가 하나의 객체를
// 동시에 참조하며 MapLibre 내부에서 변형하는 일을 막기 위해 호출마다 복제해 돌려준다.
export async function getPreparedStyle(mode, theme) {
  const resolvedTheme = theme || (isDarkBackground() ? "dark" : "light");
  const cacheKey = `${mode}:${resolvedTheme}`;
  if (!preparedStyleCache.has(cacheKey)) {
    try {
      const raw = await fetchRawStyle(resolvedTheme);
      const prepared =
        mode === "detail"
          ? prepareDetailStyle(raw, resolvedTheme)
          : prepareOverviewStyle(raw, resolvedTheme);
      preparedStyleCache.set(cacheKey, prepared);
    } catch (err) {
      // 변환 중 예외여도(가공 함수가 던진 경우) 혹시 모를 캐시 잔재를 지워
      // 다음 호출이 깨끗하게 다시 시도하도록 한다.
      preparedStyleCache.delete(cacheKey);
      throw err;
    }
  }
  return structuredClone(preparedStyleCache.get(cacheKey));
}
