// ─── 제휴(어필리에이트) 링크 설정 ───
// active: false면 해당 버튼이 화면에 아예 안 보입니다.
// 승인 전에는 일반 링크로, 승인 후 제휴 링크로 바꿔서 교체하면 됩니다.

// 클룩 도시별 페이지 슬러그 (확인된 도시만 등록, 나머지는 검색결과 페이지로 폴백)
const KLOOK_CITY_SLUGS = {
  도쿄: "c28-tokyo",
  오사카: "c29-osaka",
  교토: "c30-kyoto",
  나고야: "c71-nagoya",
  오키나와: "c13641-naha",
  삿포로: "c133938-sapporo",
  상하이: "c59-shanghai",
  방콕: "c4-bangkok",
  다낭: "c74-da-nang",
  파리: "c107-paris",
  로마: "c92-rome",
  바르셀로나: "c108-barcelona",
  뉴욕: "c93-new-york",
  라스베가스: "c136-las-vegas",
  LA: "c124-los-angeles",
};

const KLOOK_HOME_URL = "https://www.klook.com/";
const KLOOK_AFFILIATE_PREFIX =
  "https://affiliate.klook.com/redirect?aid=128507&aff_adid=1353329&k_site=";

function buildKlookAffiliateUrl(destinationUrl) {
  return `${KLOOK_AFFILIATE_PREFIX}${encodeURIComponent(destinationUrl)}`;
}

// state.accommodation(여행지) 문자열에서 확인된 도시를 찾아 클룩 도시 페이지(한국어)로,
// 확인되지 않은 도시는 입력한 텍스트로 클룩 검색결과 페이지로,
// 여행지 입력이 아예 없으면 클룩 홈으로 연결되는 제휴 링크를 반환합니다.
export function getKlookActivityUrl(destination) {
  const dest = (destination || "").trim();
  if (dest) {
    const matchedCity = Object.keys(KLOOK_CITY_SLUGS).find((city) =>
      dest.toUpperCase().includes(city.toUpperCase())
    );
    if (matchedCity) {
      return buildKlookAffiliateUrl(
        `https://www.klook.com/ko/destination/${KLOOK_CITY_SLUGS[matchedCity]}/`
      );
    }
    return buildKlookAffiliateUrl(
      `https://www.klook.com/ko/search/result/?query=${encodeURIComponent(dest)}`
    );
  }
  return buildKlookAffiliateUrl(KLOOK_HOME_URL);
}

// ─── 트립닷컴(Trip.com) 제휴 링크 ───
const TRIP_COM_PARTNER_PARAMS = "Allianceid=9908886&SID=327865168";
const TRIP_COM_SUB3 = "D19144078";

// 숙소: 도시별 코드가 확인된 도시만 등록, 나머지는 트립닷컴 홈으로 폴백
// code는 트립닷컴 cityId. 동명이인 도시가 있는 경우 검색 자동완성의 국가/지역(breadcrumb)과
// 실제 호텔 목록으로 국가를 재확인한 뒤 등록함 (예: 로마 - 영국 콘월 동명 지명 존재, 파리 - 미국 텍사스,
// 바르셀로나 - 베네수엘라, 라스베가스 - 스페인 마드리드 등 동명이인 존재 확인, 모두 정상 국가로 확정).
// 강릉은 서울 소재 조선왕릉(康陵)과 동명이인이 자동완성에 함께 뜨므로 강원도 강릉시 쪽을 확정해 등록함.
// 제주는 검색어 그대로 두면 제주특별자치도(도 단위, cityId 없음)가 먼저 잡히므로 "제주시" 재검색으로
// 확정한 city ID를 등록함.
const TRIP_COM_HOTEL_CITIES = {
  서울: { code: 274, display: "서울" },
  도쿄: { code: 228, display: "도쿄" },
  오사카: { code: 219, display: "오사카" }, // 일본
  교토: { code: 734, display: "교토" }, // 일본
  나고야: { code: 360, display: "나고야" }, // 일본
  오키나와: { code: 207, display: "오키나와" }, // 일본
  삿포로: { code: 641, display: "삿포로" }, // 일본
  후쿠오카: { code: 248, display: "후쿠오카" }, // 일본
  상하이: { code: 2, display: "상하이" }, // 중국
  방콕: { code: 359, display: "방콕" }, // 태국
  다낭: { code: 1356, display: "다낭" }, // 베트남
  파리: { code: 192, display: "파리" }, // 프랑스
  로마: { code: 343, display: "로마" }, // 이탈리아
  바르셀로나: { code: 40795, display: "바르셀로나" }, // 스페인
  뉴욕: { code: 633, display: "뉴욕" }, // 미국
  라스베가스: { code: 26282, display: "라스베이거스" }, // 미국 (트립닷컴 표기: 라스베이거스)
  LA: { code: 347, display: "로스엔젤레스" }, // 미국 (트립닷컴 표기: 로스엔젤레스)
  제주: { code: 737, display: "제주시" }, // 대한민국
  부산: { code: 253, display: "부산" }, // 대한민국
  강릉: { code: 61325, display: "강릉" }, // 대한민국
  여수: { code: 4016, display: "여수" }, // 대한민국
  경주: { code: 3675, display: "경주" }, // 대한민국
};

