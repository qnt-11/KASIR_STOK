/**
 * SERVICE WORKER store famBARLA
 * Architecture: Network-First (HTML), Cache-First (CDN), Stale-While-Revalidate (Dynamic)
 * Feature: Safe Offline Fallback, Strict Memory Trimmer, App Window Manager
 */

const APP_VERSION = '1.9'; // Versi final, anti-crash, dan konsisten

const CACHE_CORE = 'fambarla-core-v' + APP_VERSION; 
const CACHE_DYNAMIC = 'fambarla-dynamic-v' + APP_VERSION;
const MAX_DYNAMIC_ITEMS = 50; 

const coreUrls = [
  './',
  './index.html',
  './manifest.json'
];

const cdnDomains = [
  'tailwindcss.com',
  'cdnjs.cloudflare.com',
  'unpkg.com',
  'fonts.googleapis.com', 
  'fonts.gstatic.com'
];

/**
 * FUNGSI: Memangkas cache dinamis agar memori HP tidak penuh
 */
async function trimCache(cacheName, maxItems) {
  try {
    const cache = await caches.open(cacheName);
    const keys = await cache.keys();
    if (keys.length > maxItems) {
      // Hapus data yang paling tua
      const itemsToDelete = keys.slice(0, keys.length - maxItems);
      await Promise.all(itemsToDelete.map(key => cache.delete(key)));
    }
  } catch (e) {
    console.error('Trim Cache Error:', e);
  }
}

// ==========================================
// EVENT: INSTALL (Mempersiapkan File Inti)
// ==========================================
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_CORE).then(cache => {
      return Promise.all(coreUrls.map(url => {
        return fetch(new Request(url, { cache: 'reload' })).then(res => {
          if (!res || !res.ok) throw new Error('Gagal pre-cache: ' + url);
          return cache.put(url, res);
        }); 
        // [FIXED] Bug 1: .catch() dihapus dari sini agar jika gagal download, 
        // proses instalasi SW benar-benar dibatalkan dan tidak pura-pura sukses.
      }));
    })
  );
});

// ==========================================
// EVENT: ACTIVATE (Membuang Cache Versi Lama)
// ==========================================
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(keys.map(key => {
        if (key.startsWith('fambarla-') && key !== CACHE_CORE && key !== CACHE_DYNAMIC) {
          return caches.delete(key);
        }
      }));
    }).then(() => self.clients.claim()) 
  );
});

// ==========================================
// EVENT: FETCH (Pengatur Lalu Lintas Data)
// ==========================================
self.addEventListener('fetch', event => {
  const req = event.request;
  const url = new URL(req.url);

  // Abaikan request API & Non-GET
  if (req.method !== 'GET' || url.pathname.endsWith('sw.js') || url.hostname === 'script.google.com' || !url.protocol.startsWith('http')) {
    return;
  }

  // NORMALISASI URL: Buang "?v=123" dll agar cache tertata rapi
  const cleanUrl = url.origin + url.pathname;

  // ---------------------------------------------------------
  // STRATEGI 1: Network-First (Khusus File HTML & Manifest)
  // ---------------------------------------------------------
  if (req.mode === 'navigate' || url.pathname === '/' || url.pathname.endsWith('index.html') || url.pathname.endsWith('manifest.json')) {
    const fetchPromise = fetch(req).then(res => {
      if (!res || (res.status !== 200 && res.status !== 0 && res.type !== 'opaqueredirect')) throw new Error('Invalid response');
      const resClone = res.clone();
      // [FIXED] Bug 3: Gunakan cleanUrl untuk menyimpan agar match saat offline
      caches.open(CACHE_CORE).then(cache => cache.put(cleanUrl, resClone));
      return res;
    });

    event.respondWith(
      fetchPromise.catch(async () => {
        // [FIXED] Bug 4: ignoreSearch dipasang kembali agar tidak error saat diakses dari Homescreen
        const cachedRes = await caches.match(cleanUrl, { ignoreSearch: true }) || 
                          await caches.match('./', { ignoreSearch: true }) || 
                          await caches.match('./index.html', { ignoreSearch: true });
        
        if (cachedRes) return cachedRes;

        // [FIXED] Bug 5 & 6: Header manifest.json darurat agar browser tidak Crash
        if (url.pathname.endsWith('manifest.json')) {
          return new Response('{"name":"store famBARLA","short_name":"famBARLA","display":"standalone","start_url":"./"}', { 
            headers: { 'Content-Type': 'application/json' } 
          });
        }
        
        return new Response('Aplikasi sedang offline. Tidak ada data di cache.', { status: 503, statusText: 'Offline' });
      })
    );
    return;
  }

  // ---------------------------------------------------------
  // STRATEGI 2: Cache-First (Khusus Library CDN & Font)
  // ---------------------------------------------------------
  if (cdnDomains.some(domain => url.hostname.includes(domain))) {
    event.respondWith(
      caches.match(cleanUrl).then(cachedRes => {
        if (cachedRes) return cachedRes; 
        
        return fetch(req).then(async res => {
          if (!res || (res.status !== 200 && res.status !== 0)) return res;
          
          const resClone = res.clone();
          // [FIXED] Pindahkan aset CDN ke CACHE_CORE agar permanen dan tidak sengaja
          // terhapus oleh trimCache yang mengakibatkan layar rusak (Bug FIFO).
          const cache = await caches.open(CACHE_CORE);
          await cache.put(cleanUrl, resClone);
          return res;
        }).catch(() => new Response('', { status: 503, statusText: 'Offline' })); 
      })
    );
    return;
  }

  // ---------------------------------------------------------
  // STRATEGI 3: Stale-While-Revalidate (File Statis Lainnya)
  // ---------------------------------------------------------
  
  // [FIXED] Bug 2: Rantai async/await diikat menjadi satu Promise utuh
  const fetchAndCachePromise = fetch(req).then(async res => {
    if (res && (res.status === 200 || res.status === 0)) {
      const resClone = res.clone();
      const cache = await caches.open(CACHE_DYNAMIC);
      await cache.put(cleanUrl, resClone); 
      await trimCache(CACHE_DYNAMIC, MAX_DYNAMIC_ITEMS); // Trim dieksekusi dengan aman
    }
    return res;
  }).catch(() => new Response('', { status: 503, statusText: 'Offline' }));

  // Melindungi siklus hidup SW agar proses di atas tidak dibunuh secara paksa
  event.waitUntil(fetchAndCachePromise);

  event.respondWith(
    caches.match(cleanUrl, { ignoreSearch: true }).then(cachedRes => {
      return cachedRes || fetchAndCachePromise;
    })
  );
});

// ==========================================
// FITUR: Hook Pengendali Aplikasi
// ==========================================

// Pemicu Update Terkendali
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// Window Manager yang Handal
self.addEventListener('notificationclick', event => {
  event.notification.close();

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
      for (const client of clientList) {
        if (client.url.startsWith(self.registration.scope) && 'focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow('./');
      }
    })
  );
});
