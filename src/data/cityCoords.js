// git stash "weather-step2-geocoding"의 CITY_COORDS 표를 좌표 필드명만
// lat/lng로 통일해서 옮겨온 것. 지오코딩 API·후보 선택 팝업 코드는 가져오지 않았다.
// (stash는 pop하지 않음 — 날씨 작업이 재개될 때 별도로 병합한다)
export const CITY_COORDS = {
  // 국내
  제주: { lat: 33.4996, lng: 126.5312, country: "KR" },
  부산: { lat: 35.1796, lng: 129.0756, country: "KR" },
  강릉: { lat: 37.7519, lng: 128.8761, country: "KR" },
  여수: { lat: 34.7604, lng: 127.6622, country: "KR" },
  경주: { lat: 35.8562, lng: 129.2247, country: "KR" },
  서울: { lat: 37.5665, lng: 126.978, country: "KR" },
  // 일본
  도쿄: { lat: 35.6762, lng: 139.6503, country: "JP" },
  오사카: { lat: 34.6937, lng: 135.5023, country: "JP" },
  후쿠오카: { lat: 33.5904, lng: 130.4017, country: "JP" },
  삿포로: { lat: 43.0618, lng: 141.3545, country: "JP" },
  나고야: { lat: 35.1815, lng: 136.9066, country: "JP" },
  오키나와: { lat: 26.2124, lng: 127.6809, country: "JP" },
  // 중국
  상하이: { lat: 31.2304, lng: 121.4737, country: "CN" },
  베이징: { lat: 39.9042, lng: 116.4074, country: "CN" },
  청도: { lat: 36.0671, lng: 120.3826, country: "CN" },
  광저우: { lat: 23.1291, lng: 113.2644, country: "CN" },
  선전: { lat: 22.5431, lng: 114.0579, country: "CN" },
  시안: { lat: 34.3416, lng: 108.9398, country: "CN" },
  // 동남아
  방콕: { lat: 13.7563, lng: 100.5018, country: "TH" },
  다낭: { lat: 16.0544, lng: 108.2022, country: "VN" },
  발리: { lat: -8.6705, lng: 115.2126, country: "ID" },
  세부: { lat: 10.3157, lng: 123.8854, country: "PH" },
  싱가포르: { lat: 1.3521, lng: 103.8198, country: "SG" },
  코타키나발루: { lat: 5.9804, lng: 116.0735, country: "MY" },
  // 유럽
  파리: { lat: 48.8566, lng: 2.3522, country: "FR" },
  로마: { lat: 41.9028, lng: 12.4964, country: "IT" },
  런던: { lat: 51.5074, lng: -0.1278, country: "GB" },
  바르셀로나: { lat: 41.3874, lng: 2.1686, country: "ES" },
  프라하: { lat: 50.0755, lng: 14.4378, country: "CZ" },
  암스테르담: { lat: 52.3676, lng: 4.9041, country: "NL" },
  // 북미
  뉴욕: { lat: 40.7128, lng: -74.006, country: "US" },
  LA: { lat: 34.0522, lng: -118.2437, country: "US" },
  라스베가스: { lat: 36.1699, lng: -115.1398, country: "US" },
  샌프란시스코: { lat: 37.7749, lng: -122.4194, country: "US" },
  토론토: { lat: 43.6532, lng: -79.3832, country: "CA" },
  하와이: { lat: 21.3099, lng: -157.8581, country: "US" },
  // 중남미
  칸쿤: { lat: 21.1619, lng: -86.8515, country: "MX" },
  리오데자네이루: { lat: -22.9068, lng: -43.1729, country: "BR" },
  부에노스아이레스: { lat: -34.6037, lng: -58.3816, country: "AR" },
  멕시코시티: { lat: 19.4326, lng: -99.1332, country: "MX" },
  // 아프리카
  카이로: { lat: 30.0444, lng: 31.2357, country: "EG" },
  케이프타운: { lat: -33.9249, lng: 18.4241, country: "ZA" },
  마라케시: { lat: 31.6295, lng: -7.9811, country: "MA" },
  나이로비: { lat: -1.2921, lng: 36.8219, country: "KE" },
  // 오세아니아
  시드니: { lat: -33.8688, lng: 151.2093, country: "AU" },
  멜버른: { lat: -37.8136, lng: 144.9631, country: "AU" },
  오클랜드: { lat: -36.8485, lng: 174.7633, country: "NZ" },
  골드코스트: { lat: -28.0167, lng: 153.4, country: "AU" },
};

