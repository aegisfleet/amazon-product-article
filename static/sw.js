const CACHE_NAME = 'apa-cache-v1';
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
 * HTMLレスポンスを比較し、変更があればクライアントに通知する
 */
async function notifyClientsIfUpdate(request, cachedResponse, networkResponse) {
    if (!cachedResponse) return;

    const isHtml = request.mode === 'navigate' ||
        (request.headers.get('accept') && request.headers.get('accept').includes('text/html'));

    if (!isHtml) return;

    try {
        const [cachedText, networkText] = await Promise.all([
            cachedResponse.clone().text(),
            networkResponse.clone().text()
        ]);

        if (cachedText !== networkText) {
            const clients = await globalThis.clients.matchAll();
            clients.forEach(client => {
                if (client.url === request.url) {
                    client.postMessage({ type: 'UPDATE_AVAILABLE' });
                }
            });
        }
    } catch {
        // 例外を無視または適切に処理
    }
}

// Stale-While-Revalidate 戦略
globalThis.addEventListener('fetch', event => {
    // 外部オリジン（Google Fonts等）へのリクエストはネットワーク優先
    if (!event.request.url.startsWith(globalThis.location.origin)) {
        return;
    }

    event.respondWith((async () => {
        const cache = await caches.open(CACHE_NAME);
        const cachedResponse = await cache.match(event.request);

        const fetchPromise = (async () => {
            try {
                const networkResponse = await fetch(event.request);

                // 有効なレスポンスのみキャッシュを更新
                if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
                    await cache.put(event.request, networkResponse.clone());

                    // HTMLリクエストの場合、更新チェックを実行（非同期）
                    notifyClientsIfUpdate(event.request, cachedResponse, networkResponse);
                }
                return networkResponse;
            } catch {
                // ネットワークエラー時はキャッシュを返す
                return cachedResponse;
            }
        })();

        // キャッシュがあればそれを返し、バックグラウンドで更新。なければネットワークを待つ。
        return cachedResponse || fetchPromise;
    })());
});
