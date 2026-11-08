// Service worker mínimo — solo existe para que Chrome/Android considere
// esta app "instalable" (uno de los requisitos para el PWA: instalada
// como ícono en la pantalla de inicio, en vez de una pestaña común del
// navegador, Chrome es mucho más confiable manteniendo la reproducción
// de audio y la notificación de la pantalla de bloqueo con la pantalla
// apagada — ver player.tsx y la investigación de reproducción continua).
//
// A propósito NO cachea nada: el catálogo cambia seguido (temas nuevos,
// arreglos) y servir una versión vieja del bundle desde caché sería
// peor que no tener service worker. El fetch handler vacío (deja pasar
// todo derecho a la red) es lo mínimo que pide el criterio de
// instalabilidad.
self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", () => {
  // sin cache — cada pedido sigue yendo directo a la red
});
