// OpenFreeMap 공식 스타일(positron/dark) JSON을 런타임에 받아 두 가지 용도로 가공한다.
//   - overview: 일정 지도(DayMapView) — 건물/소도로/POI/번지/표지/도로명/소지역 라벨을 숨기고
//     배경·물·녹지·도로·철도 색을 우리 색으로 덮어쓴 "간소화" 스타일.
//   - detail: 위치 지정 지도(LocationPickerModal) — 건물을 포함한 전체 디테일을 유지한 채
//     색만 우리 색으로 덮어쓴("라이트") 또는 원본 그대로("다크") 스타일.
//
// 레이어는 고정된 id 문자열로 찾지 않는다. (layer.type, layer["source-layer"], id 패턴)과
// 피처의 class 속성만으로 판별한다 — OpenFreeMap이 레이어를 추가/삭제/재배열해도
// 이 로직이 조용히 깨지지 않고, 대상 레이어가 아예 없으면 해당 단계가 자연히 no-op된다.

// 이름은 모든 모드·테마에서 "한국어 우선 한 줄"로 통일한다(두 줄 표기 금지).
const KOREAN_NAME_EXPR = [
  "coalesce",
  ["get", "name:ko"],
  ["get", "name:nonlatin"],
  ["get", "name:latin"],
  ["get", "name"],
];

function isNameTextField(textField) {
  if (textField === undefined) return false;
  try {
    return JSON.stringify(textField).includes('"name');
  } catch {
    return false;
  }
}

// 라벨(이름)을 표시하는 모든 symbol 레이어의 text-field를 한국어 우선 한 줄로 교체한다.
// ref(도로 표지 번호) 같은 이름이 아닌 text-field는 건드리지 않는다.
function applyKoreanSingleLineLabels(style) {
  for (const layer of style.layers) {
    if (layer.type !== "symbol" || !layer.layout) continue;
    if (isNameTextField(layer.layout["text-field"])) {
      layer.layout["text-field"] = KOREAN_NAME_EXPR;
    }
  }
}

function hideLayer(layer) {
  layer.layout = { ...(layer.layout || {}), visibility: "none" };
}

function setBackground(style, color) {
  for (const layer of style.layers) {
    if (layer.type === "background") {
      layer.paint = { ...(layer.paint || {}), "background-color": color };
    }
  }
}

// 물/녹지 다각형 레이어 색 덮어쓰기. source-layer 이름이 스타일마다 다를 수 있어
// (positron: "park", dark: "landuse"+id "park") 패턴으로 함께 찾는다.
function recolorLandFills(style, { water, green }) {
  for (const layer of style.layers) {
    if (layer.type !== "fill") continue;
    const sl = layer["source-layer"];
    const id = layer.id;
    if (sl === "water") {
      layer.paint = { ...(layer.paint || {}), "fill-color": water };
    } else if (sl === "park" || (sl === "landcover" && /wood|green/i.test(id)) || (sl === "landuse" && /park/i.test(id))) {
      layer.paint = { ...(layer.paint || {}), "fill-color": green };
    }
  }
  // 하천/수로 line도 같은 "물" 색으로 맞춘다(있을 때만).
  for (const layer of style.layers) {
    if (layer.type === "line" && layer["source-layer"] === "waterway") {
      layer.paint = { ...(layer.paint || {}), "line-color": water };
    }
  }
}

function hideBuildings(style) {
  let hit = 0;
  for (const layer of style.layers) {
    if (layer["source-layer"] === "building") {
      hideLayer(layer);
      hit++;
    }
  }
  return hit;
}

const isCasing = (id) => /casing/i.test(id);
const isRail = (id) => /rail/i.test(id);
const isRailDash = (id) => /rail.*dash|dash.*rail/i.test(id);
const isMinorRoadPattern = (id) => /path|minor|track|service|pier|oneway/i.test(id);
const isShieldPattern = (id) => /shield/i.test(id);

