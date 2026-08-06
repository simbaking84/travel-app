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

export const AFFILIATE_LINKS = {
  hotel: {
    label: "숙소 예약",
    url: "https://www.agoda.com/partners/partnersearch.aspx?pcs=1&cid=1969873&hl=ko-kr",
    active: false,
  },
  flight: {
    label: "항공권 예약",
    url: "https://www.skyscanner.co.kr/",
    active: false,
  },
  activity: {
    label: "투어·입장권",
    url: "https://affiliate.klook.com/redirect?aid=128507&aff_adid=1353329&k_site=https%3A%2F%2Fwww.klook.com%2F",
    active: true,
  },
  esim: {
    label: "유심·eSIM",
    url: "",
    active: false,
  },
  insurance: {
    label: "여행자보험",
    url: "",
    active: false,
  },
};