import { useState, useEffect, useCallback, useRef } from "react";

import * as XLSX from 'xlsx';

// ─── Constants ───
// ⚠️ 버전 변경 시 이 한 줄만 수정하면 화면에 표시되는 모든 버전 텍스트가 자동으로 바뀜
const APP_VERSION = "v2.02";

const STORAGE_KEY = "travel_app_v2";
const ARCHIVE_KEY = "travel_archive_v2";

const TABS = {
  itinerary: { id: "itinerary", label: "일정", icon: "📅" },
  expense: { id: "expense", label: "지출", icon: "💰" },
  check: { id: "check", label: "체크", icon: "✅" },
  settings: { id: "settings", label: "설정", icon: "⚙️" },
};

const DEFAULT_STATE = {
  tripName: "",
  tripStart: "",
  tripEnd: "",
  tripRegion: "overseas",
  accommodation: "",
  tripCard: null,
  tripMemo: "",
  currency: "JPY",
  rate: 0,
  itinerary: [],
  expenses: [],
  budget: { totalKRW: 0, totalLocal: 0, categories: [] },
  selectedRegion: "",
  checkStates: {},
  companionType: "",
  companionCount: 1,
  shoppingList: [],
  version: "2.0",
  lastSaved: null,
};

const CURRENCIES = [
  { code: "JPY", name: "일본 엔", symbol: "¥", defaultRate: 9.2 },
  { code: "USD", name: "미국 달러", symbol: "$", defaultRate: 1380 },
  { code: "EUR", name: "유로", symbol: "€", defaultRate: 1520 },
  { code: "THB", name: "태국 바트", symbol: "฿", defaultRate: 39 },
  { code: "CNY", name: "중국 위안", symbol: "¥", defaultRate: 190 },
  { code: "GBP", name: "영국 파운드", symbol: "£", defaultRate: 1780 },
  { code: "VND", name: "베트남 동", symbol: "₫", defaultRate: 0.054 },
  { code: "TWD", name: "대만 달러", symbol: "NT$", defaultRate: 43 },
  { code: "PHP", name: "필리핀 페소", symbol: "₱", defaultRate: 24 },
  { code: "SGD", name: "싱가포르 달러", symbol: "S$", defaultRate: 1030 },
  { code: "MYR", name: "말레이시아 링깃", symbol: "RM", defaultRate: 310 },
  { code: "KRW", name: "원화 (국내여행)", symbol: "₩", defaultRate: 1 },
];

// ─── Utility Functions ───
function getTabOrder(tripStart, tripEnd) {
  if (!tripStart || !tripEnd) return ["check", "itinerary", "expense", "settings"];
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const start = new Date(tripStart + "T00:00:00");
  const end = new Date(tripEnd + "T00:00:00");
  if (today < start) return ["check", "itinerary", "expense", "settings"];
  if (today > end) return ["expense", "itinerary", "check", "settings"];
  return ["itinerary", "expense", "check", "settings"];
}

function getTripPhase(tripStart, tripEnd) {
  if (!tripStart || !tripEnd) return "before";
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const start = new Date(tripStart + "T00:00:00");
  const end = new Date(tripEnd + "T00:00:00");
  if (today < start) return "before";
  if (today > end) return "after";
  return "during";
}

function getDday(tripStart) {
  if (!tripStart) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const start = new Date(tripStart + "T00:00:00");
  const diff = Math.ceil((start - today) / (1000 * 60 * 60 * 24));
  if (diff > 0) return `D-${diff}`;
  if (diff === 0) return "D-DAY";
  return `D+${Math.abs(diff)}`;
}

function formatDate(dateStr) {
  if (!dateStr) return "";
  const d = new Date(dateStr + "T00:00:00");
  const m = d.getMonth() + 1;
  const day = d.getDate();
  const weekdays = ["일", "월", "화", "수", "목", "금", "토"];
  return `${m}/${day}(${weekdays[d.getDay()]})`;
}

function escapeHtml(str) {
  return String(str ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

// 여행 기록을 인쇄용 창으로 열어서 PDF로 저장할 수 있게 함 (브라우저 인쇄 → PDF로 저장)
function exportArchiveToPDF(arc) {
  const rate = arc.rate || 1;
  const totalSpent = (arc.expenses || []).reduce((s, e) =>
    s + (e.currency === "KRW" ? (e.amount || 0) : (e.amount || 0) * rate), 0);

  const itineraryRows = [...(arc.itinerary || [])]
    .sort((a, b) => (a.day - b.day) || ((a.startTime || "") < (b.startTime || "") ? -1 : 1))
    .map(it => `<tr>
      <td>D${(it.day || 0) + 1}</td>
      <td>${escapeHtml(it.startTime || "")}</td>
      <td>${escapeHtml(it.title || "")}</td>
      <td>${escapeHtml(it.place || "")}</td>
      <td>${escapeHtml(it.note || "")}</td>
    </tr>`).join("");

  const expenseRows = (arc.expenses || []).map(e => `<tr>
      <td>${escapeHtml(e.title || e.category || "")}</td>
      <td>${escapeHtml(e.category || "")}</td>
      <td style="text-align:right">${(e.amount || 0).toLocaleString()} ${escapeHtml(e.currency || "")}</td>
    </tr>`).join("");

  const html = `<!DOCTYPE html><html lang="ko"><head><meta charset="utf-8">
  <title>${escapeHtml(arc.tripName || "여행")} 기록</title>
  <style>
    body{font-family:'Noto Sans KR','Pretendard',sans-serif;padding:32px;color:#1a1a1a;max-width:800px;margin:0 auto;}
    h1{font-size:22px;margin:0 0 4px 0;}
    .sub{color:#666;font-size:13px;margin-bottom:20px;}
    h3{font-size:15px;margin:20px 0 8px 0;border-bottom:2px solid #333;padding-bottom:4px;}
    table{width:100%;border-collapse:collapse;margin-bottom:16px;font-size:12.5px;}
    th,td{border:1px solid #ddd;padding:6px 8px;text-align:left;}
    th{background:#f5f5f5;}
    .total{font-weight:700;text-align:right;margin-top:4px;font-size:14px;}
    .tripcard{max-width:100%;border-radius:8px;margin-bottom:16px;display:block;}
    .review{font-style:italic;color:#555;margin-top:4px;}
    @media print { body{padding:12px;} }
  </style></head>
  <body>
    ${arc.tripCard ? `<img class="tripcard" src="${arc.tripCard}" />` : ""}
    <h1>${escapeHtml(arc.tripName || "여행")}</h1>
    <div class="sub">
      ${arc.tripStart ? formatDate(arc.tripStart) : ""} ~ ${arc.tripEnd ? formatDate(arc.tripEnd) : ""}
      ${arc.companionType ? ` · 동행: ${escapeHtml(arc.companionType)} ${arc.companionCount || ""}명` : ""}
    </div>
    ${arc.review ? `<div class="review">"${escapeHtml(arc.review)}"</div>` : ""}

    <h3>📅 일정 (${(arc.itinerary || []).length}개)</h3>
    <table>
      <thead><tr><th>일차</th><th>시간</th><th>제목</th><th>장소</th><th>메모</th></tr></thead>
      <tbody>${itineraryRows || '<tr><td colspan="5" style="text-align:center;color:#999">일정 없음</td></tr>'}</tbody>
    </table>

    <h3>💰 지출 (${(arc.expenses || []).length}건)</h3>
    <table>
      <thead><tr><th>항목</th><th>카테고리</th><th>금액</th></tr></thead>
      <tbody>${expenseRows || '<tr><td colspan="3" style="text-align:center;color:#999">지출 없음</td></tr>'}</tbody>
    </table>
    <div class="total">총 지출(원화 환산): ${Math.round(totalSpent).toLocaleString()}원</div>
    ${arc.tripMemo ? `<h3>📝 메모</h3><p style="font-size:13px;white-space:pre-wrap;">${escapeHtml(arc.tripMemo)}</p>` : ""}
  </body></html>`;

  const w = window.open("", "_blank");
  if (!w) {
    alert("팝업이 차단되어 인쇄 화면을 열 수 없습니다.\n브라우저의 팝업 차단을 허용한 후 다시 시도해 주세요.");
    return;
  }
  w.document.write(html);
  w.document.close();
  // 이미지(여행카드) 로딩을 기다린 후 인쇄 대화상자 호출
  setTimeout(() => { try { w.print(); } catch (e) { /* ignore */ } }, 400);
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) { /* ignore */ }
  return null;
}

function saveState(state) {
  const s = { ...state, lastSaved: new Date().toISOString() };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
    return s;
  } catch (e) {
    // 저장공간 초과 — 여행카드 이미지를 제외하고 재시도 (일정/지출 데이터 손실 방지가 우선)
    try {
      const stripped = { ...s, tripCard: null };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(stripped));
      return stripped;
    } catch (e2) { /* 그래도 실패하면 메모리상 state는 유지, 다음 자동저장에서 재시도 */ }
  }
  return state;
}