// TRIP_REGIONS(App.jsx)의 지역 id -> 대표 도시. App.jsx와의 순환 참조를 피하기 위해
// 전체 TRIP_REGIONS를 가져오지 않고, 지역당 첫 번째 도시만 별도로 들고 있는다.
const REGION_FALLBACK_CITY = {
  domestic: "제주",
  japan: "도쿄",
  china: "상하이",
  southeast_asia: "방콕",
  europe: "파리",
  north_america: "뉴욕",
  latin_america: "칸쿤",
  africa: "카이로",
  oceania: "시드니",
};

// 지도 모달을 처음 열 때 쓸 기본 중심 좌표(서울). 아무 정보도 없을 때의 최후 폴백.
const DEFAULT_CENTER = { lat: 37.5665, lng: 126.978, country: "KR" };

// currentSlot과 같은 날(day)의 다른 일정 중 좌표가 있는 것을 시간순으로 찾는다.
// currentSlot.startTime보다 이른 것 중 가장 가까운 것(바로 앞 일정)을 우선하고,
// 없으면 늦은 것 중 가장 가까운 것(바로 다음 일정)을 쓴다.
function findNearestSameDaySlot(state, currentSlot) {
  if (!currentSlot || currentSlot.day == null || !currentSlot.startTime) return null;

  const siblings = (state.itinerary || []).filter(
    (s) =>
      s.day === currentSlot.day &&
      s.id !== currentSlot.id &&
      typeof s.lat === "number" &&
      typeof s.lng === "number",
  );

  const before = siblings
    .filter((s) => s.startTime < currentSlot.startTime)
    .sort((a, b) => (a.startTime > b.startTime ? -1 : 1));
  if (before.length > 0) {
    return { lat: before[0].lat, lng: before[0].lng };
  }

  const after = siblings
    .filter((s) => s.startTime > currentSlot.startTime)
    .sort((a, b) => (a.startTime < b.startTime ? -1 : 1));
  if (after.length > 0) {
    return { lat: after[0].lat, lng: after[0].lng };
  }

  return null;
}

// 여행의 대표 좌표를 아래 우선순위로 계산한다.
// 1) currentSlot(편집 중인 일정) 자체에 좌표가 있으면 그 좌표
// 2) 같은 날 일정 중 시간순으로 가장 가까운 앞쪽 일정의 좌표(없으면 바로 다음 일정)
// 3) tripCity가 CITY_COORDS에 있으면 그 좌표
// 4) 같은 여행의 일정 중 좌표가 지정된 첫 일정
// 5) selectedRegion의 대표 도시 좌표
// 6) 기본값(서울)
// currentSlot은 선택값: 지도를 열 때 편집 중인 일정({ id, day, startTime, lat, lng })을 넘기면
// 1), 2) 단계가 적용되고, 넘기지 않으면 기존 3)~6) 우선순위만 적용된다.
export function getTripCenter(state, currentSlot) {
  if (!state) return DEFAULT_CENTER;

  if (
    currentSlot &&
    typeof currentSlot.lat === "number" &&
    typeof currentSlot.lng === "number"
  ) {
    return { lat: currentSlot.lat, lng: currentSlot.lng };
  }

  const nearestSameDay = findNearestSameDaySlot(state, currentSlot);
  if (nearestSameDay) {
    return nearestSameDay;
  }

  if (state.tripCity && CITY_COORDS[state.tripCity]) {
    return CITY_COORDS[state.tripCity];
  }

  const firstPinned = (state.itinerary || []).find(
    (s) => typeof s.lat === "number" && typeof s.lng === "number",
  );
  if (firstPinned) {
    return { lat: firstPinned.lat, lng: firstPinned.lng };
  }

  const fallbackCity = REGION_FALLBACK_CITY[state.selectedRegion];
  if (fallbackCity && CITY_COORDS[fallbackCity]) {
    return CITY_COORDS[fallbackCity];
  }

  return DEFAULT_CENTER;
}
