const CACHE_NAME = "restaurant-ops-shell-v2";
const SHELL_URLS = [
  "/",
  "/owner/operations/orders",
  "/owner/operations/tables",
  "/manifest.json",
  "/favicon.ico"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(SHELL_URLS))
      .catch(() => undefined)
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
    ))
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (isNextRouteDataRequest(request, url)) {
    return;
  }

  if (request.mode === "navigate" || isOpsShellRoute(url.pathname)) {
    event.respondWith(staleWhileRevalidate(request, navigationFallbackFor(url.pathname)));
    return;
  }

  if (url.pathname.startsWith("/_next/static/") || url.pathname === "/favicon.ico" || url.pathname === "/manifest.json") {
    event.respondWith(cacheFirst(request));
  }
});

function isOpsShellRoute(pathname) {
  return pathname === "/owner/operations/orders" ||
    pathname === "/owner/operations/tables" ||
    pathname.startsWith("/owner/operations/tables/");
}

function isNextRouteDataRequest(request, url) {
  return url.searchParams.has("_rsc") ||
    request.headers.get("RSC") === "1" ||
    request.headers.get("Next-Router-Prefetch") === "1" ||
    request.headers.has("Next-Router-State-Tree");
}

function navigationFallbackFor(pathname) {
  if (pathname.startsWith("/owner/operations/tables/")) return "/owner/operations/tables";
  if (pathname.startsWith("/owner/operations/orders")) return "/owner/operations/orders";
  return "/";
}

async function staleWhileRevalidate(request, fallbackUrl) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);
  const refresh = fetch(request)
    .then(async (response) => {
      if (response.ok) await cache.put(request, response.clone());
      return response;
    })
    .catch(() => undefined);

  if (cached) {
    return cached;
  }

  const response = await refresh;
  if (response) return response;

  const fallback = await cache.match(fallbackUrl);
  if (fallback) return fallback;
  return cache.match("/owner/operations/orders") || cache.match("/");
}

async function cacheFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) await cache.put(request, response.clone());
  return response;
}
