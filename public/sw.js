// Service worker — además de lo que ya hacía (instalabilidad + push, ver
// abajo), ahora también guarda una copia de respaldo del "cascarón" de
// la app (el HTML/JS/CSS propios + las tipografías de Google Fonts) para
// poder ABRIRLA de cero sin nada de señal. Antes, si la pestaña no
// estaba ya abierta en memoria, sin red no cargaba nada.
//
// Estrategia: red primero, caché de respaldo (ver fetch de más abajo).
// Con señal, siempre se pide la versión real y se deja guardada — así
// una actualización nueva llega igual que antes, apenas se abra de
// nuevo con señal. Sin señal, si el pedido a la red falla, se sirve la
// última copia buena guardada (puede ser vieja si hace mucho que no se
// abre con señal, pero funciona).
//
// A propósito esto NO incluye nada dinámico: la API del backend,
// Supabase, ni las URLs firmadas de R2 para bajar audio siguen yendo
// directo a la red sin tocar — cachear esas rompería tokens que vencen
// o mostraría catálogo/chat/estado de suscripción viejo. El audio
// offline cifrado es un sistema aparte (ver lib/offline.ts, IndexedDB),
// no tiene nada que ver con esto.
const CACHE_CASCARON = "clubpack-cascaron-v1";
const CLAVE_SHELL = "/"; // toda ruta de la SPA (/catalogo, /playlists, etc.) sirve el mismo index.html — una sola clave, no una copia por ruta

function esPedidoDeCascaron(request) {
  if (request.method !== "GET") return false;
  const url = new URL(request.url);
  if (request.mode === "navigate" && url.origin === self.location.origin) return true;
  if (url.origin === self.location.origin && url.pathname.startsWith("/assets/")) return true;
  // Tipografías de Google Fonts (ver index.html) — cross-origin pero
  // estáticas, se cachean igual para que la app no se vea "rota" (con
  // la tipografía de reserva del sistema) al abrirla sin señal.
  if (url.origin === "https://fonts.googleapis.com" || url.origin === "https://fonts.gstatic.com") return true;
  return false;
}

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (!esPedidoDeCascaron(request)) return; // todo lo demás sigue yendo directo a la red, sin tocar

  const esNavegacion = request.mode === "navigate";

  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE_CASCARON);
      try {
        const respuestaRed = await fetch(request);
        // Solo se guarda una respuesta válida — un 404/500 no debe
        // pisar una copia buena anterior.
        if (respuestaRed && respuestaRed.ok) {
          void cache.put(esNavegacion ? CLAVE_SHELL : request, respuestaRed.clone());
        }
        return respuestaRed;
      } catch {
        const enCache = await cache.match(esNavegacion ? CLAVE_SHELL : request);
        if (enCache) return enCache;
        throw new Error(`Sin red y sin copia en caché para ${request.url}`);
      }
    })(),
  );
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