// "숙소" 탭 URL(/hotels/?locale=ko-KR&curr=KRW)은 Chrome으로 홈페이지 좌측 "숙소" 메뉴를 클릭했을 때
// 실제로 이동하는 URL을 직접 확인해 반영함 (트립닷컴 홈 대신 숙소 탭이 명확히 선택된 상태로 폴백).
const TRIP_COM_HOTEL_FALLBACK_URL = `https://kr.trip.com/hotels/?locale=ko-KR&curr=KRW&${TRIP_COM_PARTNER_PARAMS}&trip_sub1=hotel&trip_sub3=${TRIP_COM_SUB3}`;

// 항공: 서울(SEL) 출발 고정, 도착지 공항코드가 확인된 도시만 등록, 나머지는 트립닷컴 홈으로 폴백
// engName/airportCode는 Chrome으로 kr.trip.com 항공권 탭에서 "서울 → {도시}" 검색 후 실제 이동한
// URL(flights/Seoul-to-{engName}/tickets-SEL-{airportCode})과 도착 공항으로 확인한 값.
// 파리(PAR→CDG), 로마(ROM→FCO), 바르셀로나(BCN→BCN 직항), 라스베가스(LAS→LAS), LA(LAX→LAX 직항)는
// 동명이인 지명(미국 텍사스 파리, 영국 콘월 로마, 베네수엘라 바르셀로나, 스페인 마드리드 인근 라스베가스 등)이
// 존재해 실제 도착 공항 코드로 정상 국가행이 맞는지 재확인함.
// 교토는 자체 공항이 없어(항공권 자동완성에서 선택 비활성화) 등록하지 않음 — 인근 오사카/간사이/고베공항만 개별 선택 가능.
const TRIP_COM_FLIGHT_CITIES = {
  도쿄: { engName: "Tokyo", airportCode: "TYO" },
  오사카: { engName: "Osaka", airportCode: "OSA" },
  후쿠오카: { engName: "Fukuoka", airportCode: "FUK" },
  오키나와: { engName: "Okinawa", airportCode: "OKA" },
  삿포로: { engName: "Sapporo", airportCode: "SPK" },
  상하이: { engName: "Shanghai", airportCode: "SHA" },
  방콕: { engName: "Bangkok", airportCode: "BKK" },
  다낭: { engName: "Danang", airportCode: "DAD" },
  파리: { engName: "Paris", airportCode: "PAR" }, // 동명이인 확인: ICN→CDG, 프랑스 파리 (미국 텍사스 파리 아님)
  로마: { engName: "Rome", airportCode: "ROM" }, // 동명이인 확인: ICN→FCO, 이탈리아 로마 (영국 콘월 로마 아님)
  바르셀로나: { engName: "Barcelona", airportCode: "BCN" }, // 동명이인 확인: ICN→BCN 직항, 스페인 바르셀로나 (베네수엘라 아님)
  뉴욕: { engName: "New-York", airportCode: "NYC" },
  라스베가스: { engName: "Las-Vegas", airportCode: "LAS" }, // 동명이인 확인: ICN→LAS, 미국 라스베이거스 (스페인 마드리드 인근 아님)
  LA: { engName: "Los-Angeles", airportCode: "LAX" },
};