// transportation(도로/철도) line·symbol 레이어의 색을 덮어쓴다.
// - 철도(rail): 얇게 + railColor (점선 간격 레이어는 배경색으로 맞춰 "끊긴" 느낌 유지)
// - 도로 casing: casingColor가 주어졌을 때만 덮어씀(다크는 스펙에 casing색이 없어 원본 유지)
// - 도로 본선: class가 motorway/trunk/primary면 majorColor, 그 외(secondary/tertiary 등)는
//   generalColor — 레이어를 나누지 않고 data-driven expression 하나로 두 경우를 모두 처리한다.
function recolorRoadsAndRail(style, { general, major, casing, rail, bg }) {
  for (const layer of style.layers) {
    if (layer["source-layer"] !== "transportation" || layer.type !== "line") continue;
    const id = layer.id;
    layer.paint = layer.paint || {};
    if (isRail(id)) {
      layer.paint["line-width"] = 1;
      layer.paint["line-color"] = isRailDash(id) ? bg : rail;
      continue;
    }
    if (isCasing(id)) {
      if (casing) layer.paint["line-color"] = casing;
      continue;
    }
    layer.paint["line-color"] = [
      "match",
      ["get", "class"],
      ["motorway", "trunk", "primary"],
      major,
      general,
    ];
  }
}

const isMotorwayPattern = (id) => /motorway/i.test(id);
// 공식 스타일은 primary/secondary/tertiary/trunk(= "큰 도로" 그룹)를 줌 11 미만에서
// 전용 저줌 표현 레이어("...subtle", maxzoom 11 안팎)로 그린다. motorway는 자신만의
// 별도 subtle 레이어를 쓰므로 패턴에서 제외한다.
const isNonMotorwaySubtlePattern = (id) => /subtle/i.test(id) && !isMotorwayPattern(id);

// overview 전용: 줌 11 미만에서는 motorway만 보이게, trunk/primary(와 같은 그룹인
// secondary/tertiary)는 그 줌대의 저줌 표현 레이어를 통째로 숨겨 안 보이게 한다.
// 줌 11 이상에서 쓰이는 레이어(casing/inner, minzoom 11)는 건드리지 않는다.
function restrictLowZoomToMotorwayOnly(style) {
  let hit = 0;
  for (const layer of style.layers) {
    if (layer["source-layer"] !== "transportation" || layer.type !== "line") continue;
    if (!isNonMotorwaySubtlePattern(layer.id)) continue;
    hideLayer(layer);
    hit++;
  }
  return hit;
}

// overview 전용: 도로 윤곽선(casing)을 전부 숨긴다(라이트/다크 공통).
function hideRoadCasings(style) {
  let hit = 0;
  for (const layer of style.layers) {
    if (layer["source-layer"] !== "transportation" || layer.type !== "line") continue;
    if (!isCasing(layer.id)) continue;
    hideLayer(layer);
    hit++;
  }
  return hit;
}

// overview 전용: 도로 본선(casing·철도 제외) 두께를 최대 maxWidth로 제한한다.
// 원본은 줌이 커질수록 20~40px까지 굵어지는 보간식을 쓰는데, 간소화 화면에서는
// 항상 얇게 유지한다.
function capRoadWidth(style, maxWidth) {
  for (const layer of style.layers) {
    if (layer["source-layer"] !== "transportation" || layer.type !== "line") continue;
    const id = layer.id;
    if (isRail(id) || isCasing(id)) continue;
    layer.paint = { ...(layer.paint || {}), "line-width": maxWidth };
  }
}

// 소도로(service/path/track/minor/pier) + 일방통행 화살표 아이콘을 숨긴다.
function hideMinorRoads(style) {
  let hit = 0;
  for (const layer of style.layers) {
    if (layer["source-layer"] !== "transportation") continue;
    if (!isMinorRoadPattern(layer.id)) continue;
    hideLayer(layer);
    hit++;
  }
  return hit;
}

// 도로 표지(shield 번호판)와 도로명 라벨을 숨긴다. source-layer는 "transportation_name".
function hideRoadLabelsAndShields(style) {
  let shieldHit = 0;
  let nameHit = 0;
  for (const layer of style.layers) {
    if (layer["source-layer"] !== "transportation_name") continue;
    hideLayer(layer);
    if (isShieldPattern(layer.id)) shieldHit++;
    else nameHit++;
  }
  return { shieldHit, nameHit };
}

