import { useEffect, useRef } from "react";

// ▼▼▼ AdSense 승인 나면 이 값 하나만 true로 바꾸세요 ▼▼▼
// false인 동안은 이 파일이 내보내는 모든 배너(AdBanner, MobileAdSticky)가
// 어디에 쓰이든 전부 렌더링 자체를 하지 않습니다(return null) — 화면에 빈 박스,
// 테두리, 여백 등 어떤 흔적도 남기지 않습니다. 모바일 하단 배너의 높이 측정
// 로직도 그 결과로 0을 보고하므로, 콘텐츠 padding-bottom도 자동으로 탭바
// 높이만큼만 줄어들어 불필요한 빈 공간이 남지 않습니다.
export const SHOW_PLACEHOLDER = false;
// ▲▲▲ AdSense 승인 나면 이 값 하나만 true로 바꾸세요 ▲▲▲

// AdSense 승인 후 이 파일의 PLACEHOLDER 부분을 실제 광고 코드로 교체
//
// 사용법:
//   <AdBanner position="main-bottom" | "main-side" | "expense" | "modal" | "loading" onClose={fn?} />
//   <MobileAdSticky /> — 모바일 전용, 하단 탭바 바로 위에 고정으로 배너를 띄움
//
// PC 사이드 배너(main-side)는 별도 고정 레일이 아니라, PCRightPanel(App.jsx)의
// 각 탭별 우측 컬럼 안에서 마지막 카드 다음에 오는 "그냥 하나의 카드"로 씁니다.
// 그 컬럼의 실제 폭에 맞춰 자연스럽게 나타나고, 우측 컬럼 자체가 없는 모바일에서는
// PCRightPanel이 렌더링되지 않으므로 자동으로 안 보입니다.
//
// - AdSense 승인 전: position별 규격에 맞는 빈 placeholder 컨테이너만 렌더링합니다.
// - AdSense 승인 후: 아래 renderPlaceholder() 함수 내부의 PLACEHOLDER 표시 부분만
//   <ins className="adsbygoogle" ...> 태그로 교체하면, 이 컴포넌트를 쓰는 모든 위치에
//   실제 광고가 한 번에 적용됩니다. (반응형 규격/래퍼 구조는 그대로 유지)
//
// 모든 배너는 "고정 픽셀 크기"가 아니라 "유동(fluid) 크기"로 렌더링됩니다.
// width는 항상 100%(컨테이너 기준)이고, minHeight로 최소 높이만 보장하며,
// maxWidth로 지나치게 커지는 것만 막습니다. 실제 광고가 붙으면 그 안에서
// 자기 콘텐츠 크기에 맞춰 자연스럽게 늘어날 수 있도록 height는 강제하지 않습니다.

// 같은 CSS 변수(:root에 applyTheme()으로 주입됨)를 참조하는 theme 토큰.
// App.jsx의 theme 객체와 동일한 값을 가리키므로 앱 디자인과 통일감 있게 렌더링됩니다.
const theme = {
  bgCard: "var(--t-bg-card)",
  bgInput: "var(--t-bg-input)",
  text: "var(--t-text)",
  textSub: "var(--t-text-sub)",
  textLight: "var(--t-text-light)",
  border: "var(--t-border)",
  borderLight: "var(--t-border-light)",
  radius: "12px",
  radiusSm: "8px",
  radiusFull: "9999px",
};

// position별 유동(fluid) 광고 규격
// minHeight: 광고가 비어있어도 확보할 최소 높이
// maxWidth : 컨테이너가 아무리 넓어져도 이 이상 커지지 않게 막는 상한선 (100% = 제한 없음)
const AD_SPECS = {
  "main-bottom": { minHeight: 50, maxWidth: 728, label: "반응형 배너" },
  "main-side": { minHeight: 250, maxWidth: 300, label: "반응형 사이드 배너" },
  expense: { minHeight: 44, maxWidth: "100%", label: "지출 탭 반응형 배너" },
  modal: { minHeight: 250, maxWidth: 336, label: "반응형 배너" },
  loading: { minHeight: 90, maxWidth: 320, label: "반응형 배너" },
};