// "항공권" 탭 URL(/flights/?locale=ko-KR&curr=KRW)도 동일한 방식으로 Chrome에서 직접 클릭해 확인함.
const TRIP_COM_FLIGHT_FALLBACK_URL = `https://kr.trip.com/flights/?locale=ko-KR&curr=KRW&${TRIP_COM_PARTNER_PARAMS}&trip_sub1=flight&trip_sub3=${TRIP_COM_SUB3}`;

// state.accommodation(여행지) 문자열에서 확인된 도시를 찾아 트립닷컴 숙소 목록 페이지로,
// 확인되지 않은 도시(또는 입력 없음)는 트립닷컴 홈으로 연결되는 제휴 링크를 반환합니다.
export function getTripComHotelUrl(destination) {
  const dest = (destination || "").trim();
  if (dest) {
    const matchedCity = Object.keys(TRIP_COM_HOTEL_CITIES).find((city) =>
      dest.toUpperCase().includes(city.toUpperCase())
    );
    if (matchedCity) {
      const { code, display } = TRIP_COM_HOTEL_CITIES[matchedCity];
      const encodedDisplay = encodeURIComponent(display);
      return (
        `https://kr.trip.com/hotels/list?city=${code}&display=${encodedDisplay}` +
        `&optionId=${code}&optionType=City&optionName=${encodedDisplay}` +
        `&${TRIP_COM_PARTNER_PARAMS}&trip_sub1=hotel&trip_sub3=${TRIP_COM_SUB3}`
      );
    }
  }
  return TRIP_COM_HOTEL_FALLBACK_URL;
}

// state.accommodation(여행지) 문자열에서 확인된 도착 도시를 찾아 서울(SEL) 출발 항공권 페이지로,
// 확인되지 않은 도시(또는 입력 없음)는 트립닷컴 홈으로 연결되는 제휴 링크를 반환합니다.
export function getTripComFlightUrl(destination) {
  const dest = (destination || "").trim();
  if (dest) {
    const matchedCity = Object.keys(TRIP_COM_FLIGHT_CITIES).find((city) =>
      dest.toUpperCase().includes(city.toUpperCase())
    );
    if (matchedCity) {
      const { engName, airportCode } = TRIP_COM_FLIGHT_CITIES[matchedCity];
      return (
        `https://kr.trip.com/flights/Seoul-to-${engName}/tickets-SEL-${airportCode}` +
        `?flighttype=S&dcity=SEL&acity=${airportCode}` +
        `&${TRIP_COM_PARTNER_PARAMS}&trip_sub1=flight&trip_sub3=${TRIP_COM_SUB3}`
      );
    }
  }
  return TRIP_COM_FLIGHT_FALLBACK_URL;
}

// 유심·eSIM: 도시·국가 구분 없이 고정 링크 하나로 연결
const ESIM_FIXED_URL = "https://3ha.in/r/603327";

export const AFFILIATE_LINKS = {
  hotel: {
    label: "숙소 예약",
    url: TRIP_COM_HOTEL_FALLBACK_URL,
    active: true,
  },
  flight: {
    label: "항공권 예약",
    url: TRIP_COM_FLIGHT_FALLBACK_URL,
    active: true,
  },
  activity: {
    label: "투어·입장권",
    url: "https://affiliate.klook.com/redirect?aid=128507&aff_adid=1353329&k_site=https%3A%2F%2Fwww.klook.com%2F",
    active: true,
  },
  esim: {
    label: "유심·eSIM",
    url: ESIM_FIXED_URL,
    active: true,
  },
  insurance: {
    label: "여행자보험",
    url: "https://kr.trip.com/insurance?bid=1&cid=2&pid=1&locale=ko-KR&curr=KRW&Allianceid=9908886&SID=327865168&trip_sub1=insurance&trip_sub3=D19243324",
    active: true,
  },
};