// ⚠️ 배포할 때마다 버전 번호를 올려주세요 (캐시 갱신을 위해 필수)
const CACHE_NAME = 'travel-planner-v24';

const CORE_ASSETS = [
  '/',
  '/index.html',
  '/site.webmanifest',
];

const BACKGROUND_ASSETS = [
  '/assets/backgrounds/bg-light.png',
  '/assets/backgrounds/bg-dark.png',
  '/assets/backgrounds/bg-spring.png',
  '/assets/backgrounds/bg-summer.png',
  '/assets/backgrounds/bg-fall.png',
  '/assets/backgrounds/bg-winter.png',
];

const PARTICLE_ASSETS = [
  '/assets/particles/particle-spring-1-flower.png',
  '/assets/particles/particle-spring-2-petal.png',
  '/assets/particles/particle-spring-3-heart.png',
  '/assets/particles/particle-summer-1-watermelon.png',
  '/assets/particles/particle-summer-2-sun.png',
  '/assets/particles/particle-summer-3-crab.png',
  '/assets/particles/particle-fall-1-maple.png',
  '/assets/particles/particle-fall-2-ginkgo.png',
  '/assets/particles/particle-fall-3-chestnut.png',
  '/assets/particles/particle-winter-1.png',
  '/assets/particles/particle-winter-2.png',
  '/assets/particles/particle-winter-3.png',
];

const MASCOT_ASSETS = [
  '/assets/icons/mascot-logo.png',
  '/assets/icons/mascot-spring.png',
  '/assets/icons/mascot-summer.png',
  '/assets/icons/mascot-fall.png',
  '/assets/icons/mascot-winter.png',
  '/assets/icons/mascot-dark.png',
  '/assets/icons/loading-mascot.png',
];

const ALL_ASSETS = [...CORE_ASSETS, ...BACKGROUND_ASSETS, ...PARTICLE_ASSETS, ...MASCOT_ASSETS];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      // 개별 실패해도 설치가 막히지 않도록 하나씩 처리
      return Promise.all(
        ALL_ASSETS.map((url) =>
          cache.add(url).catch((err) => console.warn('캐시 실패(무시):', url, err))
        )
      );
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  // Google API 등 외부 요청은 캐시하지 않고 그대로 통과
  if (!event.request.url.startsWith(self.location.origin)) return;

  const isNavigation = event.request.mode === 'navigate' ||
    event.request.destination === 'document' ||
    event.request.url.endsWith('/index.html');

  if (isNavigation) {
    // ⚠️ HTML(페이지 진입점)은 항상 네트워크에서 최신본을 우선 가져옴
    // → 새 배포가 있으면 사용자가 캐시를 직접 안 지워도 자동으로 최신화됨
    // → 오프라인일 때만 캐시된 마지막 버전으로 폴백
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() => caches.match(event.request).then((c) => c || caches.match('/index.html')))
    );
    return;
  }

  // 이미지/JS/CSS 등 정적 자산은 캐시 우선 (빠른 로딩 + 오프라인 지원)
  // JS/CSS는 빌드시 파일명에 해시가 붙어서 내용이 바뀌면 파일명도 바뀌므로 영구 캐시해도 안전
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request)
        .then((response) => {
          if (response.ok && event.request.method === 'GET') {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() => caches.match('/index.html'));
    })
  );
});
