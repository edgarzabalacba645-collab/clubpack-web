# ClubPack — frontend

Frontend de ClubPack: React + Vite + TypeScript + Tailwind v4, hablando
directo contra Supabase (login, catálogo, géneros, usuarios, Top 50,
playlists) y contra el [backend FastAPI](../clubpack-api) para todo lo
que necesita ffmpeg, detección de BPM/fingerprint o las claves de
Cloudflare R2 (subir tracks, armar ZIPs, escanear duplicados, borrar
un track).

## Instalar y correr en local

```bash
npm install
cp .env.example .env
# completá .env con la misma Supabase URL/anon key que ya tenés, y la
# URL del backend FastAPI (por defecto http://localhost:8000)

npm run dev
```

Abre en **http://localhost:5173**. Necesitás el [backend](../clubpack-api)
corriendo aparte (`uvicorn app.main:app --reload --port 8000`) para que
funcionen Subir Track, las descargas, los ZIPs y el panel de Admin.

## Estructura

```
src/
  lib/
    supabase.ts   cliente de Supabase (sin tipar — ver nota abajo)
    api.ts        cliente del backend FastAPI
    auth.tsx      contexto de sesión/perfil (useAuth)
    types.ts      tipos del schema (Perfil, Track, Genero, ...)
    format.ts      helpers de formato (BPM, duración, fecha, errores)
  components/      AppShell (header+nav), rutas protegidas, placeholders
  pages/           una página por ruta
```

Rutas: `/` (login), `/catalogo`, `/subir`, `/playlists`, `/cuenta`,
`/suscripcion`, `/admin` (solo rol admin). Todas menos `/` requieren
sesión activa (`RutaProtegida` en `components/ProtectedRoute.tsx`), que
a su vez depende de que las políticas RLS en `sql/` dejen pasar al
usuario — el frontend nunca es la única barrera de seguridad.

`/suscripcion` muestra el precio, deja pagar con Mercado Pago (botón +
QR, generados llamando al [backend](../clubpack-api)) o avisar una
transferencia manual (CBU/CVU/alias, directo contra Supabase). El panel
de Admin tiene una pestaña nueva ("Suscripción") para configurar el
precio/CBU y aprobar o rechazar esos avisos manuales. Más detalle de
cómo funciona el cobro automático, en el README del backend.

## Nota sobre el tipado de Supabase

El cliente de Supabase (`lib/supabase.ts`) se crea **sin** el genérico
`<Database>`: `@supabase/supabase-js@2.119` tiene un bug/limitación real
en la inferencia de tipos para un `Database` escrito a mano (no
generado con `supabase gen types typescript`) que hace que
`.insert()/.update()` terminen tipados `never`. Mientras tanto, los
tipos de dominio (`lib/types.ts`) se usan como anotaciones manuales en
cada call site. Si en algún momento corren `supabase gen types
typescript` contra el proyecto real, ese archivo generado debería
poder pasarse al `createClient<Database>` sin este problema — no
verificado todavía porque generarlo necesita acceso a la base viva.

## Build / deploy

```bash
npm run build   # -> dist/, sitio estático
```

Se despliega como sitio estático (Vercel, Netlify, Cloudflare Pages).
Configurá las variables `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` y
`VITE_API_BASE_URL` (apuntando a donde quede desplegado el backend) en
el panel de ese hosting — nunca subas `.env` a git.
