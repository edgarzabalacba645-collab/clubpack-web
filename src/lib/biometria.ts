/**
 * Bloqueo biométrico "local" (huella/rostro) para la app instalada en el
 * celular — a pedido de Edgar, para que si alguien agarra el teléfono y
 * abre la app ya instalada, no pueda entrar sin la huella/rostro del
 * dueño del celular.
 *
 * OJO con el alcance real de esto (importante no perderlo de vista):
 * esto NO es una capa de seguridad del servidor ni reemplaza el login
 * de Supabase (que sigue siendo la autenticación real de la cuenta).
 * Es una traba puramente del lado del dispositivo, usando la API web
 * WebAuthn para pedirle al propio celular que muestre su diálogo
 * nativo de huella/rostro — el mismo que ya usa para desbloquear la
 * pantalla. Ni la huella ni el rostro en sí pasan nunca por acá: eso
 * queda todo adentro del hardware seguro del teléfono, acá solo se
 * recibe un sí/no de "la verificación del dispositivo salió bien".
 *
 * Por eso tampoco se valida ninguna firma contra el backend — no hace
 * falta para lo que es esto (una traba de conveniencia local, no una
 * autenticación extra de la cuenta), así que no hay ningún endpoint ni
 * tabla nueva en Supabase para esto. Lo único que se guarda es el ID
 * de la credencial WebAuthn en el localStorage de ESTE navegador/
 * dispositivo (clave por usuario, ver claveStorage) — por eso hay que
 * activarlo de nuevo en cada celular/navegador donde se quiera usar.
 */

const PREFIJO_STORAGE = "clubpack-biometria-";

function claveStorage(userId: string): string {
  return `${PREFIJO_STORAGE}${userId}`;
}

function bufferABase64Url(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binario = "";
  for (const b of bytes) binario += String.fromCharCode(b);
  return btoa(binario).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlABuffer(base64url: string): ArrayBuffer {
  const base64 = base64url.replace(/-/g, "+").replace(/_/g, "/");
  const relleno = base64.length % 4 === 0 ? "" : "=".repeat(4 - (base64.length % 4));
  const binario = atob(base64 + relleno);
  const bytes = new Uint8Array(binario.length);
  for (let i = 0; i < binario.length; i++) bytes[i] = binario.charCodeAt(i);
  return bytes.buffer;
}

/**
 * Si este navegador/dispositivo tiene un autenticador de plataforma
 * disponible (huella, rostro, PIN del dispositivo) para usar con
 * WebAuthn. Hay que chequear esto ANTES de ofrecer la opción en Mi
 * Cuenta — si da false, ni mostrarla (en vez de dejar que el usuario
 * la active y le falle en la cara).
 */
export async function biometriaDisponible(): Promise<boolean> {
  if (typeof window === "undefined" || !window.PublicKeyCredential) return false;
  try {
    return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch {
    return false;
  }
}

/** Si ya hay una credencial guardada para este usuario en ESTE dispositivo. */
export function biometriaActivada(userId: string): boolean {
  try {
    return localStorage.getItem(claveStorage(userId)) !== null;
  } catch {
    return false;
  }
}

/**
 * Registra la huella/rostro en este dispositivo para este usuario —
 * dispara el diálogo nativo del celular. Tira una excepción si el
 * usuario cancela, el dispositivo no tiene biometría configurada, o
 * algo más sale mal (el caller se encarga de mostrar un error
 * entendible).
 */
export async function activarBiometria(userId: string, nombreMostrado: string): Promise<void> {
  const challenge = crypto.getRandomValues(new Uint8Array(32));

  const credencial = (await navigator.credentials.create({
    publicKey: {
      challenge,
      rp: { name: "PLAYLIST" },
      user: {
        id: new TextEncoder().encode(userId),
        name: nombreMostrado,
        displayName: nombreMostrado,
      },
      // ES256 y RS256 — el par estándar que cubre prácticamente
      // cualquier autenticador de plataforma real (Android, iOS,
      // Windows Hello).
      pubKeyCredParams: [
        { type: "public-key", alg: -7 },
        { type: "public-key", alg: -257 },
      ],
      authenticatorSelection: {
        // "platform": que use el sensor del propio celular (huella/
        // rostro/PIN), nunca una llave física USB/NFC aparte.
        authenticatorAttachment: "platform",
        // "required": que SÍ exija la verificación (huella/rostro/PIN),
        // no alcanza con que el dispositivo esté presente nomás.
        userVerification: "required",
        residentKey: "preferred",
      },
      timeout: 60000,
      attestation: "none",
    },
  })) as PublicKeyCredential | null;

  if (!credencial) throw new Error("No se pudo registrar la biometría en este dispositivo.");

  localStorage.setItem(claveStorage(userId), bufferABase64Url(credencial.rawId));
}

/** Apaga el bloqueo biométrico para este usuario en este dispositivo. */
export function desactivarBiometria(userId: string): void {
  try {
    localStorage.removeItem(claveStorage(userId));
  } catch {
    // Sin localStorage no hay nada que borrar — no es un error real.
  }
}

/**
 * Pide la verificación biométrica (dispara el diálogo nativo) contra
 * la credencial ya guardada para este usuario en este dispositivo.
 * Devuelve true si el dispositivo confirmó la huella/rostro, false si
 * el usuario canceló, falló, o no hay nada registrado todavía.
 */
export async function verificarBiometria(userId: string): Promise<boolean> {
  let credencialId: string | null;
  try {
    credencialId = localStorage.getItem(claveStorage(userId));
  } catch {
    credencialId = null;
  }
  if (!credencialId) return false;

  const challenge = crypto.getRandomValues(new Uint8Array(32));

  try {
    const resultado = await navigator.credentials.get({
      publicKey: {
        challenge,
        allowCredentials: [{ id: base64UrlABuffer(credencialId), type: "public-key" }],
        userVerification: "required",
        timeout: 60000,
      },
    });
    return resultado != null;
  } catch {
    // Cancelado, timeout, credencial borrada del lado del sistema
    // operativo (ej. se resetearon las huellas) — en todos los casos,
    // simplemente no se desbloquea; el caller ofrece reintentar.
    return false;
  }
}
