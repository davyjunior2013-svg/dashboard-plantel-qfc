/* CINQ · service worker mínimo: só torna o sistema instalável como aplicativo.
   Não guarda nada em cache, então cada abertura sempre carrega a versão mais nova do site. */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', () => {});
