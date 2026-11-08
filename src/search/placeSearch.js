import { haversineKm } from "../utils/geo";

// 장소 검색 서비스 설정을 이 객체 한 곳에만 둔다(src/map/mapConfig.js와 같은 방식).
// 서비스를 바꿀 때는 이 객체만 수정한다. 응답 정규화는 Nominatim jsonv2 형식 기준이다.
export const PLACE_SEARCH_CONFIG = {
  endpoint: "https://nominatim.openstreetmap.org/search",
  timeoutMs: 8000,
  limit: 5,
  minIntervalMs: 1100,
  language: "ko",
};

const MIN_QUERY_LEN = 2;
const MAX_QUERY_LEN = 100;
const CACHE_MAX = 30;
const VIEWBOX_HALF_DEG = 1.5;
const ADDRESS_MAX_LEN = 80;

// 검색어와 응답은 이 모듈 변수(메모리)에만 둔다. 새로고침하면 사라진다.
const cache = new Map();
let lastRequestAt = -Infinity;

function fail(reason) {
  return { ok: false, reason };
}

function round5(n) {
  return Math.round(n * 100000) / 100000;
}

function toCoord(v) {
  if (typeof v === "number") return v;
  if (typeof v === "string" && v.trim() !== "") return Number(v);
  return NaN;
}

function sanitizeCenter(center) {
  if (!center) return null;
  const lat = toCoord(center.lat);
  const lng = toCoord(center.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return { lat, lng };
}

function sanitizeCountryCodes(codes) {
  const list = Array.isArray(codes) ? codes : typeof codes === "string" ? codes.split(",") : [];
  const cleaned = list
    .map((c) => (typeof c === "string" ? c.trim().toLowerCase() : ""))
    .filter((c) => /^[a-z]{2}$/.test(c));
  return [...new Set(cleaned)].sort();
}

function makeCacheKey(q, center, codes) {
  const normalizedQuery = q.toLowerCase().replace(/\s+/g, " ");
  const c = center ? `${center.lat.toFixed(1)},${center.lng.toFixed(1)}` : "-";
  return `${normalizedQuery}|${c}|${codes.join(",")}`;
}

function cacheGet(key) {
  if (!cache.has(key)) return null;
  const value = cache.get(key);
  cache.delete(key);
  cache.set(key, value);
  return value;
}

function cacheSet(key, items) {
  cache.delete(key);
  cache.set(key, items);
  while (cache.size > CACHE_MAX) {
    cache.delete(cache.keys().next().value);
  }
}

function buildUrl(q, center, codes) {
  const cfg = PLACE_SEARCH_CONFIG;
  const params = new URLSearchParams({
    q,
    format: "jsonv2",
    addressdetails: "1",
    limit: String(cfg.limit),
    "accept-language": cfg.language,
    dedupe: "1",
  });
  if (center) {
    const left = Math.max(-180, center.lng - VIEWBOX_HALF_DEG);
    const right = Math.min(180, center.lng + VIEWBOX_HALF_DEG);
    const top = Math.min(90, center.lat + VIEWBOX_HALF_DEG);
    const bottom = Math.max(-90, center.lat - VIEWBOX_HALF_DEG);
    params.set("viewbox", [left, top, right, bottom].map(round5).join(","));
  }
  if (codes.length > 0) params.set("countrycodes", codes.join(","));
  return `${cfg.endpoint}?${params.toString()}`;
}

function normalizeItem(raw) {
  if (!raw || typeof raw !== "object") return null;
  const lat = toCoord(raw.lat);
  const lng = toCoord(raw.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;

  const displayName = typeof raw.display_name === "string" ? raw.display_name.trim() : "";
  const rawName = typeof raw.name === "string" ? raw.name.trim() : "";
  const name = rawName || displayName.split(",")[0].trim();
  if (!name) return null;

  let address = displayName;
  if (address.startsWith(name)) address = address.slice(name.length);
  else if (address.includes(",")) address = address.slice(address.indexOf(",") + 1);
  else address = "";
  address = address.replace(/^[\s,]+/, "").trim().slice(0, ADDRESS_MAX_LEN).trim();

  const roundedLat = round5(lat);
  const roundedLng = round5(lng);
  const hasOsmId = raw.osm_type != null && raw.osm_id != null;
  const countryCode =
    typeof raw.address?.country_code === "string" ? raw.address.country_code.toUpperCase() : "";

  return {
    id: hasOsmId ? `${raw.osm_type}:${raw.osm_id}` : `${roundedLat},${roundedLng}`,
    name,
    address,
    lat: roundedLat,
    lng: roundedLng,
    type: typeof raw.type === "string" ? raw.type : "",
    countryCode,
  };
}

// distanceKm는 표시용이다. 서비스가 준 순위는 바꾸지 않는다.
function withDistance(items, center) {
  return items.map((it) => ({
    ...it,
    distanceKm: center ? haversineKm(center, { lat: it.lat, lng: it.lng }) : null,
  }));
}

async function runSearch(query, options) {
  const { center: rawCenter, countryCodes: rawCodes, signal } = options || {};

  if (typeof query !== "string") return fail("empty-query");
  const q = query.trim();
  if (q.length < MIN_QUERY_LEN) return fail("empty-query");
  if (q.length > MAX_QUERY_LEN) return fail("too-long");

  const center = sanitizeCenter(rawCenter);
  const codes = sanitizeCountryCodes(rawCodes);
  const key = makeCacheKey(q, center, codes);

  const cached = cacheGet(key);
  if (cached) return { ok: true, items: withDistance(cached, center), fromCache: true };

  if (signal && signal.aborted) return fail("network");

  const cfg = PLACE_SEARCH_CONFIG;
  const now = Date.now();
  if (now - lastRequestAt < cfg.minIntervalMs) return fail("rate");
  lastRequestAt = now;

  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, cfg.timeoutMs);
  const onExternalAbort = () => controller.abort();
  if (signal) signal.addEventListener("abort", onExternalAbort, { once: true });

  try {
    let res;
    try {
      res = await fetch(buildUrl(q, center, codes), { signal: controller.signal });
    } catch (e) {
      return fail(timedOut ? "timeout" : "network");
    }
    if (!res.ok) return fail("http");

    let data;
    try {
      data = await res.json();
    } catch (e) {
      if (timedOut) return fail("timeout");
      return fail(e && e.name === "AbortError" ? "network" : "parse");
    }
    if (!Array.isArray(data)) return fail("parse");

    const items = data.map(normalizeItem).filter(Boolean);
    cacheSet(key, items);
    return { ok: true, items: withDistance(items, center), fromCache: false };
  } finally {
    clearTimeout(timer);
    if (signal) signal.removeEventListener("abort", onExternalAbort);
  }
}

// 예외를 던지지 않고 { ok: true, items, fromCache } 또는 { ok: false, reason }을 돌려준다.
export async function searchPlaces(query, options) {
  try {
    return await runSearch(query, options);
  } catch (e) {
    return fail("network");
  }
}
