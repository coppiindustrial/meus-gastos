// SERVICE WORKER QUE SE DESINSTALA. A primeira versão do app (offline-first) registrava um service
// worker em /meus-gastos/sw.js, que guardava o app antigo em cache e continuava a servi-lo. O navegador
// procura uma versão nova deste arquivo de tempos em tempos: ao achar esta, ela apaga os caches, se
// desregistra e recarrega as abas abertas — e daí em diante o site é servido normalmente, sem cache.
// Pode sair daqui quando não houver mais aparelho com a versão antiga (o app novo não registra nada).
self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (evento) => {
  evento.waitUntil((async () => {
    const chaves = await caches.keys();
    await Promise.all(chaves.map((c) => caches.delete(c)));
    await self.registration.unregister();
    const abas = await self.clients.matchAll({ type: 'window' });
    abas.forEach((aba) => aba.navigate(aba.url));
  })());
});
