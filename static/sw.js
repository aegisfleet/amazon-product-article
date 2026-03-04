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
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => {
                return cache.addAll(urlsToCache);
            })
    );
});

// アクティベート時に古いキャッシュを削除し、すぐに制御を開始
globalThis.addEventListener('activate', event => {
    const cacheWhitelist = [CACHE_NAME];
    event.waitUntil(
        Promise.all([
            caches.keys().then(cacheNames => {
                return Promise.all(
                    cacheNames.map(cacheName => {
                        if (cacheWhitelist.indexOf(cacheName) === -1) {
                            return caches.delete(cacheName);
                        }
                    })
                );
            }),
            globalThis.clients.claim() // すぐに全てのクライアントを制御下に置く
        ])
    );
});

// Stale-While-Revalidate 戦略
globalThis.addEventListener('fetch', event => {
    // 外部オリジン（Google Fonts等）へのリクエストはネットワーク優先（任意でキャッシュも可能）
    if (!event.request.url.startsWith(globalThis.location.origin)) {
        return;
    }

    event.respondWith(
        caches.open(CACHE_NAME).then(cache => {
            return cache.match(event.request).then(cachedResponse => {
                const fetchPromise = fetch(event.request).then(networkResponse => {
                    // 有効なレスポンスのみキャッシュを更新
                    if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
                        const responseToCache = networkResponse.clone();
                        cache.put(event.request, responseToCache);

                        // HTMLリクエストの場合、更新があればクライアントに通知する
                        if (cachedResponse && (event.request.mode === 'navigate' || (event.request.headers.get('accept') && event.request.headers.get('accept').includes('text/html')))) {
                            Promise.all([
                                cachedResponse.clone().text(),
                                networkResponse.clone().text()
                            ]).then(([cachedText, networkText]) => {
                                if (cachedText !== networkText) {
                                    globalThis.clients.matchAll().then(clients => {
                                        clients.forEach(client => {
                                            if (client.url === event.request.url) {
                                                client.postMessage({ type: 'UPDATE_AVAILABLE' });
                                            }
                                        });
                                    });
                                }
                            }).catch(err => console.error('Error comparing responses:', err));
                        }
                    }
                    return networkResponse;
                }).catch(() => {
                    // ネットワークエラー時はキャッシュがあればそれを返す（既に返しているはずだが念のため）
                    return cachedResponse;
                });

                // キャッシュがあればそれを返し、バックグラウンドで更新。なければネットワークを待つ。
                return cachedResponse || fetchPromise;
            });
        })
    );
});
