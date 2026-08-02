// ─── 제휴(어필리에이트) 링크 설정 ───
// active: false면 해당 버튼이 화면에 아예 안 보입니다.
// 승인 전에는 일반 링크로, 승인 후 제휴 링크로 바꿔서 교체하면 됩니다.

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