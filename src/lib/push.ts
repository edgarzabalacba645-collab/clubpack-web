/**
 * Notificaciones push reales (Web Push) — para avisar al celular,
 * aunque la app esté cerrada o la pantalla bloqueada, cuando alguien
 * te arroba (@) en el chat de comunidad (ver ChatPage.tsx para el
 * autocompletado de menciones y sql/021_notificaciones_push.sql +
 * app/push.py del backend para el envío real).
 *
 * Cómo funciona, de punta a punta: este navegador le pide al Service
 * Worker (ver public/sw.js) una "suscripción push" al servicio de
 * notificaciones del sistema operativo/navegador (FCM en Android/
 * Chrome, APNs en iOS/Safari, etc) — esa suscripción es un endpoint +
 * dos claves (p256dh/auth) propias de ESTE navegador en ESTE
 * dispositivo. La guardamos en Supabase (push_subscripciones) para
 * que el backend, cuando alguien te arrobe, le pueda mandar un mensaje
 * ENCRIPTADO específicamente para esas claves — ni Supabase ni el
 * backend pueden leer notificaciones de otra suscripción con esto, y
 * tampoco pueden mandar nada que no sea a través del servicio de push
 * real (no hay forma de "falsificar" que viene de ahí sin la clave
 * privada de VAPID, que vive solo en el backend).
 *
 * Por dispositivo: hay que activarlo de nuevo en cada celular/
 * navegador donde se quiera recibir — igual que el bloqueo biométrico
 * (ver lib/biometria.ts), pero esto SÍ necesita guardar algo en el
 * servidor (el backend tiene que poder mandarte algo aunque no tengas
 * la app abierta en este momento).
 */

import { supabase } from "./supabase";

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY;

function base64UrlAUint8Array(base64url: string): Uint8Array<ArrayBuffer> {
  const base64 = base64url.replace(/-/g, "+").replace(/_/g, "/");
  const relleno = base64.length % 4 === 0 ? "" : "=".repeat(4 - (base64.length % 4));
  const binario = atob(base64 + relleno);
  const bytes = new Uint8Array(binario.length);
  for (let i = 0; i < binario.length; i++) bytes[i] = binario.charCodeAt(i);
  return bytes;
}

function bufferABase64Url(buffer: ArrayBuffer | null): string {
  if (!buffer) return "";
  const bytes = new Uint8Array(buffer);
  let binario = "";
  for (const b of bytes) binario += String.fromCharCode(b);
  return btoa(binario).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Si este navegador soporta Web Push y la app tiene la clave VAPID configurada. */
export function pushDisponible(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window &&
    !!VAPID_PUBLIC_KEY
  );
}

/** Si ya hay una suscripción activa en ESTE navegador/dispositivo. */
export async function pushActivado(): Promise<boolean> {
  if (!pushDisponible()) return false;
  try {
    const registro = await navigator.serviceWorker.ready;
    const suscripcion = await registro.pushManager.getSubscription();
    return suscripcion !== null;
  } catch {
    return false;
  }
}

/** Traduce el error real a algo entendible, sin esconder el detalle técnico. */
export function mensajeErrorPush(error: unknown): string {
  if (typeof Notification !== "undefined" && Notification.permission === "denied") {
    return "Bloqueaste las notificaciones para este sitio — para activarlas hay que habilitarlas de nuevo desde la configuración del navegador.";
  }
  const detalle = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  return `No se pudo activar. (detalle: ${detalle})`;
}

/**
 * Pide permiso de notificaciones (diálogo nativo del navegador/
 * celular), suscribe este dispositivo y guarda la suscripción en
 * Supabase. Tira una excepción si el usuario no da el permiso o algo
 * más sale mal (el caller se encarga de mostrar un error entendible).
 */
export async function activarPush(userId: string): Promise<void> {
  const permiso = await Notification.requestPermission();
  if (permiso !== "granted") {
    throw new Error("No se concedió el permiso de notificaciones.");
  }

  const registro = await navigator.serviceWorker.ready;
  let suscripcion = await registro.pushManager.getSubscription();
  if (!suscripcion) {
    suscripcion = await registro.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: base64UrlAUint8Array(VAPID_PUBLIC_KEY),
    });
  }

  const p256dh = bufferABase64Url(suscripcion.getKey("p256dh"));
  const auth = bufferABase64Url(suscripcion.getKey("auth"));
  if (!p256dh || !auth) {
    throw new Error("El navegador no devolvió las claves de la suscripción.");
  }

  const { error } = await supabase
    .from("push_subscripciones")
    .upsert(
      { usuario_id: userId, endpoint: suscripcion.endpoint, p256dh, auth },
      { onConflict: "endpoint" },
    );
  if (error) throw error;
}

/** Apaga las notificaciones push en este navegador/dispositivo. */
export async function desactivarPush(): Promise<void> {
  if (!pushDisponible()) return;
  const registro = await navigator.serviceWorker.ready;
  const suscripcion = await registro.pushManager.getSubscription();
  if (!suscripcion) return;

  const endpoint = suscripcion.endpoint;
  await suscripcion.unsubscribe();
  // Si esto falla, el navegador ya canceló su lado igual — a lo sumo
  // queda una fila vieja en la tabla que el backend simplemente no va
  // a poder usar (Web Push le va a devolver 404/410 y push.py ya la
  // limpia solo la próxima vez que se intente mandar algo ahí).
  await supabase.from("push_subscripciones").delete().eq("endpoint", endpoint);
}
