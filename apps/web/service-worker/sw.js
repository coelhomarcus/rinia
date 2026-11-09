/* Rinia service worker. The build (vite-plugins/service-worker.ts) fills in the version and the precache list. */
/* global self, caches, fetch, URL, Response */

const VERSION = self.__RINIA_VERSION__;
const PRECACHE = self.__RINIA_PRECACHE__;
const SHELL_CACHE = `rinia-shell-${VERSION}`;
const IMAGE_CACHE = "rinia-images-v1";
const IMAGE_LIMIT = 120;
const IMAGE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
// Lazy chunks and other build assets that are not precached. Their names carry a content hash, so entries never go
// stale; the cap only bounds the disk used by chunks of old builds.
const ASSET_CACHE = "rinia-assets-v1";
const ASSET_LIMIT = 150;
const SHELL_ENTRY = "/index.html";

/**
 * Never handled here, so they always reach the network: the API (authenticated, per account), OAuth and its
 * discovery documents (MCP clients sign in through them), and the realtime socket.
 */
const BYPASS = [/^\/api\//, /^\/\.well-known\//, /^\/oauth\//];

self.addEventListener("install", (event) => {
    // The new version waits until the page agrees to reload (the "new version" toast), so a page never runs
    // code from two builds at once.
    event.waitUntil(precache());
});

/**
 * Fetches the shell file by file, so one failing asset does not abort the install the way `cache.addAll` would
 * (a file that is missing here is fetched from the network when it is first used). Only the HTML shell is
 * required: without it the app cannot open offline, so the worker retries on the next update check.
 */
async function precache() {
    const cache = await caches.open(SHELL_CACHE);
    const results = await Promise.allSettled(PRECACHE.map((path) => cache.add(path)));
    const failed = PRECACHE.findIndex((path, index) => path === SHELL_ENTRY && results[index].status === "rejected");
    if (failed !== -1) throw results[failed].reason;
}

self.addEventListener("activate", (event) => {
    event.waitUntil(
        (async () => {
            const names = await caches.keys();
            await Promise.all(names.filter((name) => name.startsWith("rinia-shell-") && name !== SHELL_CACHE).map((name) => caches.delete(name)));
            await self.clients.claim();
        })(),
    );
});

self.addEventListener("message", (event) => {
    if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("fetch", (event) => {
    const { request } = event;
    if (request.method !== "GET") return;
    const url = new URL(request.url);
    if (url.origin !== self.location.origin || BYPASS.some((pattern) => pattern.test(url.pathname))) return;

    if (request.mode === "navigate") {
        event.respondWith(navigation(request));
        return;
    }
    if (PRECACHE.includes(url.pathname)) {
        event.respondWith(caches.match(url.pathname, { cacheName: SHELL_CACHE }).then((cached) => cached ?? fetch(request)));
        return;
    }
    if (url.pathname.startsWith("/assets/")) {
        event.respondWith(asset(event, request));
        return;
    }
    if (request.destination === "image") event.respondWith(image(request));
});

/** Pages come from the network; offline, every route gets the cached app, which shows its own offline state. */
async function navigation(request) {
    try {
        return await fetch(request);
    } catch (error) {
        const cached = await caches.match("/index.html", { cacheName: SHELL_CACHE });
        if (cached) return cached;
        throw error;
    }
}

/** Build assets outside the precache (lazy chunks, icons): stale-while-revalidate, so a chunk works offline once it was used. */
async function asset(event, request) {
    const cache = await caches.open(ASSET_CACHE);
    const cached = await cache.match(request);
    const refresh = fetch(request).then(async (response) => {
        if (response.ok && response.type === "basic") {
            await cache.put(request, response.clone());
            await trim(cache, ASSET_LIMIT);
        }
        return response;
    });
    if (!cached) return refresh;
    // The page gets the cached copy now; the worker stays alive to update it for next time.
    event.waitUntil(refresh.catch(() => undefined));
    return cached;
}

/** Same-origin images: from the cache when present and fresh, refreshed from the network otherwise. */
async function image(request) {
    const cache = await caches.open(IMAGE_CACHE);
    const cached = await cache.match(request);
    const cachedAt = Number(cached?.headers.get("x-rinia-cached-at") ?? 0);
    if (cached && Date.now() - cachedAt < IMAGE_MAX_AGE_MS) return cached;
    try {
        const response = await fetch(request);
        if (response.ok && response.type === "basic") {
            const headers = new Headers(response.headers);
            headers.set("x-rinia-cached-at", String(Date.now()));
            const body = await response.clone().blob();
            await cache.put(request, new Response(body, { status: response.status, statusText: response.statusText, headers }));
            await trim(cache, IMAGE_LIMIT);
        }
        return response;
    } catch (error) {
        if (cached) return cached;
        throw error;
    }
}

/** Drops the oldest entries beyond `limit`. */
async function trim(cache, limit) {
    const keys = await cache.keys();
    await Promise.all(keys.slice(0, Math.max(0, keys.length - limit)).map((key) => cache.delete(key)));
}
