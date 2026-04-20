/**
 * SERVICE WORKER STORE famBARLA (KASIR VERSION v30.4 - THE TRUE IMMORTAL)
 * Fitur: PWA Offline Ready, Network First (Anti-Captive Portal), 
 * CDN Opaque Bypass, Auto-Trim Cache, & WaitUntil Background Sync.
 */

const APP_VERSION = '30.4-IMMORTAL'; 

const CACHE_STATIC = 'fambarla-static-v' + APP_VERSION;
const CACHE_DYNAMIC = 'fambarla-dynamic-v' + APP_VERSION;
const MAX_DYNAMIC_ITEMS = 50; // Tukang Pangkas: Maksimal simpan 50 file agar HP tidak lemot

// 1. Aset inti (Kerangka Utama)
const coreAssets = [
  './',
  './index.html',
  './manifest.json'
];

// 2. Daftar CDN Pihak Ketiga (Diizinkan masuk brankas walau status Opaque/0)
const cdnAssets = [
  'tailwindcss.com',
  'cdnjs.cloudflare.com',
  'unpkg.com'
];

// ========================================================
// FUNGSI TUKANG PANGKAS MEMORI (Auto-Trim)
// ========================================================
function trimCache(cacheName, maxItems) {
  caches.open(cacheName).then(cache => {
    cache.keys().then(keys => {
      if (keys.length > maxItems) {
        cache.delete(keys[0]).then(() => trimCache(cacheName, maxItems));
      }
    });
  });
}

// ========================================================
// TAHAP 1: INSTALASI (Anti-Mati Suri)
// ========================================================
self.addEventListener('install', event => {
  self.skipWaiting(); 
  event.waitUntil(
    caches.open(CACHE_STATIC).then(cache => {
      // Promise.all untuk memastikan PWA tetap terinstal meski ada 1 ikon yang gagal di-load
      return Promise.all(coreAssets.map(url => {
        return cache.add(url).catch(err => console.log('Abaikan jika tidak ada:', url));
      }));
    })
  );
});

// ========================================================
// TAHAP 2: AKTIVASI (Pembersih Otomatis)
// ========================================================
self.addEventListener('activate', event => {
  self.clients.claim(); 
  event.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(keys.map(key => {
        if (key.startsWith('fambarla-') && key !== CACHE_STATIC && key !== CACHE_DYNAMIC) {
          return caches.delete(key);
        }
      }));
    })
  );
});

// ========================================================
// TAHAP 3: INTERSEP LALU LINTAS JARINGAN (The Immortal Brain)
// ========================================================
self.addEventListener('fetch', event => {
  const req = event.request;
  const url = new URL(req.url);

  // --- FILTER KEAMANAN MUTLAK ---
  if (req.method !== 'GET') return; // Abaikan POST (Upload Data Cloud)
  if (url.pathname.endsWith('sw.js')) return; // Jangan cache otaknya sendiri
  if (url.hostname === 'script.google.com') return; // BYPASS MUTLAK GOOGLE SHEETS
  if (!url.protocol.startsWith('http')) return; // Abaikan ekstensi aneh

  // ========================================================
  // STRATEGI 1: NETWORK-FIRST (Utamakan Internet untuk HTML)
  // Vaksin: Anti-Zombie, Anti-WiFi Warkop, Anti-Phantom Redirect
  // ========================================================
  if (req.mode === 'navigate' || url.pathname === '/' || url.pathname.endsWith('index.html')) {
    event.respondWith(
      fetch(req).then(res => {
        // Tolak keras jika respon bukan 200 OK dan bukan pengalihan internal yang sah
        if (!res || (res.status !== 200 && res.type !== 'opaqueredirect')) {
          throw new Error('Terindikasi Captive Portal / WiFi Warkop');
        }
        const resClone = res.clone();
        caches.open(CACHE_DYNAMIC).then(cache => cache.put(req, resClone));
        return res;
      }).catch(() => {
        // MATI LAMPU: Buka brankas dengan mengabaikan buntut URL (Anti-Kloning Memori)
        return caches.match(req, { ignoreSearch: true }).then(cachedRes => {
          return cachedRes || caches.match('./index.html', { ignoreSearch: true }).then(fallback => {
             // Nyawa terakhir: kembalikan halaman kosong agar Service Worker tidak crash
             return fallback || new Response('<h1>Offline Server</h1>', { headers: { 'Content-Type': 'text/html' } });
          });
        });
      })
    );
    return; 
  }

  // ========================================================
  // STRATEGI 2: CACHE-FIRST (Utamakan Brankas untuk CDN)
  // Vaksin: Anti-Black Hole (Tampilan hancur saat offline)
  // ========================================================
  if (cdnAssets.some(cdn => url.hostname.includes(cdn))) {
    event.respondWith(
      caches.match(req, { ignoreSearch: true }).then(cachedRes => {
        if (cachedRes) return cachedRes; 
        
        return fetch(req).then(res => {
          // Izinkan status 0 (Opaque) khusus untuk CSS dan Ikon luar negeri
          if (!res || (res.status !== 200 && res.status !== 0)) return res;
          
          const resClone = res.clone();
          caches.open(CACHE_STATIC).then(cache => cache.put(req, resClone));
          return res;
        }).catch(() => new Response('', { status: 404, statusText: 'Offline CDN' }));
      })
    );
    return;
  }

  // ========================================================
  // STRATEGI 3: STALE-WHILE-REVALIDATE (Untuk Sisa Aset)
  // Vaksin: Sabuk Pengaman (WaitUntil) Anti-Pembunuhan Background
  // ========================================================
  event.respondWith(
    caches.match(req, { ignoreSearch: true }).then(cachedRes => {
      
      const networkFetch = fetch(req).then(res => {
        if (res && res.status === 200) {
          const resClone = res.clone();
          caches.open(CACHE_DYNAMIC).then(cache => {
            cache.put(req, resClone);
            trimCache(CACHE_DYNAMIC, MAX_DYNAMIC_ITEMS); // Pangkas memori HP
          });
        }
        return res;
      }).catch(() => new Response('', { status: 404, statusText: 'Offline Asset' }));
      
      // INI DIA VAKSINNYA: Paksa browser menunggu download selesai, jangan bunuh SW-nya!
      if (cachedRes) {
        event.waitUntil(networkFetch);
        return cachedRes;
      }
      
      return networkFetch; 
    })
  );
});