// 모바일 하단 탭바/배너 높이의 "초기값(추정치)" — 실제 DOM 측정값이 나오기 전
// 첫 렌더에서만 잠깐 쓰이는 폴백입니다. 탭바는 폰트 렌더링·OS·safe-area 유무에
// 따라 실제 높이가 미묘하게 달라질 수 있어서, 이 상수만 믿고 배너 위치를 고정하면
// 값이 살짝만 어긋나도 배너 아래쪽이 탭바에 가려 잘려 보이는 문제가 생깁니다.
// → App.jsx에서 ResizeObserver로 탭바의 실제 렌더링 높이를 측정해 이 값을 덮어씁니다.
export const MOBILE_TABBAR_HEIGHT_FALLBACK = 56;
export const MOBILE_AD_RESERVED_HEIGHT_FALLBACK =
  AD_SPECS["main-bottom"].minHeight + 12 + 1; // 패딩(6*2) + minHeight + borderTop(1)

function renderPlaceholder(spec) {
  // ▼▼▼ PLACEHOLDER: AdSense 승인 후 이 안쪽만 <ins className="adsbygoogle" ...> 로 교체 ▼▼▼
  return (
    <>
      <span>AD</span>
      <span style={{ fontSize: "10px", opacity: 0.8 }}>{spec.label}</span>
    </>
  );
  // ▲▲▲ PLACEHOLDER 끝 ▲▲▲
}

// ─── position별 래퍼 스타일 ───
function getWrapperStyle(position) {
  switch (position) {
    case "main-bottom":
      return {
        display: "flex",
        justifyContent: "center",
        width: "100%",
        padding: "6px 0",
        boxSizing: "border-box",
      };
    case "main-side":
      return {
        display: "flex",
        justifyContent: "center",
        width: "100%",
        boxSizing: "border-box",
        // PCRightPanel의 마지막 카드 다음에 바로 붙는 위치라, 다른 카드 간
        // 간격(16px)과 동일하게 여기서 직접 줌 — 꺼져 있을 때(SHOW_PLACEHOLDER
        // false)는 컴포넌트 자체가 null을 반환해 이 여백도 함께 사라짐.
        marginTop: "16px",
      };
    case "expense":
      return {
        display: "flex",
        alignItems: "center",
        width: "100%",
        boxSizing: "border-box",
        marginBottom: "12px",
      };
    case "modal":
      return {
        display: "flex",
        justifyContent: "center",
        width: "100%",
        boxSizing: "border-box",
        margin: "16px 0",
      };
    case "loading":
      return {
        display: "flex",
        justifyContent: "center",
        width: "100%",
        boxSizing: "border-box",
        marginTop: "20px",
      };
    default:
      return {
        display: "flex",
        justifyContent: "center",
        width: "100%",
        boxSizing: "border-box",
      };
  }
}

// ─── 재사용 가능한 광고 배너 (유동 크기) ───
// props
//   position: "main-bottom" | "main-side" | "expense" | "modal" | "loading"
//   onClose : (선택) 전달 시 닫기(✕) 버튼이 함께 렌더링됩니다.
export default function AdBanner({ position, onClose }) {
  if (!SHOW_PLACEHOLDER) return null;

  const spec = AD_SPECS[position] || AD_SPECS.modal;
  const isSoft = position === "expense";

  return (
    <div style={getWrapperStyle(position)}>
      <div
        style={{
          position: "relative",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: "2px",
          width: "100%",
          maxWidth:
            typeof spec.maxWidth === "number"
              ? `${spec.maxWidth}px`
              : spec.maxWidth,
          minHeight: `${spec.minHeight}px`,
          background: isSoft ? theme.bgInput : theme.bgCard,
          border: isSoft ? "none" : `1px solid ${theme.border}`,
          borderRadius: isSoft ? theme.radiusFull : theme.radiusSm,
          boxSizing: "border-box",
          overflow: "hidden",
          paddingRight: onClose ? "34px" : 0,
          color: theme.textLight,
          fontSize: "11px",
          fontWeight: "600",
          userSelect: "none",
        }}
      >
        {renderPlaceholder(spec)}

        {onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label="광고 닫기"
            style={{
              position: "absolute",
              top: "50%",
              right: "8px",
              transform: "translateY(-50%)",
              width: "22px",
              height: "22px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: "none",
              border: "none",
              borderRadius: "50%",
              fontSize: "14px",
              lineHeight: 1,
              color: theme.textSub,
              cursor: "pointer",
              padding: 0,
            }}
          >
            ✕
          </button>
        )}
      </div>
    </div>
  );
}

