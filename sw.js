/**
 * SERVICE WORKER store famBARLA
 * Architecture: Network-First (HTML), Cache-First (CDN), Stale-While-Revalidate (Dynamic)
 * Advanced Feature: In-App Update Manager & Safe URL Matching
 */

const APP_VERSION = '1.6'; // Ganti angka ini setiap kali kamu merubah index.html!

const CACHE_CORE = 'fambarla-core-v' + APP_VERSION; 
const CACHE_DYNAMIC = 'fambarla-dynamic-v' + APP_VERSION;
const MAX_DYNAMIC_ITEMS = 50; 

const coreUrls = [
  './',
  './manifest.json'
];

const cdnDomains = [
  'tailwindcss.com',
  'cdnjs.cloudflare.com',
  'unpkg.com',
  'fonts.googleapis.com', 
  'fonts.gstatic.com'
];

// FUNGSI: Memangkas cache dinamis
async function trimCache(cacheName, maxItems) {
  try {
    const cache = await caches.open(cacheName);
    const keys = await cache.keys();
    if (keys.length > maxItems) {
      const itemsToDelete = keys.slice(0, keys.length - maxItems);
      await Promise.all(itemsToDelete.map(key => cache.delete(key)));
    }
  } catch (e) {
    console.error('Trim Cache Error:', e);
  }
}

// 1. EVENT: INSTALL 
self.addEventListener('install', event => {
  // PENTING: Jangan pakai self.skipWaiting() di sini lagi agar kita bisa trigger pop-up update di index.html
  event.waitUntil(
    caches.open(CACHE_CORE).then(cache => {
      return Promise.all(coreUrls.map(url => {
        return fetch(new Request(url, { cache: 'reload' }))
          .then(res => {
            if (!res || !res.ok) throw new Error('Gagal pre-cache: ' + url);
            return cache.put(url, res);
          })
          .catch(err => console.warn('Peringatan Install:', err)); 
      }));
    })
  );
});

// 2. EVENT: ACTIVATE
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(keys.map(key => {
        // Hapus cache lama
        if (key.startsWith('fambarla-') && key !== CACHE_CORE && key !== CACHE_DYNAMIC) {
          return caches.delete(key);
        }
      }));
    }).then(() => self.clients.claim()) 
  );
});

// 3. EVENT: FETCH
self.addEventListener('fetch', event => {
  const req = event.request;
  const url = new URL(req.url);

  // Abaikan request API & Non-GET
  if (req.method !== 'GET' || url.pathname.endsWith('sw.js') || url.hostname === 'script.google.com' || !url.protocol.startsWith('http')) {
    return;
  }

  // STRATEGI 1: Network-First (HTML)
  if (req.mode === 'navigate' || url.pathname === '/' || url.pathname.endsWith('index.html') || url.pathname.endsWith('manifest.json')) {
    event.respondWith(
      fetch(req).then(res => {
        if (!res || (res.status !== 200 && res.type !== 'opaqueredirect')) throw new Error('Invalid response');
        const resClone = res.clone();
        caches.open(CACHE_CORE).then(cache => cache.put(req.url, resClone));
        return res;
      }).catch(async () => {
        const cachedRes = await caches.match(req.url, { ignoreSearch: true });
        return cachedRes || caches.match('./', { ignoreSearch: true });
      })
    );
    return;
  }

  // STRATEGI 2: Cache-First (CDN)
  if (cdnDomains.some(domain => url.hostname.includes(domain))) {
    event.respondWith(
      caches.match(req.url).then(cachedRes => {
        if (cachedRes) return cachedRes; 
        return fetch(req).then(res => {
          if (!res || (res.status !== 200 && res.status !== 0)) return res;
          const resClone = res.clone();
          event.waitUntil(
            caches.open(CACHE_DYNAMIC).then(cache => {
              cache.put(req.url, resClone);
              trimCache(CACHE_DYNAMIC, MAX_DYNAMIC_ITEMS);
            })
          );
          return res;
        }).catch(() => new Response('', { status: 404 })); 
      })
    );
    return;
  }

  // STRATEGI 3: Stale-While-Revalidate (Lainnya)
  event.respondWith(
    caches.match(req.url, { ignoreSearch: true }).then(cachedRes => {
      const networkFetch = fetch(req).then(res => {
        if (res && res.status === 200) {
          const resClone = res.clone();
          caches.open(CACHE_DYNAMIC).then(cache => {
            cache.put(req.url, resClone); 
            trimCache(CACHE_DYNAMIC, MAX_DYNAMIC_ITEMS); 
          });
        }
        return res;
      }).catch(() => new Response('', { status: 404 }));

      if (cachedRes) {
        event.waitUntil(networkFetch);
        return cachedRes;
      }
      return networkFetch;
    })
  );
});

// 4. EVENT: MESSAGE (Pemicu Update dari index.html)
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting(); // Langsung update!
  }
});