function loadArchive() {
  try {
    const raw = localStorage.getItem(ARCHIVE_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) { /* ignore */ }
  return [];
}

function saveArchive(archive) {
  try {
    localStorage.setItem(ARCHIVE_KEY, JSON.stringify(archive));
    return { ok: true };
  } catch (e) {
    // 저장공간 초과 등 — 여행카드 이미지를 제외하고 재시도
    try {
      const stripped = archive.map(a => ({ ...a, tripCard: null }));
      localStorage.setItem(ARCHIVE_KEY, JSON.stringify(stripped));
      return { ok: true, strippedImages: true };
    } catch (e2) {
      return { ok: false, error: e2 };
    }
  }
}

// ─── Theme System ───
const REGION_FLAGS = {
  japan: "🇯🇵", europe: "🇪🇺", southeast_asia: "🌴",
  usa: "🇺🇸", domestic: "🇰🇷", overseas: "🌏",
};

const THEME_PRESETS = {
  light: {
    "--t-bg": "#FAFAF8", "--t-bg-card": "#FFFFFF", "--t-bg-sidebar": "#1A1D23",
    "--t-bg-input": "#F3F4F6", "--t-bg-badge": "#F0EFEB",
    "--t-text": "#1A1D23", "--t-text-sub": "#6B7280", "--t-text-light": "#9CA3AF", "--t-text-white": "#FFFFFF",
    "--t-primary": "#2563EB", "--t-primary-light": "#EFF6FF", "--t-primary-dark": "#1D4ED8",
    "--t-success": "#10B981", "--t-warning": "#F59E0B", "--t-danger": "#EF4444",
    "--t-border": "#E5E7EB", "--t-border-light": "#F3F4F6",
    "--t-shadow": "0 1px 3px rgba(0,0,0,0.06)", "--t-shadow-lg": "0 8px 24px rgba(0,0,0,0.12)",
  },
  dark: {
    "--t-bg": "#0F1117", "--t-bg-card": "#1A1D23", "--t-bg-sidebar": "#080A0F",
    "--t-bg-input": "#252933", "--t-bg-badge": "#252933",
    "--t-text": "#F1F5F9", "--t-text-sub": "#94A3B8", "--t-text-light": "#64748B", "--t-text-white": "#FFFFFF",
    "--t-primary": "#3B82F6", "--t-primary-light": "#1E3A5F", "--t-primary-dark": "#2563EB",
    "--t-success": "#34D399", "--t-warning": "#FBBF24", "--t-danger": "#F87171",
    "--t-border": "#2D3340", "--t-border-light": "#1E2330",
    "--t-shadow": "0 1px 3px rgba(0,0,0,0.3)", "--t-shadow-lg": "0 8px 24px rgba(0,0,0,0.5)",
  },
  spring: {
    "--t-bg": "#FFF5F8", "--t-bg-card": "#FFFFFF", "--t-bg-sidebar": "#7B0F3B",
    "--t-bg-input": "#FFE8F2", "--t-bg-badge": "#FFD6EA",
    "--t-text": "#2D0A30", "--t-text-sub": "#E91E8C", "--t-text-light": "#F06292", "--t-text-white": "#FFFFFF",
    "--t-primary": "#D81B60", "--t-primary-light": "#FCE4EC", "--t-primary-dark": "#880E4F",
    "--t-success": "#43A047", "--t-warning": "#FB8C00", "--t-danger": "#E53935",
    "--t-border": "#F8BBD9", "--t-border-light": "#FFD6EA",
    "--t-shadow": "0 1px 3px rgba(216,27,96,0.1)", "--t-shadow-lg": "0 8px 24px rgba(216,27,96,0.18)",
  },
  summer: {
    "--t-bg": "#EFF6FF", "--t-bg-card": "#FFFFFF", "--t-bg-sidebar": "#0D2D6B",
    "--t-bg-input": "#DBEAFE", "--t-bg-badge": "#EFF6FF",
    "--t-text": "#0C1E4A", "--t-text-sub": "#1D6FA4", "--t-text-light": "#60A5FA", "--t-text-white": "#FFFFFF",
    "--t-primary": "#2563EB", "--t-primary-light": "#DBEAFE", "--t-primary-dark": "#1D4ED8",
    "--t-success": "#059669", "--t-warning": "#D97706", "--t-danger": "#DC2626",
    "--t-border": "#93C5FD", "--t-border-light": "#DBEAFE",
    "--t-shadow": "0 1px 3px rgba(37,99,235,0.08)", "--t-shadow-lg": "0 8px 24px rgba(37,99,235,0.15)",
  },
  fall: {
    "--t-bg": "#FFF8F0", "--t-bg-card": "#FFFDF9", "--t-bg-sidebar": "#2D1300",
    "--t-bg-input": "#FFF3E0", "--t-bg-badge": "#FFF8F0",
    "--t-text": "#3E1500", "--t-text-sub": "#A1522C", "--t-text-light": "#D4845A", "--t-text-white": "#FFFFFF",
    "--t-primary": "#E64A19", "--t-primary-light": "#FBE9E7", "--t-primary-dark": "#BF360C",
    "--t-success": "#558B2F", "--t-warning": "#F9A825", "--t-danger": "#B71C1C",
    "--t-border": "#FFCCBC", "--t-border-light": "#FBE9E7",
    "--t-shadow": "0 1px 3px rgba(230,74,25,0.08)", "--t-shadow-lg": "0 8px 24px rgba(230,74,25,0.15)",
  },
  winter: {
    "--t-bg": "#F0F3F8", "--t-bg-card": "#FFFFFF", "--t-bg-sidebar": "#1A2540",
    "--t-bg-input": "#E4EAF4", "--t-bg-badge": "#ECF0F8",
    "--t-text": "#1A2035", "--t-text-sub": "#546E7A", "--t-text-light": "#90A4AE", "--t-text-white": "#FFFFFF",
    "--t-primary": "#3F6FD8", "--t-primary-light": "#E4EAF4", "--t-primary-dark": "#2952B3",
    "--t-success": "#2E7D6B", "--t-warning": "#A07D20", "--t-danger": "#B91C1C",
    "--t-border": "#B0BEC5", "--t-border-light": "#E4EAF4",
    "--t-shadow": "0 1px 3px rgba(60,80,120,0.08)", "--t-shadow-lg": "0 8px 24px rgba(60,80,120,0.14)",
  },
};

function getSeason() {
  const m = new Date().getMonth() + 1;
  if (m >= 3 && m <= 5) return "spring";
  if (m >= 6 && m <= 8) return "summer";
  if (m >= 9 && m <= 11) return "fall";
  return "winter";
}

function applyTheme(mode) {
  const resolved = mode === "system" ? "light"
    : mode === "seasonal" ? getSeason()
    : mode;
  const vars = THEME_PRESETS[resolved] || THEME_PRESETS.light;
  const root = document.documentElement;
  Object.entries(vars).forEach(([k, v]) => root.style.setProperty(k, v));
  // body 배경은 이미지 로딩 실패 시 폴백 색상으로 항상 유지 (AppBackground가 위에 이미지를 덮음)
  document.body.style.background = vars["--t-bg"];
  document.body.style.color = vars["--t-text"];
  // 스크롤바 테마
  let styleEl = document.getElementById("theme-scrollbar");
  if (!styleEl) {
    styleEl = document.createElement("style");
    styleEl.id = "theme-scrollbar";
    document.head.appendChild(styleEl);
  }
  styleEl.textContent = `
    ::-webkit-scrollbar { width: 5px; height: 5px; }
    ::-webkit-scrollbar-track { background: ${vars["--t-bg"]}; }
    ::-webkit-scrollbar-thumb { background: ${vars["--t-border"]}; border-radius: 4px; }
    ::-webkit-scrollbar-thumb:hover { background: ${vars["--t-text-sub"]}; }
    * { scrollbar-width: thin; scrollbar-color: ${vars["--t-border"]} transparent; }
  `;
}

// Theme object uses CSS variables — works with React inline styles
const theme = {
  bg: "var(--t-bg)", bgCard: "var(--t-bg-card)", bgSidebar: "var(--t-bg-sidebar)",
  bgInput: "var(--t-bg-input)", bgBadge: "var(--t-bg-badge)",
  text: "var(--t-text)", textSub: "var(--t-text-sub)", textLight: "var(--t-text-light)", textWhite: "var(--t-text-white)",
  primary: "var(--t-primary)", primaryLight: "var(--t-primary-light)", primaryDark: "var(--t-primary-dark)",
  success: "var(--t-success)", warning: "var(--t-warning)", danger: "var(--t-danger)",
  border: "var(--t-border)", borderLight: "var(--t-border-light)",
  shadow: "var(--t-shadow)", shadowMd: "0 4px 12px rgba(0,0,0,0.08)", shadowLg: "var(--t-shadow-lg)",
  radius: "12px", radiusSm: "8px", radiusLg: "16px", radiusFull: "9999px",
};

// Apply saved theme on load
applyTheme(localStorage.getItem("theme_mode") || "system");


// ─── Components ───

// Welcome Screen
function WelcomeScreen({ onNewTrip, onImport, onViewArchive, hasArchive, bgMode, onOpenSettings, activeTrip, onResumeTrip, showActiveTripWarning, onCloseActiveTripWarning }) {
  return (
    <div style={{
      minHeight: "100dvh",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      background: "transparent",
      padding: "24px",
      fontFamily: "'Pretendard Variable', 'Pretendard', -apple-system, sans-serif",
      position: "relative",
    }}>
      <AppBackground mode={bgMode || "light"} />
      <button onClick={onOpenSettings} aria-label="설정" style={{
        position: "absolute",
        top: "16px",
        right: "16px",
        width: "40px",
        height: "40px",
        borderRadius: "50%",
        background: theme.bgCard,
        border: `1px solid ${theme.border}`,
        fontSize: "18px",
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        boxShadow: theme.shadow,
      }}>
        ⚙️
      </button>

      {activeTrip && (
        <button onClick={onResumeTrip} style={{
          position: "absolute",
          top: "16px",
          left: "16px",
          right: "68px",
          maxWidth: "280px",
          padding: "10px 16px",
          background: theme.primary,
          color: theme.textWhite,
          border: "none",
          borderRadius: theme.radiusFull,
          fontSize: "13px",
          fontWeight: "700",
          cursor: "pointer",
          boxShadow: theme.shadow,
          textAlign: "left",
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}>
          ✈️ "{activeTrip.tripName || "진행중인 여행"}"으로 돌아가기
        </button>
      )}

      <div style={{
        textAlign: "center",
        marginBottom: "48px",
      }}>
        <img
          src={`${process.env.PUBLIC_URL}/assets/icons/mascot-logo.png`}
          alt="모리"
          style={{
            width: "110px",
            height: "110px",
            borderRadius: "50%",
            marginBottom: "16px",
            filter: "drop-shadow(0 2px 4px rgba(0,0,0,0.1))",
          }}
        />
        <h1 style={{
          fontSize: "28px",
          fontWeight: "800",
          color: theme.text,
          margin: "0 0 8px 0",
          letterSpacing: "-0.5px",
        }}>모리의 여행플래너</h1>
        <p style={{
          fontSize: "15px",
          color: theme.textSub,
          margin: 0,
          fontWeight: "400",
        }}>여행의 모든 순간을 한 곳에서</p>
        <div style={{
          marginTop: "8px",
          fontSize: "12px",
          color: theme.textLight,
          fontWeight: "500",
        }}>{APP_VERSION}</div>
      </div>

      <div style={{
        width: "100%",
        maxWidth: "340px",
        display: "flex",
        flexDirection: "column",
        gap: "12px",
      }}>
        <button onClick={onNewTrip} style={{
          width: "100%",
          padding: "16px 24px",
          background: theme.primary,
          color: theme.textWhite,
          border: "none",
          borderRadius: theme.radius,
          fontSize: "16px",
          fontWeight: "700",
          cursor: "pointer",
          boxShadow: "0 2px 8px rgba(37,99,235,0.3)",
          transition: "all 0.2s",
          letterSpacing: "-0.2px",
        }}>
          ✈️ 새 여행 만들기
        </button>

        <button onClick={onImport} style={{
          width: "100%",
          padding: "16px 24px",
          background: theme.bgCard,
          color: theme.text,
          border: `1.5px solid ${theme.border}`,
          borderRadius: theme.radius,
          fontSize: "16px",
          fontWeight: "600",
          cursor: "pointer",
          transition: "all 0.2s",
          letterSpacing: "-0.2px",
        }}>
          📂 기존 데이터 가져오기
        </button>

        {hasArchive && (
          <button onClick={onViewArchive} style={{
            width: "100%",
            padding: "16px 24px",
            background: "transparent",
            color: theme.textSub,
            border: `1.5px dashed ${theme.border}`,
            borderRadius: theme.radius,
            fontSize: "16px",
            fontWeight: "500",
            cursor: "pointer",
            transition: "all 0.2s",
            letterSpacing: "-0.2px",
          }}>
            📖 여행 기록 보기
          </button>
        )}
      </div>

      {showActiveTripWarning && (
        <ActiveTripWarningModal
          tripName={activeTrip?.tripName}
          onClose={onCloseActiveTripWarning}
          onGoToTrip={onResumeTrip}
        />
      )}
    </div>
  );
}

// Trip Setup Form
function TripSetupForm({ onComplete, onBack, bgMode }) {
  const [form, setForm] = useState({
    tripName: "",
    tripStart: "",
    tripEnd: "",
    tripRegion: "overseas",
    accommodation: "",
    currency: "JPY",
    rate: 9.2,
  });
  const [rateStatus, setRateStatus] = useState("idle"); // idle | loading | live | error

  const loadLiveRate = async (code) => {
    if (!code || code === "KRW") return;
    setRateStatus("loading");
    try {
      const live = await fetchLiveExchangeRate(code);
      setForm(prev => (prev.currency === code ? { ...prev, rate: roundRateForSize(live) } : prev));
      setRateStatus("live");
    } catch {
      setRateStatus("error");
    }
  };

  // 최초 진입 시 기본 통화(JPY) 실시간 환율도 미리 가져오기
  useEffect(() => { loadLiveRate("JPY"); }, []);

  const update = (key, val) => {
    if (key === "currency") {
      const cur = CURRENCIES.find(c => c.code === val);
      setForm(prev => ({ ...prev, currency: val, rate: cur?.defaultRate || "" }));
      setRateStatus("idle");
      if (val !== "KRW") loadLiveRate(val);
    } else {
      setForm(prev => ({ ...prev, [key]: val }));
    }
  };

  const isValid = form.tripName && form.tripStart && form.tripEnd;

  const handleSubmit = () => {
    if (!isValid) return;
    onComplete({
      ...DEFAULT_STATE,
      ...form,
      rate: parseFloat(form.rate) || 0,
      lastSaved: new Date().toISOString(),
    });
  };

  const inputStyle = {
    width: "100%",
    padding: "12px 14px",
    border: `1.5px solid ${theme.border}`,
    borderRadius: theme.radiusSm,
    fontSize: "15px",
    fontWeight: "500",
    color: theme.text,
    background: theme.bgCard,
    outline: "none",
    boxSizing: "border-box",
    transition: "border-color 0.2s",
    fontFamily: "inherit",
  };

  const labelStyle = {
    display: "block",
    fontSize: "13px",
    fontWeight: "700",
    color: theme.textSub,
    marginBottom: "6px",
    letterSpacing: "0.2px",
  };

  return (
    <div style={{
      minHeight: "100dvh",
      background: "transparent",
      fontFamily: "'Pretendard Variable', 'Pretendard', -apple-system, sans-serif",
      position: "relative",
    }}>
      <AppBackground mode={bgMode || "light"} />
      {/* Header */}
      <div style={{
        display: "flex",
        alignItems: "center",
        padding: "12px 16px",
        borderBottom: `1px solid ${theme.borderLight}`,
        background: theme.bgCard,
      }}>
        <button onClick={onBack} style={{
          background: "none",
          border: "none",
          fontSize: "24px",
          cursor: "pointer",
          padding: "4px 8px 4px 0",
          color: theme.text,
        }}>←</button>
        <h2 style={{
          margin: 0,
          fontSize: "18px",
          fontWeight: "700",
          color: theme.text,
        }}>새 여행 만들기</h2>
      </div>

      {/* Form */}
      <div style={{
        padding: "24px 20px",
        maxWidth: "480px",
        margin: "0 auto",
      }}>
        <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
          {/* Trip Name */}
          <div>
            <label style={labelStyle}>여행 이름 *</label>
            <input
              type="text"
              value={form.tripName}
              onChange={e => update("tripName", e.target.value)}
              placeholder="예: 2026 도쿄 여행"
              style={inputStyle}
            />
          </div>

          {/* Date Range */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
            <div>
              <label style={labelStyle}>출발일 *</label>
              <input
                type="date"
                value={form.tripStart}
                onChange={e => update("tripStart", e.target.value)}
                style={inputStyle}
              />
            </div>
            <div>
              <label style={labelStyle}>도착일 *</label>
              <input
                type="date"
                value={form.tripEnd}
                onChange={e => update("tripEnd", e.target.value)}
                style={inputStyle}
              />
            </div>
          </div>

          {/* Region */}
          <div>
            <label style={labelStyle}>여행 지역</label>
            <div style={{ display: "flex", gap: "8px" }}>
              {[
                { val: "domestic", label: "🇰🇷 국내" },
                { val: "overseas", label: "🌏 해외" },
              ].map(opt => (
                <button key={opt.val} onClick={() => update("tripRegion", opt.val)} style={{
                  flex: 1,
                  padding: "12px",
                  border: `1.5px solid ${form.tripRegion === opt.val ? theme.primary : theme.border}`,
                  borderRadius: theme.radiusSm,
                  background: form.tripRegion === opt.val ? theme.primaryLight : theme.bgCard,
                  color: form.tripRegion === opt.val ? theme.primary : theme.text,
                  fontSize: "15px",
                  fontWeight: "600",
                  cursor: "pointer",
                  transition: "all 0.2s",
                }}>
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Accommodation */}
          <div>
            <label style={labelStyle}>숙소 지역</label>
            <input
              type="text"
              value={form.accommodation}
              onChange={e => update("accommodation", e.target.value)}
              placeholder="예: 신주쿠, 사카에"
              style={inputStyle}
            />
          </div>

          {/* Currency */}
          {form.tripRegion === "overseas" && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
              <div>
                <label style={labelStyle}>통화</label>
                <select
                  value={form.currency}
                  onChange={e => update("currency", e.target.value)}
                  style={{ ...inputStyle, appearance: "auto" }}
                >
                  {CURRENCIES.map(c => (
                    <option key={c.code} value={c.code}>{c.symbol} {c.code} — {c.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label style={labelStyle}>
                  환율 (1{form.currency} = {formatRateLabel(form.rate)})
                </label>
                <div style={{ display: "flex", gap: "6px" }}>
                  <input
                    type="number"
                    value={form.rate}
                    onChange={e => update("rate", e.target.value)}
                    placeholder="예: 9.2"
                    style={{ ...inputStyle, flex: 1 }}
                  />
                  <button
                    type="button"
                    onClick={() => loadLiveRate(form.currency)}
                    disabled={rateStatus === "loading"}
                    title="실시간 환율 새로고침"
                    style={{
                      width: "44px", border: `1.5px solid ${theme.border}`,
                      borderRadius: theme.radiusSm, background: theme.bgCard,
                      cursor: rateStatus === "loading" ? "default" : "pointer",
                      fontSize: "16px", opacity: rateStatus === "loading" ? 0.5 : 1,
                    }}
                  >
                    {rateStatus === "loading" ? "⏳" : "🔄"}
                  </button>
                </div>
                <div style={{ fontSize: "11px", color: theme.textLight, marginTop: "4px" }}>
                  {rateStatus === "loading" && "실시간 환율 가져오는 중..."}
                  {rateStatus === "live" && "✅ 실시간 환율 반영됨 · 직접 수정 가능"}
                  {rateStatus === "error" && "⚠️ 실시간 환율 조회 실패 — 참고용 기본값 사용 중 · 직접 수정 가능"}
                  {rateStatus === "idle" && "📌 참고 환율 자동입력 · 직접 수정 가능"}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Submit */}
        <button onClick={handleSubmit} disabled={!isValid} style={{
          width: "100%",
          marginTop: "32px",
          padding: "16px",
          background: isValid ? theme.primary : theme.bgInput,
          color: isValid ? theme.textWhite : theme.textLight,
          border: "none",
          borderRadius: theme.radius,
          fontSize: "16px",
          fontWeight: "700",
          cursor: isValid ? "pointer" : "default",
          boxShadow: isValid ? "0 2px 8px rgba(37,99,235,0.3)" : "none",
          transition: "all 0.2s",
        }}>
          여행 시작하기 ✈️
        </button>
      </div>
    </div>
  );
}

// Import Screen
function ImportScreen({ onBack, onImportDrive, onImportFile, bgMode, driveStatus, driveMessage }) {
  const importFileRef = useRef(null);
  const isDriveBusy = driveStatus === "loading";

  return (
    <div style={{
      minHeight: "100dvh",
      background: "transparent",
      fontFamily: "'Pretendard Variable', 'Pretendard', -apple-system, sans-serif",
      position: "relative",
    }}>
      <AppBackground mode={bgMode || "light"} />
      <div style={{
        display: "flex",
        alignItems: "center",
        padding: "12px 16px",
        borderBottom: `1px solid ${theme.borderLight}`,
        background: theme.bgCard,
      }}>
        <button onClick={onBack} style={{
          background: "none",
          border: "none",
          fontSize: "24px",
          cursor: "pointer",
          padding: "4px 8px 4px 0",
          color: theme.text,
        }}>←</button>
        <h2 style={{
          margin: 0,
          fontSize: "18px",
          fontWeight: "700",
          color: theme.text,
        }}>데이터 가져오기</h2>
      </div>

      <div style={{ padding: "24px 20px", maxWidth: "480px", margin: "0 auto" }}>
        {driveMessage && (
          <div style={{
            padding: "10px 14px",
            marginBottom: "12px",
            borderRadius: theme.radiusSm,
            background: driveStatus === "error" ? "#FEE2E2" : "#DCFCE7",
            color: driveStatus === "error" ? "#991B1B" : "#166534",
            fontSize: "13px",
            fontWeight: "600",
          }}>
            {driveMessage}
          </div>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          <button onClick={onImportDrive} disabled={isDriveBusy} style={{
            width: "100%",
            padding: "20px",
            background: theme.bgCard,
            border: `1.5px solid ${theme.border}`,
            borderRadius: theme.radius,
            cursor: isDriveBusy ? "default" : "pointer",
            textAlign: "left",
            transition: "all 0.2s",
            opacity: isDriveBusy ? 0.6 : 1,
          }}>
            <div style={{ fontSize: "24px", marginBottom: "8px" }}>☁️</div>
            <div style={{ fontSize: "16px", fontWeight: "700", color: theme.text, marginBottom: "4px" }}>
              {isDriveBusy ? "불러오는 중..." : "Google Drive에서 불러오기"}
            </div>
            <div style={{ fontSize: "13px", color: theme.textSub }}>
              Drive에 백업한 여행 데이터를 복원합니다 (최초 1회 로그인 필요)
            </div>
          </button>

          <input
            ref={importFileRef}
            type="file"
            accept=".csv,.xlsx,.xls,.json"
            onChange={onImportFile}
            style={{ display: "none" }}
          />
          <button onClick={() => importFileRef.current?.click()} style={{
            width: "100%",
            padding: "20px",
            background: theme.bgCard,
            border: `1.5px solid ${theme.border}`,
            borderRadius: theme.radius,
            cursor: "pointer",
            textAlign: "left",
            transition: "all 0.2s",
          }}>
            <div style={{ fontSize: "24px", marginBottom: "8px" }}>📄</div>
            <div style={{ fontSize: "16px", fontWeight: "700", color: theme.text, marginBottom: "4px" }}>
              JSON/CSV/엑셀 파일 업로드
            </div>
            <div style={{ fontSize: "13px", color: theme.textSub }}>
              공유받은 일정 파일을 불러옵니다
            </div>
          </button>
        </div>
      </div>
    </div>
  );
}

// Global Settings Screen — 여행 생성 전에도 접근 가능한 설정(Drive 연결/테마/양식)
function GlobalSettingsScreen({ onBack, bgMode, appThemeMode, onThemeChange }) {
  const [driveState, setDriveState] = useState("idle"); // idle | connecting | connected | error
  const [driveMsg, setDriveMsg] = useState("");
  const [v1BackupMsg, setV1BackupMsg] = useState("");

  const handleBackupV1Data = () => {
    const raw = localStorage.getItem("travel_app_v1");
    if (!raw) {
      setV1BackupMsg("이 기기·브라우저에는 v1 데이터가 없습니다.");
      return;
    }
    try {
      const blob = new Blob([raw], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "travel_app_v1_backup.json";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setV1BackupMsg("✅ 백업 파일을 다운로드했습니다. (다운로드 폴더 확인)");
    } catch (e) {
      setV1BackupMsg("백업 실패: " + (e.message || "알 수 없는 오류"));
    }
  };

  const handleConnectDrive = async () => {
    setDriveState("connecting");
    setDriveMsg("");
    try {
      await ensureDriveToken();
      setDriveState("connected");
      setDriveMsg("Google 계정이 연결되었습니다. 같은 세션에서는 다시 로그인하지 않아도 Drive 저장/불러오기를 쓸 수 있습니다.");
    } catch (e) {
      setDriveState("error");
      setDriveMsg(e.message || "연결에 실패했습니다.");
    }
  };

  const themeRowStyle = (id) => ({
    flex: 1, padding: "9px 4px",
    background: appThemeMode === id ? theme.text : "transparent",
    color: appThemeMode === id ? theme.textWhite : theme.textSub,
    border: `1px solid ${appThemeMode === id ? theme.text : theme.border}`,
    borderRadius: theme.radiusSm, fontSize: "11px", fontWeight: "600", cursor: "pointer",
  });

  const sectionStyle = {
    background: theme.bgCard, borderRadius: theme.radius,
    border: `1px solid ${theme.borderLight}`, marginBottom: "12px",
    overflow: "hidden", boxShadow: theme.shadow,
  };

  return (
    <div style={{
      minHeight: "100dvh",
      background: "transparent",
      fontFamily: "'Pretendard Variable', 'Pretendard', -apple-system, sans-serif",
      position: "relative",
    }}>
      <AppBackground mode={bgMode || "light"} />
      <div style={{
        display: "flex",
        alignItems: "center",
        padding: "12px 16px",
        borderBottom: `1px solid ${theme.borderLight}`,
        background: theme.bgCard,
      }}>
        <button onClick={onBack} style={{
          background: "none",
          border: "none",
          fontSize: "24px",
          cursor: "pointer",
          padding: "4px 8px 4px 0",
          color: theme.text,
        }}>←</button>
        <h2 style={{
          margin: 0,
          fontSize: "18px",
          fontWeight: "700",
          color: theme.text,
        }}>설정</h2>
      </div>

      <div style={{ padding: "16px 20px 100px", maxWidth: "480px", margin: "0 auto" }}>
        {/* Google Drive 연결 */}
        <div style={sectionStyle}>
          <div style={{ padding: "12px 16px 8px", fontSize: "12px", fontWeight: "700", color: theme.textLight, letterSpacing: "0.5px" }}>
            Google Drive
          </div>
          <div style={{ padding: "0 16px 14px" }}>
            <button
              onClick={handleConnectDrive}
              disabled={driveState === "connecting"}
              style={{
                width: "100%", padding: "14px",
                background: driveState === "connected" ? theme.success : theme.bgCard,
                color: driveState === "connected" ? theme.textWhite : theme.text,
                border: `1.5px solid ${driveState === "connected" ? theme.success : theme.border}`,
                borderRadius: theme.radiusSm,
                fontSize: "14px", fontWeight: "700", cursor: "pointer",
                opacity: driveState === "connecting" ? 0.6 : 1,
              }}
            >
              {driveState === "connecting" ? "연결 중..." :
               driveState === "connected" ? "✅ 연결됨" :
               "☁️ Google 계정 연결하기"}
            </button>
            {driveMsg && (
              <div style={{
                marginTop: "8px", fontSize: "12px",
                color: driveState === "error" ? theme.danger : theme.textSub,
                lineHeight: 1.5,
              }}>
                {driveMsg}
              </div>
            )}
            <div style={{ marginTop: "8px", fontSize: "11px", color: theme.textLight, lineHeight: 1.5 }}>
              여행을 시작하기 전에 미리 로그인해두면, 나중에 "데이터 가져오기"에서
              Drive 백업을 바로 불러올 수 있습니다.
            </div>
          </div>
        </div>

        {/* 테마 */}
        <div style={sectionStyle}>
          <div style={{ padding: "12px 16px 8px", fontSize: "12px", fontWeight: "700", color: theme.textLight, letterSpacing: "0.5px" }}>
            테마
          </div>
          <div style={{ padding: "8px 16px 14px", display: "flex", flexDirection: "column", gap: "8px" }}>
            <div style={{ display: "flex", gap: "6px" }}>
              {[
                { id: "system", label: "🌐 시스템" },
                { id: "light", label: "☀️ 밝음" },
                { id: "dark", label: "🌙 다크" },
                { id: "seasonal", label: `🍂 계절 (${getSeason() === "spring" ? "봄" : getSeason() === "summer" ? "여름" : getSeason() === "fall" ? "가을" : "겨울"})` },
              ].map(t => (
                <button key={t.id} onClick={() => onThemeChange(t.id)} style={themeRowStyle(t.id)}>{t.label}</button>
              ))}
            </div>
            <div style={{ display: "flex", gap: "6px" }}>
              {[
                { id: "spring", label: "🌸 봄" },
                { id: "summer", label: "🌊 여름" },
                { id: "fall", label: "🍁 가을" },
                { id: "winter", label: "❄️ 겨울" },
              ].map(t => (
                <button key={t.id} onClick={() => onThemeChange(t.id)} style={themeRowStyle(t.id)}>{t.label}</button>
              ))}
            </div>
          </div>
        </div>

        {/* 양식 다운로드 */}
        <div style={sectionStyle}>
          <div style={{ padding: "12px 16px 8px", fontSize: "12px", fontWeight: "700", color: theme.textLight, letterSpacing: "0.5px" }}>
            데이터 관리
          </div>
          <button
            onClick={() => downloadExcelTemplate("", "")}
            style={{
              width: "100%", display: "flex", alignItems: "center", gap: "12px",
              padding: "14px 16px", background: "none", border: "none",
              borderBottom: `1px solid ${theme.borderLight}`,
              cursor: "pointer", textAlign: "left",
            }}
          >
            <span style={{ fontSize: "20px" }}>📥</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: "15px", fontWeight: "600", color: theme.text }}>엑셀 양식 다운로드</div>
              <div style={{ fontSize: "12px", color: theme.textSub }}>일정 입력 템플릿 (.xlsx)</div>
            </div>
          </button>
          <button
            onClick={handleBackupV1Data}
            style={{
              width: "100%", display: "flex", alignItems: "center", gap: "12px",
              padding: "14px 16px", background: "none", border: "none",
              cursor: "pointer", textAlign: "left",
            }}
          >
            <span style={{ fontSize: "20px" }}>🗄️</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: "15px", fontWeight: "600", color: theme.text }}>v1 데이터 백업 파일 받기</div>
              <div style={{ fontSize: "12px", color: theme.textSub }}>이 기기의 v1 원본 데이터를 JSON 파일로 다운로드</div>
            </div>
          </button>
          {v1BackupMsg && (
            <div style={{ padding: "0 16px 14px", fontSize: "12px", color: theme.textSub, lineHeight: 1.5 }}>
              {v1BackupMsg}
            </div>
          )}
        </div>

        <div style={{ textAlign: "center", padding: "20px 0 8px", fontSize: "12px", color: theme.textLight }}>
          모리의 여행플래너 {APP_VERSION}
        </div>
      </div>
    </div>
  );
}

// Archive Screen
function ArchiveEditModal({ archive, onSave, onClose }) {
  const [tripName, setTripName] = useState(archive.tripName || "");
  const [review, setReview] = useState(archive.review || "");
  const [itinerary, setItinerary] = useState(archive.itinerary || []);
  const [expenses, setExpenses] = useState(archive.expenses || []);
  const [editingSlot, setEditingSlot] = useState(null); // { slot, day } | "new"
  const [editingExpense, setEditingExpense] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null); // { type: 'slot'|'expense', id }

  const sectionTitle = { fontSize: "13px", fontWeight: "700", color: theme.textSub, margin: "20px 0 8px 0" };
  const rowStyle = {
    display: "flex", alignItems: "center", gap: "8px", padding: "8px 10px",
    background: theme.bgInput, borderRadius: theme.radiusSm, marginBottom: "6px", fontSize: "12.5px",
  };
  const smallBtn = {
    background: "none", border: "none", cursor: "pointer", fontSize: "14px",
    padding: "4px 6px", color: theme.textLight,
  };

  const saveSlot = (newSlot) => {
    setItinerary(prev => {
      const exists = prev.some(s => s.id === newSlot.id);
      return exists ? prev.map(s => s.id === newSlot.id ? newSlot : s) : [...prev, newSlot];
    });
    setEditingSlot(null);
  };
  const saveExpense = (newExpense) => {
    setExpenses(prev => {
      const exists = prev.some(e => e.id === newExpense.id);
      return exists ? prev.map(e => e.id === newExpense.id ? newExpense : e) : [...prev, newExpense];
    });
    setEditingExpense(null);
  };

  return (
    <>
    <ModalWrapper onClose={onClose}>
      <h3 style={{ margin: "0 0 16px 0", fontSize: "18px", fontWeight: "800", color: theme.text }}>
        ✏️ 여행 기록 수정
      </h3>
      <div style={{ marginBottom: "14px" }}>
        <label style={{ display: "block", fontSize: "13px", fontWeight: "700", color: theme.textSub, marginBottom: "6px" }}>
          여행명
        </label>
        <input
          value={tripName}
          onChange={e => setTripName(e.target.value)}
          style={{
            width: "100%", padding: "12px 14px", border: `1.5px solid ${theme.border}`,
            borderRadius: theme.radiusSm, fontSize: "15px", color: theme.text,
            background: theme.bgCard, outline: "none", boxSizing: "border-box",
          }}
        />
      </div>
      <div>
        <label style={{ display: "block", fontSize: "13px", fontWeight: "700", color: theme.textSub, marginBottom: "6px" }}>
          한줄평
        </label>
        <textarea
          value={review}
          onChange={e => setReview(e.target.value)}
          rows={3}
          style={{
            width: "100%", padding: "12px 14px", border: `1.5px solid ${theme.border}`,
            borderRadius: theme.radiusSm, fontSize: "14px", color: theme.text,
            background: theme.bgCard, outline: "none", boxSizing: "border-box", resize: "vertical",
            fontFamily: "inherit",
          }}
        />
      </div>

      {/* 일정 수정 */}
      <div style={sectionTitle}>📅 일정 ({itinerary.length}개)</div>
      {[...itinerary].sort((a, b) => (a.day - b.day) || ((a.startTime || "") < (b.startTime || "") ? -1 : 1)).map((it) => (
        <div key={it.id} style={rowStyle}>
          <span style={{ color: theme.textSub, fontWeight: "600", flexShrink: 0 }}>D{(it.day || 0) + 1} {it.startTime}</span>
          <span style={{ flex: 1, color: theme.text }}>{it.title}{it.place ? ` · ${it.place}` : ""}</span>
          <button onClick={() => setEditingSlot({ slot: it, day: it.day })} style={smallBtn}>✏️</button>
          <button onClick={() => setDeleteTarget({ type: "slot", id: it.id })} style={smallBtn}>🗑️</button>
        </div>
      ))}
      <button onClick={() => setEditingSlot({ slot: null, day: 0 })} style={{
        width: "100%", padding: "8px", marginTop: "4px", fontSize: "12.5px", fontWeight: "600",
        background: "none", border: `1.5px dashed ${theme.border}`, borderRadius: theme.radiusSm,
        color: theme.textSub, cursor: "pointer",
      }}>+ 일정 추가</button>

      {/* 지출 수정 */}
      <div style={sectionTitle}>💰 지출 ({expenses.length}건)</div>
      {expenses.map((e) => (
        <div key={e.id} style={rowStyle}>
          <span style={{ flex: 1, color: theme.text }}>{e.title || e.category}</span>
          <span style={{ fontWeight: "600", color: theme.text }}>{(e.amount || 0).toLocaleString()} {e.currency}</span>
          <button onClick={() => setEditingExpense(e)} style={smallBtn}>✏️</button>
          <button onClick={() => setDeleteTarget({ type: "expense", id: e.id })} style={smallBtn}>🗑️</button>
        </div>
      ))}
      <button onClick={() => setEditingExpense({})} style={{
        width: "100%", padding: "8px", marginTop: "4px", fontSize: "12.5px", fontWeight: "600",
        background: "none", border: `1.5px dashed ${theme.border}`, borderRadius: theme.radiusSm,
        color: theme.textSub, cursor: "pointer",
      }}>+ 지출 추가</button>

      <div style={{ display: "flex", gap: "10px", marginTop: "20px" }}>
        <button onClick={onClose} style={{
          flex: 1, padding: "14px", background: theme.bgInput, color: theme.textSub,
          border: "none", borderRadius: theme.radius, fontSize: "15px", fontWeight: "600", cursor: "pointer",
        }}>취소</button>
        <button onClick={() => onSave({ tripName: tripName.trim(), review: review.trim(), itinerary, expenses })} style={{
          flex: 2, padding: "14px", background: theme.primary, color: theme.textWhite,
          border: "none", borderRadius: theme.radius, fontSize: "15px", fontWeight: "700", cursor: "pointer",
        }}>저장</button>
      </div>
    </ModalWrapper>

    {editingSlot && (
      <SlotEditorModal
        slot={editingSlot.slot}
        day={editingSlot.day}
        onSave={saveSlot}
        onClose={() => setEditingSlot(null)}
      />
    )}
    {editingExpense && (
      <ExpenseEditorModal
        expense={editingExpense.id ? editingExpense : null}
        day={0}
        state={archive}
        onSave={saveExpense}
        onClose={() => setEditingExpense(null)}
      />
    )}
    {deleteTarget && (
      <ConfirmDialog
        message="삭제할까요?"
        onConfirm={() => {
          if (deleteTarget.type === "slot") setItinerary(prev => prev.filter(s => s.id !== deleteTarget.id));
          else setExpenses(prev => prev.filter(e => e.id !== deleteTarget.id));
          setDeleteTarget(null);
        }}
        onCancel={() => setDeleteTarget(null)}
      />
    )}
    </>
  );
}

function ArchiveScreen({ onBack, archives, bgMode, onDeleteArchive, onEditArchive }) {
  const [expanded, setExpanded] = useState(null);
  const [deleteIdx, setDeleteIdx] = useState(null);
  const [editIdx, setEditIdx] = useState(null);

  if (archives.length === 0) {
    return (
      <div style={{
        minHeight: "100dvh",
        background: "transparent",
        fontFamily: "'Pretendard Variable', 'Pretendard', -apple-system, sans-serif",
        position: "relative",
      }}>
        <AppBackground mode={bgMode || "light"} />
        <div style={{
          display: "flex",
          alignItems: "center",
          padding: "12px 16px",
          borderBottom: `1px solid ${theme.borderLight}`,
          background: theme.bgCard,
        }}>
          <button onClick={onBack} style={{
            background: "none",
            border: "none",
            fontSize: "24px",
            cursor: "pointer",
            padding: "4px 8px 4px 0",
            color: theme.text,
          }}>←</button>
          <h2 style={{ margin: 0, fontSize: "18px", fontWeight: "700", color: theme.text }}>
            여행 기록
          </h2>
        </div>
        <div style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: "80px 24px",
          color: theme.textLight,
        }}>
          <div style={{ fontSize: "48px", marginBottom: "16px" }}>📖</div>
          <p style={{ fontSize: "15px", margin: 0 }}>아직 저장된 여행 기록이 없습니다</p>
        </div>
      </div>
    );
  }

  return (
    <div style={{
      minHeight: "100dvh",
      background: "transparent",
      fontFamily: "'Pretendard Variable', 'Pretendard', -apple-system, sans-serif",
      position: "relative",
    }}>
      <AppBackground mode={bgMode || "light"} />
      <div style={{
        display: "flex",
        alignItems: "center",
        padding: "12px 16px",
        borderBottom: `1px solid ${theme.borderLight}`,
        background: theme.bgCard,
      }}>
        <button onClick={onBack} style={{
          background: "none",
          border: "none",
          fontSize: "24px",
          cursor: "pointer",
          padding: "4px 8px 4px 0",
          color: theme.text,
        }}>←</button>
        <h2 style={{ margin: 0, fontSize: "18px", fontWeight: "700", color: theme.text }}>
          여행 기록 ({archives.length})
        </h2>
      </div>
      <div style={{ padding: "16px 20px", maxWidth: "600px", margin: "0 auto" }}>
        {archives.map((arc, i) => {
          const rate = arc.rate || 1;
          const totalSpent = (arc.expenses || []).reduce((s, e) =>
            s + (e.currency === "KRW" ? e.amount : (e.amount || 0) * rate), 0);
          return (
          <div key={i} style={{
            background: theme.bgCard,
            borderRadius: theme.radius,
            border: `1px solid ${theme.borderLight}`,
            marginBottom: "12px",
            overflow: "hidden",
            boxShadow: theme.shadow,
          }}>
            <button onClick={() => setExpanded(expanded === i ? null : i)} style={{
              width: "100%",
              display: "flex",
              alignItems: "center",
              gap: "12px",
              padding: "16px",
              background: "none",
              border: "none",
              cursor: "pointer",
              textAlign: "left",
            }}>
              {arc.tripCard ? (
                <img src={arc.tripCard} alt="trip" style={{
                  width: "48px", height: "48px", borderRadius: "8px",
                  objectFit: "cover", flexShrink: 0,
                }} />
              ) : (
                <div style={{
                  width: "48px", height: "48px", borderRadius: "8px",
                  background: theme.bgInput, display: "flex", alignItems: "center",
                  justifyContent: "center", fontSize: "26px", flexShrink: 0,
                }}>
                  {REGION_FLAGS[arc.selectedRegion] || REGION_FLAGS[arc.tripRegion === "domestic" ? "domestic" : "overseas"]}
                </div>
              )}
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: "15px", fontWeight: "700", color: theme.text }}>
                  {arc.tripName || "여행"}
                </div>
                <div style={{ fontSize: "13px", color: theme.textSub, marginTop: "2px" }}>
                  {arc.tripStart && formatDate(arc.tripStart)} ~ {arc.tripEnd && formatDate(arc.tripEnd)}
                </div>
                {arc.review && (
                  <div style={{ fontSize: "13px", color: theme.textLight, marginTop: "4px", fontStyle: "italic" }}>
                    "{arc.review}"
                  </div>
                )}
              </div>
              <span style={{
                fontSize: "18px",
                color: theme.textLight,
                transform: expanded === i ? "rotate(180deg)" : "rotate(0deg)",
                transition: "transform 0.2s",
              }}>▼</span>
            </button>
            {expanded === i && (
              <div style={{
                padding: "0 16px 16px",
                borderTop: `1px solid ${theme.borderLight}`,
              }}>
                {/* 액션 버튼: 수정/삭제/PDF내보내기 */}
                <div style={{ display: "flex", gap: "8px", paddingTop: "12px", marginBottom: "12px" }}>
                  <button onClick={() => setEditIdx(i)} style={{
                    flex: 1, padding: "9px", fontSize: "12.5px", fontWeight: "600",
                    background: theme.bgInput, color: theme.text, border: "none",
                    borderRadius: theme.radiusSm, cursor: "pointer",
                  }}>✏️ 수정</button>
                  <button onClick={() => exportArchiveToPDF(arc)} style={{
                    flex: 1, padding: "9px", fontSize: "12.5px", fontWeight: "600",
                    background: theme.bgInput, color: theme.text, border: "none",
                    borderRadius: theme.radiusSm, cursor: "pointer",
                  }}>📄 PDF 내보내기</button>
                  <button onClick={() => setDeleteIdx(i)} style={{
                    flex: 1, padding: "9px", fontSize: "12.5px", fontWeight: "600",
                    background: "#FEE2E2", color: "#B91C1C", border: "none",
                    borderRadius: theme.radiusSm, cursor: "pointer",
                  }}>🗑️ 삭제</button>
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: "6px", marginBottom: "12px" }}>
                  {[
                    { label: "일정", value: `${(arc.itinerary || []).length}개` },
                    { label: "지출", value: `${(arc.expenses || []).length}건 · ${Math.round(totalSpent).toLocaleString()}원` },
                    { label: "동행", value: arc.companionType ? `${arc.companionType} ${arc.companionCount || ""}명` : "-" },
                    { label: "메모", value: arc.tripMemo || "-" },
                  ].map((row, j) => (
                    <div key={j} style={{ display: "flex", gap: "12px", fontSize: "13px" }}>
                      <span style={{ color: theme.textSub, fontWeight: "600", minWidth: "36px" }}>{row.label}</span>
                      <span style={{ color: theme.text }}>{row.value}</span>
                    </div>
                  ))}
                </div>

                {(arc.itinerary || []).length > 0 && (
                  <div>
                    <div style={{ fontSize: "12px", fontWeight: "700", color: theme.textLight, marginBottom: "6px" }}>
                      📅 일정 상세
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: "6px", maxHeight: "260px", overflowY: "auto" }}>
                      {[...arc.itinerary].sort((a, b) => (a.day - b.day) || ((a.startTime || "") < (b.startTime || "") ? -1 : 1)).map((it, k) => (
                        <div key={k} style={{
                          fontSize: "12.5px", color: theme.text, padding: "6px 8px",
                          background: theme.bgInput, borderRadius: theme.radiusSm,
                          display: "flex", gap: "8px",
                        }}>
                          <span style={{ color: theme.textSub, fontWeight: "600", flexShrink: 0 }}>
                            D{(it.day || 0) + 1} {it.startTime || ""}
                          </span>
                          <span>{it.title || "(제목 없음)"}{it.place ? ` · ${it.place}` : ""}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {(arc.expenses || []).length > 0 && (
                  <div style={{ marginTop: "12px" }}>
                    <div style={{ fontSize: "12px", fontWeight: "700", color: theme.textLight, marginBottom: "6px" }}>
                      💰 지출 상세
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: "6px", maxHeight: "220px", overflowY: "auto" }}>
                      {arc.expenses.map((e, k) => (
                        <div key={k} style={{
                          fontSize: "12.5px", color: theme.text, padding: "6px 8px",
                          background: theme.bgInput, borderRadius: theme.radiusSm,
                          display: "flex", justifyContent: "space-between", gap: "8px",
                        }}>
                          <span>{e.title || e.category || "지출"}</span>
                          <span style={{ fontWeight: "600" }}>
                            {(e.amount || 0).toLocaleString()} {e.currency || ""}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
          );
        })}
      </div>

      {deleteIdx !== null && (
        <ConfirmDialog
          message={`"${archives[deleteIdx]?.tripName || "이 여행"}" 기록을 삭제할까요?\n삭제하면 복구할 수 없습니다.`}
          onConfirm={() => { onDeleteArchive(deleteIdx); setDeleteIdx(null); }}
          onCancel={() => setDeleteIdx(null)}
        />
      )}
      {editIdx !== null && (
        <ArchiveEditModal
          archive={archives[editIdx]}
          onSave={(updates) => { onEditArchive(editIdx, updates); setEditIdx(null); }}
          onClose={() => setEditIdx(null)}
        />
      )}
    </div>
  );
}

// Tab Bar (Mobile Bottom / PC Sidebar)
function TabBar({ tabs, activeTab, onTabChange, isMobile, tripPhase }) {
  const phaseLabel = { before: "여행 전", during: "여행 중", after: "여행 후" };

  if (!isMobile) {
    // PC Sidebar
    return (
      <div style={{
        width: "220px",
        minHeight: "100dvh",
        background: theme.bgSidebar,
        display: "flex",
        flexDirection: "column",
        padding: "20px 12px",
        boxSizing: "border-box",
        flexShrink: 0,
      }}>
        <div style={{
          padding: "8px 12px",
          marginBottom: "8px",
        }}>
          <div style={{ fontSize: "20px", fontWeight: "800", color: theme.textWhite, letterSpacing: "-0.5px" }}>
            🧳 여행플래너
          </div>
          <div style={{
            fontSize: "11px",
            color: "rgba(255,255,255,0.4)",
            marginTop: "4px",
            fontWeight: "500",
          }}>{APP_VERSION} · {phaseLabel[tripPhase]}</div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "4px", marginTop: "12px" }}>
          {tabs.map(tabId => {
            const tab = TABS[tabId];
            const isActive = activeTab === tabId;
            return (
              <button key={tabId} onClick={() => onTabChange(tabId)} style={{
                display: "flex",
                alignItems: "center",
                gap: "10px",
                width: "100%",
                padding: "12px 14px",
                background: isActive ? "rgba(255,255,255,0.1)" : "transparent",
                border: "none",
                borderRadius: theme.radiusSm,
                cursor: "pointer",
                transition: "all 0.15s",
                textAlign: "left",
              }}>
                <span style={{ fontSize: "18px" }}>{tab.icon}</span>
                <span style={{
                  fontSize: "15px",
                  fontWeight: isActive ? "700" : "500",
                  color: isActive ? theme.textWhite : "rgba(255,255,255,0.55)",
                  letterSpacing: "-0.2px",
                }}>{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  // Mobile Bottom Tab Bar
  return (
    <div style={{
      position: "fixed",
      bottom: 0,
      left: 0,
      right: 0,
      display: "flex",
      background: theme.bgCard,
      borderTop: `1px solid ${theme.border}`,
      paddingBottom: "env(safe-area-inset-bottom, 0px)",
      zIndex: 100,
    }}>
      {tabs.map(tabId => {
        const tab = TABS[tabId];
        const isActive = activeTab === tabId;
        return (
          <button key={tabId} onClick={() => onTabChange(tabId)} style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: "2px",
            padding: "8px 4px 6px",
            background: "none",
            border: "none",
            cursor: "pointer",
            transition: "all 0.15s",
          }}>
            <span style={{
              fontSize: "20px",
              filter: isActive ? "none" : "grayscale(0.5)",
              opacity: isActive ? 1 : 0.5,
            }}>{tab.icon}</span>
            <span style={{
              fontSize: "11px",
              fontWeight: isActive ? "700" : "500",
              color: isActive ? theme.primary : theme.textLight,
              letterSpacing: "-0.2px",
            }}>{tab.label}</span>
          </button>
        );
      })}
    </div>
  );
}

// Header (Mobile)
function MobileHeader({ state, onGoHome }) {
  const dday = getDday(state.tripStart);
  return (
    <div style={{
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      padding: "12px 20px",
      background: theme.bgCard,
      borderBottom: `1px solid ${theme.borderLight}`,
      gap: "10px",
    }}>
      <button onClick={onGoHome} title="홈으로" style={{
        width: "36px", height: "36px", flexShrink: 0,
        borderRadius: "50%", border: `1px solid ${theme.border}`,
        background: theme.bgInput, fontSize: "16px", cursor: "pointer",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>🏠</button>
      <div style={{ flex: 1, minWidth: 0 }}>
        <h1 style={{
          margin: 0,
          fontSize: "18px",
          fontWeight: "800",
          color: theme.text,
          letterSpacing: "-0.5px",
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}>
          {state.tripName || "새 여행"}
        </h1>
        {state.tripStart && (
          <div style={{ fontSize: "12px", color: theme.textSub, marginTop: "2px", fontWeight: "500" }}>
            {formatDate(state.tripStart)} ~ {formatDate(state.tripEnd)}
          </div>
        )}
      </div>
      {dday && (
        <div style={{
          padding: "4px 12px",
          background: dday === "D-DAY" ? theme.primary : theme.bgBadge,
          color: dday === "D-DAY" ? theme.textWhite : theme.text,
          borderRadius: theme.radiusFull,
          fontSize: "13px",
          fontWeight: "800",
          letterSpacing: "-0.3px",
          flexShrink: 0,
        }}>
          {dday}
        </div>
      )}
    </div>
  );
}

// ─── Utility: Map & CSV ───
function getMapUrl(place, isOverseas) {
  const cleaned = place.replace(/[\(\)（）\[\]【】]/g, " ").replace(/[^\w\s가-힣ぁ-んァ-ヶ一-龥a-zA-Z0-9]/g, "").trim();
  if (!cleaned) return null;
  if (isOverseas) return `https://www.google.com/maps/search/${encodeURIComponent(cleaned)}`;
  return `https://map.naver.com/v5/search/${encodeURIComponent(cleaned)}`;
}

function parseCSV(text) {
  const timeMap = { morning: "09:00", afternoon: "13:00", evening: "18:00", allday: "00:00" };
  const lines = text.split("\n").map(l => l.trim()).filter(Boolean);
  if (lines.length < 2) return [];
  const header = lines[0].toLowerCase().split(",").map(h => h.trim());
  const dayIdx = header.indexOf("day");
  const timeIdx = header.indexOf("time");
  const titleIdx = header.indexOf("title");
  const noteIdx = header.indexOf("note");
  const placeIdx = header.indexOf("place");
  if (titleIdx === -1) return [];
  return lines.slice(1).map((line, i) => {
    const cols = [];
    let current = "";
    let inQuotes = false;
    for (const ch of line) {
      if (ch === '"') { inQuotes = !inQuotes; continue; }
      if (ch === ',' && !inQuotes) { cols.push(current.trim()); current = ""; continue; }
      current += ch;
    }
    cols.push(current.trim());
    const rawTime = timeIdx >= 0 ? (cols[timeIdx] || "").toLowerCase() : "";
    const startTime = timeMap[rawTime] || rawTime || "09:00";
    return {
      id: `it_csv_${Date.now()}_${i}`,
      day: dayIdx >= 0 ? parseInt(cols[dayIdx]) || 0 : 0,
      startTime,
      title: cols[titleIdx] || "",
      place: placeIdx >= 0 ? (cols[placeIdx] || "") : "",
      note: noteIdx >= 0 ? (cols[noteIdx] || "") : "",
      visited: false,
    };
  }).filter(s => s.title);
}

function parseExcel(data) {
  const timeMap = { morning: "09:00", afternoon: "13:00", evening: "18:00", allday: "00:00",
    "오전": "09:00", "오후": "13:00", "저녁": "18:00", "하루종일": "00:00" };
  try {
    const wb = XLSX.read(data, { type: "array" });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(ws, { defval: "" });
    if (rows.length === 0) return [];
    // Flexible header matching (한글/영문 모두 지원)
    const findKey = (row, candidates) => {
      const keys = Object.keys(row);
      for (const c of candidates) {
        const found = keys.find(k => k.toLowerCase().trim() === c.toLowerCase());
        if (found) return found;
      }
      return null;
    };
    const sample = rows[0];
    const dayKey = findKey(sample, ["day", "일차", "날짜"]);
    const timeKey = findKey(sample, ["time", "시간", "시간대"]);
    const titleKey = findKey(sample, ["title", "일정", "일정명", "제목"]);
    const placeKey = findKey(sample, ["place", "장소", "위치"]);
    const noteKey = findKey(sample, ["note", "메모", "비고", "노트"]);
    if (!titleKey) return [];
    return rows.map((row, i) => {
      const rawTime = timeKey ? String(row[timeKey]).toLowerCase().trim() : "";
      const startTime = timeMap[rawTime] || rawTime || "09:00";
      const rawDay = dayKey ? row[dayKey] : 0;
      const day = typeof rawDay === "string" ? (parseInt(rawDay.replace(/[^0-9]/g, "")) || 1) - 1 : (parseInt(rawDay) || 0);
      return {
        id: `it_xl_${Date.now()}_${i}`,
        day: day < 0 ? 0 : day,
        startTime,
        title: String(row[titleKey] || "").trim(),
        place: placeKey ? String(row[placeKey] || "").trim() : "",
        note: noteKey ? String(row[noteKey] || "").trim() : "",
        visited: false,
      };
    }).filter(s => s.title);
  } catch (e) {
    return [];
  }
}

// 엑셀 파일에서 "여행버킷" 시트를 찾아 shoppingList 형식으로 변환 (없으면 빈 배열)
function parseExcelBucket(data) {
  try {
    const wb = XLSX.read(data, { type: "array" });
    const sheetName = wb.SheetNames.find(n => n.replace(/\s/g, "") === "여행버킷" || n.toLowerCase().includes("bucket"));
    if (!sheetName) return [];
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { defval: "" });
    const findKey = (row, candidates) => {
      const keys = Object.keys(row);
      for (const c of candidates) {
        const found = keys.find(k => k.toLowerCase().trim() === c.toLowerCase());
        if (found) return found;
      }
      return null;
    };
    if (rows.length === 0) return [];
    const itemKey = findKey(rows[0], ["항목", "item", "text"]);
    const doneKey = findKey(rows[0], ["완료여부", "완료", "done"]);
    if (!itemKey) return [];
    return rows
      .map((row, i) => {
        const text = String(row[itemKey] || "").trim();
        if (!text) return null;
        const rawDone = doneKey ? String(row[doneKey] || "").trim() : "";
        const done = ["o", "O", "y", "Y", "완료", "예", "true", "1"].includes(rawDone);
        return { id: `sl_xl_${Date.now()}_${i}`, text, done };
      })
      .filter(Boolean);
  } catch (e) {
    return [];
  }
}

// 엑셀 파일에서 "예산" 시트를 찾아 budget 형식으로 변환 (없으면 null)
function parseExcelBudget(data) {
  const BUDGET_CAT_NAMES = ["식비", "교통", "숙박", "관광", "쇼핑", "선물", "기타"];
  try {
    const wb = XLSX.read(data, { type: "array" });
    const sheetName = wb.SheetNames.find(n => n.replace(/\s/g, "") === "예산" || n.toLowerCase().includes("budget"));
    if (!sheetName) return null;
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { defval: "" });
    const findKey = (row, candidates) => {
      const keys = Object.keys(row);
      for (const c of candidates) {
        const found = keys.find(k => k.toLowerCase().trim() === c.toLowerCase());
        if (found) return found;
      }
      return null;
    };
    if (rows.length === 0) return null;
    const labelKey = findKey(rows[0], ["구분", "category", "항목"]);
    const amountKey = findKey(rows[0], ["금액", "amount", "value"]);
    if (!labelKey || !amountKey) return null;

    let totalKRW = 0, totalLocal = 0;
    const categories = [];
    rows.forEach(row => {
      const label = String(row[labelKey] || "").trim();
      const amount = parseFloat(String(row[amountKey]).replace(/[^0-9.]/g, "")) || 0;
      if (!label || amount <= 0) return;
      if (label.includes("원화")) totalKRW = amount;
      else if (label.includes("현지")) totalLocal = amount;
      else if (BUDGET_CAT_NAMES.includes(label)) categories.push({ id: `bg_${label}`, name: label, planned: amount });
    });
    if (totalKRW === 0 && totalLocal === 0 && categories.length === 0) return null;
    return { totalKRW, totalLocal, categories };
  } catch (e) {
    return null;
  }
}

function generateId() {
  return `it_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
}

// ─── 실시간 환율 조회 (무료 API, 키 불필요) ───
// open.er-api.com: 가입/키 없이 사용 가능, 약 1일 1회 갱신되는 참고용 환율
async function fetchLiveExchangeRate(currencyCode) {
  if (!currencyCode || currencyCode === "KRW") return 1;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(`https://open.er-api.com/v6/latest/${currencyCode}`, {
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    if (!res.ok) throw new Error("환율 응답 오류");
    const data = await res.json();
    const krw = data?.rates?.KRW;
    if (typeof krw !== "number" || !isFinite(krw)) throw new Error("환율 데이터 없음");
    return krw;
  } catch (e) {
    clearTimeout(timeoutId);
    throw e;
  }
}

// 환율 값 크기에 맞춰 적절한 소수점 자릿수로 반올림 (베트남 동 등 1 미만 환율 대응)
function roundRateForSize(n) {
  if (!isFinite(n)) return n;
  if (Math.abs(n) < 1) return Math.round(n * 10000) / 10000;   // 0.0539 등 4자리까지
  if (Math.abs(n) < 100) return Math.round(n * 100) / 100;     // 39.12 등 2자리까지
  return Math.round(n);                                         // 1531 등 정수
}

// 환율 라벨 표시용 — 값 크기에 맞춰 소수점 자릿수 조정, 빈 값은 "?원"
function formatRateLabel(rateStr) {
  const n = parseFloat(rateStr);
  if (rateStr === "" || rateStr == null || isNaN(n)) return "?원";
  let maxDecimals = 0;
  if (Math.abs(n) < 1) maxDecimals = 4;
  else if (Math.abs(n) < 100) maxDecimals = 2;
  return `${n.toLocaleString(undefined, { maximumFractionDigits: maxDecimals })}원`;
}

// ─── Seasonal Background + Particle Canvas ───
const SEASONAL_THEMES = new Set(["spring", "summer", "fall", "winter", "seasonal"]);

// ─── 배경 이미지 경로 (라이트/다크/계절별, PC/모바일) + 레터박스용 베이스 컬러 ───
const BACKGROUND_IMAGE_PATHS = {
  light:  { pc: `${process.env.PUBLIC_URL}/assets/backgrounds/bg-light.webp`,  mobile: `${process.env.PUBLIC_URL}/assets/backgrounds/bg-light-mobile.webp`,  colorPc: "#f6fafd", colorMobile: "#f4f7fd" },
  dark:   { pc: `${process.env.PUBLIC_URL}/assets/backgrounds/bg-dark.webp`,   mobile: `${process.env.PUBLIC_URL}/assets/backgrounds/bg-dark-mobile.webp`,   colorPc: "#122143", colorMobile: "#122346" },
  spring: { pc: `${process.env.PUBLIC_URL}/assets/backgrounds/bg-spring.webp`, mobile: `${process.env.PUBLIC_URL}/assets/backgrounds/bg-spring-mobile.webp`, colorPc: "#f3e7f8", colorMobile: "#f3e7f8" },
  summer: { pc: `${process.env.PUBLIC_URL}/assets/backgrounds/bg-summer.webp`, mobile: `${process.env.PUBLIC_URL}/assets/backgrounds/bg-summer-mobile.webp`, colorPc: "#e4f1ff", colorMobile: "#e5f0ff" },
  fall:   { pc: `${process.env.PUBLIC_URL}/assets/backgrounds/bg-fall.webp`,   mobile: `${process.env.PUBLIC_URL}/assets/backgrounds/bg-fall-mobile.webp`,   colorPc: "#fce6c5", colorMobile: "#fde8c2" },
  winter: { pc: `${process.env.PUBLIC_URL}/assets/backgrounds/bg-winter.webp`, mobile: `${process.env.PUBLIC_URL}/assets/backgrounds/bg-winter-mobile.webp`, colorPc: "#e7f4fd", colorMobile: "#e6f2fe" },
};

// 라이트/다크/계절 6종 배경 이미지 — PC(768px↑)/모바일 반응형 전환
// contain 방식: 창 크기가 어떻든 이미지 전체(캐릭터 포함)가 절대 잘리지 않음.
// 남는 여백은 이미지와 같은 베이스 컬러로 채워서 이질감 없이 자연스럽게 보임.
function AppBackground({ mode }) {
  const paths = BACKGROUND_IMAGE_PATHS[mode] || BACKGROUND_IMAGE_PATHS.light;

  useEffect(() => {
    let styleEl = document.getElementById("app-bg-style");
    if (!styleEl) {
      styleEl = document.createElement("style");
      styleEl.id = "app-bg-style";
      document.head.appendChild(styleEl);
    }
    styleEl.textContent = `
      .app-bg-fixed {
        background-image: url('${paths.mobile}');
        background-color: ${paths.colorMobile};
      }
      @media (min-width: 768px) {
        .app-bg-fixed {
          background-image: url('${paths.pc}');
          background-color: ${paths.colorPc};
        }
      }
    `;
  }, [paths.mobile, paths.pc, paths.colorMobile, paths.colorPc]);

  return (
    <div className="app-bg-fixed" style={{
      position: "fixed", inset: 0, zIndex: -1,
      backgroundSize: "contain", // 잘리지 않고 전체가 보이도록
      backgroundPosition: "right bottom", // 캐릭터가 있는 우측 하단 코너 기준 정렬
      backgroundRepeat: "no-repeat",
      pointerEvents: "none",
    }} />
  );
}

// ─── 계절별 파티클 이미지 경로 (3종씩) ───
const PARTICLE_IMAGE_PATHS = {
  spring: [
    `${process.env.PUBLIC_URL}/assets/particles/particle-spring-1-flower.png`,
    `${process.env.PUBLIC_URL}/assets/particles/particle-spring-2-petal.png`,
    `${process.env.PUBLIC_URL}/assets/particles/particle-spring-3-heart.png`,
  ],
  summer: [
    `${process.env.PUBLIC_URL}/assets/particles/particle-summer-1-watermelon.png`,
    `${process.env.PUBLIC_URL}/assets/particles/particle-summer-2-sun.png`,
    `${process.env.PUBLIC_URL}/assets/particles/particle-summer-3-crab.png`,
  ],
  fall: [
    `${process.env.PUBLIC_URL}/assets/particles/particle-fall-1-maple.png`,
    `${process.env.PUBLIC_URL}/assets/particles/particle-fall-2-ginkgo.png`,
    `${process.env.PUBLIC_URL}/assets/particles/particle-fall-3-chestnut.png`,
  ],
  winter: [
    `${process.env.PUBLIC_URL}/assets/particles/particle-winter-1.png`,
    `${process.env.PUBLIC_URL}/assets/particles/particle-winter-2.png`,
    `${process.env.PUBLIC_URL}/assets/particles/particle-winter-3.png`,
  ],
};

// 이미지 프리로드 캐시 (계절 전환 시 재로딩 방지)
const particleImageCache = {};
function loadParticleImages(season) {
  if (particleImageCache[season]) return particleImageCache[season];
  const imgs = PARTICLE_IMAGE_PATHS[season].map((src) => {
    const img = new Image();
    img.src = src;
    return img;
  });
  particleImageCache[season] = imgs;
  return imgs;
}

function ParticleCanvas({ themeMode, enabled }) {
  const canvasRef = useRef(null);
  const animRef = useRef(null);

  const resolvedSeason = themeMode === "seasonal" ? getSeason() : themeMode;
  const isActive = SEASONAL_THEMES.has(themeMode) && ["spring","summer","fall","winter"].includes(resolvedSeason);

  useEffect(() => {
    if (!isActive || !enabled || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    let W = window.innerWidth, H = window.innerHeight;
    canvas.width = W; canvas.height = H;

    const onResize = () => {
      W = window.innerWidth; H = window.innerHeight;
      canvas.width = W; canvas.height = H;
    };
    window.addEventListener("resize", onResize);

    // 이미지 프리로드 (계절별 3종)
    const images = loadParticleImages(resolvedSeason);

    const COUNT = resolvedSeason === "winter" ? 28 : resolvedSeason === "summer" ? 16 : 22;
    const particles = Array.from({ length: COUNT }, (_, i) => ({
      x: Math.random() * W,
      y: Math.random() * H,
      size: resolvedSeason === "winter" ? 18.2 + Math.random() * 23.4   // 겨울 30% 증가
          : resolvedSeason === "summer" ? 19.2 + Math.random() * 24     // 여름 20% 증가
          : resolvedSeason === "spring" ? 9 + Math.random() * 10.8     // 봄 (70%축소 후 50%증가 = 최초대비 45%)
          : 20 + Math.random() * 24,                                    // 가을 유지
      speed: resolvedSeason === "winter" ? 0.06 + Math.random() * 0.14
           : resolvedSeason === "summer" ? 0
           : resolvedSeason === "spring" ? 0.12 + Math.random() * 0.22
           : 0.14 + Math.random() * 0.26,
      drift: (Math.random() - 0.5) * (resolvedSeason === "winter" ? 0.08 : 0.18),
      driftPhase: Math.random() * Math.PI * 2,
      rot: Math.random() * Math.PI * 2,
      rotSpeed: (Math.random() - 0.5) * (resolvedSeason === "fall" ? 0.012 : 0.008),
      opacity: resolvedSeason === "winter" ? 0.55 + Math.random() * 0.35
             : resolvedSeason === "summer" ? 0.35 + Math.random() * 0.45
             : 0.45 + Math.random() * 0.4,
      // 3종 중 랜덤으로 1개 이미지 배정
      imgIndex: i % 3,
      twinklePhase: Math.random() * Math.PI * 2,
      twinkleSpeed: 0.02 + Math.random() * 0.025,
    }));

    // 이미지를 회전/투명도 적용해서 캔버스에 그리기
    const drawParticleImage = (img, x, y, size, rot, opacity) => {
      if (!img.complete || img.naturalWidth === 0) return; // 아직 로드 안 됐으면 스킵
      ctx.save();
      ctx.globalAlpha = opacity;
      ctx.translate(x, y);
      ctx.rotate(rot);
      // 이미지를 정사각형 비율로, 중심 기준 배치
      ctx.drawImage(img, -size / 2, -size / 2, size, size);
      ctx.restore();
    };

    let frame = 0;
    const draw = () => {
      ctx.clearRect(0, 0, W, H);
      frame++;
      particles.forEach(p => {
        // 여름 깜빡임 효과 제거 — 고정 투명도 사용
        const twinkle = p.opacity;

        const img = images[p.imgIndex];
        drawParticleImage(img, p.x, p.y, p.size, p.rot, twinkle);

        if (resolvedSeason !== "summer") {
          p.y += p.speed;
          p.x += p.drift + Math.sin(frame * 0.012 + p.driftPhase) * 0.35;
          p.rot += p.rotSpeed;
          if (p.y > H + 30) { p.y = -30; p.x = Math.random() * W; }
        } else {
          p.rot += p.rotSpeed;
          p.x += Math.sin(frame * 0.008 + p.driftPhase) * 0.3;
          p.y += Math.cos(frame * 0.006 + p.twinklePhase) * 0.2;
          if (p.x < -20) p.x = W + 20;
          if (p.x > W + 20) p.x = -20;
        }
      });
      animRef.current = requestAnimationFrame(draw);
    };
    draw();

    return () => {
      cancelAnimationFrame(animRef.current);
      window.removeEventListener("resize", onResize);
    };
  }, [themeMode, enabled, resolvedSeason, isActive]);

  if (!isActive || !enabled) return null;

  return (
    <canvas ref={canvasRef} style={{
      position: "fixed", inset: 0,
      width: "100vw", height: "100vh",
      pointerEvents: "none", zIndex: 99,
    }} />
  );
}


// ─── Body Scroll Lock ───
function useScrollLock(active) {
  useEffect(() => {
    if (active) {
      const scrollY = window.scrollY;
      document.body.style.overflow = "hidden";
      document.body.style.position = "fixed";
      document.body.style.top = `-${scrollY}px`;
      document.body.style.left = "0";
      document.body.style.right = "0";
      return () => {
        document.body.style.overflow = "";
        document.body.style.position = "";
        document.body.style.top = "";
        document.body.style.left = "";
        document.body.style.right = "";
        window.scrollTo(0, scrollY);
      };
    }
  }, [active]);
}

// ─── Responsive Modal Wrapper ───
function ModalWrapper({ onClose, children }) {
  useScrollLock(true);
  const [isLandscape, setIsLandscape] = useState(window.innerWidth > window.innerHeight);
  useEffect(() => {
    const handler = () => setIsLandscape(window.innerWidth > window.innerHeight);
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, []);

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 200,
      display: "flex", alignItems: "center", justifyContent: "center",
      background: "rgba(0,0,0,0.4)", padding: "16px",
    }} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{
        width: "100%",
        maxWidth: isLandscape ? "680px" : "480px",
        maxHeight: isLandscape ? "85dvh" : "80dvh",
        background: theme.bg,
        borderRadius: theme.radiusLg,
        padding: "24px 20px",
        overflowY: "auto",
        boxShadow: theme.shadowLg,
      }}>
        {children}
      </div>
    </div>
  );
}

// ─── Slot Editor Modal ───
function SlotEditorModal({ slot, day, onSave, onClose }) {
  const [form, setForm] = useState(slot ? {
    startTime: slot.startTime || "09:00",
    title: slot.title || "",
    place: slot.place || "",
    note: slot.note || "",
  } : {
    startTime: "09:00",
    title: "",
    place: "",
    note: "",
  });

  const update = (k, v) => setForm(p => ({ ...p, [k]: v }));
  const isValid = form.title.trim();

  const handleSave = () => {
    if (!isValid) return;
    onSave({
      id: slot?.id || generateId(),
      day: slot?.day ?? day,
      startTime: form.startTime,
      title: form.title.trim(),
      place: form.place.trim(),
      note: form.note.trim(),
      visited: slot?.visited || false,
    });
  };

  const inputStyle = {
    width: "100%",
    padding: "12px 14px",
    border: `1.5px solid ${theme.border}`,
    borderRadius: theme.radiusSm,
    fontSize: "15px",
    fontWeight: "500",
    color: theme.text,
    background: theme.bgCard,
    outline: "none",
    boxSizing: "border-box",
    fontFamily: "inherit",
  };
  const labelStyle = {
    display: "block",
    fontSize: "13px",
    fontWeight: "700",
    color: theme.textSub,
    marginBottom: "6px",
  };

  return (
    <ModalWrapper onClose={onClose}>
        <div style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "20px",
        }}>
          <h3 style={{ margin: 0, fontSize: "18px", fontWeight: "800", color: theme.text }}>
            {slot ? "일정 수정" : "일정 추가"}
          </h3>
          <button onClick={onClose} style={{
            background: "none", border: "none", fontSize: "22px",
            cursor: "pointer", color: theme.textLight, padding: "4px",
          }}>✕</button>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          <div>
            <label style={labelStyle}>시간 *</label>
            <input type="time" value={form.startTime} onChange={e => update("startTime", e.target.value)} style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>일정명 *</label>
            <input type="text" value={form.title} onChange={e => update("title", e.target.value)} placeholder="예: 나고야 성 관람" style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>장소</label>
            <input type="text" value={form.place} onChange={e => update("place", e.target.value)} placeholder="예: 나고야성 (지도 검색용)" style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>메모</label>
            <textarea value={form.note} onChange={e => update("note", e.target.value)} placeholder="입장료, 운영시간, 예약 등" rows={3}
              style={{ ...inputStyle, resize: "vertical", minHeight: "60px" }} />
          </div>
        </div>

        <div style={{ display: "flex", gap: "10px", marginTop: "24px" }}>
          <button onClick={onClose} style={{
            flex: 1, padding: "14px", background: theme.bgInput,
            color: theme.textSub, border: "none", borderRadius: theme.radius,
            fontSize: "15px", fontWeight: "600", cursor: "pointer",
          }}>취소</button>
          <button onClick={handleSave} disabled={!isValid} style={{
            flex: 2, padding: "14px",
            background: isValid ? theme.primary : theme.bgInput,
            color: isValid ? theme.textWhite : theme.textLight,
            border: "none", borderRadius: theme.radius,
            fontSize: "15px", fontWeight: "700", cursor: isValid ? "pointer" : "default",
          }}>{slot ? "수정 완료" : "추가하기"}</button>
        </div>
    </ModalWrapper>
  );
}

// ─── Confirm Dialog ───
function ActiveTripWarningModal({ tripName, onClose, onGoToTrip }) {
  return (
    <ModalWrapper onClose={onClose}>
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: "40px", marginBottom: "12px" }}>✈️</div>
        <h3 style={{ margin: "0 0 8px 0", fontSize: "17px", fontWeight: "800", color: theme.text }}>
          지금은 여행중이에요
        </h3>
        <p style={{ fontSize: "14px", color: theme.textSub, margin: "0 0 20px", lineHeight: 1.6 }}>
          "{tripName || "진행중인 여행"}"이 아직 진행 중입니다.<br />
          새 여행을 만들려면 먼저 현재 여행을 마무리해주세요.
        </p>
        <div style={{ display: "flex", gap: "10px" }}>
          <button onClick={onClose} style={{
            flex: 1, padding: "12px", background: theme.bgInput,
            color: theme.textSub, border: "none", borderRadius: theme.radiusSm,
            fontSize: "14px", fontWeight: "600", cursor: "pointer",
          }}>닫기</button>
          <button onClick={onGoToTrip} style={{
            flex: 1.4, padding: "12px", background: theme.primary,
            color: theme.textWhite, border: "none", borderRadius: theme.radiusSm,
            fontSize: "14px", fontWeight: "700", cursor: "pointer",
          }}>진행중 여행 보러가기</button>
        </div>
      </div>
    </ModalWrapper>
  );
}

function ConfirmDialog({ message, onConfirm, onCancel }) {
  return (
    <ModalWrapper onClose={onCancel}>
      <div style={{ textAlign: "center" }}>
        <p style={{ fontSize: "15px", fontWeight: "600", color: theme.text, margin: "0 0 20px", lineHeight: 1.6 }}>
          {message}
        </p>
        <div style={{ display: "flex", gap: "10px" }}>
          <button onClick={onCancel} style={{
            flex: 1, padding: "12px", background: theme.bgInput,
            color: theme.textSub, border: "none", borderRadius: theme.radiusSm,
            fontSize: "14px", fontWeight: "600", cursor: "pointer",
          }}>취소</button>
          <button onClick={onConfirm} style={{
            flex: 1, padding: "12px", background: theme.danger,
            color: theme.textWhite, border: "none", borderRadius: theme.radiusSm,
            fontSize: "14px", fontWeight: "700", cursor: "pointer",
          }}>삭제</button>
        </div>
      </div>
    </ModalWrapper>
  );
}

// ─── Excel Template Download ───
function downloadExcelTemplate(tripStart, tripEnd) {
  const days = [];
  if (tripStart && tripEnd) {
    const s = new Date(tripStart + "T00:00:00");
    const e = new Date(tripEnd + "T00:00:00");
    const diff = Math.ceil((e - s) / (1000 * 60 * 60 * 24)) + 1;
    for (let i = 0; i < diff; i++) days.push(i + 1);
  } else {
    days.push(1, 2, 3);
  }
  const rows = [
    { "일차": 1, "시간": "09:00", "일정명": "공항 도착", "장소": "인천국제공항", "메모": "이동수단 및 소요시간" },
    { "일차": 1, "시간": "13:00", "일정명": "첫 번째 관광지", "장소": "장소명 입력", "메모": "입장료·운영시간" },
    { "일차": 1, "시간": "18:00", "일정명": "저녁 맛집", "장소": "맛집명 입력", "메모": "예약 필요 여부" },
    { "일차": 2, "시간": "09:00", "일정명": "오전 관광지", "장소": "", "메모": "" },
    { "일차": 2, "시간": "13:00", "일정명": "점심", "장소": "", "메모": "" },
  ];
  const ws = XLSX.utils.json_to_sheet(rows);
  ws["!cols"] = [
    { wch: 8 },  // 일차
    { wch: 10 }, // 시간
    { wch: 24 }, // 일정명
    { wch: 22 }, // 장소
    { wch: 30 }, // 메모
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "일정");
  // Add instruction sheet
  const helpRows = [
    { "항목": "일차", "설명": "숫자만 입력 (1, 2, 3 ...)" },
    { "항목": "시간", "설명": "HH:MM 형식 (09:00, 13:30) 또는 오전/오후/저녁" },
    { "항목": "일정명", "설명": "일정 제목 (필수)" },
    { "항목": "장소", "설명": "지도 검색에 사용될 장소명 (선택)" },
    { "항목": "메모", "설명": "입장료, 예약, 운영시간 등 참고사항 (선택)" },
    { "항목": "[여행버킷 시트] 항목", "설명": "하고 싶은 일 / 사고 싶은 것 (한 줄에 하나씩)" },
    { "항목": "[여행버킷 시트] 완료여부", "설명": "비워두면 미완료. O 또는 완료 라고 쓰면 완료 처리" },
    { "항목": "[예산 시트] 구분", "설명": "총예산(원화) / 총예산(현지화) / 식비 / 교통 / 숙박 / 관광 / 쇼핑 / 선물 / 기타 중 입력" },
    { "항목": "[예산 시트] 금액", "설명": "숫자만 입력 (필요 없는 항목은 비워두면 됨)" },
  ];
  const ws2 = XLSX.utils.json_to_sheet(helpRows);
  ws2["!cols"] = [{ wch: 10 }, { wch: 50 }];
  XLSX.utils.book_append_sheet(wb, ws2, "작성 안내");

  // 여행버킷 시트 (하고 싶은 일 / 사고 싶은 것)
  const bucketRows = [
    { "항목": "예: 후지산 전망대에서 사진 찍기", "완료여부": "" },
    { "항목": "예: 기념품 가게에서 마그넷 사기", "완료여부": "" },
    { "항목": "", "완료여부": "" },
  ];
  const ws3 = XLSX.utils.json_to_sheet(bucketRows);
  ws3["!cols"] = [{ wch: 40 }, { wch: 12 }];
  XLSX.utils.book_append_sheet(wb, ws3, "여행버킷");

  // 예산 시트 (총예산 + 카테고리별 계획)
  const budgetRows = [
    { "구분": "총예산(원화)", "금액": "" },
    { "구분": "총예산(현지화)", "금액": "" },
    { "구분": "식비", "금액": "" },
    { "구분": "교통", "금액": "" },
    { "구분": "숙박", "금액": "" },
    { "구분": "관광", "금액": "" },
    { "구분": "쇼핑", "금액": "" },
    { "구분": "선물", "금액": "" },
    { "구분": "기타", "금액": "" },
  ];
  const ws4 = XLSX.utils.json_to_sheet(budgetRows);
  ws4["!cols"] = [{ wch: 16 }, { wch: 14 }];
  XLSX.utils.book_append_sheet(wb, ws4, "예산");

  XLSX.writeFile(wb, "여행일정_양식.xlsx");
}

// ─── Bulk Input Modal ───
function BulkInputModal({ day, totalDays, onSave, onClose }) {
  useScrollLock(true);
  const emptyRow = () => ({ startTime: "", title: "", place: "", note: "", day: day });
  const [rows, setRows] = useState([emptyRow(), emptyRow(), emptyRow()]);
  const [currentDay, setCurrentDay] = useState(day);

  const updateRow = (idx, key, val) => {
    setRows(prev => prev.map((r, i) => i === idx ? { ...r, [key]: val } : r));
  };

  const addRow = () => setRows(prev => [...prev, emptyRow()]);

  const removeRow = (idx) => {
    if (rows.length <= 1) return;
    setRows(prev => prev.filter((_, i) => i !== idx));
  };

  const handleSave = () => {
    const valid = rows.filter(r => r.title.trim());
    if (valid.length === 0) { alert("일정명을 하나 이상 입력해 주세요."); return; }
    const slots = valid.map((r, i) => ({
      id: generateId(),
      day: currentDay,
      startTime: r.startTime || "09:00",
      title: r.title.trim(),
      place: r.place.trim(),
      note: r.note.trim(),
      visited: false,
    }));
    onSave(slots);
  };

  const validCount = rows.filter(r => r.title.trim()).length;

  const inputStyle = {
    width: "100%",
    padding: "10px",
    border: `1.5px solid ${theme.border}`,
    borderRadius: "6px",
    fontSize: "14px",
    color: theme.text,
    background: theme.bgCard,
    outline: "none",
    boxSizing: "border-box",
    fontFamily: "inherit",
  };

  return (
    <ModalWrapper onClose={onClose}>
        {/* Header */}
        <div style={{
          display: "flex", justifyContent: "space-between",
          alignItems: "center", marginBottom: "16px",
        }}>
          <h3 style={{ margin: 0, fontSize: "18px", fontWeight: "800", color: theme.text }}>
            빠른 입력
          </h3>
          <button onClick={onClose} style={{
            background: "none", border: "none", fontSize: "22px",
            cursor: "pointer", color: theme.textLight, padding: "4px",
          }}>✕</button>
        </div>

        {/* Day Selector */}
        <div style={{
          display: "flex", gap: "6px", marginBottom: "16px",
          overflowX: "auto", paddingBottom: "4px",
        }}>
          {Array.from({ length: totalDays }, (_, i) => (
            <button key={i} onClick={() => setCurrentDay(i)} style={{
              flexShrink: 0,
              padding: "6px 14px",
              background: currentDay === i ? theme.primary : "transparent",
              color: currentDay === i ? theme.textWhite : theme.textSub,
              border: currentDay === i ? "none" : `1px solid ${theme.border}`,
              borderRadius: theme.radiusFull,
              fontSize: "13px",
              fontWeight: currentDay === i ? "700" : "500",
              cursor: "pointer",
            }}>
              {i + 1}일차
            </button>
          ))}
        </div>

        {/* Table Header */}
        <div style={{
          display: "grid",
          gridTemplateColumns: "72px 1fr 1fr auto",
          gap: "6px",
          padding: "8px 4px",
          fontSize: "12px",
          fontWeight: "700",
          color: theme.textSub,
        }}>
          <span>시간</span>
          <span>일정명 *</span>
          <span>장소</span>
          <span style={{ width: "28px" }}></span>
        </div>

        {/* Rows */}
        <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginBottom: "12px" }}>
          {rows.map((row, idx) => (
            <div key={idx} style={{
              display: "grid",
              gridTemplateColumns: "72px 1fr 1fr auto",
              gap: "6px",
              alignItems: "start",
            }}>
              <input type="time" value={row.startTime}
                onChange={e => updateRow(idx, "startTime", e.target.value)}
                style={{ ...inputStyle, padding: "10px 4px" }} />
              <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                <input type="text" value={row.title}
                  onChange={e => updateRow(idx, "title", e.target.value)}
                  placeholder="일정명"
                  style={inputStyle} />
                <input type="text" value={row.note}
                  onChange={e => updateRow(idx, "note", e.target.value)}
                  placeholder="메모 (선택)"
                  style={{ ...inputStyle, fontSize: "12px", padding: "7px 10px", color: theme.textSub }} />
              </div>
              <input type="text" value={row.place}
                onChange={e => updateRow(idx, "place", e.target.value)}
                placeholder="장소"
                style={inputStyle} />
              <button onClick={() => removeRow(idx)} style={{
                width: "28px", height: "28px", marginTop: "6px",
                background: "none", border: "none", cursor: "pointer",
                fontSize: "16px", color: rows.length <= 1 ? theme.borderLight : theme.textLight,
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>✕</button>
            </div>
          ))}
        </div>

        {/* Add Row */}
        <button onClick={addRow} style={{
          width: "100%",
          padding: "10px",
          background: "none",
          border: `1.5px dashed ${theme.border}`,
          borderRadius: theme.radiusSm,
          color: theme.textSub,
          fontSize: "13px",
          fontWeight: "600",
          cursor: "pointer",
          marginBottom: "16px",
        }}>+ 행 추가</button>

        {/* Actions */}
        <div style={{ display: "flex", gap: "10px" }}>
          <button onClick={onClose} style={{
            flex: 1, padding: "14px", background: theme.bgInput,
            color: theme.textSub, border: "none", borderRadius: theme.radius,
            fontSize: "15px", fontWeight: "600", cursor: "pointer",
          }}>취소</button>
          <button onClick={handleSave} style={{
            flex: 2, padding: "14px",
            background: validCount > 0 ? theme.primary : theme.bgInput,
            color: validCount > 0 ? theme.textWhite : theme.textLight,
            border: "none", borderRadius: theme.radius,
            fontSize: "15px", fontWeight: "700",
            cursor: validCount > 0 ? "pointer" : "default",
          }}>{validCount}개 일정 추가하기</button>
        </div>
    </ModalWrapper>
  );
}

// ─── Tab Content Components ───

function ItineraryTab({ state, setState }) {
  const days = [];
  if (state.tripStart && state.tripEnd) {
    const start = new Date(state.tripStart + "T00:00:00");
    const end = new Date(state.tripEnd + "T00:00:00");
    const diff = Math.ceil((end - start) / (1000 * 60 * 60 * 24)) + 1;
    for (let i = 0; i < diff; i++) {
      const d = new Date(start);
      d.setDate(d.getDate() + i);
      days.push({ dayIndex: i, date: d });
    }
  }

  const [selectedDay, setSelectedDay] = useState(0);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingSlot, setEditingSlot] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [bulkInputOpen, setBulkInputOpen] = useState(false);
  const fileRef = useRef(null);

  const isOverseas = state.tripRegion === "overseas";

  const daySlots = state.itinerary
    .filter(s => s.day === selectedDay)
    .sort((a, b) => (a.startTime || "00:00").localeCompare(b.startTime || "00:00"));

  const handleAddSlot = () => {
    setEditingSlot(null);
    setEditorOpen(true);
  };

  const handleEditSlot = (slot) => {
    setEditingSlot(slot);
    setEditorOpen(true);
  };

  const handleSaveSlot = (slot) => {
    setState(prev => {
      const exists = prev.itinerary.find(s => s.id === slot.id);
      const newItinerary = exists
        ? prev.itinerary.map(s => s.id === slot.id ? slot : s)
        : [...prev.itinerary, slot];
      return { ...prev, itinerary: newItinerary };
    });
    setEditorOpen(false);
    setEditingSlot(null);
  };

  const handleDeleteSlot = (slot) => {
    setDeleteTarget(slot);
  };

  const confirmDelete = () => {
    if (!deleteTarget) return;
    setState(prev => ({
      ...prev,
      itinerary: prev.itinerary.filter(s => s.id !== deleteTarget.id),
    }));
    setDeleteTarget(null);
  };

  const handleToggleVisited = (slotId) => {
    setState(prev => ({
      ...prev,
      itinerary: prev.itinerary.map(s =>
        s.id === slotId ? { ...s, visited: !s.visited } : s
      ),
    }));
  };

  const handleFileUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const isExcel = file.name.endsWith(".xlsx") || file.name.endsWith(".xls");
    if (isExcel) {
      const reader = new FileReader();
      reader.onload = (ev) => {
        const data = new Uint8Array(ev.target.result);
        const parsed = parseExcel(data);
        const bucket = parseExcelBucket(data);
        const budget = parseExcelBudget(data);
        if (parsed.length === 0 && bucket.length === 0 && !budget) {
          alert("엑셀 파싱 실패: '일정' 시트(또는 'title' 열), '여행버킷' 시트, '예산' 시트 중 하나도 인식할 수 없습니다.");
          return;
        }
        setState(prev => ({
          ...prev,
          itinerary: parsed.length > 0 ? [...prev.itinerary, ...parsed.map(s => ({ ...s, id: generateId() }))] : prev.itinerary,
          shoppingList: bucket.length > 0 ? [...(prev.shoppingList || []), ...bucket] : prev.shoppingList,
          budget: budget ? {
            totalKRW: budget.totalKRW || prev.budget?.totalKRW || 0,
            totalLocal: budget.totalLocal || prev.budget?.totalLocal || 0,
            categories: budget.categories.length > 0 ? budget.categories : (prev.budget?.categories || []),
          } : prev.budget,
        }));
        const summary = [
          parsed.length > 0 ? `일정 ${parsed.length}개` : null,
          bucket.length > 0 ? `여행버킷 ${bucket.length}개` : null,
          budget ? "예산 정보" : null,
        ].filter(Boolean).join(", ");
        alert(`${summary}를 추가했습니다.`);
      };
      reader.readAsArrayBuffer(file);
    } else {
      const reader = new FileReader();
      reader.onload = (ev) => {
        const text = ev.target.result;
        const parsed = parseCSV(text);
        if (parsed.length === 0) {
          alert("CSV 파싱 실패: 올바른 형식인지 확인해 주세요.\n필수 헤더: day, time, title");
          return;
        }
        setState(prev => ({
          ...prev,
          itinerary: [...prev.itinerary, ...parsed.map(s => ({ ...s, id: generateId() }))],
        }));
        alert(`${parsed.length}개 일정을 추가했습니다.`);
      };
      reader.readAsText(file);
    }
    e.target.value = "";
  };

  const handleBulkSave = (slots) => {
    setState(prev => ({
      ...prev,
      itinerary: [...prev.itinerary, ...slots],
    }));
    setBulkInputOpen(false);
    alert(`${slots.length}개 일정을 추가했습니다.`);
  };

  const handleDownloadTemplate = () => {
    downloadExcelTemplate(state.tripStart, state.tripEnd);
  };

  const visitedCount = daySlots.filter(s => s.visited).length;

  return (
    <div>
      {/* Trip Card */}
      {state.tripCard && (
        <div style={{ padding: "16px 20px 0" }}>
          <img src={state.tripCard} alt="trip card" style={{
            width: "100%",
            borderRadius: theme.radius,
            boxShadow: theme.shadow,
          }} />
        </div>
      )}

      {/* Day Selector */}
      {days.length > 0 && (
        <div style={{
          display: "flex",
          gap: "8px",
          padding: "16px 20px",
          overflowX: "auto",
          WebkitOverflowScrolling: "touch",
        }}>
          {days.map(({ dayIndex, date }) => {
            const isActive = selectedDay === dayIndex;
            const weekdays = ["일", "월", "화", "수", "목", "금", "토"];
            const daySlotsCount = state.itinerary.filter(s => s.day === dayIndex).length;
            return (
              <button key={dayIndex} onClick={() => setSelectedDay(dayIndex)} style={{
                flexShrink: 0,
                padding: "8px 16px",
                background: isActive ? theme.primary : theme.bgCard,
                color: isActive ? theme.textWhite : theme.text,
                border: isActive ? "none" : `1.5px solid ${theme.border}`,
                borderRadius: theme.radiusFull,
                fontSize: "13px",
                fontWeight: "700",
                cursor: "pointer",
                transition: "all 0.15s",
                whiteSpace: "nowrap",
                position: "relative",
              }}>
                {dayIndex + 1}일차
                <span style={{
                  display: "block",
                  fontSize: "11px",
                  fontWeight: "500",
                  opacity: 0.7,
                  marginTop: "1px",
                }}>
                  {date.getMonth() + 1}/{date.getDate()}({weekdays[date.getDay()]})
                </span>
                {daySlotsCount > 0 && !isActive && (
                  <span style={{
                    position: "absolute",
                    top: "-4px",
                    right: "-4px",
                    width: "18px",
                    height: "18px",
                    background: theme.primary,
                    color: theme.textWhite,
                    borderRadius: "50%",
                    fontSize: "10px",
                    fontWeight: "700",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}>{daySlotsCount}</span>
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* Day Summary */}
      {daySlots.length > 0 && (
        <div style={{
          padding: "0 20px 8px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}>
          <span style={{ fontSize: "12px", color: theme.textLight, fontWeight: "600" }}>
            {daySlots.length}개 일정 · {visitedCount}개 방문완료
          </span>
          <button onClick={handleAddSlot} style={{
            padding: "6px 12px",
            background: theme.primaryLight,
            color: theme.primary,
            border: "none",
            borderRadius: theme.radiusFull,
            fontSize: "12px",
            fontWeight: "700",
            cursor: "pointer",
          }}>+ 추가</button>
        </div>
      )}

      {/* Timeline */}
      <div style={{ padding: "0 20px 100px" }}>
        {daySlots.length > 0 ? (
          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            {daySlots.map((slot, idx) => {
              const mapUrl = slot.place ? getMapUrl(slot.place, isOverseas) : null;
              return (
                <div key={slot.id} style={{
                  display: "flex",
                  gap: "12px",
                  background: theme.bgCard,
                  borderRadius: theme.radius,
                  padding: "14px 16px",
                  border: `1px solid ${slot.visited ? theme.success + "40" : theme.borderLight}`,
                  boxShadow: theme.shadow,
                  alignItems: "flex-start",
                  opacity: slot.visited ? 0.7 : 1,
                  transition: "all 0.2s",
                }}>
                  {/* Visit Check */}
                  <button onClick={() => handleToggleVisited(slot.id)} style={{
                    width: "28px",
                    height: "28px",
                    borderRadius: "50%",
                    border: `2px solid ${slot.visited ? theme.success : theme.border}`,
                    background: slot.visited ? theme.success : "transparent",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    cursor: "pointer",
                    flexShrink: 0,
                    marginTop: "1px",
                    transition: "all 0.15s",
                    fontSize: "13px",
                    color: theme.textWhite,
                  }}>
                    {slot.visited ? "✓" : ""}
                  </button>

                  {/* Time */}
                  <div style={{
                    minWidth: "44px",
                    fontSize: "14px",
                    fontWeight: "700",
                    color: slot.visited ? theme.textLight : theme.primary,
                    paddingTop: "3px",
                  }}>
                    {slot.startTime || "--:--"}
                  </div>

                  {/* Content */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontSize: "15px",
                      fontWeight: "700",
                      color: slot.visited ? theme.textLight : theme.text,
                      letterSpacing: "-0.2px",
                      textDecoration: slot.visited ? "line-through" : "none",
                    }}>{slot.title}</div>
                    {slot.place && (
                      <div style={{
                        fontSize: "13px",
                        color: theme.primary,
                        marginTop: "4px",
                        display: "flex",
                        alignItems: "center",
                        gap: "4px",
                      }}>
                        {mapUrl ? (
                          <a href={mapUrl} target="_blank" rel="noopener noreferrer" style={{
                            color: theme.primary,
                            textDecoration: "none",
                            display: "flex",
                            alignItems: "center",
                            gap: "4px",
                          }}>
                            🗺️ {slot.place}
                          </a>
                        ) : (
                          <span>📍 {slot.place}</span>
                        )}
                      </div>
                    )}
                    {slot.note && (
                      <div style={{
                        fontSize: "13px",
                        color: theme.textSub,
                        marginTop: "3px",
                        lineHeight: 1.4,
                      }}>{slot.note}</div>
                    )}
                  </div>

                  {/* Actions */}
                  <div style={{ display: "flex", flexDirection: "column", gap: "2px", flexShrink: 0 }}>
                    <button onClick={() => handleEditSlot(slot)} style={{
                      width: "30px", height: "30px",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      background: "none", border: "none", cursor: "pointer",
                      fontSize: "15px", borderRadius: "6px", color: theme.textLight,
                    }}>✏️</button>
                    <button onClick={() => handleDeleteSlot(slot)} style={{
                      width: "30px", height: "30px",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      background: "none", border: "none", cursor: "pointer",
                      fontSize: "15px", borderRadius: "6px", color: theme.textLight,
                    }}>🗑️</button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div style={{
            textAlign: "center",
            padding: "48px 20px",
            color: theme.textLight,
          }}>
            <div style={{ fontSize: "40px", marginBottom: "12px" }}>📋</div>
            <p style={{ fontSize: "15px", margin: "0 0 16px", fontWeight: "500" }}>
              {days.length > 0 ? "아직 일정이 없습니다" : "여행 날짜를 먼저 설정해 주세요"}
            </p>
            {days.length > 0 && (
              <div style={{ display: "flex", gap: "8px", justifyContent: "center" }}>
                <button onClick={handleAddSlot} style={{
                  padding: "10px 20px",
                  background: theme.primary,
                  color: theme.textWhite,
                  border: "none",
                  borderRadius: theme.radiusFull,
                  fontSize: "14px",
                  fontWeight: "700",
                  cursor: "pointer",
                }}>+ 일정 추가</button>
                <button onClick={() => setBulkInputOpen(true)} style={{
                  padding: "10px 20px",
                  background: theme.bgCard,
                  color: theme.primary,
                  border: `1.5px solid ${theme.primary}`,
                  borderRadius: theme.radiusFull,
                  fontSize: "14px",
                  fontWeight: "700",
                  cursor: "pointer",
                }}>⚡ 빠른 입력</button>
              </div>
            )}
          </div>
        )}

        {daySlots.length > 0 && (
          <button onClick={handleAddSlot} style={{
            width: "100%",
            marginTop: "12px",
            padding: "14px",
            background: "none",
            border: `1.5px dashed ${theme.border}`,
            borderRadius: theme.radius,
            color: theme.textSub,
            fontSize: "14px",
            fontWeight: "600",
            cursor: "pointer",
          }}>+ 일정 추가</button>
        )}

        {/* CSV Upload */}
        {days.length > 0 && (
          <div style={{ marginTop: "16px", display: "flex", flexDirection: "column", gap: "8px" }}>
            <button onClick={() => setBulkInputOpen(true)} style={{
              width: "100%",
              padding: "12px",
              background: theme.primaryLight,
              border: `1px solid ${theme.primary}30`,
              borderRadius: theme.radiusSm,
              color: theme.primary,
              fontSize: "13px",
              fontWeight: "700",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "6px",
            }}>
              ⚡ 빠른 입력 (여러 일정 한 번에)
            </button>
            <div style={{ display: "flex", gap: "8px" }}>
              <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls" onChange={handleFileUpload}
                style={{ display: "none" }} />
              <button onClick={() => fileRef.current?.click()} style={{
                flex: 1,
                padding: "12px",
                background: theme.bgCard,
                border: `1px solid ${theme.border}`,
                borderRadius: theme.radiusSm,
                color: theme.textSub,
                fontSize: "12px",
                fontWeight: "600",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "4px",
              }}>
                📄 파일 업로드
              </button>
              <button onClick={handleDownloadTemplate} style={{
                flex: 1,
                padding: "12px",
                background: theme.bgCard,
                border: `1px solid ${theme.border}`,
                borderRadius: theme.radiusSm,
                color: theme.textSub,
                fontSize: "12px",
                fontWeight: "600",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "4px",
              }}>
                📥 엑셀 양식
              </button>
            </div>
          </div>
        )}

        {/* Trip Memo */}
        <div style={{ marginTop: "24px" }}>
          <div style={{
            fontSize: "13px",
            fontWeight: "700",
            color: theme.textSub,
            marginBottom: "8px",
          }}>📝 여행 메모</div>
          <textarea
            value={state.tripMemo}
            onChange={e => setState(prev => ({ ...prev, tripMemo: e.target.value }))}
            placeholder="자유롭게 메모하세요"
            style={{
              width: "100%",
              minHeight: "80px",
              padding: "12px",
              border: `1.5px solid ${theme.border}`,
              borderRadius: theme.radiusSm,
              fontSize: "14px",
              color: theme.text,
              background: theme.bgCard,
              resize: "vertical",
              fontFamily: "inherit",
              outline: "none",
              boxSizing: "border-box",
            }}
          />
        </div>
      </div>

      {/* Modals */}
      {editorOpen && (
        <SlotEditorModal
          slot={editingSlot}
          day={selectedDay}
          onSave={handleSaveSlot}
          onClose={() => { setEditorOpen(false); setEditingSlot(null); }}
        />
      )}
      {deleteTarget && (
        <ConfirmDialog
          message={`"${deleteTarget.title}" 일정을 삭제할까요?`}
          onConfirm={confirmDelete}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
      {bulkInputOpen && (
        <BulkInputModal
          day={selectedDay}
          totalDays={days.length}
          onSave={handleBulkSave}
          onClose={() => setBulkInputOpen(false)}
        />
      )}
    </div>
  );
}

// ─── Expense Editor Modal ───
function ExpenseEditorModal({ expense, day, state, onSave, onClose }) {
  useScrollLock(true);
  const ALL_METHODS = [
    { id: "cash_krw", label: "원화 현금", icon: "💵", isLocal: false },
    { id: "cash_local", label: "현지 현금", icon: "💴", isLocal: true },
    { id: "card_krw", label: "카드·원화", icon: "🏦", isLocal: false },
    { id: "card_local", label: "카드·현지", icon: "💳", isLocal: true },
  ];
  const isDomestic = state.tripRegion === "domestic";
  const METHODS = isDomestic ? ALL_METHODS.filter(m => !m.isLocal) : ALL_METHODS;
  const CATEGORIES = ["식비", "교통", "숙박", "관광", "쇼핑", "선물", "기타"];

  const getAutoCurrency = (method) => {
    if (isDomestic) return "KRW";
    if (method === "cash_krw" || method === "card_krw") return "KRW";
    return state.currency;
  };

  const [form, setForm] = useState(expense ? {
    title: expense.title,
    amount: String(expense.amount),
    method: expense.method,
    category: expense.category,
    currency: expense.currency || getAutoCurrency(expense.method),
  } : {
    title: "",
    amount: "",
    method: isDomestic ? "card_krw" : "card_local",
    category: "식비",
    currency: isDomestic ? "KRW" : state.currency,
  });

  const update = (k, v) => {
    if (k === "method") {
      const autoCurrency = getAutoCurrency(v);
      setForm(p => ({ ...p, method: v, currency: autoCurrency }));
    } else {
      setForm(p => ({ ...p, [k]: v }));
    }
  };
  const isValid = form.title.trim() && form.amount && parseFloat(form.amount) > 0;

  const handleSave = () => {
    if (!isValid) return;
    onSave({
      id: expense?.id || `ex_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
      day: expense?.day ?? day,
      title: form.title.trim(),
      amount: parseFloat(form.amount),
      method: form.method,
      category: form.category,
      currency: form.currency,
      date: expense?.date || new Date().toISOString().split("T")[0],
    });
  };

  const inputStyle = {
    width: "100%", padding: "12px 14px",
    border: `1.5px solid ${theme.border}`, borderRadius: theme.radiusSm,
    fontSize: "15px", fontWeight: "500", color: theme.text,
    background: theme.bgCard, outline: "none", boxSizing: "border-box", fontFamily: "inherit",
  };
  const labelStyle = { display: "block", fontSize: "13px", fontWeight: "700", color: theme.textSub, marginBottom: "6px" };

  return (
    <ModalWrapper onClose={onClose}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
          <h3 style={{ margin: 0, fontSize: "18px", fontWeight: "800", color: theme.text }}>
            {expense ? "지출 수정" : "지출 추가"}
          </h3>
          <button onClick={onClose} style={{
            background: "none", border: "none", fontSize: "22px",
            cursor: "pointer", color: theme.textLight, padding: "4px",
          }}>✕</button>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          <div>
            <label style={labelStyle}>항목명 *</label>
            <input type="text" value={form.title} onChange={e => update("title", e.target.value)}
              placeholder="예: 점심 라멘" style={inputStyle} />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: "10px" }}>
            <div>
              <label style={labelStyle}>금액 *</label>
              <AmountInput value={form.amount} onChange={v => update("amount", v)}
                placeholder="0" style={{ fontSize: "18px", fontWeight: "700" }} />
            </div>
            <div>
              <label style={labelStyle}>통화</label>
              <div style={{
                ...inputStyle, display: "flex", alignItems: "center",
                minWidth: "90px", background: theme.bgInput, color: theme.textSub,
              }}>
                {CURRENCIES.find(c => c.code === form.currency)?.symbol || "₩"} {form.currency}
              </div>
              <div style={{ fontSize: "11px", color: theme.textLight, marginTop: "3px" }}>
                결제수단에 따라 자동 설정
              </div>
            </div>
          </div>
          <div>
            <label style={labelStyle}>결제 수단</label>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "8px" }}>
              {METHODS.map(m => {
                const isActive = form.method === m.id;
                return (
                  <button key={m.id} onClick={() => update("method", m.id)} style={{
                    padding: "10px", display: "flex", alignItems: "center", gap: "8px",
                    background: isActive ? theme.primaryLight : theme.bgCard,
                    border: `1.5px solid ${isActive ? theme.primary : theme.border}`,
                    borderRadius: theme.radiusSm, cursor: "pointer", transition: "all 0.15s",
                  }}>
                    <span style={{ fontSize: "18px" }}>{m.icon}</span>
                    <span style={{
                      fontSize: "13px", fontWeight: isActive ? "700" : "500",
                      color: isActive ? theme.primary : theme.textSub,
                    }}>{m.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
          <div>
            <label style={labelStyle}>카테고리</label>
            <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
              {CATEGORIES.map(cat => {
                const isActive = form.category === cat;
                return (
                  <button key={cat} onClick={() => update("category", cat)} style={{
                    padding: "8px 14px",
                    background: isActive ? theme.text : "transparent",
                    color: isActive ? theme.textWhite : theme.textSub,
                    border: isActive ? "none" : `1px solid ${theme.border}`,
                    borderRadius: theme.radiusFull, fontSize: "13px",
                    fontWeight: isActive ? "700" : "500", cursor: "pointer",
                  }}>{cat}</button>
                );
              })}
            </div>
          </div>
        </div>

        <div style={{ display: "flex", gap: "10px", marginTop: "24px" }}>
          <button onClick={onClose} style={{
            flex: 1, padding: "14px", background: theme.bgInput,
            color: theme.textSub, border: "none", borderRadius: theme.radius,
            fontSize: "15px", fontWeight: "600", cursor: "pointer",
          }}>취소</button>
          <button onClick={handleSave} disabled={!isValid} style={{
            flex: 2, padding: "14px",
            background: isValid ? theme.primary : theme.bgInput,
            color: isValid ? theme.textWhite : theme.textLight,
            border: "none", borderRadius: theme.radius,
            fontSize: "15px", fontWeight: "700", cursor: isValid ? "pointer" : "default",
          }}>{expense ? "수정 완료" : "추가하기"}</button>
        </div>
    </ModalWrapper>
  );
}

// ─── Settlement View ───
function SettlementView({ state }) {
  const METHOD_LABELS = {
    cash_krw: { label: "원화 현금", icon: "💵" },
    cash_local: { label: "현지 현금", icon: "💴" },
    card_krw: { label: "카드·원화", icon: "🏦" },
    card_local: { label: "카드·현지", icon: "💳" },
  };
  const BUDGET_CATS = ["식비", "교통", "숙박", "관광", "쇼핑", "선물", "기타"];
  const expenses = state.expenses || [];
  const rate = state.rate || 1;
  const budgetCats = state.budget?.categories || [];

  const toKRW = (e) => e.currency === "KRW" ? e.amount : e.amount * rate;

  // By category
  const byCat = {};
  expenses.forEach(e => {
    if (!byCat[e.category]) byCat[e.category] = 0;
    byCat[e.category] += toKRW(e);
  });

  // By method
  const byMethod = {};
  expenses.forEach(e => {
    if (!byMethod[e.method]) byMethod[e.method] = 0;
    byMethod[e.method] += toKRW(e);
  });

  const totalKRW = expenses.reduce((s, e) => s + toKRW(e), 0);
  const totalBudget = (state.budget?.totalKRW || 0) + (state.budget?.totalLocal || 0) * rate;
  const hasBudget = budgetCats.length > 0;

  const sectionStyle = {
    background: theme.bgCard, borderRadius: theme.radius,
    border: `1px solid ${theme.borderLight}`, padding: "16px",
    marginBottom: "12px", boxShadow: theme.shadow,
  };
  const titleStyle = { fontSize: "13px", fontWeight: "700", color: theme.textSub, marginBottom: "12px" };

  // All categories that have either budget or spending
  const allCats = [...new Set([...BUDGET_CATS.filter(c => budgetCats.find(b => b.name === c) || byCat[c]), ...Object.keys(byCat)])];

  return (
    <div>
      {/* Category Budget vs Actual */}
      <div style={sectionStyle}>
        <div style={titleStyle}>📊 카테고리별 {hasBudget ? "예산 vs 실사용" : "지출"}</div>
        {allCats.length > 0 ? allCats.map(cat => {
          const spent = Math.round(byCat[cat] || 0);
          const planned = budgetCats.find(b => b.name === cat)?.planned || 0;
          const percent = planned > 0 ? Math.round((spent / planned) * 100) : 0;
          const isOver = planned > 0 && spent > planned;
          return (
            <div key={cat} style={{ padding: "10px 0", borderBottom: `1px solid ${theme.borderLight}` }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "4px" }}>
                <span style={{ fontSize: "14px", fontWeight: "600", color: theme.text }}>{cat}</span>
                <div style={{ textAlign: "right" }}>
                  <span style={{
                    fontSize: "14px", fontWeight: "700",
                    color: isOver ? theme.danger : theme.text,
                  }}>
                    {spent.toLocaleString()}원
                  </span>
                  {planned > 0 && (
                    <span style={{ fontSize: "12px", color: theme.textLight, marginLeft: "4px" }}>
                      / {planned.toLocaleString()}원
                    </span>
                  )}
                </div>
              </div>
              {planned > 0 && (
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <div style={{
                    flex: 1, height: "5px", background: theme.bgInput,
                    borderRadius: "3px", overflow: "hidden",
                  }}>
                    <div style={{
                      height: "100%",
                      width: `${Math.min(100, percent)}%`,
                      background: isOver ? theme.danger : percent > 80 ? theme.warning : theme.primary,
                      borderRadius: "3px", transition: "width 0.3s",
                    }} />
                  </div>
                  <span style={{
                    fontSize: "12px", fontWeight: "700", minWidth: "40px", textAlign: "right",
                    color: isOver ? theme.danger : percent > 80 ? theme.warning : theme.textSub,
                  }}>
                    {percent}%
                  </span>
                </div>
              )}
              {!planned && totalKRW > 0 && (
                <div style={{ fontSize: "11px", color: theme.textLight, marginTop: "2px" }}>
                  전체의 {Math.round(((byCat[cat] || 0) / totalKRW) * 100)}% · 미편성
                </div>
              )}
            </div>
          );
        }) : (
          <div style={{ fontSize: "14px", color: theme.textLight, textAlign: "center", padding: "12px" }}>
            지출 내역이 없습니다
          </div>
        )}
      </div>

      {/* Method Summary */}
      <div style={sectionStyle}>
        <div style={titleStyle}>💳 결제수단별 지출</div>
        {Object.entries(byMethod).sort((a, b) => b[1] - a[1]).map(([method, amt]) => {
          const info = METHOD_LABELS[method] || { label: method, icon: "💰" };
          return (
            <div key={method} style={{
              display: "flex", justifyContent: "space-between", alignItems: "center",
              padding: "8px 0", borderBottom: `1px solid ${theme.borderLight}`,
            }}>
              <span style={{ fontSize: "14px", fontWeight: "600", color: theme.text }}>
                {info.icon} {info.label}
              </span>
              <span style={{ fontSize: "14px", fontWeight: "700", color: theme.text }}>
                {Math.round(amt).toLocaleString()}원
              </span>
            </div>
          );
        })}
        {Object.keys(byMethod).length === 0 && (
          <div style={{ fontSize: "14px", color: theme.textLight, textAlign: "center", padding: "12px" }}>
            지출 내역이 없습니다
          </div>
        )}
      </div>

      {/* Total */}
      <div style={{
        ...sectionStyle,
        background: theme.text, color: theme.textWhite,
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: "15px", fontWeight: "600" }}>총 지출</span>
          <span style={{ fontSize: "20px", fontWeight: "800" }}>
            {Math.round(totalKRW).toLocaleString()}원
          </span>
        </div>
        {totalBudget > 0 && (
          <div style={{
            display: "flex", justifyContent: "space-between",
            fontSize: "12px", opacity: 0.6, marginTop: "4px",
          }}>
            <span>예산 {Math.round(totalBudget).toLocaleString()}원</span>
            <span>{expenses.length}건 · {totalBudget >= totalKRW
              ? `${Math.round(totalBudget - totalKRW).toLocaleString()}원 남음`
              : `${Math.round(totalKRW - totalBudget).toLocaleString()}원 초과`}
            </span>
          </div>
        )}
        {totalBudget === 0 && (
          <div style={{ fontSize: "12px", opacity: 0.6, marginTop: "4px", textAlign: "right" }}>
            {expenses.length}건
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Budget Editor Modal ───
// ─── Donut Chart Component ───
function BudgetChart({ segments, totalBudget, allocated, unallocated }) {
  const COLORS = ["#2563EB", "#10B981", "#F59E0B", "#8B5CF6", "#EC4899", "#F97316", "#9CA3AF"];
  const r = 50;
  const size = 140;
  const cx = size / 2;
  const cy = size / 2;
  const circumference = 2 * Math.PI * r;
  const pct = totalBudget > 0 ? Math.round((allocated / totalBudget) * 100) : 0;

  let offset = 0;
  const arcs = segments.map((seg, i) => {
    const dashLen = circumference * seg.ratio;
    const dashOffset = -offset;
    offset += dashLen;
    return (
      <circle key={i} cx={cx} cy={cy} r={r} fill="none"
        stroke={COLORS[i % COLORS.length]} strokeWidth="20"
        strokeDasharray={`${dashLen} ${circumference - dashLen}`}
        strokeDashoffset={dashOffset}
        strokeLinecap="round"
        style={{ transition: "all 0.4s ease" }} />
    );
  });

  return (
    <div>
      {/* Donut + Center */}
      <div style={{ display: "flex", alignItems: "center", gap: "20px", justifyContent: "center" }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          <circle cx={cx} cy={cy} r={r} fill="none" stroke="#F3F4F6" strokeWidth="20" />
          {arcs}
          <text x={cx} y={cy - 6} textAnchor="middle" fontSize="22" fill="#1A1D23" fontWeight="800">
            {pct}%
          </text>
          <text x={cx} y={cy + 12} textAnchor="middle" fontSize="11" fill="#9CA3AF" fontWeight="500">
            편성률
          </text>
        </svg>

        {/* Right: Summary */}
        <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
          <div>
            <div style={{ fontSize: "11px", color: "#9CA3AF", fontWeight: "600" }}>편성</div>
            <div style={{ fontSize: "16px", fontWeight: "800", color: "#1A1D23" }}>
              {Math.round(allocated).toLocaleString()}원
            </div>
          </div>
          <div>
            <div style={{ fontSize: "11px", color: "#9CA3AF", fontWeight: "600" }}>미편성</div>
            <div style={{ fontSize: "16px", fontWeight: "800", color: unallocated > 0 ? "#10B981" : "#9CA3AF" }}>
              {Math.round(Math.max(0, unallocated)).toLocaleString()}원
            </div>
          </div>
        </div>
      </div>

      {/* Horizontal Bars */}
      <div style={{ marginTop: "16px", display: "flex", flexDirection: "column", gap: "8px" }}>
        {segments.filter(s => s.amount > 0).map((seg, i) => {
          const barPct = totalBudget > 0 ? (seg.amount / totalBudget) * 100 : 0;
          return (
            <div key={i}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "3px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                  <div style={{
                    width: "10px", height: "10px", borderRadius: "3px",
                    background: COLORS[i % COLORS.length],
                  }} />
                  <span style={{ fontSize: "13px", fontWeight: "600", color: "#1A1D23" }}>{seg.label}</span>
                </div>
                <span style={{ fontSize: "13px", fontWeight: "700", color: "#1A1D23" }}>
                  {Math.round(seg.amount).toLocaleString()}원
                  <span style={{ fontSize: "11px", color: "#9CA3AF", marginLeft: "4px" }}>
                    {Math.round(barPct)}%
                  </span>
                </span>
              </div>
              <div style={{ height: "6px", background: "#F3F4F6", borderRadius: "3px", overflow: "hidden" }}>
                <div style={{
                  height: "100%", width: `${barPct}%`,
                  background: COLORS[i % COLORS.length],
                  borderRadius: "3px", transition: "width 0.3s",
                }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Number Input (no spinners, no negatives, integers only) ───
function AmountInput({ value, onChange, placeholder, style: extraStyle }) {
  const handleChange = (e) => {
    const v = e.target.value.replace(/[^0-9]/g, "");
    onChange(v);
  };
  return (
    <input type="text" inputMode="numeric" value={value} onChange={handleChange}
      placeholder={placeholder || "0"}
      style={{
        width: "100%", padding: "12px 14px",
        border: `1.5px solid ${theme.border}`, borderRadius: theme.radiusSm,
        fontSize: "15px", fontWeight: "500", color: theme.text,
        background: theme.bgCard, outline: "none", boxSizing: "border-box",
        fontFamily: "inherit", ...extraStyle,
      }} />
  );
}

function BudgetEditorModal({ state, onSave, onClose }) {
  useScrollLock(true);
  const isDomestic = state.tripRegion === "domestic";
  const curSymbol = CURRENCIES.find(c => c.code === state.currency)?.symbol || "";
  const rate = state.rate || 1;
  const BUDGET_CATS = ["식비", "교통", "숙박", "관광", "쇼핑", "선물", "기타"];

  const initCats = {};
  BUDGET_CATS.forEach(cat => {
    const saved = (state.budget?.categories || []).find(c => c.name === cat);
    initCats[cat] = String(saved?.planned || "");
  });

  const [form, setForm] = useState({
    totalKRW: String(state.budget?.totalKRW || ""),
    totalLocal: String(state.budget?.totalLocal || ""),
    cats: initCats,
  });
  const [showCats, setShowCats] = useState(false);

  const totalBudget = (parseFloat(form.totalKRW) || 0) + (parseFloat(form.totalLocal) || 0) * rate;
  const allocated = BUDGET_CATS.reduce((s, cat) => s + (parseFloat(form.cats[cat]) || 0), 0);
  const unallocated = totalBudget - allocated;

  const updateCat = (cat, rawVal) => {
    const val = parseFloat(rawVal) || 0;
    const othersTotal = BUDGET_CATS.reduce((s, c) => c === cat ? s : s + (parseFloat(form.cats[c]) || 0), 0);
    const maxAllowed = Math.max(0, totalBudget - othersTotal);
    const capped = Math.min(val, maxAllowed);
    setForm(p => ({ ...p, cats: { ...p.cats, [cat]: rawVal === "" ? "" : String(capped) } }));
  };

  const handleSave = () => {
    const categories = BUDGET_CATS
      .filter(cat => parseFloat(form.cats[cat]) > 0)
      .map(cat => ({ id: `bg_${cat}`, name: cat, planned: parseFloat(form.cats[cat]) || 0 }));
    onSave({
      totalKRW: parseFloat(form.totalKRW) || 0,
      totalLocal: parseFloat(form.totalLocal) || 0,
      categories,
    });
  };

  // Chart data
  const chartSegments = BUDGET_CATS
    .filter(cat => parseFloat(form.cats[cat]) > 0)
    .map(cat => ({
      label: cat,
      amount: parseFloat(form.cats[cat]) || 0,
      ratio: totalBudget > 0 ? (parseFloat(form.cats[cat]) || 0) / totalBudget : 0,
    }));
  if (unallocated > 0 && totalBudget > 0) {
    chartSegments.push({ label: "미편성", amount: unallocated, ratio: unallocated / totalBudget });
  }

  const labelStyle = { display: "block", fontSize: "13px", fontWeight: "700", color: theme.textSub, marginBottom: "6px" };

  return (
    <ModalWrapper onClose={onClose}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
          <h3 style={{ margin: 0, fontSize: "18px", fontWeight: "800", color: theme.text }}>
            💰 예산 설정
          </h3>
          <button onClick={onClose} style={{
            background: "none", border: "none", fontSize: "22px",
            cursor: "pointer", color: theme.textLight, padding: "4px",
          }}>✕</button>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          {/* Total Budget Inputs */}
          <div>
            <label style={labelStyle}>원화 예산 (₩)</label>
            <AmountInput value={form.totalKRW}
              onChange={v => setForm(p => ({ ...p, totalKRW: v }))}
              placeholder="예: 500000" />
          </div>

          {!isDomestic && (
            <div>
              <label style={labelStyle}>현지통화 예산 ({curSymbol} {state.currency})</label>
              <AmountInput value={form.totalLocal}
                onChange={v => setForm(p => ({ ...p, totalLocal: v }))}
                placeholder="예: 50000" />
              {parseFloat(form.totalLocal) > 0 && (
                <div style={{ fontSize: "11px", color: theme.textLight, marginTop: "4px" }}>
                  ≈ {Math.round((parseFloat(form.totalLocal) || 0) * rate).toLocaleString()}원 (환율 {rate})
                </div>
              )}
            </div>
          )}

          {/* Total Summary */}
          <div style={{
            padding: "12px 16px", background: theme.primaryLight, borderRadius: theme.radiusSm,
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: "14px", fontWeight: "700", color: theme.primary }}>합산 예산</span>
              <span style={{ fontSize: "18px", fontWeight: "800", color: theme.primary }}>
                {Math.round(totalBudget).toLocaleString()}원
              </span>
            </div>
          </div>

          {/* Category Toggle */}
          {totalBudget > 0 && (
            <>
              <button onClick={() => setShowCats(!showCats)} style={{
                width: "100%", display: "flex", justifyContent: "space-between",
                alignItems: "center", padding: "14px 16px",
                background: theme.bgCard, border: `1px solid ${theme.borderLight}`,
                borderRadius: theme.radius, cursor: "pointer", boxShadow: theme.shadow,
              }}>
                <div style={{ textAlign: "left" }}>
                  <div style={{ fontSize: "14px", fontWeight: "700", color: theme.text }}>
                    카테고리별 배분
                  </div>
                  <div style={{ fontSize: "12px", color: theme.textLight, marginTop: "2px" }}>
                    편성 {Math.round(allocated).toLocaleString()}원 · 미편성 {Math.round(Math.max(0, unallocated)).toLocaleString()}원
                  </div>
                </div>
                <span style={{
                  fontSize: "14px", color: theme.textLight,
                  transform: showCats ? "rotate(180deg)" : "rotate(0deg)",
                  transition: "transform 0.2s",
                }}>▼</span>
              </button>

              {showCats && (
                <div style={{
                  background: theme.bgCard, border: `1px solid ${theme.borderLight}`,
                  borderRadius: theme.radius, padding: "16px", boxShadow: theme.shadow,
                }}>
                  {/* Remaining Budget Banner */}
                  <div style={{
                    display: "flex", justifyContent: "space-between", alignItems: "center",
                    padding: "10px 12px", background: unallocated > 0 ? "#ECFDF5" : theme.bgBadge,
                    borderRadius: theme.radiusSm, marginBottom: "14px",
                  }}>
                    <span style={{ fontSize: "13px", fontWeight: "600", color: theme.textSub }}>배분 가능 잔액</span>
                    <span style={{
                      fontSize: "15px", fontWeight: "800",
                      color: unallocated > 0 ? "#10B981" : theme.textLight,
                    }}>
                      {Math.round(Math.max(0, unallocated)).toLocaleString()}원
                    </span>
                  </div>

                  <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                    {BUDGET_CATS.map(cat => (
                      <div key={cat} style={{
                        display: "flex", alignItems: "center", gap: "10px",
                      }}>
                        <span style={{
                          width: "42px", fontSize: "14px", fontWeight: "600",
                          color: theme.text, flexShrink: 0,
                        }}>{cat}</span>
                        <AmountInput value={form.cats[cat]}
                          onChange={v => updateCat(cat, v)}
                          placeholder="0"
                          style={{ flex: 1, textAlign: "right", fontWeight: "600" }} />
                        <span style={{ fontSize: "13px", color: theme.textLight, flexShrink: 0, width: "16px" }}>원</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Budget Chart */}
              {allocated > 0 && (
                <div style={{
                  background: theme.bgCard, border: `1px solid ${theme.borderLight}`,
                  borderRadius: theme.radius, padding: "20px 16px", boxShadow: theme.shadow,
                }}>
                  <BudgetChart
                    segments={chartSegments}
                    totalBudget={totalBudget}
                    allocated={allocated}
                    unallocated={unallocated}
                  />
                </div>
              )}
            </>
          )}
        </div>

        <div style={{ display: "flex", gap: "10px", marginTop: "24px" }}>
          <button onClick={onClose} style={{
            flex: 1, padding: "14px", background: theme.bgInput,
            color: theme.textSub, border: "none", borderRadius: theme.radius,
            fontSize: "15px", fontWeight: "600", cursor: "pointer",
          }}>취소</button>
          <button onClick={handleSave} style={{
            flex: 2, padding: "14px", background: theme.primary,
            color: theme.textWhite, border: "none", borderRadius: theme.radius,
            fontSize: "15px", fontWeight: "700", cursor: "pointer",
          }}>저장하기</button>
        </div>
    </ModalWrapper>
  );
}

function ExpenseTab({ state, setState }) {
  const days = [];
  if (state.tripStart && state.tripEnd) {
    const start = new Date(state.tripStart + "T00:00:00");
    const end = new Date(state.tripEnd + "T00:00:00");
    const diff = Math.ceil((end - start) / (1000 * 60 * 60 * 24)) + 1;
    for (let i = -1; i < diff; i++) days.push(i);
    days.push(999);
  }

  const [selectedDay, setSelectedDay] = useState(-1);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [budgetOpen, setBudgetOpen] = useState(false);

  const METHOD_ICONS = { cash_krw: "💵", cash_local: "💴", card_local: "💳", card_krw: "🏦" };
  const rate = state.rate || 1;
  const toKRW = (e) => e.currency === "KRW" ? e.amount : e.amount * rate;

  const totalSpent = (state.expenses || []).reduce((sum, e) => sum + toKRW(e), 0);
  const totalBudget = (state.budget?.totalKRW || 0) + (state.budget?.totalLocal || 0) * rate;
  const remaining = totalBudget - totalSpent;

  const dayExpenses = (state.expenses || [])
    .filter(e => e.day === selectedDay)
    .sort((a, b) => (b.date || "").localeCompare(a.date || "") || b.id.localeCompare(a.id));

  const dayTotal = dayExpenses.reduce((s, e) => s + toKRW(e), 0);

  const handleAdd = () => { setEditingExpense(null); setEditorOpen(true); };
  const handleEdit = (exp) => { setEditingExpense(exp); setEditorOpen(true); };

  const handleSaveBudget = (budget) => {
    setState(prev => ({ ...prev, budget }));
    setBudgetOpen(false);
  };

  const handleSave = (exp) => {
    setState(prev => {
      const exists = prev.expenses.find(e => e.id === exp.id);
      const newExpenses = exists
        ? prev.expenses.map(e => e.id === exp.id ? exp : e)
        : [...prev.expenses, exp];
      return { ...prev, expenses: newExpenses };
    });
    setEditorOpen(false);
    setEditingExpense(null);
  };

  const confirmDelete = () => {
    if (!deleteTarget) return;
    setState(prev => ({ ...prev, expenses: prev.expenses.filter(e => e.id !== deleteTarget.id) }));
    setDeleteTarget(null);
  };

  return (
    <div>
      {/* Summary Bar */}
      <button onClick={() => setBudgetOpen(true)} style={{
        display: "block", width: "calc(100% - 40px)", textAlign: "left",
        margin: "16px 20px", padding: "16px",
        background: theme.bgCard, borderRadius: theme.radius,
        border: `1px solid ${theme.borderLight}`, boxShadow: theme.shadow,
        cursor: "pointer", transition: "all 0.15s",
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px" }}>
          <span style={{ fontSize: "13px", color: theme.textSub, fontWeight: "600" }}>
            총 예산 <span style={{ fontSize: "11px", color: theme.textLight }}>탭하여 설정 ›</span>
          </span>
          <span style={{ fontSize: "15px", fontWeight: "800", color: theme.text }}>
            {totalBudget > 0 ? `${Math.round(totalBudget).toLocaleString()}원` : "미설정"}
          </span>
        </div>
        {totalBudget > 0 && (
          <>
            <div style={{
              height: "6px", background: theme.bgInput, borderRadius: "3px",
              overflow: "hidden", marginBottom: "8px",
            }}>
              <div style={{
                height: "100%",
                width: `${Math.min(100, (totalSpent / totalBudget) * 100)}%`,
                background: remaining >= 0 ? theme.primary : theme.danger,
                borderRadius: "3px", transition: "width 0.3s",
              }} />
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ fontSize: "12px", color: theme.textSub }}>
                사용: {Math.round(totalSpent).toLocaleString()}원
              </span>
              <span style={{
                fontSize: "12px", fontWeight: "700",
                color: remaining >= 0 ? theme.success : theme.danger,
              }}>
                잔액: {Math.round(remaining).toLocaleString()}원
              </span>
            </div>
          </>
        )}
        {totalBudget === 0 && totalSpent > 0 && (
          <div style={{ fontSize: "13px", color: theme.textSub, marginTop: "4px" }}>
            총 사용: {Math.round(totalSpent).toLocaleString()}원
          </div>
        )}
      </button>

      {/* Day Sub Tabs */}
      <div style={{
        display: "flex", gap: "6px", padding: "0 20px 12px",
        overflowX: "auto", WebkitOverflowScrolling: "touch",
      }}>
        {days.map(d => {
          const isActive = selectedDay === d;
          const label = d === -1 ? "출발전" : d === 999 ? "정산" : `${d + 1}일차`;
          const count = d === 999 ? 0 : (state.expenses || []).filter(e => e.day === d).length;
          return (
            <button key={d} onClick={() => setSelectedDay(d)} style={{
              flexShrink: 0, padding: "6px 14px", position: "relative",
              background: isActive ? theme.text : theme.bgCard,
              color: isActive ? theme.textWhite : theme.text,
              border: `1.5px solid ${isActive ? theme.text : theme.border}`,
              borderRadius: theme.radiusFull, fontSize: "13px",
              fontWeight: isActive ? "700" : "600", cursor: "pointer",
              boxShadow: isActive ? "none" : theme.shadow,
            }}>
              {label}
              {count > 0 && !isActive && (
                <span style={{
                  position: "absolute", top: "-5px", right: "-5px",
                  width: "16px", height: "16px", background: theme.primary,
                  color: theme.textWhite, borderRadius: "50%", fontSize: "10px",
                  fontWeight: "700", display: "flex", alignItems: "center", justifyContent: "center",
                }}>{count}</span>
              )}
            </button>
          );
        })}
      </div>

      {/* Content */}
      <div style={{ padding: "0 20px 100px" }}>
        {selectedDay === 999 ? (
          <SettlementView state={state} />
        ) : (
          <>
            {/* Day Subtotal */}
            {dayExpenses.length > 0 && (
              <div style={{
                display: "flex", justifyContent: "space-between", alignItems: "center",
                marginBottom: "10px", padding: "0 4px",
              }}>
                <span style={{ fontSize: "12px", color: theme.textLight, fontWeight: "600" }}>
                  {dayExpenses.length}건
                </span>
                <span style={{ fontSize: "13px", fontWeight: "700", color: theme.text }}>
                  소계: {Math.round(dayTotal).toLocaleString()}원
                </span>
              </div>
            )}

            {/* Expense List */}
            {dayExpenses.length > 0 ? (
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                {dayExpenses.map(exp => {
                  const krwAmt = toKRW(exp);
                  const isLocal = exp.currency !== "KRW";
                  return (
                    <div key={exp.id} style={{
                      display: "flex", alignItems: "flex-start", gap: "10px",
                      background: theme.bgCard, borderRadius: theme.radius,
                      padding: "12px 14px",
                      border: `1px solid ${theme.borderLight}`, boxShadow: theme.shadow,
                    }}>
                      {/* Method Icon */}
                      <span style={{ fontSize: "20px", flexShrink: 0, marginTop: "2px" }}>
                        {METHOD_ICONS[exp.method] || "💰"}
                      </span>

                      {/* Info */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                          <span style={{
                            fontSize: "15px", fontWeight: "700", color: theme.text,
                            whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                            maxWidth: "50%", lineHeight: "1.3",
                          }}>{exp.title}</span>
                          <div style={{ textAlign: "right", flexShrink: 0 }}>
                            <span style={{ fontSize: "15px", fontWeight: "800", color: theme.text }}>
                              {isLocal
                                ? `${exp.amount.toLocaleString()} ${exp.currency}`
                                : `${exp.amount.toLocaleString()}원`}
                            </span>
                            {isLocal && (
                              <div style={{ fontSize: "11px", color: theme.textLight }}>
                                ≈ {Math.round(krwAmt).toLocaleString()}원
                              </div>
                            )}
                          </div>
                        </div>
                        <div style={{
                          display: "flex", gap: "6px", marginTop: "4px",
                          fontSize: "12px", color: theme.textLight, alignItems: "center",
                        }}>
                          <span style={{
                            padding: "2px 8px", background: theme.bgBadge,
                            borderRadius: theme.radiusFull, fontWeight: "600",
                          }}>{exp.category}</span>
                        </div>
                      </div>

                      {/* Actions */}
                      <div style={{ display: "flex", gap: "2px", flexShrink: 0, marginTop: "0px" }}>
                        <button onClick={() => handleEdit(exp)} style={{
                          width: "28px", height: "28px", display: "flex",
                          alignItems: "center", justifyContent: "center",
                          background: "none", border: "none", cursor: "pointer",
                          fontSize: "14px", color: theme.textLight,
                        }}>✏️</button>
                        <button onClick={() => setDeleteTarget(exp)} style={{
                          width: "28px", height: "28px", display: "flex",
                          alignItems: "center", justifyContent: "center",
                          background: "none", border: "none", cursor: "pointer",
                          fontSize: "14px", color: theme.textLight,
                        }}>🗑️</button>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div style={{
                textAlign: "center", padding: "48px 20px", color: theme.textLight,
              }}>
                <div style={{ fontSize: "40px", marginBottom: "12px" }}>💳</div>
                <p style={{ fontSize: "15px", margin: "0 0 16px", fontWeight: "500" }}>
                  지출 내역이 없습니다
                </p>
              </div>
            )}

            {/* Add Button */}
            <button onClick={handleAdd} style={{
              width: "100%", marginTop: "12px", padding: "14px",
              background: selectedDay === -1 && dayExpenses.length === 0 ? theme.primary : "none",
              color: selectedDay === -1 && dayExpenses.length === 0 ? theme.textWhite : theme.textSub,
              border: selectedDay === -1 && dayExpenses.length === 0 ? "none" : `1.5px dashed ${theme.border}`,
              borderRadius: theme.radius, fontSize: "14px", fontWeight: "600", cursor: "pointer",
            }}>+ 지출 추가</button>
          </>
        )}
      </div>

      {/* Modals */}
      {editorOpen && (
        <ExpenseEditorModal
          expense={editingExpense}
          day={selectedDay}
          state={state}
          onSave={handleSave}
          onClose={() => { setEditorOpen(false); setEditingExpense(null); }}
        />
      )}
      {deleteTarget && (
        <ConfirmDialog
          message={`"${deleteTarget.title}" 지출을 삭제할까요?`}
          onConfirm={confirmDelete}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
      {budgetOpen && (
        <BudgetEditorModal
          state={state}
          onSave={handleSaveBudget}
          onClose={() => setBudgetOpen(false)}
        />
      )}
    </div>
  );
}

// ─── Checklist Phase Data ───
const PHASES = [
  { id: "plan", label: "여행 계획 전", icon: "📝", desc: "예약 전 확인사항" },
  { id: "confirm", label: "여행 확정 후", icon: "📋", desc: "예약 완료 후 준비" },
  { id: "depart", label: "출발 전", icon: "🧳", desc: "D-3 ~ 출발 당일" },
];

const PHASE_ITEMS = {
  plan: {
    common: [
      { id: "pl3", text: "여행 날짜·기간 결정" },
      { id: "pl4", text: "예산 계획 수립" },
      { id: "pl5", text: "항공권 가격 비교·예약 (또는 교통편 예약)" },
      { id: "pl6", text: "숙소 예약" },
      { id: "pl7", text: "여행자 보험 가입 검토" },
    ],
    overseas: [
      { id: "pl1", text: "여권 유효기간 확인 (6개월 이상 남아야 함)" },
      { id: "pl2", text: "비자 필요 여부 조회" },
    ],
    japan: [{ id: "plj1", text: "Visit Japan Web 사전 등록 확인" }],
    europe: [{ id: "ple1", text: "ETIAS 입국 신청 필요 여부 확인" }],
    usa: [{ id: "plu1", text: "ESTA 신청 (출발 72시간 전까지 필수)" }],
    southeast_asia: [{ id: "pls1", text: "국가별 비자 발급 방법 확인" }],
    domestic: [],
    solo: [{ id: "plso1", text: "긴급연락처 가족에게 일정 공유" }],
    friends: [{ id: "plf1", text: "동행자와 예산·일정 사전 조율" }],
    family: [{ id: "plfa1", text: "아이 여권 유효기간 확인" }],
  },
  confirm: {
    common: [
      { id: "cf1", text: "여행자 보험 가입 완료" },
      { id: "cf3", text: "현지 교통패스 예약 (필요 시)" },
      { id: "cf4", text: "인기 맛집·관광지 예약" },
      { id: "cf6", text: "짐 목록 작성" },
      { id: "cf7", text: "상비약 준비 목록 작성" },
    ],
    overseas: [
      { id: "cf2", text: "포켓와이파이 또는 유심 예약" },
      { id: "cf5", text: "환전 계획 수립 (환율 좋은 날 환전)" },
    ],
    japan: [
      { id: "cfj1", text: "Suica·ICOCA 교통카드 준비" },
      { id: "cfj2", text: "엔화 현금 환전 (현금 사용 빈번)" },
    ],
    europe: [
      { id: "cfe1", text: "유레일 패스 구매 (필요 시)" },
      { id: "cfe2", text: "소매치기 대비 복대·잠금 가방 준비" },
    ],
    usa: [
      { id: "cfu1", text: "국제운전면허증 발급 (렌터카 시)" },
      { id: "cfu2", text: "팁 문화 대비 달러 현금 준비" },
    ],
    southeast_asia: [
      { id: "cfs1", text: "자외선 차단제·모기 기피제 구매" },
      { id: "cfs2", text: "사원 방문 시 복장 규정 확인" },
    ],
    domestic: [{ id: "cfd1", text: "교통카드 충전 (KTX·버스 등)" }],
    solo: [],
    friends: [{ id: "cff1", text: "더치페이 앱 설치 (트리비·스플리트와이즈)" }],
    family: [
      { id: "cffa1", text: "아이 상비약 처방 (소아과 방문)" },
      { id: "cffa2", text: "유아 탑승 좌석 예약 (항공사 직접 연락)" },
    ],
  },
  depart: {
    common: [
      { id: "dp2", text: "항공권·승차권 e-티켓 저장·출력" },
      { id: "dp4", text: "신용카드·체크카드 챙기기" },
      { id: "dp5", text: "보조배터리 충전 완료 — 2개 이내, 기내 반입만 가능, 단자 보호 필수 (기내 사용 금지)" },
      { id: "dp6", text: "짐 패킹 완료" },
      { id: "dp7", text: "상비약 챙기기" },
      { id: "dp8", text: "숙소 주소 오프라인 저장" },
      { id: "dp10", text: "액체류 100ml 이하 지퍼백에 정리 (항공편 이용 시)" },
    ],
    overseas: [
      { id: "dp1", text: "여권 위치 확인" },
      { id: "dp3", text: "환전 완료" },
      { id: "dp9", text: "멀티 어댑터 챙기기" },
    ],
    japan: [{ id: "dpj1", text: "일본 입국 심사 서류 준비" }],
    europe: [{ id: "dpe1", text: "여행 경비 분산 보관" }],
    usa: [{ id: "dpu1", text: "입국 신고서 사전 작성" }],
    southeast_asia: [{ id: "dps1", text: "위장약·정장제 챙기기" }],
    domestic: [{ id: "dpd1", text: "신분증(주민등록증·운전면허증) 챙기기 — 항공권 발권·렌터카 시 필수" }],
    solo: [{ id: "dpso1", text: "대사관 긴급연락처 저장" }],
    friends: [],
    family: [
      { id: "dpfa1", text: "기저귀·분유 충분히 챙기기" },
      { id: "dpfa2", text: "아이 멀미약 챙기기" },
      { id: "dpfa3", text: "아이 좋아하는 간식·장난감" },
    ],
  },
};

// ─── 2025 최신 기내 반입 금지 품목 ───
const CARRY_ON_PROHIBITED = [
  {
    cat: "액체·젤·에어로졸",
    items: [
      "100ml(3.4oz) 초과 액체류 — 물, 음료, 샴푸, 로션 등",
      "젤·페이스트 식품 — 잼, 된장, 고추장, 꿀 등 (100ml 초과 시)",
      "스프레이·에어로졸 제품 (100ml 초과 시)",
      "액체류는 1L 투명 지퍼백 1개에 담아야 함 (1인 1개)",
    ],
  },
  {
    cat: "보조배터리·전자기기 (2026.4.20 강화)",
    items: [
      "160Wh 초과 — 기내·위탁 모두 반입 금지",
      "160Wh 이하 — 1인당 최대 2개, 기내 반입만 가능 (위탁 금지)",
      "100Wh~160Wh — 항공사 사전 승인 필요 (2개 이내)",
      "기내에서 보조배터리로 충전·사용 전면 금지 (2026년~)",
      "단락 방지 필수 — 단자에 절연테이프 또는 개별 지퍼백 포장",
      "기내 선반(Overhead Bin) 보관 금지 — 좌석 앞 주머니·발밑에 휴대",
    ],
  },
  {
    cat: "날카로운 도구",
    items: [
      "날 길이 6cm 초과 칼·가위 (위탁 수하물로만 가능)",
      "커터칼·면도칼·스크레이퍼",
      "골프채·야구배트·하키스틱 등 스포츠 용품 (위탁만 가능)",
      "작살·다트·화살 등",
    ],
  },
  {
    cat: "발화·인화·폭발물",
    items: [
      "라이터 2개 초과 (1인 1개 기내 반입 허용, 위탁 금지)",
      "성냥 — 안전성냥 1개만 기내 반입 허용",
      "부탄가스 캔·가스 연료 (기내·위탁 모두 금지)",
      "폭죽·불꽃놀이·화약류",
      "인화성 액체 (페인트·시너·라이터 연료 등)",
    ],
  },
  {
    cat: "의약품·약물 (2025년 신규)",
    items: [
      "일본산 진통제 EVE 시리즈 — 알릴이소프로필아세틸요소 성분 포함, 한국 입국 시 압수 대상",
      "마약류·향정신성 의약품 — 처방전 없을 경우 반입 금지",
      "일부 해외 의약품 — 성분 확인 후 반입 여부 확인 필수",
    ],
  },
  {
    cat: "식품·농산물 (입국 시)",
    items: [
      "육류·가금류 — 대부분 국가 반입 금지 (가공품 포함)",
      "과일·채소 — 국가별 검역 대상",
      "흙이 묻은 식물·뿌리 — 반입 금지",
      "씨앗류 — 국가별 검역 대상",
    ],
  },
];

const REGIONS = [
  { id: "japan", label: "일본", icon: "🇯🇵" },
  { id: "europe", label: "유럽", icon: "🇪🇺" },
  { id: "southeast_asia", label: "동남아", icon: "🌴" },
  { id: "usa", label: "미국", icon: "🇺🇸" },
  { id: "domestic", label: "국내", icon: "🇰🇷" },
];

// ─── CheckItem Component ───
function CheckItem({ item, checked, onToggle }) {
  return (
    <button onClick={() => onToggle(item.id)} style={{
      width: "100%", display: "flex", alignItems: "center", gap: "12px",
      padding: "12px 16px",
      background: checked ? "#F0FDF4" : "transparent",
      border: "none", cursor: "pointer", textAlign: "left",
      transition: "background 0.15s",
    }}>
      <div style={{
        width: "22px", height: "22px", borderRadius: "6px", flexShrink: 0,
        border: `2px solid ${checked ? theme.success : theme.border}`,
        background: checked ? theme.success : "transparent",
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: "13px", color: theme.textWhite, transition: "all 0.15s",
      }}>{checked ? "✓" : ""}</div>
      <span style={{
        fontSize: "14px", fontWeight: "500",
        color: checked ? theme.textLight : theme.text,
        textDecoration: checked ? "line-through" : "none",
        lineHeight: 1.4,
      }}>{item.text}</span>
    </button>
  );
}

function CheckTab({ state, setState }) {
  const companions = [
    { type: "solo", label: "혼자", icon: "🧍", count: 1, fixed: true },
    { type: "couple", label: "커플", icon: "💑", count: 2, fixed: true },
    { type: "friends", label: "친구", icon: "👫", count: null, fixed: false },
    { type: "family", label: "가족", icon: "👨‍👩‍👧", count: null, fixed: false },
  ];

  const [showProhibited, setShowProhibited] = useState(false);
  const [newShopItem, setNewShopItem] = useState("");
  const [activeSection, setActiveSection] = useState("checklist");
  const [openPhase, setOpenPhase] = useState(null);
  const [completedPhases, setCompletedPhases] = useState({});
  const shopInputRef = useRef(null);

  const checkStates = state.checkStates || {};
  const selectedRegion = state.selectedRegion || "none";
  const shoppingList = state.shoppingList || [];
  const companionType = state.companionType || "";

  // Auto-open current phase based on trip date
  useEffect(() => {
    if (!state.tripStart) { setOpenPhase("plan"); return; }
    const today = new Date(); today.setHours(0,0,0,0);
    const start = new Date(state.tripStart + "T00:00:00");
    const daysLeft = Math.ceil((start - today) / (1000*60*60*24));
    if (daysLeft > 14) setOpenPhase(completedPhases["plan"] ? "confirm" : "plan");
    else if (daysLeft > 0) setOpenPhase(completedPhases["confirm"] ? "depart" : "confirm");
    else setOpenPhase("depart");
  }, [state.tripStart]);

  const getPhaseItems = (phaseId) => {
    const data = PHASE_ITEMS[phaseId];
    if (!data) return [];
    const items = [...data.common];
    // selectedRegion을 아직 안 골랐으면 여행 만들 때 정한 tripRegion으로 국내/해외 판단 (기본값 보정)
    const isDomestic = selectedRegion === "domestic" || (!selectedRegion && state.tripRegion === "domestic");
    if (!isDomestic && data.overseas) items.push(...data.overseas);
    if (selectedRegion && selectedRegion !== "none" && data[selectedRegion]) items.push(...data[selectedRegion]);
    if (companionType && data[companionType]) items.push(...data[companionType]);
    return items;
  };

  const toggleCheck = (id) => {
    setState(prev => ({
      ...prev,
      checkStates: { ...prev.checkStates, [id]: !prev.checkStates?.[id] },
    }));
  };

  const completePhase = (phaseId) => {
    setCompletedPhases(prev => ({ ...prev, [phaseId]: true }));
    const idx = PHASES.findIndex(p => p.id === phaseId);
    if (idx < PHASES.length - 1) setOpenPhase(PHASES[idx + 1].id);
    else setOpenPhase(null);
  };

  const setRegion = (id) => setState(prev => ({ ...prev, selectedRegion: id }));

  const addShopItem = () => {
    if (!newShopItem.trim()) return;
    setState(prev => ({
      ...prev,
      shoppingList: [...(prev.shoppingList || []), { id: `sl_${Date.now()}`, text: newShopItem.trim(), done: false }],
    }));
    setNewShopItem("");
    shopInputRef.current?.focus();
  };

  const toggleShopItem = (id) => setState(prev => ({
    ...prev,
    shoppingList: prev.shoppingList.map(s => s.id === id ? { ...s, done: !s.done } : s),
  }));

  const deleteShopItem = (id) => setState(prev => ({
    ...prev,
    shoppingList: prev.shoppingList.filter(s => s.id !== id),
  }));

  // Total checklist progress
  const allItems = PHASES.flatMap(p => getPhaseItems(p.id));
  const totalChecked = allItems.filter(i => checkStates[i.id]).length;

  return (
    <div style={{ paddingBottom: "100px" }}>
      {/* 기내반입 요약 배너 */}
      <div style={{
        margin: "12px 20px 0",
        padding: "12px 16px",
        background: "#FEF3C7", borderRadius: theme.radiusSm,
        fontSize: "13px", color: "#92400E", fontWeight: "600", lineHeight: 1.5,
      }}>
        ✈️ 기내반입 주의: 액체 100ml↑ 금지 · 보조배터리 2개 이내·위탁 금지·기내 사용 금지(2026.4.20~) · EVE 진통제 한국 반입 금지
        <button onClick={() => setShowProhibited(true)} style={{
          display: "inline-block", marginLeft: "8px", padding: "2px 10px",
          background: "#FCD34D", border: "none", borderRadius: theme.radiusFull,
          fontSize: "12px", fontWeight: "700", color: "#92400E", cursor: "pointer",
        }}>전체 보기 ›</button>
      </div>

      {/* Section Toggle */}
      <div style={{ display: "flex", gap: "8px", padding: "12px 20px 0" }}>
        {[
          { id: "checklist", label: `✅ 체크리스트 (${totalChecked}/${allItems.length})` },
          { id: "shopping", label: `🪣 여행 버킷 (${shoppingList.filter(s=>s.done).length}/${shoppingList.length})` },
        ].map(s => (
          <button key={s.id} onClick={() => setActiveSection(s.id)} style={{
            flex: 1, padding: "10px",
            background: activeSection === s.id ? theme.text : theme.bgCard,
            color: activeSection === s.id ? theme.textWhite : theme.textSub,
            border: `1px solid ${activeSection === s.id ? theme.text : theme.border}`,
            borderRadius: theme.radiusSm, fontSize: "13px", fontWeight: "700", cursor: "pointer",
          }}>{s.label}</button>
        ))}
      </div>

      <div style={{ padding: "14px 20px 0" }}>
        {activeSection === "checklist" ? (
          <>
            {/* 동행 유형 */}
            <div style={{ marginBottom: "16px" }}>
              <div style={{ fontSize: "13px", fontWeight: "700", color: theme.textSub, marginBottom: "8px" }}>👥 동행 유형</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "8px" }}>
                {companions.map(c => {
                  const isActive = companionType === c.type;
                  return (
                    <button key={c.type} onClick={() => {
                      setState(prev => ({
                        ...prev,
                        companionType: c.type,
                        companionCount: c.fixed ? c.count : (prev.companionCount || 2),
                      }));
                    }} style={{
                      padding: "10px 6px", display: "flex", flexDirection: "column",
                      alignItems: "center", gap: "4px",
                      background: isActive ? theme.primaryLight : theme.bgCard,
                      border: `1.5px solid ${isActive ? theme.primary : theme.border}`,
                      borderRadius: theme.radiusSm, cursor: "pointer",
                    }}>
                      <span style={{ fontSize: "20px" }}>{c.icon}</span>
                      <span style={{
                        fontSize: "11px", fontWeight: isActive ? "700" : "500",
                        color: isActive ? theme.primary : theme.textSub,
                      }}>{c.label}</span>
                    </button>
                  );
                })}
              </div>
              {/* 인원 (친구·가족만) */}
              {(companionType === "friends" || companionType === "family") && (
                <div style={{ display: "flex", alignItems: "center", gap: "10px", marginTop: "10px" }}>
                  <span style={{ fontSize: "13px", color: theme.textSub, fontWeight: "600" }}>인원</span>
                  <button onClick={() => setState(prev => ({ ...prev, companionCount: Math.max(2, (prev.companionCount||2)-1) }))} style={{
                    width: "30px", height: "30px", borderRadius: "50%",
                    border: `1.5px solid ${theme.border}`, background: theme.bgCard,
                    fontSize: "16px", cursor: "pointer", color: theme.text,
                  }}>−</button>
                  <span style={{ fontSize: "16px", fontWeight: "800", color: theme.text, minWidth: "20px", textAlign: "center" }}>
                    {state.companionCount || 2}
                  </span>
                  <button onClick={() => setState(prev => ({ ...prev, companionCount: (prev.companionCount||2)+1 }))} style={{
                    width: "30px", height: "30px", borderRadius: "50%",
                    border: `1.5px solid ${theme.border}`, background: theme.bgCard,
                    fontSize: "16px", cursor: "pointer", color: theme.text,
                  }}>+</button>
                  <span style={{ fontSize: "13px", color: theme.textSub }}>명</span>
                </div>
              )}
              {/* 혼자·커플 인원 안내 */}
              {(companionType === "solo" || companionType === "couple") && (
                <div style={{ marginTop: "8px", fontSize: "12px", color: theme.textLight, fontWeight: "500" }}>
                  {companionType === "solo" ? "🧍 혼자 여행하는 일정입니다" : "💑 2인 기준으로 준비합니다"}
                </div>
              )}
            </div>

            {/* 여행 지역 */}
            <div style={{ marginBottom: "16px" }}>
              <div style={{ fontSize: "13px", fontWeight: "700", color: theme.textSub, marginBottom: "4px" }}>🗺️ 여행 지역</div>
              <div style={{
                fontSize: "12px", color: theme.text,
                marginBottom: "8px",
                padding: "8px 12px",
                background: theme.bgCard,
                borderRadius: theme.radiusSm,
                border: `1px solid ${theme.border}`,
                fontWeight: "500", lineHeight: 1.5,
              }}>
                💡 선택하면 지역별 추가 준비물이 표시됩니다 (공통 항목은 항상 포함)
              </div>
              <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                {REGIONS.map(r => {
                  const isActive = selectedRegion === r.id;
                  return (
                    <button key={r.id} onClick={() => setRegion(isActive ? "" : r.id)} style={{
                      padding: "7px 12px", display: "flex", alignItems: "center", gap: "4px",
                      background: isActive ? theme.text : theme.bgCard,
                      color: isActive ? theme.textWhite : theme.text,
                      border: `1.5px solid ${isActive ? theme.text : theme.border}`,
                      borderRadius: theme.radiusFull, fontSize: "13px",
                      fontWeight: isActive ? "700" : "600", cursor: "pointer",
                      boxShadow: isActive ? "none" : theme.shadow,
                    }}>
                      <span>{r.icon}</span><span>{r.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 단계별 체크리스트 */}
            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              {PHASES.map(phase => {
                const items = getPhaseItems(phase.id);
                const checked = items.filter(i => checkStates[i.id]).length;
                const isOpen = openPhase === phase.id;
                const isDone = completedPhases[phase.id];
                const allChecked = items.length > 0 && checked === items.length;

                return (
                  <div key={phase.id} style={{
                    background: theme.bgCard, borderRadius: theme.radius,
                    border: `1.5px solid ${isDone ? theme.success + "60" : isOpen ? theme.primary + "40" : theme.borderLight}`,
                    overflow: "hidden", boxShadow: theme.shadow,
                  }}>
                    {/* Phase Header */}
                    <button onClick={() => setOpenPhase(isOpen ? null : phase.id)} style={{
                      width: "100%", display: "flex", alignItems: "center", gap: "12px",
                      padding: "14px 16px", background: isDone ? "#F0FDF4" : "transparent",
                      border: "none", cursor: "pointer", textAlign: "left",
                    }}>
                      <span style={{ fontSize: "20px" }}>{isDone ? "✅" : phase.icon}</span>
                      <div style={{ flex: 1 }}>
                        <div style={{
                          fontSize: "15px", fontWeight: "700",
                          color: isDone ? theme.success : theme.text,
                        }}>{phase.label}</div>
                        <div style={{ fontSize: "12px", color: theme.textLight, marginTop: "2px" }}>
                          {isDone ? "완료" : `${checked}/${items.length} 체크`} · {phase.desc}
                        </div>
                      </div>
                      {/* Progress mini bar */}
                      {!isDone && items.length > 0 && (
                        <div style={{
                          width: "48px", height: "4px", background: theme.bgInput,
                          borderRadius: "2px", overflow: "hidden", flexShrink: 0,
                        }}>
                          <div style={{
                            height: "100%",
                            width: `${(checked / items.length) * 100}%`,
                            background: allChecked ? theme.success : theme.primary,
                            borderRadius: "2px", transition: "width 0.2s",
                          }} />
                        </div>
                      )}
                      <span style={{
                        fontSize: "14px", color: theme.textLight,
                        transform: isOpen ? "rotate(180deg)" : "none",
                        transition: "transform 0.2s", flexShrink: 0,
                      }}>▼</span>
                    </button>

                    {/* Phase Items */}
                    {isOpen && (
                      <div style={{ borderTop: `1px solid ${theme.borderLight}` }}>
                        {items.map((item, idx) => (
                          <div key={item.id} style={{
                            borderBottom: idx < items.length - 1 ? `1px solid ${theme.borderLight}` : "none",
                          }}>
                            <CheckItem item={item} checked={!!checkStates[item.id]} onToggle={toggleCheck} />
                          </div>
                        ))}

                        {/* Complete Button */}
                        <div style={{ padding: "12px 16px", borderTop: `1px solid ${theme.borderLight}` }}>
                          {isDone ? (
                            <button onClick={() => setCompletedPhases(prev => ({ ...prev, [phase.id]: false }))} style={{
                              width: "100%", padding: "10px",
                              background: "transparent", border: `1px solid ${theme.border}`,
                              borderRadius: theme.radiusSm, color: theme.textLight,
                              fontSize: "13px", fontWeight: "600", cursor: "pointer",
                            }}>↩ 완료 취소</button>
                          ) : (
                            <button onClick={() => completePhase(phase.id)} style={{
                              width: "100%", padding: "12px",
                              background: allChecked ? theme.success : theme.bgInput,
                              color: allChecked ? theme.textWhite : theme.textSub,
                              border: "none", borderRadius: theme.radiusSm,
                              fontSize: "14px", fontWeight: "700", cursor: "pointer",
                              transition: "all 0.2s",
                            }}>
                              {allChecked ? "✅ 이 단계 완료!" : `🔲 미완료 항목이 ${items.length - checked}개 있음 · 그래도 완료 처리`}
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        ) : (
          /* 여행 버킷 */
          <div>
            {/* 설명 배너 */}
            <div style={{
              padding: "12px 16px", marginBottom: "16px",
              background: theme.primaryLight, borderRadius: theme.radiusSm,
              fontSize: "13px", color: theme.primary, fontWeight: "500", lineHeight: 1.6,
            }}>
              🪣 <strong>여행 버킷</strong>은 사고 싶은 것, 챙겨야 할 것, 먹어볼 것 등<br/>
              여행에서 담아두고 싶은 모든 것을 자유롭게 기록하는 공간입니다.
            </div>

            <div style={{ display: "flex", gap: "8px", marginBottom: "16px" }}>
              <input ref={shopInputRef} type="text" value={newShopItem}
                onChange={e => setNewShopItem(e.target.value)}
                onKeyDown={e => e.key === "Enter" && addShopItem()}
                placeholder="예: 네스프레소 캡슐, 상비약, 기념품..."
                style={{
                  flex: 1, padding: "12px 14px",
                  border: `1.5px solid ${theme.border}`, borderRadius: theme.radiusSm,
                  fontSize: "15px", color: theme.text, outline: "none",
                  background: theme.bgCard, fontFamily: "inherit",
                }} />
              <button onClick={addShopItem} style={{
                padding: "12px 18px", background: theme.primary,
                color: theme.textWhite, border: "none", borderRadius: theme.radiusSm,
                fontSize: "15px", fontWeight: "700", cursor: "pointer",
              }}>+</button>
            </div>
            {shoppingList.length === 0 ? (
              <div style={{ textAlign: "center", padding: "40px", color: theme.textLight }}>
                <div style={{ fontSize: "36px", marginBottom: "10px" }}>🪣</div>
                <p style={{ fontSize: "14px", margin: 0 }}>버킷이 비어 있습니다</p>
                <p style={{ fontSize: "12px", margin: "6px 0 0", color: theme.textLight }}>
                  쇼핑 목록, 짐 목록, 약 목록 등<br/>무엇이든 담아보세요
                </p>
              </div>
            ) : (
              <div style={{
                background: theme.bgCard, borderRadius: theme.radius,
                border: `1px solid ${theme.borderLight}`, overflow: "hidden",
              }}>
                {shoppingList.map((item, idx) => (
                  <div key={item.id} style={{
                    display: "flex", alignItems: "center", gap: "12px",
                    padding: "13px 16px",
                    background: item.done ? "#F0FDF4" : "transparent",
                    borderBottom: idx < shoppingList.length - 1 ? `1px solid ${theme.borderLight}` : "none",
                  }}>
                    <button onClick={() => toggleShopItem(item.id)} style={{
                      width: "22px", height: "22px", borderRadius: "6px", flexShrink: 0,
                      border: `2px solid ${item.done ? theme.success : theme.border}`,
                      background: item.done ? theme.success : "transparent",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: "13px", color: theme.textWhite, cursor: "pointer",
                    }}>{item.done ? "✓" : ""}</button>
                    <span style={{
                      flex: 1, fontSize: "14px", fontWeight: "500",
                      color: item.done ? theme.textLight : theme.text,
                      textDecoration: item.done ? "line-through" : "none",
                    }}>{item.text}</span>
                    <button onClick={() => deleteShopItem(item.id)} style={{
                      width: "28px", height: "28px", background: "none", border: "none",
                      cursor: "pointer", fontSize: "14px", color: theme.textLight,
                    }}>🗑️</button>
                  </div>
                ))}
              </div>
            )}
            {shoppingList.length > 0 && (
              <div style={{ marginTop: "10px", fontSize: "12px", color: theme.textLight, textAlign: "center", fontWeight: "600" }}>
                {shoppingList.filter(s => s.done).length}/{shoppingList.length}개 완료
              </div>
            )}
          </div>
        )}
      </div>

      {/* 기내반입 금지 전체 모달 */}
      {showProhibited && (
        <ModalWrapper onClose={() => setShowProhibited(false)}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
            <h3 style={{ margin: 0, fontSize: "18px", fontWeight: "800", color: theme.text }}>
              ✈️ 기내 반입 금지 품목
            </h3>
            <button onClick={() => setShowProhibited(false)} style={{
              background: "none", border: "none", fontSize: "22px", cursor: "pointer", color: theme.textLight,
            }}>✕</button>
          </div>
          <div style={{ fontSize: "11px", color: theme.textLight, marginBottom: "14px", padding: "8px 12px", background: theme.bgInput, borderRadius: theme.radiusSm }}>
            📅 2026년 4월 최신 기준 · 항공사·노선별 규정이 다를 수 있으니 탑승 전 항공사에서 최종 확인
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            {CARRY_ON_PROHIBITED.map((section, i) => (
              <div key={i}>
                <div style={{
                  fontSize: "13px", fontWeight: "700", color: theme.primary,
                  marginBottom: "8px", paddingBottom: "6px",
                  borderBottom: `2px solid ${theme.primaryLight}`,
                }}>{section.cat}</div>
                {section.items.map((item, j) => (
                  <div key={j} style={{
                    display: "flex", alignItems: "flex-start", gap: "8px",
                    padding: "7px 0", fontSize: "13px", color: theme.text, lineHeight: 1.5,
                    borderBottom: j < section.items.length - 1 ? `1px solid ${theme.borderLight}` : "none",
                  }}>
                    <span style={{ color: theme.danger, flexShrink: 0, marginTop: "1px" }}>⛔</span>
                    <span>{item}</span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </ModalWrapper>
      )}
    </div>
  );
}

// ─── Google Drive Integration ───
const DRIVE_CLIENT_ID = "840168983675-g6o8fmmnrnmbmp1u7soa48jgh8v2rsu2.apps.googleusercontent.com";
const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.file";
const DRIVE_FILE_NAME = "travel_planner_data_v2.json";
const DRIVE_FILE_NAME_V1 = "travel_planner_data.json"; // 구버전(v1) 백업 파일명 — 폴백용

let _driveToken = null;
let _driveTokenExpiry = 0;

function withTimeout(promise, ms, msg) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(msg)), ms)),
  ]);
}

function loadGISScript() {
  if (window.google?.accounts?.oauth2) return Promise.resolve();
  // index.html에 스크립트 태그가 이미 있으면 폴링으로 대기
  const existing = document.querySelector('script[src*="accounts.google.com/gsi"]');
  if (existing) {
    return withTimeout(
      new Promise(resolve => {
        const poll = setInterval(() => {
          if (window.google?.accounts?.oauth2) { clearInterval(poll); resolve(); }
        }, 200);
      }),
      12000,
      "Google 인증 모듈 로드 대기 시간 초과"
    );
  }
  // 동적 로드 (배포 환경)
  return withTimeout(
    new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = "https://accounts.google.com/gsi/client";
      s.async = true;
      s.onload = () => setTimeout(resolve, 300);
      s.onerror = () => reject(new Error(
        "Google 인증 스크립트 로드 실패.\n\n" +
        "배포된 앱(GitHub Pages)에서 사용하려면\n" +
        "index.html <head> 안에 아래 코드를 추가하세요:\n" +
        "<script src=\"https://accounts.google.com/gsi/client\" async defer></scri" + "pt>"
      ));
      document.head.appendChild(s);
    }),
    12000,
    "Google 인증 스크립트 로드 시간 초과"
  );
}

async function ensureDriveToken() {
  if (_driveToken && Date.now() < _driveTokenExpiry - 60000) return _driveToken;
  await loadGISScript();
  if (!window.google?.accounts?.oauth2) {
    throw new Error("Google 인증 모듈을 불러오지 못했습니다. 페이지를 새로고침해 주세요.");
  }
  return withTimeout(
    new Promise((resolve, reject) => {
      try {
        const client = window.google.accounts.oauth2.initTokenClient({
          client_id: DRIVE_CLIENT_ID,
          scope: DRIVE_SCOPE,
          callback: (resp) => {
            if (resp.error) {
              const msgs = {
                access_denied: "Google 계정 접근이 거부됐습니다.",
                popup_closed_by_user: "로그인 창이 닫혔습니다. 다시 시도해 주세요.",
              };
              reject(new Error(msgs[resp.error] || `인증 오류: ${resp.error}`));
              return;
            }
            _driveToken = resp.access_token;
            _driveTokenExpiry = Date.now() + resp.expires_in * 1000;
            resolve(_driveToken);
          },
          error_callback: (err) => {
            const msgs = {
              popup_closed: "로그인 창이 닫혔습니다. 다시 시도해 주세요.",
              popup_failed_to_open: "팝업이 차단됐습니다.\n브라우저 주소창에서 팝업 허용 후 다시 시도해 주세요.",
            };
            reject(new Error(msgs[err?.type] || `인증 실패: ${err?.type || "알 수 없는 오류"}`));
          },
        });
        client.requestAccessToken({ prompt: "select_account" });
      } catch (e) {
        reject(new Error(`Google 인증 초기화 오류: ${e.message}`));
      }
    }),
    60000,
    "로그인 대기 시간 초과 (60초).\n다시 시도해 주세요."
  );
}

async function driveFindFile(fileName) {
  const token = await ensureDriveToken();
  const q = encodeURIComponent(`name='${fileName}' and not trashed`);
  const res = await withTimeout(
    fetch(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name,modifiedTime)`, {
      headers: { Authorization: `Bearer ${token}` },
    }),
    15000, "Drive 파일 검색 시간 초과"
  );
  const data = await res.json();
  return data.files?.[0] || null;
}

async function driveSave(payload) {
  const token = await ensureDriveToken();
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const existing = await driveFindFile(DRIVE_FILE_NAME);
  if (existing) {
    const res = await withTimeout(
      fetch(`https://www.googleapis.com/upload/drive/v3/files/${existing.id}?uploadType=media`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: blob,
      }),
      20000, "Drive 저장 시간 초과"
    );
    if (!res.ok) throw new Error(`Drive 저장 실패 (${res.status})`);
    return existing.id;
  } else {
    const form = new FormData();
    form.append("metadata", new Blob([JSON.stringify({ name: DRIVE_FILE_NAME, mimeType: "application/json" })], { type: "application/json" }));
    form.append("file", blob);
    const res = await withTimeout(
      fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      }),
      20000, "Drive 생성 시간 초과"
    );
    if (!res.ok) throw new Error(`Drive 생성 실패 (${res.status})`);
    return (await res.json()).id;
  }
}

// v1 데이터(itinerary의 time 문자열 등)를 v2 state 형식으로 변환
function convertV1DriveDataToV2(v1) {
  const timeMap = { morning: "09:00", afternoon: "13:00", evening: "18:00", allday: "00:00" };
  const itinerary = (v1.itinerary || []).map(s => ({
    id: generateId(),
    day: s.day || 0,
    startTime: timeMap[s.time] || "09:00",
    title: s.title || "",
    place: "",
    note: s.note || "",
    visited: s.visited || false,
  }));
  return {
    ...DEFAULT_STATE,
    tripName: v1.tripName || "가져온 여행(v1 Drive 백업)",
    tripStart: v1.tripStart || new Date().toISOString().slice(0, 10),
    tripEnd: v1.tripEnd || new Date().toISOString().slice(0, 10),
    itinerary,
    lastSaved: new Date().toISOString(),
    _importedFromV1Drive: true, // 호출부에서 안내 메시지 분기용
  };
}

async function driveLoad() {
  // 1) v2 파일 먼저 탐색
  const v2File = await driveFindFile(DRIVE_FILE_NAME);
  if (v2File) {
    const token = await ensureDriveToken();
    const res = await withTimeout(
      fetch(`https://www.googleapis.com/drive/v3/files/${v2File.id}?alt=media`, {
        headers: { Authorization: `Bearer ${token}` },
      }),
      20000, "Drive 불러오기 시간 초과"
    );
    if (!res.ok) throw new Error(`Drive 불러오기 실패 (${res.status})`);
    return await res.json();
  }
  // 2) v2 파일이 없으면 v1 백업 파일도 확인 (구버전 사용자 대비 폴백)
  const v1File = await driveFindFile(DRIVE_FILE_NAME_V1);
  if (v1File) {
    const token = await ensureDriveToken();
    const res = await withTimeout(
      fetch(`https://www.googleapis.com/drive/v3/files/${v1File.id}?alt=media`, {
        headers: { Authorization: `Bearer ${token}` },
      }),
      20000, "Drive 불러오기 시간 초과"
    );
    if (!res.ok) throw new Error(`Drive 불러오기 실패 (${res.status})`);
    const v1data = await res.json();
    return convertV1DriveDataToV2(v1data);
  }
  throw new Error("Drive에 저장된 데이터가 없습니다.\n먼저 Drive에 저장해 주세요.");
}

function useDrive(state, setState) {
  const [driveStatus, setDriveStatus] = useState("idle");
  const [driveMessage, setDriveMessage] = useState("");
  const [lastSynced, setLastSynced] = useState(localStorage.getItem("drive_last_synced") || "");

  const resetToIdle = () => {
    _driveToken = null;
    setDriveStatus("idle");
    setDriveMessage("");
  };

  const handleDriveSave = async () => {
    setDriveStatus("saving");
    setDriveMessage("");
    try {
      await driveSave({ ...state, archives: loadArchive(), savedAt: new Date().toISOString(), appVersion: "2.0" });
      const now = new Date().toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
      setLastSynced(now);
      localStorage.setItem("drive_last_synced", now);
      setDriveStatus("success");
      setDriveMessage("Drive에 저장했습니다");
      setTimeout(() => setDriveStatus("idle"), 3000);
    } catch (e) {
      setDriveStatus("error");
      setDriveMessage(e.message || "저장 실패");
      setTimeout(() => setDriveStatus("idle"), 6000);
    }
  };

  const handleDriveLoad = async () => {
    if (!window.confirm("Drive에서 불러오면 현재 데이터가 대체됩니다.\n계속할까요?")) return;
    setDriveStatus("loading");
    setDriveMessage("");
    try {
      const data = await driveLoad();
      if (data.archives) saveArchive(data.archives);
      const { archives: _a, savedAt: _s, appVersion: _v, _importedFromV1Drive, ...tripData } = data;
      setState({ ...DEFAULT_STATE, ...tripData });
      const now = new Date().toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
      setLastSynced(now);
      localStorage.setItem("drive_last_synced", now);
      setDriveStatus("success");
      setDriveMessage(
        _importedFromV1Drive
          ? "v1 Drive 백업에서 일정을 가져왔습니다 (일정만 포함, 지출·체크리스트는 제외)"
          : "Drive에서 불러왔습니다"
      );
      setTimeout(() => setDriveStatus("idle"), 3000);
    } catch (e) {
      setDriveStatus("error");
      setDriveMessage(e.message || "불러오기 실패");
      setTimeout(() => setDriveStatus("idle"), 6000);
    }
  };

  return { driveStatus, driveMessage, lastSynced, handleDriveSave, handleDriveLoad, resetToIdle };
}
const CUSTOM_THEMES_KEY = "travel_custom_themes_v2";

function loadCustomThemes() {
  try { return JSON.parse(localStorage.getItem(CUSTOM_THEMES_KEY) || "[]"); } catch { return []; }
}
function saveCustomThemes(themes) {
  try { localStorage.setItem(CUSTOM_THEMES_KEY, JSON.stringify(themes)); } catch { /* ignore */ }
}

function getActiveCustomTheme(customThemes) {
  const today = new Date(); today.setHours(0,0,0,0);
  // 자동 적용 기간 우선
  const auto = customThemes.find(t => {
    if (!t.autoApply || !t.startDate || !t.endDate) return false;
    const s = new Date(t.startDate + "T00:00:00");
    const e = new Date(t.endDate + "T00:00:00");
    return today >= s && today <= e;
  });
  if (auto) return auto;
  // 수동 활성화
  return customThemes.find(t => t.isActive) || null;
}

function applyCustomTheme(ct) {
  if (!ct) return;
  const root = document.documentElement;
  const c = ct.colors || {};
  const map = {
    "--t-bg": c.bg || "#FAFAF8",
    "--t-bg-card": "#FFFFFF",
    "--t-bg-sidebar": c.sidebar || "#1A1D23",
    "--t-bg-input": "#F3F4F6",
    "--t-bg-badge": "#F0EFEB",
    "--t-text": c.text || "#1A1D23",
    "--t-text-sub": c.textSub || "#6B7280",
    "--t-text-light": "#9CA3AF",
    "--t-text-white": "#FFFFFF",
    "--t-primary": c.primary || "#2563EB",
    "--t-primary-light": c.primary ? c.primary + "22" : "#EFF6FF",
    "--t-success": "#10B981",
    "--t-warning": "#F59E0B",
    "--t-danger": "#EF4444",
    "--t-border": "#E5E7EB",
    "--t-border-light": "#F3F4F6",
    "--t-shadow": "0 1px 3px rgba(0,0,0,0.06)",
    "--t-shadow-lg": "0 8px 24px rgba(0,0,0,0.12)",
  };
  Object.entries(map).forEach(([k, v]) => root.style.setProperty(k, v));
  document.body.style.background = ct.bgImage ? "transparent" : (c.bg || "#FAFAF8");
}

// ─── Custom Theme Particle Canvas ───
function CustomParticleCanvas({ theme: ct }) {
  const canvasRef = useRef(null);
  const animRef = useRef(null);
  const imgCache = useRef([]);

  useEffect(() => {
    if (!ct?.particles?.length || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    let W = window.innerWidth, H = window.innerHeight;
    canvas.width = W; canvas.height = H;
    const onResize = () => { W = window.innerWidth; H = window.innerHeight; canvas.width = W; canvas.height = H; };
    window.addEventListener("resize", onResize);

    // 이미지 로드
    const imgs = ct.particles.map(src => { const i = new Image(); i.src = src; return i; });
    imgCache.current = imgs;

    const COUNT = 20;
    const particles = Array.from({ length: COUNT }, (_, i) => ({
      x: Math.random() * W, y: Math.random() * H,
      size: 18 + Math.random() * 22,
      speed: 0.12 + Math.random() * 0.22,
      drift: (Math.random() - 0.5) * 0.3,
      driftPhase: Math.random() * Math.PI * 2,
      rot: Math.random() * Math.PI * 2,
      rotSpeed: (Math.random() - 0.5) * 0.015,
      opacity: 0.5 + Math.random() * 0.4,
      imgIdx: i % imgs.length,
    }));

    let frame = 0;
    const draw = () => {
      ctx.clearRect(0, 0, W, H);
      frame++;
      particles.forEach(p => {
        const img = imgs[p.imgIdx];
        if (img.complete && img.naturalWidth > 0) {
          ctx.save();
          ctx.globalAlpha = p.opacity;
          ctx.translate(p.x, p.y);
          ctx.rotate(p.rot);
          ctx.drawImage(img, -p.size / 2, -p.size / 2, p.size, p.size);
          ctx.restore();
        }
        p.y += p.speed;
        p.x += p.drift + Math.sin(frame * 0.012 + p.driftPhase) * 0.3;
        p.rot += p.rotSpeed;
        if (p.y > H + 30) { p.y = -30; p.x = Math.random() * W; }
      });
      animRef.current = requestAnimationFrame(draw);
    };
    draw();
    return () => { cancelAnimationFrame(animRef.current); window.removeEventListener("resize", onResize); };
  }, [ct]);

  if (!ct?.particles?.length) return null;
  return <canvas ref={canvasRef} style={{ position:"fixed", inset:0, width:"100vw", height:"100vh", pointerEvents:"none", zIndex:99 }} />;
}

// ─── Custom Theme Editor Modal ───
function CustomThemeEditorModal({ editTheme, onSave, onClose }) {
  const genId = () => `ct_${Date.now()}`;
  const [form, setForm] = useState(editTheme || {
    id: genId(), name: "", startDate: "", endDate: "",
    autoApply: false, bgImage: null, bgColor: "#FAFAF8",
    particles: [], colors: { primary: "#2563EB", sidebar: "#1A1D23", text: "#1A1D23", textSub: "#6B7280", bg: "#FAFAF8" },
    isActive: false,
  });
  const [sizeWarning, setSizeWarning] = useState("");
  const bgRef = useRef(null);
  const particleRef = useRef(null);

  const update = (k, v) => setForm(p => ({ ...p, [k]: v }));
  const updateColor = (k, v) => setForm(p => ({ ...p, colors: { ...p.colors, [k]: v } }));

  const handleBgUpload = (e) => {
    const file = e.target.files?.[0]; if (!file) return;
    if (file.size > 2 * 1024 * 1024) { setSizeWarning("배경 이미지는 2MB 이하로 올려주세요."); return; }
    setSizeWarning("");
    const reader = new FileReader();
    reader.onload = (ev) => update("bgImage", ev.target.result);
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  const handleParticleUpload = (e) => {
    const files = Array.from(e.target.files || []);
    if (form.particles.length + files.length > 3) { setSizeWarning("파티클은 최대 3개까지 가능합니다."); return; }
    setSizeWarning("");
    files.forEach(file => {
      if (file.size > 500 * 1024) { setSizeWarning("파티클 이미지는 500KB 이하로 올려주세요."); return; }
      const reader = new FileReader();
      reader.onload = (ev) => setForm(p => ({ ...p, particles: [...p.particles, ev.target.result] }));
      reader.readAsDataURL(file);
    });
    e.target.value = "";
  };

  const inputStyle = {
    width: "100%", padding: "11px 14px",
    border: `1.5px solid ${theme.border}`, borderRadius: theme.radiusSm,
    fontSize: "14px", color: theme.text, background: theme.bgCard,
    outline: "none", boxSizing: "border-box", fontFamily: "inherit",
  };
  const labelStyle = { fontSize: "12px", fontWeight: "700", color: theme.textSub, display: "block", marginBottom: "5px" };

  const COLOR_FIELDS = [
    { key: "primary", label: "주요 색상" },
    { key: "sidebar", label: "사이드바" },
    { key: "bg", label: "배경색" },
    { key: "text", label: "본문 텍스트" },
    { key: "textSub", label: "보조 텍스트" },
  ];

  return (
    <ModalWrapper onClose={onClose}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:"18px" }}>
        <h3 style={{ margin:0, fontSize:"18px", fontWeight:"800", color:theme.text }}>🎨 커스텀 테마</h3>
        <button onClick={onClose} style={{ background:"none", border:"none", fontSize:"22px", cursor:"pointer", color:theme.textLight }}>✕</button>
      </div>

      <div style={{ display:"flex", flexDirection:"column", gap:"14px" }}>
        <div>
          <label style={labelStyle}>테마 이름 *</label>
          <input type="text" value={form.name} onChange={e => update("name", e.target.value)} placeholder="예: 2026 월드컵" style={inputStyle} />
        </div>

        <div>
          <label style={labelStyle}>자동 적용 기간 (선택)</label>
          <div style={{ display:"flex", gap:"8px", alignItems:"center" }}>
            <input type="date" value={form.startDate} onChange={e => update("startDate", e.target.value)} style={{ ...inputStyle, flex:1 }} />
            <span style={{ color:theme.textLight, flexShrink:0 }}>~</span>
            <input type="date" value={form.endDate} onChange={e => update("endDate", e.target.value)} style={{ ...inputStyle, flex:1 }} />
          </div>
          {form.startDate && form.endDate && (
            <label style={{ display:"flex", alignItems:"center", gap:"8px", marginTop:"8px", cursor:"pointer" }}>
              <input type="checkbox" checked={form.autoApply} onChange={e => update("autoApply", e.target.checked)} />
              <span style={{ fontSize:"13px", color:theme.textSub }}>기간 내 자동 적용</span>
            </label>
          )}
        </div>

        {/* 배경 이미지 */}
        <div>
          <label style={labelStyle}>배경 이미지 (선택, 2MB 이하)</label>
          {form.bgImage ? (
            <div style={{ position:"relative" }}>
              <img src={form.bgImage} alt="bg" style={{ width:"100%", height:"80px", objectFit:"cover", borderRadius:theme.radiusSm }} />
              <button onClick={() => update("bgImage", null)} style={{
                position:"absolute", top:"6px", right:"6px", background:"rgba(0,0,0,0.5)", color:"#fff",
                border:"none", borderRadius:"50%", width:"24px", height:"24px", cursor:"pointer", fontSize:"12px",
              }}>✕</button>
            </div>
          ) : (
            <>
              <input ref={bgRef} type="file" accept="image/*" onChange={handleBgUpload} style={{ display:"none" }} />
              <button onClick={() => bgRef.current?.click()} style={{
                width:"100%", padding:"12px", border:`1.5px dashed ${theme.border}`,
                borderRadius:theme.radiusSm, background:"none", color:theme.textSub,
                fontSize:"13px", cursor:"pointer",
              }}>🖼️ 이미지 업로드</button>
            </>
          )}
        </div>

        {/* 배경 색상 */}
        {!form.bgImage && (
          <div>
            <label style={labelStyle}>배경 색상 (이미지 없을 때 사용)</label>
            <div style={{ display:"flex", alignItems:"center", gap:"10px" }}>
              <input type="color" value={form.bgColor} onChange={e => update("bgColor", e.target.value)}
                style={{ width:"48px", height:"40px", border:"none", cursor:"pointer", borderRadius:"6px" }} />
              <span style={{ fontSize:"13px", color:theme.textSub }}>{form.bgColor}</span>
            </div>
          </div>
        )}

        {/* 파티클 이미지 */}
        <div>
          <label style={labelStyle}>파티클 이미지 (선택, PNG 투명배경, 최대 3개, 각 500KB 이하)</label>
          <div style={{ display:"flex", gap:"8px", flexWrap:"wrap" }}>
            {form.particles.map((src, i) => (
              <div key={i} style={{ position:"relative" }}>
                <img src={src} alt={`particle-${i}`} style={{ width:"56px", height:"56px", objectFit:"contain", borderRadius:"8px", border:`1px solid ${theme.border}`, background:"#f0f0f0" }} />
                <button onClick={() => setForm(p => ({ ...p, particles: p.particles.filter((_, j) => j !== i) }))} style={{
                  position:"absolute", top:"-6px", right:"-6px", background:theme.danger, color:"#fff",
                  border:"none", borderRadius:"50%", width:"20px", height:"20px", cursor:"pointer", fontSize:"11px",
                }}>✕</button>
              </div>
            ))}
            {form.particles.length < 3 && (
              <>
                <input ref={particleRef} type="file" accept="image/png" multiple onChange={handleParticleUpload} style={{ display:"none" }} />
                <button onClick={() => particleRef.current?.click()} style={{
                  width:"56px", height:"56px", border:`1.5px dashed ${theme.border}`,
                  borderRadius:"8px", background:"none", cursor:"pointer", fontSize:"22px", color:theme.textLight,
                }}>+</button>
              </>
            )}
          </div>
        </div>

        {/* 색상 설정 */}
        <div>
          <label style={labelStyle}>주요 색상 설정</label>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"10px" }}>
            {COLOR_FIELDS.map(({ key, label }) => (
              <div key={key} style={{ display:"flex", alignItems:"center", gap:"8px" }}>
                <input type="color" value={form.colors[key] || "#888888"} onChange={e => updateColor(key, e.target.value)}
                  style={{ width:"36px", height:"36px", border:"none", cursor:"pointer", borderRadius:"6px", flexShrink:0 }} />
                <span style={{ fontSize:"12px", color:theme.textSub }}>{label}</span>
              </div>
            ))}
          </div>
        </div>

        {sizeWarning && (
          <div style={{ padding:"8px 12px", background:"#FEF2F2", borderRadius:theme.radiusSm, fontSize:"12px", color:theme.danger, fontWeight:"600" }}>
            ⚠️ {sizeWarning}
          </div>
        )}
      </div>

      <div style={{ display:"flex", gap:"10px", marginTop:"20px" }}>
        <button onClick={onClose} style={{
          flex:1, padding:"13px", background:theme.bgInput, color:theme.textSub,
          border:"none", borderRadius:theme.radius, fontSize:"14px", fontWeight:"600", cursor:"pointer",
        }}>취소</button>
        <button onClick={() => { if (!form.name.trim()) { setSizeWarning("테마 이름을 입력해 주세요."); return; } onSave(form); }} style={{
          flex:2, padding:"13px", background:theme.primary, color:theme.textWhite,
          border:"none", borderRadius:theme.radius, fontSize:"14px", fontWeight:"700", cursor:"pointer",
        }}>저장하기</button>
      </div>
    </ModalWrapper>
  );
}

// ─── Trip Edit Modal ───
function TripEditModal({ state, onSave, onClose }) {
  const [form, setForm] = useState({
    tripName: state.tripName || "",
    tripStart: state.tripStart || "",
    tripEnd: state.tripEnd || "",
    tripRegion: state.tripRegion || "overseas",
    accommodation: state.accommodation || "",
    currency: state.currency || "JPY",
    rate: String(state.rate || ""),
  });
  const [rateStatus, setRateStatus] = useState("idle"); // idle | loading | live | error

  const loadLiveRate = async (code) => {
    if (!code || code === "KRW") return;
    setRateStatus("loading");
    try {
      const live = await fetchLiveExchangeRate(code);
      setForm(prev => (prev.currency === code ? { ...prev, rate: String(roundRateForSize(live)) } : prev));
      setRateStatus("live");
    } catch {
      setRateStatus("error");
    }
  };

  const update = (k, v) => {
    if (k === "currency") {
      const cur = CURRENCIES.find(c => c.code === v);
      setForm(p => ({ ...p, currency: v, rate: String(cur?.defaultRate || "") }));
      setRateStatus("idle");
      if (v !== "KRW") loadLiveRate(v);
    } else {
      setForm(p => ({ ...p, [k]: v }));
    }
  };

  const inputStyle = {
    width: "100%", padding: "11px 14px",
    border: `1.5px solid ${theme.border}`, borderRadius: theme.radiusSm,
    fontSize: "15px", fontWeight: "500", color: theme.text,
    background: theme.bgCard, outline: "none", boxSizing: "border-box", fontFamily: "inherit",
  };
  const labelStyle = { display: "block", fontSize: "13px", fontWeight: "700", color: theme.textSub, marginBottom: "6px" };

  return (
    <ModalWrapper onClose={onClose}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
        <h3 style={{ margin: 0, fontSize: "18px", fontWeight: "800", color: theme.text }}>✈️ 여행 정보 수정</h3>
        <button onClick={onClose} style={{ background: "none", border: "none", fontSize: "22px", cursor: "pointer", color: theme.textLight }}>✕</button>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
        <div>
          <label style={labelStyle}>여행 이름</label>
          <input type="text" value={form.tripName} onChange={e => update("tripName", e.target.value)} style={inputStyle} />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
          <div>
            <label style={labelStyle}>출발일</label>
            <input type="date" value={form.tripStart} onChange={e => update("tripStart", e.target.value)} style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>도착일</label>
            <input type="date" value={form.tripEnd} onChange={e => update("tripEnd", e.target.value)} style={inputStyle} />
          </div>
        </div>
        <div>
          <label style={labelStyle}>여행 지역</label>
          <div style={{ display: "flex", gap: "8px" }}>
            {[{ val: "domestic", label: "🇰🇷 국내" }, { val: "overseas", label: "🌏 해외" }].map(opt => (
              <button key={opt.val} onClick={() => update("tripRegion", opt.val)} style={{
                flex: 1, padding: "11px",
                border: `1.5px solid ${form.tripRegion === opt.val ? theme.primary : theme.border}`,
                borderRadius: theme.radiusSm,
                background: form.tripRegion === opt.val ? theme.primaryLight : theme.bgCard,
                color: form.tripRegion === opt.val ? theme.primary : theme.text,
                fontSize: "14px", fontWeight: "600", cursor: "pointer",
              }}>{opt.label}</button>
            ))}
          </div>
        </div>
        <div>
          <label style={labelStyle}>숙소 지역</label>
          <input type="text" value={form.accommodation} onChange={e => update("accommodation", e.target.value)} placeholder="예: 신주쿠" style={inputStyle} />
        </div>
        {form.tripRegion === "overseas" && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
            <div>
              <label style={labelStyle}>통화</label>
              <select value={form.currency} onChange={e => update("currency", e.target.value)}
                style={{ ...inputStyle, appearance: "auto" }}>
                {CURRENCIES.map(c => <option key={c.code} value={c.code}>{c.symbol} {c.code} — {c.name}</option>)}
              </select>
            </div>
            <div>
              <label style={labelStyle}>
                환율 (1{form.currency} = {formatRateLabel(form.rate)})
              </label>
              <div style={{ display: "flex", gap: "6px" }}>
                <input type="text" inputMode="numeric" value={form.rate}
                  onChange={e => update("rate", e.target.value.replace(/[^0-9.]/g, ""))}
                  placeholder="예: 9.2" style={{ ...inputStyle, flex: 1 }} />
                <button
                  type="button"
                  onClick={() => loadLiveRate(form.currency)}
                  disabled={rateStatus === "loading"}
                  title="실시간 환율 새로고침"
                  style={{
                    width: "40px", border: `1.5px solid ${theme.border}`,
                    borderRadius: theme.radiusSm, background: theme.bgCard,
                    cursor: rateStatus === "loading" ? "default" : "pointer",
                    fontSize: "15px", opacity: rateStatus === "loading" ? 0.5 : 1,
                  }}
                >
                  {rateStatus === "loading" ? "⏳" : "🔄"}
                </button>
              </div>
              <div style={{ fontSize: "11px", color: theme.textLight, marginTop: "3px" }}>
                {rateStatus === "loading" && "실시간 환율 가져오는 중..."}
                {rateStatus === "live" && "✅ 실시간 환율 반영됨"}
                {rateStatus === "error" && "⚠️ 조회 실패 — 참고용 기본값 사용 중"}
                {rateStatus === "idle" && "📌 참고 환율 자동입력 · 🔄로 실시간 갱신 가능"}
              </div>
            </div>
          </div>
        )}
      </div>
      <div style={{ display: "flex", gap: "10px", marginTop: "24px" }}>
        <button onClick={onClose} style={{
          flex: 1, padding: "14px", background: theme.bgInput, color: theme.textSub,
          border: "none", borderRadius: theme.radius, fontSize: "15px", fontWeight: "600", cursor: "pointer",
        }}>취소</button>
        <button onClick={() => onSave({ ...state, ...form, rate: parseFloat(form.rate) || 0 })} style={{
          flex: 2, padding: "14px", background: theme.primary, color: theme.textWhite,
          border: "none", borderRadius: theme.radius, fontSize: "15px", fontWeight: "700", cursor: "pointer",
        }}>저장하기</button>
      </div>
    </ModalWrapper>
  );
}

// ─── Finish Trip Modal ───
function FinishTripModal({ onConfirm, onClose }) {
  const [review, setReview] = useState("");
  return (
    <ModalWrapper onClose={onClose}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
        <h3 style={{ margin: 0, fontSize: "18px", fontWeight: "800", color: theme.text }}>🏁 여행 마무리</h3>
        <button onClick={onClose} style={{ background: "none", border: "none", fontSize: "22px", cursor: "pointer", color: theme.textLight }}>✕</button>
      </div>
      <p style={{ fontSize: "14px", color: theme.textSub, lineHeight: 1.6, margin: "0 0 16px" }}>
        여행을 마무리하면 현재 데이터가 아카이브로 저장되고 앱이 초기화됩니다.
      </p>
      <div>
        <div style={{ fontSize: "13px", fontWeight: "700", color: theme.textSub, marginBottom: "6px" }}>
          ✍️ 한줄평 (선택)
        </div>
        <input type="text" value={review} onChange={e => setReview(e.target.value)}
          placeholder="이번 여행 어떠셨나요?"
          style={{
            width: "100%", padding: "12px 14px",
            border: `1.5px solid ${theme.border}`, borderRadius: theme.radiusSm,
            fontSize: "15px", color: theme.text, outline: "none",
            background: theme.bgCard, boxSizing: "border-box", fontFamily: "inherit",
          }} />
      </div>
      <div style={{ display: "flex", gap: "10px", marginTop: "24px" }}>
        <button onClick={onClose} style={{
          flex: 1, padding: "14px", background: theme.bgInput, color: theme.textSub,
          border: "none", borderRadius: theme.radius, fontSize: "15px", fontWeight: "600", cursor: "pointer",
        }}>취소</button>
        <button onClick={() => onConfirm(review)} style={{
          flex: 2, padding: "14px", background: theme.danger, color: theme.textWhite,
          border: "none", borderRadius: theme.radius, fontSize: "15px", fontWeight: "700", cursor: "pointer",
        }}>마무리 & 아카이브 저장</button>
      </div>
    </ModalWrapper>
  );
}

// ─── Archive View Modal ───
function ArchiveModal({ archives, onClose, onDeleteArchive, onEditArchive }) {
  const [expanded, setExpanded] = useState(null);
  const [deleteIdx, setDeleteIdx] = useState(null);
  const [editIdx, setEditIdx] = useState(null);
  return (
    <ModalWrapper onClose={onClose}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
        <h3 style={{ margin: 0, fontSize: "18px", fontWeight: "800", color: theme.text }}>
          📖 여행 기록 ({archives.length})
        </h3>
        <button onClick={onClose} style={{ background: "none", border: "none", fontSize: "22px", cursor: "pointer", color: theme.textLight }}>✕</button>
      </div>
      {archives.length === 0 ? (
        <div style={{ textAlign: "center", padding: "40px", color: theme.textLight }}>
          <div style={{ fontSize: "40px", marginBottom: "12px" }}>📖</div>
          <p style={{ fontSize: "14px", margin: 0 }}>저장된 여행 기록이 없습니다</p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          {archives.map((arc, i) => {
            const rate = arc.rate || 1;
            const totalSpent = (arc.expenses || []).reduce((s, e) =>
              s + (e.currency === "KRW" ? e.amount : e.amount * rate), 0);
            return (
              <div key={i} style={{
                background: theme.bgCard, borderRadius: theme.radius,
                border: `1px solid ${theme.borderLight}`, overflow: "hidden",
              }}>
                <button onClick={() => setExpanded(expanded === i ? null : i)} style={{
                  width: "100%", display: "flex", alignItems: "center", gap: "12px",
                  padding: "14px 16px", background: "none", border: "none", cursor: "pointer", textAlign: "left",
                }}>
                  {/* 여행카드 썸네일 or 국기 */}
                  {arc.tripCard ? (
                    <img src={arc.tripCard} alt="trip" style={{
                      width: "48px", height: "48px", borderRadius: "8px",
                      objectFit: "cover", flexShrink: 0,
                    }} />
                  ) : (
                    <div style={{
                      width: "48px", height: "48px", borderRadius: "8px",
                      background: theme.bgInput, display: "flex", alignItems: "center",
                      justifyContent: "center", fontSize: "26px", flexShrink: 0,
                    }}>
                      {REGION_FLAGS[arc.selectedRegion] || REGION_FLAGS[arc.tripRegion === "domestic" ? "domestic" : "overseas"]}
                    </div>
                  )}
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: "15px", fontWeight: "700", color: theme.text }}>{arc.tripName}</div>
                    <div style={{ fontSize: "12px", color: theme.textSub, marginTop: "2px" }}>
                      {formatDate(arc.tripStart)} ~ {formatDate(arc.tripEnd)}
                    </div>
                    {arc.review && (
                      <div style={{ fontSize: "12px", color: theme.textLight, marginTop: "4px", fontStyle: "italic" }}>
                        "{arc.review}"
                      </div>
                    )}
                  </div>
                  <span style={{
                    fontSize: "14px", color: theme.textLight,
                    transform: expanded === i ? "rotate(180deg)" : "none", transition: "transform 0.2s",
                  }}>▼</span>
                </button>
                {expanded === i && (
                  <div style={{ padding: "12px 16px", borderTop: `1px solid ${theme.borderLight}`, display: "flex", flexDirection: "column", gap: "6px" }}>
                    <div style={{ display: "flex", gap: "8px", marginBottom: "6px" }}>
                      <button onClick={() => setEditIdx(i)} style={{
                        flex: 1, padding: "8px", fontSize: "12px", fontWeight: "600",
                        background: theme.bgInput, color: theme.text, border: "none",
                        borderRadius: theme.radiusSm, cursor: "pointer",
                      }}>✏️ 수정</button>
                      <button onClick={() => exportArchiveToPDF(arc)} style={{
                        flex: 1, padding: "8px", fontSize: "12px", fontWeight: "600",
                        background: theme.bgInput, color: theme.text, border: "none",
                        borderRadius: theme.radiusSm, cursor: "pointer",
                      }}>📄 PDF</button>
                      <button onClick={() => setDeleteIdx(i)} style={{
                        flex: 1, padding: "8px", fontSize: "12px", fontWeight: "600",
                        background: "#FEE2E2", color: "#B91C1C", border: "none",
                        borderRadius: theme.radiusSm, cursor: "pointer",
                      }}>🗑️ 삭제</button>
                    </div>
                    {[
                      { label: "일정", value: `${(arc.itinerary || []).length}개` },
                      { label: "지출", value: `${(arc.expenses || []).length}건 · ${Math.round(totalSpent).toLocaleString()}원` },
                      { label: "동행", value: arc.companionType ? `${arc.companionType} ${arc.companionCount || ""}명` : "-" },
                      { label: "메모", value: arc.tripMemo || "-" },
                    ].map((row, j) => (
                      <div key={j} style={{ display: "flex", gap: "12px", fontSize: "13px" }}>
                        <span style={{ color: theme.textSub, fontWeight: "600", minWidth: "36px" }}>{row.label}</span>
                        <span style={{ color: theme.text }}>{row.value}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
      {deleteIdx !== null && (
        <ConfirmDialog
          message={`"${archives[deleteIdx]?.tripName || "이 여행"}" 기록을 삭제할까요?\n삭제하면 복구할 수 없습니다.`}
          onConfirm={() => { onDeleteArchive(deleteIdx); setDeleteIdx(null); }}
          onCancel={() => setDeleteIdx(null)}
        />
      )}
      {editIdx !== null && (
        <ArchiveEditModal
          archive={archives[editIdx]}
          onSave={(updates) => { onEditArchive(editIdx, updates); setEditIdx(null); }}
          onClose={() => setEditIdx(null)}
        />
      )}
    </ModalWrapper>
  );
}

function SettingsTab({ state, setState, onFinishTrip, archives, onViewArchive, onThemeChange, onDeleteArchive, onEditArchive }) {
  const [editOpen, setEditOpen] = useState(false);
  const [finishOpen, setFinishOpen] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [theme_mode, setThemeMode] = useState(localStorage.getItem("theme_mode") || "system");
  const [customThemes, setCustomThemes] = useState(loadCustomThemes);
  const [themeEditorOpen, setThemeEditorOpen] = useState(false);
  const [editingTheme, setEditingTheme] = useState(null);
  const cardRef = useRef(null);
  const fileRef = useRef(null);
  const { driveStatus, driveMessage, lastSynced, handleDriveSave, handleDriveLoad, resetToIdle } = useDrive(state, setState);

  const handleTheme = (mode) => {
    setThemeMode(mode);
    localStorage.setItem("theme_mode", mode);
    applyTheme(mode);
    onThemeChange?.(mode);
  };

  const handleSaveCustomTheme = (ct) => {
    const updated = editingTheme
      ? customThemes.map(t => t.id === ct.id ? ct : t)
      : [...customThemes, ct];
    setCustomThemes(updated);
    saveCustomThemes(updated);
    setThemeEditorOpen(false);
    setEditingTheme(null);
    onThemeChange?.("__custom_updated__");
  };

  const handleToggleCustomTheme = (ct) => {
    const updated = customThemes.map(t => ({ ...t, isActive: t.id === ct.id ? !t.isActive : false }));
    setCustomThemes(updated);
    saveCustomThemes(updated);
    const nowActive = updated.find(t => t.id === ct.id);
    if (nowActive?.isActive) {
      applyCustomTheme(nowActive);
    } else {
      applyTheme(theme_mode);
      onThemeChange?.(theme_mode);
    }
    onThemeChange?.("__custom_updated__");
  };

  const handleDeleteCustomTheme = (id) => {
    const updated = customThemes.filter(t => t.id !== id);
    setCustomThemes(updated);
    saveCustomThemes(updated);
    onThemeChange?.("__custom_updated__");
  };

  const handleCardUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => setState(prev => ({ ...prev, tripCard: ev.target.result }));
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  const handleShare = async () => {
    const exportData = {
      tripName: state.tripName,
      tripStart: state.tripStart,
      tripEnd: state.tripEnd,
      tripRegion: state.tripRegion,
      accommodation: state.accommodation,
      itinerary: state.itinerary,
      version: "2.0",
    };
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: "application/json" });
    const file = new File([blob], `${state.tripName || "여행"}_일정.json`, { type: "application/json" });
    if (navigator.share && navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ title: `${state.tripName} 일정`, files: [file] });
      } catch (e) { /* cancelled */ }
    } else {
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = file.name; a.click();
      URL.revokeObjectURL(url);
    }
  };

  const handleExcelTemplate = () => downloadExcelTemplate(state.tripStart, state.tripEnd);

  const handleFileUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const isExcel = file.name.endsWith(".xlsx") || file.name.endsWith(".xls");
    const isJSON = file.name.endsWith(".json");
    if (isExcel) {
      const reader = new FileReader();
      reader.onload = (ev) => {
        const data = new Uint8Array(ev.target.result);
        const parsed = parseExcel(data);
        const bucket = parseExcelBucket(data);
        const budget = parseExcelBudget(data);
        if (parsed.length === 0 && bucket.length === 0 && !budget) { alert("엑셀 파싱 실패"); return; }
        setState(prev => ({
          ...prev,
          itinerary: parsed.length > 0 ? [...prev.itinerary, ...parsed.map(s => ({ ...s, id: generateId() }))] : prev.itinerary,
          shoppingList: bucket.length > 0 ? [...(prev.shoppingList || []), ...bucket] : prev.shoppingList,
          budget: budget ? {
            totalKRW: budget.totalKRW || prev.budget?.totalKRW || 0,
            totalLocal: budget.totalLocal || prev.budget?.totalLocal || 0,
            categories: budget.categories.length > 0 ? budget.categories : (prev.budget?.categories || []),
          } : prev.budget,
        }));
        const summary = [
          parsed.length > 0 ? `일정 ${parsed.length}개` : null,
          bucket.length > 0 ? `여행버킷 ${bucket.length}개` : null,
          budget ? "예산 정보" : null,
        ].filter(Boolean).join(", ");
        alert(`${summary}를 추가했습니다.`);
      };
      reader.readAsArrayBuffer(file);
    } else if (isJSON) {
      const reader = new FileReader();
      reader.onload = (ev) => {
        try {
          const data = JSON.parse(ev.target.result);
          if (data.itinerary) {
            setState(prev => ({ ...prev, itinerary: [...prev.itinerary, ...data.itinerary.map(s => ({ ...s, id: generateId() }))] }));
            alert(`${data.itinerary.length}개 일정을 추가했습니다.`);
          }
        } catch { alert("JSON 파일 형식이 올바르지 않습니다."); }
      };
      reader.readAsText(file);
    } else {
      const reader = new FileReader();
      reader.onload = (ev) => {
        const parsed = parseCSV(ev.target.result);
        if (parsed.length === 0) { alert("CSV 파싱 실패"); return; }
        setState(prev => ({ ...prev, itinerary: [...prev.itinerary, ...parsed.map(s => ({ ...s, id: generateId() }))] }));
        alert(`${parsed.length}개 일정을 추가했습니다.`);
      };
      reader.readAsText(file);
    }
    e.target.value = "";
  };

  const sectionStyle = {
    background: theme.bgCard, borderRadius: theme.radius,
    border: `1px solid ${theme.borderLight}`, marginBottom: "12px",
    overflow: "hidden", boxShadow: theme.shadow,
  };
  const rowStyle = {
    width: "100%", display: "flex", alignItems: "center", gap: "12px",
    padding: "14px 16px", background: "none", border: "none",
    borderBottom: `1px solid ${theme.borderLight}`,
    cursor: "pointer", textAlign: "left",
  };

  return (
    <div style={{ padding: "16px 20px 100px" }}>
      {/* 여행 정보 */}
      <div style={sectionStyle}>
        <div style={{ padding: "12px 16px 8px", fontSize: "12px", fontWeight: "700", color: theme.textLight, letterSpacing: "0.5px" }}>
          여행 정보
        </div>
        <div style={{ padding: "0 16px 12px", display: "flex", flexDirection: "column", gap: "6px" }}>
          {[
            { label: "여행명", value: state.tripName },
            { label: "기간", value: `${formatDate(state.tripStart)} ~ ${formatDate(state.tripEnd)}` },
            { label: "지역", value: state.tripRegion === "domestic" ? "🇰🇷 국내" : "🌏 해외" },
            { label: "숙소", value: state.accommodation || "-" },
            { label: "통화", value: state.tripRegion === "overseas" ? `${state.currency} (×${state.rate})` : "KRW" },
          ].map((item, i) => (
            <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: "13px", color: theme.textSub }}>{item.label}</span>
              <span style={{ fontSize: "13px", fontWeight: "600", color: theme.text }}>{item.value}</span>
            </div>
          ))}
        </div>
        <button onClick={() => setEditOpen(true)} style={{
          ...rowStyle, borderBottom: "none",
          borderTop: `1px solid ${theme.borderLight}`,
          justifyContent: "center", color: theme.primary,
          fontSize: "14px", fontWeight: "700",
        }}>✏️ 여행 정보 수정</button>
      </div>

      {/* 여행카드 */}
      <div style={sectionStyle}>
        <div style={{ padding: "12px 16px 8px", fontSize: "12px", fontWeight: "700", color: theme.textLight, letterSpacing: "0.5px" }}>
          여행카드
        </div>
        {state.tripCard && (
          <div style={{ padding: "0 16px 12px" }}>
            <img src={state.tripCard} alt="trip card" style={{ width: "100%", borderRadius: theme.radiusSm }} />
          </div>
        )}
        <input ref={cardRef} type="file" accept="image/*" onChange={handleCardUpload} style={{ display: "none" }} />
        <button onClick={() => cardRef.current?.click()} style={{ ...rowStyle, borderBottom: "none" }}>
          <span style={{ fontSize: "20px" }}>🖼️</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: "15px", fontWeight: "600", color: theme.text }}>여행카드 {state.tripCard ? "변경" : "업로드"}</div>
            <div style={{ fontSize: "12px", color: theme.textSub }}>일정 탭 상단에 표시될 이미지</div>
          </div>
          <span style={{ fontSize: "16px", color: theme.textLight }}>›</span>
        </button>
        {state.tripCard && (
          <button onClick={() => setState(prev => ({ ...prev, tripCard: null }))} style={{
            ...rowStyle, borderBottom: "none", borderTop: `1px solid ${theme.borderLight}`,
          }}>
            <span style={{ fontSize: "20px" }}>🗑️</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: "15px", fontWeight: "600", color: theme.danger }}>여행카드 삭제</div>
            </div>
          </button>
        )}
      </div>

      {/* 테마 */}
      <div style={sectionStyle}>
        <div style={{ padding: "12px 16px 8px", fontSize: "12px", fontWeight: "700", color: theme.textLight, letterSpacing: "0.5px" }}>
          테마
        </div>
        <div style={{ padding: "8px 16px 14px", display: "flex", flexDirection: "column", gap: "8px" }}>
          {/* 기본 모드 */}
          <div style={{ display: "flex", gap: "6px" }}>
            {[
              { id: "system", label: "🌐 시스템" },
              { id: "light", label: "☀️ 밝음" },
              { id: "dark", label: "🌙 다크" },
              { id: "seasonal", label: `🍂 계절 (${getSeason() === "spring" ? "봄" : getSeason() === "summer" ? "여름" : getSeason() === "fall" ? "가을" : "겨울"})` },
            ].map(t => (
              <button key={t.id} onClick={() => { handleTheme(t.id); }} style={{
                flex: 1, padding: "9px 4px",
                background: theme_mode === t.id ? theme.text : "transparent",
                color: theme_mode === t.id ? theme.textWhite : theme.textSub,
                border: `1px solid ${theme_mode === t.id ? theme.text : theme.border}`,
                borderRadius: theme.radiusSm, fontSize: "11px", fontWeight: "600", cursor: "pointer",
              }}>{t.label}</button>
            ))}
          </div>
          {/* 시즌별 직접 선택 */}
          <div style={{ display: "flex", gap: "6px" }}>
            {[
              { id: "spring", label: "🌸 봄" },
              { id: "summer", label: "🌊 여름" },
              { id: "fall", label: "🍁 가을" },
              { id: "winter", label: "❄️ 겨울" },
            ].map(t => (
              <button key={t.id} onClick={() => { handleTheme(t.id); }} style={{
                flex: 1, padding: "9px 4px",
                background: theme_mode === t.id ? theme.text : "transparent",
                color: theme_mode === t.id ? theme.textWhite : theme.textSub,
                border: `1px solid ${theme_mode === t.id ? theme.text : theme.border}`,
                borderRadius: theme.radiusSm, fontSize: "11px", fontWeight: "600", cursor: "pointer",
              }}>{t.label}</button>
            ))}
          </div>
        </div>
      </div>

      {/* 데이터 관리 */}
      <div style={sectionStyle}>
        <div style={{ padding: "12px 16px 8px", fontSize: "12px", fontWeight: "700", color: theme.textLight, letterSpacing: "0.5px" }}>
          데이터 관리
        </div>
        <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls,.json" onChange={handleFileUpload} style={{ display: "none" }} />
        {[
          { icon: "📥", label: "엑셀 양식 다운로드", desc: "일정 입력 템플릿 (.xlsx)", action: handleExcelTemplate },
          { icon: "📤", label: "파일 업로드", desc: "엑셀 / CSV / JSON 일정 가져오기", action: () => fileRef.current?.click() },
          { icon: "🔗", label: "일정 공유", desc: "카카오톡·메일로 일정 전달", action: handleShare },
        ].map((item, i, arr) => (
          <button key={i} onClick={item.action} style={{
            ...rowStyle,
            borderBottom: i < arr.length - 1 ? `1px solid ${theme.borderLight}` : "none",
          }}>
            <span style={{ fontSize: "20px" }}>{item.icon}</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: "15px", fontWeight: "600", color: theme.text }}>{item.label}</div>
              <div style={{ fontSize: "12px", color: theme.textSub }}>{item.desc}</div>
            </div>
            <span style={{ fontSize: "16px", color: theme.textLight }}>›</span>
          </button>
        ))}
      </div>

      {/* Google Drive 연동 */}
      <div style={sectionStyle}>
        <div style={{ padding: "12px 16px 8px", fontSize: "12px", fontWeight: "700", color: theme.textLight, letterSpacing: "0.5px" }}>
          Google Drive 연동
        </div>
        {/* 상태 배너 */}
        {driveStatus !== "idle" && (
          <div style={{
            margin: "0 12px 8px", padding: "10px 14px",
            borderRadius: theme.radiusSm,
            background: driveStatus === "error" ? "#FEF2F2" : driveStatus === "success" ? "#F0FDF4" : theme.bgInput,
            fontSize: "13px", fontWeight: "600",
            color: driveStatus === "error" ? theme.danger : driveStatus === "success" ? theme.success : theme.textSub,
            display: "flex", justifyContent: "space-between", alignItems: "center", gap: "8px",
          }}>
            <span>
              {driveStatus === "saving" && "☁️ Google 로그인 후 저장 중..."}
              {driveStatus === "loading" && "☁️ Drive에서 불러오는 중..."}
              {driveStatus === "success" && `✅ ${driveMessage}`}
              {driveStatus === "error" && `❌ ${driveMessage}`}
            </span>
            {(driveStatus === "saving" || driveStatus === "loading") && (
              <button onClick={resetToIdle} style={{
                padding: "4px 10px", background: theme.danger, color: theme.textWhite,
                border: "none", borderRadius: theme.radiusFull,
                fontSize: "12px", fontWeight: "700", cursor: "pointer", flexShrink: 0,
              }}>취소</button>
            )}
          </div>
        )}
        {lastSynced && driveStatus === "idle" && (
          <div style={{ padding: "0 16px 8px", fontSize: "11px", color: theme.textLight }}>
            마지막 동기화: {lastSynced}
          </div>
        )}
        <div style={{ display: "flex", padding: "0 12px 14px", gap: "8px" }}>
          <button onClick={handleDriveSave} disabled={driveStatus !== "idle"} style={{
            flex: 1, padding: "12px 8px", borderRadius: theme.radiusSm,
            border: `1px solid ${theme.border}`, background: theme.bgCard,
            cursor: driveStatus !== "idle" ? "default" : "pointer",
            opacity: driveStatus !== "idle" ? 0.6 : 1,
            display: "flex", flexDirection: "column", alignItems: "center", gap: "4px",
          }}>
            <span style={{ fontSize: "20px" }}>☁️</span>
            <span style={{ fontSize: "13px", fontWeight: "700", color: theme.text }}>Drive 저장</span>
            <span style={{ fontSize: "11px", color: theme.textSub }}>현재 데이터 백업</span>
          </button>
          <button onClick={handleDriveLoad} disabled={driveStatus !== "idle"} style={{
            flex: 1, padding: "12px 8px", borderRadius: theme.radiusSm,
            border: `1px solid ${theme.border}`, background: theme.bgCard,
            cursor: driveStatus !== "idle" ? "default" : "pointer",
            opacity: driveStatus !== "idle" ? 0.6 : 1,
            display: "flex", flexDirection: "column", alignItems: "center", gap: "4px",
          }}>
            <span style={{ fontSize: "20px" }}>📥</span>
            <span style={{ fontSize: "13px", fontWeight: "700", color: theme.text }}>Drive 불러오기</span>
            <span style={{ fontSize: "11px", color: theme.textSub }}>백업 데이터 복원</span>
          </button>
        </div>
        <div style={{
          margin: "0 12px 12px", padding: "10px 12px",
          background: theme.bgInput, borderRadius: theme.radiusSm,
          fontSize: "11px", color: theme.textSub, lineHeight: 1.7,
        }}>
          💡 Drive 저장 시 Google 계정 로그인이 필요합니다.<br/>
          저장 파일명: {DRIVE_FILE_NAME}<br/>
          <span style={{ color: theme.textLight }}>
            ⚙️ 배포 환경에서는 index.html &lt;head&gt;에<br/>
            &lt;script src="https://accounts.google.com/gsi/client" async defer&gt;&lt;/script&gt; 추가 필요
          </span>
        </div>
      </div>

      {/* 커스텀 테마 관리 */}
      <div style={sectionStyle}>
        <div style={{ padding:"12px 16px 8px", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
          <span style={{ fontSize:"12px", fontWeight:"700", color:theme.textLight, letterSpacing:"0.5px" }}>커스텀 테마</span>
          <button onClick={() => { setEditingTheme(null); setThemeEditorOpen(true); }} style={{
            padding:"4px 12px", background:theme.primary, color:theme.textWhite,
            border:"none", borderRadius:theme.radiusFull, fontSize:"12px", fontWeight:"700", cursor:"pointer",
          }}>+ 추가</button>
        </div>
        {customThemes.length === 0 ? (
          <div style={{ padding:"16px", textAlign:"center", fontSize:"13px", color:theme.textLight }}>
            커스텀 테마가 없습니다<br/>
            <span style={{ fontSize:"11px" }}>+ 추가로 나만의 테마를 만들어보세요</span>
          </div>
        ) : (
          <div style={{ display:"flex", flexDirection:"column" }}>
            {customThemes.map((ct, i) => {
              const active = getActiveCustomTheme(customThemes)?.id === ct.id || ct.isActive;
              const today = new Date(); today.setHours(0,0,0,0);
              const isAutoActive = ct.autoApply && ct.startDate && ct.endDate &&
                today >= new Date(ct.startDate + "T00:00:00") && today <= new Date(ct.endDate + "T00:00:00");
              return (
                <div key={ct.id} style={{
                  display:"flex", alignItems:"center", gap:"10px", padding:"12px 16px",
                  borderBottom: i < customThemes.length - 1 ? `1px solid ${theme.borderLight}` : "none",
                  background: active ? theme.primaryLight : "transparent",
                }}>
                  {/* 색상 프리뷰 */}
                  <div style={{
                    width:"36px", height:"36px", borderRadius:"8px", flexShrink:0,
                    background: ct.bgImage ? `url(${ct.bgImage}) center/cover` : (ct.bgColor || theme.bg),
                    border:`2px solid ${ct.colors?.primary || theme.primary}`,
                    overflow:"hidden",
                  }} />
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontSize:"14px", fontWeight:"700", color:theme.text }}>
                      {ct.name}
                      {isAutoActive && <span style={{ marginLeft:"6px", fontSize:"10px", background:theme.success, color:"#fff", padding:"1px 6px", borderRadius:"9999px" }}>자동 적용 중</span>}
                    </div>
                    {ct.startDate && ct.endDate && (
                      <div style={{ fontSize:"11px", color:theme.textLight }}>
                        {formatDate(ct.startDate)} ~ {formatDate(ct.endDate)}
                        {ct.autoApply ? " · 자동" : " · 수동"}
                      </div>
                    )}
                    {ct.particles?.length > 0 && (
                      <div style={{ fontSize:"11px", color:theme.textLight }}>파티클 {ct.particles.length}개</div>
                    )}
                  </div>
                  <div style={{ display:"flex", gap:"4px" }}>
                    <button onClick={() => handleToggleCustomTheme(ct)} style={{
                      padding:"5px 10px", borderRadius:theme.radiusFull,
                      border:`1.5px solid ${ct.isActive ? theme.primary : theme.border}`,
                      background: ct.isActive ? theme.primary : "transparent",
                      color: ct.isActive ? theme.textWhite : theme.textSub,
                      fontSize:"12px", fontWeight:"700", cursor:"pointer",
                    }}>{ct.isActive ? "적용 중" : "적용"}</button>
                    <button onClick={() => { setEditingTheme(ct); setThemeEditorOpen(true); }} style={{
                      width:"30px", height:"30px", border:"none", background:"none", cursor:"pointer", fontSize:"14px",
                    }}>✏️</button>
                    <button onClick={() => handleDeleteCustomTheme(ct.id)} style={{
                      width:"30px", height:"30px", border:"none", background:"none", cursor:"pointer", fontSize:"14px",
                    }}>🗑️</button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 아카이브 */}
      <button onClick={() => setArchiveOpen(true)} style={{
        width: "100%", display: "flex", alignItems: "center", gap: "12px",
        padding: "14px 16px", background: theme.bgCard,
        border: `1px solid ${theme.borderLight}`, borderRadius: theme.radius,
        cursor: "pointer", textAlign: "left", boxShadow: theme.shadow, marginBottom: "12px",
      }}>
        <span style={{ fontSize: "20px" }}>📖</span>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: "15px", fontWeight: "600", color: theme.text }}>여행 기록 보기</div>
          <div style={{ fontSize: "12px", color: theme.textSub }}>지난 여행 {archives.length}개 저장됨</div>
        </div>
        <span style={{ fontSize: "16px", color: theme.textLight }}>›</span>
      </button>

      {/* 여행 마무리 */}
      <button onClick={() => setFinishOpen(true)} style={{
        width: "100%", marginTop: "8px", padding: "16px",
        background: "transparent", border: `1.5px solid ${theme.danger}`,
        borderRadius: theme.radius, color: theme.danger,
        fontSize: "15px", fontWeight: "700", cursor: "pointer",
      }}>🏁 여행 마무리</button>

      <div style={{ textAlign: "center", marginTop: "28px", fontSize: "12px", color: theme.textLight }}>
        모리의 여행플래너 v2.0
        {state.lastSaved && (
          <div style={{ marginTop: "4px" }}>
            마지막 저장: {new Date(state.lastSaved).toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}
          </div>
        )}
      </div>

      {/* Modals */}
      {editOpen && (
        <TripEditModal state={state}
          onSave={(updated) => { setState(updated); setEditOpen(false); }}
          onClose={() => setEditOpen(false)} />
      )}
      {finishOpen && (
        <FinishTripModal
          onConfirm={async (review) => {
            setFinishOpen(false);
            const wantBackup = window.confirm(
              "Google Drive에도 백업하시겠습니까?\n\n여행카드 이미지 등 큰 데이터는 브라우저 저장공간보다 Drive가 훨씬 안전합니다.\n(이 기기에 데이터가 남아있더라도, 다른 기기에서 보거나 나중에 복구하려면 Drive 백업을 권장합니다)"
            );
            if (wantBackup) {
              try {
                await driveSave({ ...state, archives: loadArchive(), savedAt: new Date().toISOString(), appVersion: "2.0" });
                alert("✅ Drive 백업 완료! 여행을 마무리합니다.");
              } catch (e) {
                const proceed = window.confirm(
                  `⚠️ Drive 백업에 실패했습니다 (${e.message || "오류"}).\n그래도 마무리(아카이브 저장)를 진행할까요?`
                );
                if (!proceed) return;
              }
            }
            onFinishTrip(review);
          }}
          onClose={() => setFinishOpen(false)} />
      )}
      {archiveOpen && (
        <ArchiveModal
          archives={archives}
          onClose={() => setArchiveOpen(false)}
          onDeleteArchive={onDeleteArchive}
          onEditArchive={onEditArchive}
        />
      )}
      {themeEditorOpen && (
        <CustomThemeEditorModal
          editTheme={editingTheme}
          onSave={handleSaveCustomTheme}
          onClose={() => { setThemeEditorOpen(false); setEditingTheme(null); }}
        />
      )}
      <div style={{ textAlign: "center", padding: "20px 0 8px", fontSize: "12px", color: theme.textLight }}>
        모리의 여행플래너 {APP_VERSION}
      </div>
    </div>
  );
}

// ─── Main App ───
export default function App() {
  const [state, setState] = useState(null);
  const [screen, setScreen] = useState("loading");
  const [activeTab, setActiveTab] = useState(null);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 1024);
  const [archives, setArchives] = useState([]);
  const [appThemeMode, setAppThemeMode] = useState(localStorage.getItem("theme_mode") || "system");
  const [particlesEnabled, setParticlesEnabled] = useState(localStorage.getItem("particles_enabled") !== "false");

  const handleDeleteArchive = (idx) => {
    const newArchives = archives.filter((_, i) => i !== idx);
    setArchives(newArchives);
    const result = saveArchive(newArchives);
    if (!result.ok) alert("⚠️ 삭제 반영 중 저장에 실패했습니다. 다시 시도해 주세요.");
  };

  const handleEditArchive = (idx, updates) => {
    const newArchives = archives.map((a, i) => i === idx ? { ...a, ...updates } : a);
    setArchives(newArchives);
    const result = saveArchive(newArchives);
    if (!result.ok) alert("⚠️ 수정사항 저장에 실패했습니다. 다시 시도해 주세요.");
  };

  const handleParticleToggle = () => {
    const next = !particlesEnabled;
    setParticlesEnabled(next);
    localStorage.setItem("particles_enabled", String(next));
  };

  // Load initial data
  useEffect(() => {
    const saved = loadState();
    const arch = loadArchive();
    setArchives(arch);
    if (saved && saved.tripName) {
      setState(saved);
      setScreen("main");
      const order = getTabOrder(saved.tripStart, saved.tripEnd);
      setActiveTab(order[0]);
    } else {
      setScreen("welcome");
    }
  }, []);

  // Responsive
  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 1024);
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, []);

  // Auto save
  useEffect(() => {
    if (state && screen === "main") {
      const timer = setTimeout(() => saveState(state), 500);
      return () => clearTimeout(timer);
    }
  }, [state, screen]);

  const [showActiveTripWarning, setShowActiveTripWarning] = useState(false);
  const handleNewTrip = () => {
    if (state) { setShowActiveTripWarning(true); return; }
    setScreen("setup");
  };
  // 진행중 여행 데이터(state)는 그대로 유지한 채 웰컴화면으로만 이동
  const handleGoHome = () => setScreen("welcome");
  const handleResumeTrip = () => {
    if (!state) return;
    setShowActiveTripWarning(false);
    const order = getTabOrder(state.tripStart, state.tripEnd);
    setActiveTab(order[0]);
    setScreen("main");
  };
  const handleImport = () => setScreen("import");
  const handleViewArchive = () => setScreen("archive");

  // ─── 웰컴화면 "기존 데이터 가져오기" — 실제 동작 구현 ───
  const { driveStatus: importDriveStatus, driveMessage: importDriveMessage, handleDriveLoad: importDriveLoad } = useDrive(state, setState);

  // Drive 불러오기 성공 시 메인 화면으로 이동
  useEffect(() => {
    if (screen === "import" && importDriveStatus === "success") {
      const order = getTabOrder(state?.tripStart, state?.tripEnd);
      setActiveTab(order[0]);
      setScreen("main");
    }
  }, [importDriveStatus]);

  const finalizeImportedTrip = (itinerary, extra = {}) => {
    const newState = {
      ...DEFAULT_STATE,
      tripName: "가져온 일정",
      tripStart: new Date().toISOString().slice(0, 10),
      tripEnd: new Date().toISOString().slice(0, 10),
      ...extra,
      itinerary,
      lastSaved: new Date().toISOString(),
    };
    setState(newState);
    saveState(newState);
    const order = getTabOrder(newState.tripStart, newState.tripEnd);
    setActiveTab(order[0]);
    setScreen("main");
  };

  const handleImportFileNew = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const isExcel = file.name.endsWith(".xlsx") || file.name.endsWith(".xls");
    const isJSON = file.name.endsWith(".json");

    if (isExcel) {
      const reader = new FileReader();
      reader.onload = (ev) => {
        const data = new Uint8Array(ev.target.result);
        const parsed = parseExcel(data);
        const bucket = parseExcelBucket(data);
        const budget = parseExcelBudget(data);
        if (parsed.length === 0 && bucket.length === 0 && !budget) { alert("엑셀 파싱 실패"); return; }
        finalizeImportedTrip(
          parsed.map(s => ({ ...s, id: generateId() })),
          {
            ...(bucket.length > 0 ? { shoppingList: bucket } : {}),
            ...(budget ? { budget } : {}),
          }
        );
      };
      reader.readAsArrayBuffer(file);
    } else if (isJSON) {
      const reader = new FileReader();
      reader.onload = (ev) => {
        try {
          const data = JSON.parse(ev.target.result);
          if (data.tripStart && data.tripEnd) {
            // 전체 백업(Drive 내보내기 등) 형식
            const { archives: _a, savedAt: _s, appVersion: _v, ...tripData } = data;
            finalizeImportedTrip(
              (tripData.itinerary || []).map(s => ({ ...s, id: s.id || generateId() })),
              tripData
            );
          } else if (Array.isArray(data.itinerary)) {
            finalizeImportedTrip(data.itinerary.map(s => ({ ...s, id: generateId() })));
          } else {
            alert("지원하지 않는 JSON 형식입니다.");
          }
        } catch { alert("JSON 파일 형식이 올바르지 않습니다."); }
      };
      reader.readAsText(file);
    } else {
      const reader = new FileReader();
      reader.onload = (ev) => {
        const parsed = parseCSV(ev.target.result);
        if (parsed.length === 0) { alert("CSV 파싱 실패"); return; }
        finalizeImportedTrip(parsed.map(s => ({ ...s, id: generateId() })));
      };
      reader.readAsText(file);
    }
    e.target.value = "";
  };

  const handleSetupComplete = (newState) => {
    setState(newState);
    saveState(newState);
    const order = getTabOrder(newState.tripStart, newState.tripEnd);
    setActiveTab(order[0]);
    setScreen("main");
  };

  const handleFinishTrip = (review = "") => {
    if (!state) return;
    const archiveEntry = { ...state, review, archivedAt: new Date().toISOString() };
    const newArchives = [archiveEntry, ...archives];
    setArchives(newArchives);
    const result = saveArchive(newArchives);
    if (!result.ok) {
      alert("⚠️ 저장 공간이 부족해서 여행 기록을 저장하지 못했습니다.\n브라우저 저장공간을 정리한 후 다시 시도해 주세요.");
      return; // 저장 실패 시 화면 전환하지 않음 (데이터 손실 방지)
    }
    if (result.strippedImages) {
      alert("⚠️ 저장 공간이 부족해서 여행카드 이미지는 제외하고 저장했습니다.\n(일정·지출 등 나머지 데이터는 정상 저장됨)");
    }
    localStorage.removeItem(STORAGE_KEY);
    setState(null);
    setScreen("welcome");
  };

  // Tab
  const tabOrder = state ? getTabOrder(state.tripStart, state.tripEnd) : [];
  const tripPhase = state ? getTripPhase(state.tripStart, state.tripEnd) : "before";
  const currentTab = activeTab || (tabOrder.length > 0 ? tabOrder[0] : "itinerary");
  const resolvedAppSeason = appThemeMode === "seasonal" ? getSeason() : appThemeMode;
  const isActive = SEASONAL_THEMES.has(appThemeMode) && ["spring","summer","fall","winter"].includes(resolvedAppSeason);
  const bgMode = appThemeMode === "system" ? "light" : resolvedAppSeason;

  const [appCustomThemes, setAppCustomThemes] = useState(loadCustomThemes);
  const [customThemeVersion, setCustomThemeVersion] = useState(0);
  const activeCustomTheme = getActiveCustomTheme(appCustomThemes);

  // customThemeVersion 바뀔 때마다 localStorage에서 리로드
  useEffect(() => {
    setAppCustomThemes(loadCustomThemes());
  }, [customThemeVersion, appThemeMode]);

  // 커스텀 테마 변경 → App에 알림
  const handleThemeChange = (modeOrSignal) => {
    if (modeOrSignal === "__custom_updated__") {
      setCustomThemeVersion(v => v + 1);
    } else {
      setAppThemeMode(modeOrSignal);
      setCustomThemeVersion(v => v + 1);
    }
  };

  if (screen === "loading") {
    return (
      <div style={{
        minHeight: "100dvh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: theme.bg,
        fontFamily: "'Pretendard Variable', 'Pretendard', -apple-system, sans-serif",
      }}>
        <div style={{ fontSize: "32px" }}>🧳</div>
      </div>
    );
  }

  if (screen === "welcome") {
    return (
      <WelcomeScreen
        bgMode={bgMode}
        onNewTrip={handleNewTrip}
        onImport={handleImport}
        onViewArchive={handleViewArchive}
        hasArchive={archives.length > 0}
        onOpenSettings={() => setScreen("globalSettings")}
        activeTrip={state}
        onResumeTrip={handleResumeTrip}
        showActiveTripWarning={showActiveTripWarning}
        onCloseActiveTripWarning={() => setShowActiveTripWarning(false)}
      />
    );
  }

  if (screen === "globalSettings") {
    return (
      <GlobalSettingsScreen
        bgMode={bgMode}
        appThemeMode={appThemeMode}
        onThemeChange={(mode) => {
          setAppThemeMode(mode);
          localStorage.setItem("theme_mode", mode);
          applyTheme(mode);
        }}
        onBack={() => setScreen("welcome")}
      />
    );
  }

  if (screen === "setup") {
    return <TripSetupForm bgMode={bgMode} onComplete={handleSetupComplete} onBack={() => setScreen("welcome")} />;
  }

  if (screen === "import") {
    return (
      <ImportScreen
        bgMode={bgMode}
        onBack={() => setScreen("welcome")}
        onImportDrive={importDriveLoad}
        onImportFile={handleImportFileNew}
        driveStatus={importDriveStatus}
        driveMessage={importDriveMessage}
      />
    );
  }

  if (screen === "archive") {
    return (
      <ArchiveScreen
        bgMode={bgMode}
        onBack={() => setScreen("welcome")}
        archives={archives}
        onDeleteArchive={handleDeleteArchive}
        onEditArchive={handleEditArchive}
      />
    );
  }

  // Main Screen
  if (!state) {
    setScreen("welcome");
    return null;
  }

  const renderTab = () => {
    switch (currentTab) {
      case "itinerary":
        return <ItineraryTab state={state} setState={setState} />;
      case "expense":
        return <ExpenseTab state={state} setState={setState} />;
      case "check":
        return <CheckTab state={state} setState={setState} />;
      case "settings":
        return <SettingsTab state={state} setState={setState} onFinishTrip={handleFinishTrip} archives={archives} onThemeChange={handleThemeChange} onDeleteArchive={handleDeleteArchive} onEditArchive={handleEditArchive} />;
      default:
        return null;
    }
  };

  return (
    <div style={{
      display: "flex",
      minHeight: "100dvh",
      background: "transparent",
      fontFamily: "'Pretendard Variable', 'Pretendard', -apple-system, sans-serif",
      position: "relative",
    }}>
      <AppBackground mode={bgMode} />
      <ParticleCanvas themeMode={appThemeMode} enabled={particlesEnabled} />
      {/* 커스텀 테마 배경 + 파티클 */}
      {activeCustomTheme?.bgImage && (
        <div style={{
          position:"fixed", inset:0, zIndex:-1, pointerEvents:"none",
          backgroundImage:`url(${activeCustomTheme.bgImage})`,
          backgroundSize:"cover", backgroundPosition:"center",
        }} />
      )}
      {activeCustomTheme && particlesEnabled && (
        <CustomParticleCanvas theme={activeCustomTheme} />
      )}

      {/* 파티클 토글 버튼 */}
      {isActive && (
        <button onClick={handleParticleToggle} style={{
          position: "fixed",
          bottom: isMobile ? "72px" : "20px",
          right: "16px",
          zIndex: 150,
          width: "36px", height: "36px",
          borderRadius: "50%",
          border: "1.5px solid rgba(255,255,255,0.5)",
          background: "rgba(0,0,0,0.25)",
          backdropFilter: "blur(6px)",
          cursor: "pointer",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: "16px",
          title: particlesEnabled ? "파티클 끄기" : "파티클 켜기",
        }}>
          {particlesEnabled ? "✨" : "○"}
        </button>
      )}

      {/* PC Sidebar */}
      {!isMobile && (
        <TabBar
          tabs={tabOrder}
          activeTab={currentTab}
          onTabChange={setActiveTab}
          isMobile={false}
          tripPhase={tripPhase}
        />
      )}

      {/* Content Area */}
      <div style={{ flex: 1, minWidth: 0, maxWidth: "100%" }}>
        {/* Mobile Header */}
        {isMobile && state && <MobileHeader state={state} onGoHome={handleGoHome} />}

        {/* PC Header */}
        {!isMobile && state && (
          <div style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "16px 32px",
            borderBottom: `1px solid ${theme.borderLight}`,
            background: theme.bgCard,
            gap: "16px",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: "14px", minWidth: 0 }}>
              <button onClick={handleGoHome} title="홈으로" style={{
                width: "40px", height: "40px", flexShrink: 0,
                borderRadius: "50%", border: `1px solid ${theme.border}`,
                background: theme.bgInput, fontSize: "18px", cursor: "pointer",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>🏠</button>
              <div style={{ minWidth: 0 }}>
                <h1 style={{
                  margin: 0,
                  fontSize: "22px",
                  fontWeight: "800",
                  color: theme.text,
                  letterSpacing: "-0.5px",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}>
                  {state.tripName}
                </h1>
                <div style={{ fontSize: "13px", color: theme.textSub, marginTop: "2px" }}>
                  {formatDate(state.tripStart)} ~ {formatDate(state.tripEnd)}
                  {state.accommodation && ` · 📍 ${state.accommodation}`}
                </div>
              </div>
            </div>
            {getDday(state.tripStart) && (
              <div style={{
                padding: "6px 16px",
                background: getDday(state.tripStart) === "D-DAY" ? theme.primary : theme.bgBadge,
                color: getDday(state.tripStart) === "D-DAY" ? theme.textWhite : theme.text,
                borderRadius: theme.radiusFull,
                fontSize: "14px",
                fontWeight: "800",
                flexShrink: 0,
              }}>
                {getDday(state.tripStart)}
              </div>
            )}
          </div>
        )}

        {/* Tab Content */}
        <div style={{
          maxWidth: isMobile ? "100%" : "720px",
          margin: isMobile ? 0 : "0 auto",
          padding: isMobile ? 0 : "0 16px",
        }}>
          {renderTab()}
        </div>
      </div>

      {/* Mobile Bottom Tab Bar */}
      {isMobile && (
        <TabBar
          tabs={tabOrder}
          activeTab={currentTab}
          onTabChange={setActiveTab}
          isMobile={true}
          tripPhase={tripPhase}
        />
      )}
    </div>
  );
}
