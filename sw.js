const CACHE_NAME = 'barla-kasir-v18.0';

// File utama yang disimpan ke memori HP untuk akses offline
const urlsToCache = [
  './',
  './index.html',
  './manifest.json'
];

// Proses Instalasi & Menyimpan Cache
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Opened cache');
        return cache.addAll(urlsToCache);
      })
  );
  // Memaksa service worker baru untuk langsung aktif
  self.skipWaiting();
});

// Proses Aktivasi & Menghapus Cache Versi Lama (Biar gak nyangkut)
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            console.log('Menghapus cache lama:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// Proses Fetch (Jaringan Pintar: Coba internet dulu, kalau gagal pakai cache/offline)
self.addEventListener('fetch', event => {
  event.respondWith(
    fetch(event.request).catch(() => {
      return caches.match(event.request);
    })
  );
});
