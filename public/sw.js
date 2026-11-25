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

// ------------------------------------------------------------
// Notificación push real (Web Push) — cuando alguien te arroba (@) en
// el chat de comunidad. Ver lib/push.ts (quién arma la suscripción) y
// app/push.py del backend (quién manda el mensaje encriptado). El
// payload lo arma routers/webhooks.py como {titulo, cuerpo, url}.
// ------------------------------------------------------------
self.addEventListener("push", (event) => {
  let datos = { titulo: "PLAYLIST", cuerpo: "Tenés una notificación nueva", url: "/chat" };
  try {
    if (event.data) datos = { ...datos, ...event.data.json() };
  } catch {
    // Si por algo el payload no es el JSON esperado, se muestra el
    // aviso genérico de arriba en vez de romper (sin esto, un push
    // mal formado no mostraría NADA — peor que un aviso genérico).
  }

  event.waitUntil(
    self.registration.showNotification(datos.titulo, {
      body: datos.cuerpo,
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      data: { url: datos.url },
    }),
  );
});

// Al tocar la notificación: si ya hay una pestaña de la app abierta,
// la enfoca y la manda al chat; si no, abre una nueva.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/chat";

  event.waitUntil(
    (async () => {
      const listaClientes = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const cliente of listaClientes) {
        if ("focus" in cliente) {
          await cliente.focus();
          if ("navigate" in cliente) await cliente.navigate(url);
          return;
        }
      }
      await self.clients.openWindow(url);
    })(),
  );
});