function hideBySourceLayer(style, sourceLayer) {
  let hit = 0;
  for (const layer of style.layers) {
    if (layer["source-layer"] === sourceLayer) {
      hideLayer(layer);
      hit++;
    }
  }
  return hit;
}

// "place" source-layer의 소지역 라벨(neighbourhood/quarter/isolated_dwelling/hamlet,
// 초메 단위)만 제외한다. 국가·도시·구(suburb)·주요 동네(town/village) 라벨은 그대로 둔다.
// 레이어를 통째로 숨기지 않고 필터에 제외 조건을 추가하는 방식을 쓰는 이유는, 공식 스타일에
// 따라 이 클래스들이 "구"(suburb)와 한 레이어에 섞여 있을 수 있기 때문이다(예: positron의
// label_other는 suburb/neighbourhood/hamlet/quarter/isolated_dwelling을 한 레이어에서 다룸).
const SMALL_PLACE_CLASSES = ["neighbourhood", "quarter", "isolated_dwelling", "hamlet"];
function excludeSmallPlaceLabels(style) {
  let hit = 0;
  for (const layer of style.layers) {
    if (layer.type !== "symbol" || layer["source-layer"] !== "place") continue;
    const exclude = ["!", ["match", ["get", "class"], SMALL_PLACE_CLASSES, true, false]];
    layer.filter = layer.filter ? ["all", layer.filter, exclude] : exclude;
    hit++;
  }
  return hit;
}

// detail 전용: "place" source-layer 중 소지역 클래스(neighbourhood/quarter/
// isolated_dwelling/hamlet)를 다루는 레이어를 줌 minZoom 미만에서 숨긴다. 구(suburb)·
// 도시·국가 라벨은 손대지 않는다. 공식 스타일에 따라 이 클래스들이 구(suburb)와
// 한 레이어에 섞여 있을 수 있어(positron의 label_other), 모든 place 심볼 레이어에
// 예외 없이 분리를 적용한다 — label_other처럼 "큰 클래스 목록에 없으면 true"
// 식으로 소지역을 암묵적으로 포함하는 필터는 텍스트 검색으로 걸러낼 수 없기 때문.
// 레이어를 복제해 "소지역만" 담당하는 복제본에 minzoom을 걸고, 원본 레이어의
// 필터에서는 소지역 클래스를 뺀다. 소지역을 전혀 포함하지 않는 레이어(예: dark의
// place_suburb, place_city)는 복제본이 아무 것도 그리지 않을 뿐 시각적 영향이 없다.
function restrictSmallPlaceLabelsByZoom(style, minZoom) {
  const insertions = [];
  for (const layer of style.layers) {
    if (layer.type !== "symbol" || layer["source-layer"] !== "place") continue;

    const smallOnly = structuredClone(layer);
    smallOnly.id = `${layer.id}__small-place-zoom-gate`;
    const includeSmall = ["match", ["get", "class"], SMALL_PLACE_CLASSES, true, false];
    smallOnly.filter = layer.filter ? ["all", layer.filter, includeSmall] : includeSmall;
    smallOnly.minzoom = Math.max(layer.minzoom || 0, minZoom);
    insertions.push({ afterId: layer.id, layer: smallOnly });

    const excludeSmall = ["!", ["match", ["get", "class"], SMALL_PLACE_CLASSES, true, false]];
    layer.filter = layer.filter ? ["all", layer.filter, excludeSmall] : excludeSmall;
  }
  for (const { afterId, layer } of insertions) {
    const idx = style.layers.findIndex((l) => l.id === afterId);
    style.layers.splice(idx + 1, 0, layer);
  }
}

// 남아있는(숨기지 않은) 모든 라벨 레이어의 글자색/후광색을 통일한다.
function recolorLabels(style, { label, halo }) {
  for (const layer of style.layers) {
    if (layer.type !== "symbol" || !layer.layout) continue;
    if (!isNameTextField(layer.layout["text-field"])) continue;
    layer.paint = { ...(layer.paint || {}), "text-color": label, "text-halo-color": halo };
  }
}

const OVERVIEW_ROAD_MAX_WIDTH = 2;
const DETAIL_SMALL_PLACE_MINZOOM = 16;