// ─── 모바일 전용: 하단 탭바 바로 위에 고정되는 배너 ───
// position: fixed + bottom 오프셋으로, 스크롤 위치·탭 내용과 무관하게
// 항상 뷰포트 기준 하단 탭바 바로 위 같은 자리에 온전히 보입니다.
// (position: sticky는 루트가 flex 컨테이너인 이 앱 구조에서 컨테이닝 블록에
//  따라 상단으로 밀리거나 잘리는 경우가 있어 fixed로 전환)
//
// props
//   tabBarHeight  : 하단 탭바의 "실측" 높이(px). App.jsx가 getBoundingClientRect()로
//                   탭바 DOM을 직접 측정해 내려줍니다. 탭바는 이미 자기 paddingBottom에
//                   env(safe-area-inset-bottom)을 포함해서 렌더링되므로, 이 값 자체에
//                   safe-area만큼의 높이가 이미 녹아 있습니다 — 그래서 아래 bottom 계산에
//                   safe-area를 또 더하면 이중 계산이 되어 노치 있는 기기에서 배너가
//                   필요 이상으로 위로 붕 뜹니다. 하드코딩된 추정치 대신 실측값을 써야,
//                   폰트/OS 렌더링 차이로 탭바 실제 높이가 몇 px만 어긋나도 배너 아래쪽이
//                   탭바에 가려 잘리는 문제가 재발하지 않습니다.
//   onHeightChange: 이 배너 자체의 실측 높이(px)가 바뀔 때마다 호출됩니다.
//                   App.jsx는 이 값 + tabBarHeight만큼 콘텐츠 영역 하단에
//                   padding-bottom을 줘서, fixed로 빠진 배너에 콘텐츠 마지막
//                   줄이 가려지지 않게 합니다.
export function MobileAdSticky({
  tabBarHeight = MOBILE_TABBAR_HEIGHT_FALLBACK,
  onHeightChange,
}) {
  const ref = useRef(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || !onHeightChange || typeof ResizeObserver === "undefined") {
      return;
    }
    const report = () => onHeightChange(el.getBoundingClientRect().height);
    report();
    const ro = new ResizeObserver(report);
    ro.observe(el);
    return () => ro.disconnect();
  }, [onHeightChange]);

  return (
    <div
      ref={ref}
      style={{
        position: "fixed",
        left: 0,
        right: 0,
        // tabBarHeight는 탭바를 실측한 값이라 safe-area가 이미 포함돼 있음 →
        // 여기서 env(safe-area-inset-bottom)을 또 더하지 않음(이중 계산 방지).
        bottom: `${tabBarHeight}px`,
        zIndex: 95,
        boxSizing: "border-box",
        // SHOW_PLACEHOLDER가 false면 배경·테두리도 넣지 않음 — 안쪽 <AdBanner/>가
        // null을 반환해 콘텐츠가 없어지는 것과 더불어, 이 래퍼 자체도 시각적으로
        // 완전히 투명한 0px 높이 요소가 되어 화면에 어떤 흔적도 남기지 않습니다.
        ...(SHOW_PLACEHOLDER
          ? {
              background: theme.bgCard,
              borderTop: `1px solid ${theme.borderLight}`,
            }
          : {}),
      }}
    >
      <AdBanner position="main-bottom" />
    </div>
  );
}
