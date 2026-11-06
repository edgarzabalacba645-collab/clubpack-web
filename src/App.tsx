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

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<LoginPage />} />

        <Route element={<RutaProtegida />}>
          <Route element={<AppShell />}>
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
