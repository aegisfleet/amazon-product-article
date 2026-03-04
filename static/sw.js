const CACHE_NAME = 'apa-cache-v2';
const urlsToCache = [
    '/amazon-product-article/',
    '/amazon-product-article/css/variables.css',
    '/amazon-product-article/css/style.css',
    '/amazon-product-article/css/search.css',
    '/amazon-product-article/js/theme.js',
    '/amazon-product-article/favicon.png',
    '/amazon-product-article/apple-touch-icon.png'
];

// インストール時に初期リソースをキャッシュ
globalThis.addEventListener('install', event => {
    globalThis.skipWaiting(); // 新しいSWをすぐに待機状態から移行
    event.waitUntil((async () => {
        const cache = await caches.open(CACHE_NAME);
        return cache.addAll(urlsToCache);
    })());
});

// アクティベート時に古いキャッシュを削除し、すぐに制御を開始
globalThis.addEventListener('activate', event => {
    const cacheWhitelist = new Set([CACHE_NAME]);
    event.waitUntil((async () => {
        const cacheNames = await caches.keys();
        await Promise.all(
            cacheNames.map(cacheName => {
                if (!cacheWhitelist.has(cacheName)) {
                    return caches.delete(cacheName);
                }
            })
        );
        await globalThis.clients.claim(); // すぐに全てのクライアントを制御下に置く
    })());
});

/**
 * HTMLリクエストかどうかを判定する
 */
function isNavigationRequest(request) {
    return request.mode === 'navigate' ||
        (request.headers.get('accept')?.includes('text/html') ?? false);
}

/**
 * Network First 戦略（HTMLページ用）
 * ネットワークを優先し、失敗時のみキャッシュにフォールバック
 */
async function networkFirst(request, cache) {
    try {
        const networkResponse = await fetch(request);
        if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
            await cache.put(request, networkResponse.clone());
        }
        return networkResponse;
    } catch {
        // ネットワークエラー時はキャッシュにフォールバック
        const cachedResponse = await cache.match(request);
        return cachedResponse || new Response('オフラインです', {
            status: 503,
            headers: { 'Content-Type': 'text/html; charset=UTF-8' }
        });
    }
}

/**
 * Stale-While-Revalidate 戦略（静的リソース用）
 * キャッシュを即座に返し、バックグラウンドでネットワークから更新
 */
async function staleWhileRevalidate(request, cache) {
    const cachedResponse = await cache.match(request);

    const fetchPromise = (async () => {
        try {
            const networkResponse = await fetch(request);
            if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
                await cache.put(request, networkResponse.clone());
            }
            return networkResponse;
        } catch {
            return cachedResponse;
        }
    })();

    // キャッシュがあればそれを返し、バックグラウンドで更新。なければネットワークを待つ。
    return cachedResponse || fetchPromise;
}

globalThis.addEventListener('fetch', event => {
    // 外部オリジン（Google Fonts等）へのリクエストはネットワーク優先
    if (!event.request.url.startsWith(globalThis.location.origin)) {
        return;
    }

    event.respondWith((async () => {
        const cache = await caches.open(CACHE_NAME);

        // HTMLページ: Network First（常に最新コンテンツを表示）
        // 静的リソース: Stale-While-Revalidate（高速表示を優先）
        if (isNavigationRequest(event.request)) {
            return networkFirst(event.request, cache);
        }
        return staleWhileRevalidate(event.request, cache);
    })());
});