const OVERVIEW_COLORS = {
  light: {
    bg: "#F6F4EF",
    water: "#CFE8F7",
    green: "#DDEFD2",
    general: "#FFFFFF",
    major: "#FFE9B8",
    casing: "#E2DED6",
    rail: "#D9D5CE",
    label: "#3A3F47",
    halo: "#FFFFFF",
  },
  dark: {
    bg: "#141A22",
    water: "#17324A",
    green: "#1D3A2C",
    general: "#2B3340",
    major: "#3A4252",
    // 스펙에 다크용 casing/철도 색이 따로 주어지지 않아: casing은 원본 유지(null),
    // 철도는 라이트와 같은 #D9D5CE를 재사용한다(어두운 배경 위에서도 충분히 식별됨).
    casing: null,
    rail: "#D9D5CE",
    label: "#C9D1DC",
    halo: "#141A22",
  },
};

// 일정 지도(overview)용 "간소화" 스타일을 만든다.
// 숨김: 건물, 소도로, POI, 번지, 도로 표지, 도로명 라벨, 소지역 라벨.
// 남김: 국가/도시/구/주요 동네 라벨, 물 이름, 공항 라벨, 주요 철도역/명소 라벨(poi 등
//       해당 소스레이어가 있을 때만 — positron/dark 공식 스타일에는 poi/housenumber
//       레이어가 없어 현재는 no-op).
export function prepareOverviewStyle(rawStyle, theme) {
  const style = structuredClone(rawStyle);
  const C = theme === "dark" ? OVERVIEW_COLORS.dark : OVERVIEW_COLORS.light;

  setBackground(style, C.bg);
  recolorLandFills(style, C);
  hideBuildings(style);
  recolorRoadsAndRail(style, C);
  hideMinorRoads(style);
  restrictLowZoomToMotorwayOnly(style); // 줌 11 미만: motorway만, trunk/primary 등은 숨김
  hideRoadCasings(style); // 도로 윤곽선은 overview에서 전부 숨김
  capRoadWidth(style, OVERVIEW_ROAD_MAX_WIDTH); // 도로 두께를 얇게 고정
  hideRoadLabelsAndShields(style);
  hideBySourceLayer(style, "poi"); // 공식 스타일에 없으면 0건으로 조용히 넘어간다.
  hideBySourceLayer(style, "housenumber"); // 위와 동일.
  // 공항(aerodrome_label)은 숨기지 않고 남긴다 — 구/도시/물 이름과 같은 라벨 색을
  // recolorLabels()가 아래에서 일괄 적용한다(숨기지 않으므로 이 루프에도 걸린다).
  excludeSmallPlaceLabels(style);
  recolorLabels(style, C);
  applyKoreanSingleLineLabels(style);

  return style;
}

// 위치 지정 지도(detail)용 스타일을 만든다. 건물·소도로·POI·라벨을 전부 유지한 채
// 라이트는 색만 우리 색으로 덮어쓰고, 다크는 원본 색을 그대로 둔다. 둘 다 라벨은
// 한국어 우선 한 줄로 통일한다.
export function prepareDetailStyle(rawStyle, theme) {
  const style = structuredClone(rawStyle);
  if (theme === "light") {
    const C = {
      bg: "#F6F4EF",
      water: "#CFE8F7",
      green: "#DDEFD2",
      general: "#FFFFFF",
      major: "#FFE9B8",
      casing: "#E2DED6",
      rail: "#D9D5CE",
    };
    setBackground(style, C.bg);
    recolorLandFills(style, C);
    recolorRoadsAndRail(style, C);
    for (const layer of style.layers) {
      if (layer["source-layer"] === "building") {
        layer.paint = { ...(layer.paint || {}), "fill-color": "#EDE9E2" };
      }
    }
  }
  hideBySourceLayer(style, "housenumber"); // 번지는 detail에서도 계속 숨김(현재는 no-op).
  restrictSmallPlaceLabelsByZoom(style, DETAIL_SMALL_PLACE_MINZOOM);
  // 다크는 색 변경 없음 — 기존 dark 스타일 그대로, 라벨만 한국어 우선 한 줄로.
  applyKoreanSingleLineLabels(style);
  return style;
}
