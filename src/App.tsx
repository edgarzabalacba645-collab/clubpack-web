import { useEffect } from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { API_BASE_URL } from "./lib/supabase";
import LoginPage from "./pages/LoginPage";
import CatalogoPage from "./pages/CatalogoPage";
import SubirTrackPage from "./pages/SubirTrackPage";
import PlaylistsPage from "./pages/PlaylistsPage";
import ChatPage from "./pages/ChatPage";
import HerramientasPage from "./pages/HerramientasPage";
import Top50Page from "./pages/Top50Page";
import MiCuentaPage from "./pages/MiCuentaPage";
import SuscripcionPage from "./pages/SuscripcionPage";
import AdminPage from "./pages/AdminPage";
import FavoritosPage from "./pages/FavoritosPage";
import NovedadesPage from "./pages/NovedadesPage";
import DescargasPage from "./pages/DescargasPage";
import { ContactoPage, PrivacidadPage, TerminosPage } from "./pages/LegalPages";
import AppShell from "./components/AppShell";
import { RutaProtegida, RutaAdmin } from "./components/ProtectedRoute";
import { PlayerProvider } from "./lib/player";
import { SubidaProvider } from "./lib/subida";
import { CargaMasivaProvider } from "./lib/cargaMasiva";

/*
 * El reproductor y las dos colas de subida (individual y masiva) viven
 * en contextos montados por encima de las rutas protegidas, envolviendo
 * AppShell directamente — así, al navegar entre pantallas (Outlet
 * cambia, pero esta ruta "padre" no se remonta), un tema que está
 * sonando sigue sonando y una carga en curso no se pierde. Ver
 * src/lib/player.tsx, src/lib/subida.tsx y src/lib/cargaMasiva.tsx.
 */
function AppShellConProveedores() {
  return (
    <PlayerProvider>
      <SubidaProvider>
        <CargaMasivaProvider>
          <AppShell />
        </CargaMasivaProvider>
      </SubidaProvider>
    </PlayerProvider>
  );
}

/**
 * El backend (Render, plan gratis) se duerme a los 15 min sin tráfico y
 * tarda 50+ segundos en volver a arrancar — eso es lo que se siente como
 * demora al darle play o al subir un tema, porque CUALQUIERA de las dos
 * cosas pega contra el backend (obtenerUrlDescarga para reproducir,
 * /tracks/analyze y /tracks/confirm para subir — no hay forma de evitarlo,
 * ambas necesitan ffmpeg/R2 del lado del servidor).
 *
 * Este ping inicial adelanta el despertar al momento en que se abre la
 * app (antes incluso de loguearse), para que la mayor parte de esos 50s
 * ya haya pasado mientras el usuario todavía está eligiendo qué hacer.
 * Pero eso solo cubre el arranque — a pedido de Edgar ("mientras la
 * plataforma esté abierta no se duerman los procesos, ni análisis ni
 * reproducción"), además se repite cada 10 minutos mientras la pestaña
 * siga abierta (por debajo del umbral de 15 min de Render), para que el
 * backend nunca llegue a dormirse en medio de una sesión activa.
 *
 * Si se cierra la pestaña, el intervalo se corta solo (cleanup de abajo)
 * y el backend puede volver a dormirse — es lo esperado: no tiene
 * sentido mantenerlo despierto las 24 horas sin que nadie lo esté
 * usando (el plan gratis de Render tiene un tope de horas por mes, y
 * quemarlo de más podría dejarlo sin esas horas justo cuando sí hay
 * gente usando la app).
 *
 * Límite real que no depende de la app: si el celular se bloquea o el
 * navegador manda la pestaña muy al fondo, el sistema operativo puede
 * pausar este temporizador igual — no hay forma de garantizar el 100%
 * desde el lado del frontend en ese caso.
 */
function usarDespertarBackend() {
  useEffect(() => {
    if (!API_BASE_URL) return;

    const pingear = () => {
      fetch(`${API_BASE_URL}/health`).catch(() => {
        // Sin red, o el backend tardando en arrancar — no es nada que
        // mostrarle al usuario acá, la próxima acción real ya mostrará su
        // propio estado de carga si todavía no respondió.
      });
    };

    pingear();
    const intervalo = setInterval(pingear, 10 * 60 * 1000);
    return () => clearInterval(intervalo);
  }, []);
}

export default function App() {
  usarDespertarBackend();

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<LoginPage />} />

        <Route element={<RutaProtegida />}>
          <Route element={<AppShellConProveedores />}>
            <Route path="/catalogo" element={<CatalogoPage />} />
            <Route path="/subir" element={<SubirTrackPage />} />
            <Route path="/playlists" element={<PlaylistsPage />} />
            <Route path="/chat" element={<ChatPage />} />
            <Route path="/herramientas" element={<HerramientasPage />} />
            <Route path="/top50" element={<Top50Page />} />
            <Route path="/cuenta" element={<MiCuentaPage />} />
            <Route path="/suscripcion" element={<SuscripcionPage />} />
            <Route path="/favoritos" element={<FavoritosPage />} />
            <Route path="/novedades" element={<NovedadesPage />} />
            <Route path="/descargas" element={<DescargasPage />} />
            <Route path="/terminos" element={<TerminosPage />} />
            <Route path="/privacidad" element={<PrivacidadPage />} />
            <Route path="/contacto" element={<ContactoPage />} />

            <Route element={<RutaAdmin />}>
              <Route path="/admin" element={<AdminPage />} />
            </Route>
          </Route>
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
