import { BrowserRouter, Routes, Route } from "react-router-dom";
import LoginPage from "./pages/LoginPage";
import CatalogoPage from "./pages/CatalogoPage";
import SubirTrackPage from "./pages/SubirTrackPage";
import PlaylistsPage from "./pages/PlaylistsPage";
import ChatPage from "./pages/ChatPage";
import HerramientasPage from "./pages/HerramientasPage";
import MiCuentaPage from "./pages/MiCuentaPage";
import SuscripcionPage from "./pages/SuscripcionPage";
import AdminPage from "./pages/AdminPage";
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

export default function App() {
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
            <Route path="/cuenta" element={<MiCuentaPage />} />
            <Route path="/suscripcion" element={<SuscripcionPage />} />

            <Route element={<RutaAdmin />}>
              <Route path="/admin" element={<AdminPage />} />
            </Route>
          </Route>
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
