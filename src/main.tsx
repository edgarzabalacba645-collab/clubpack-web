import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.tsx";
import { AuthProvider } from "./lib/auth";
import { ThemeProvider } from "./lib/theme";

// Service worker mínimo (ver public/sw.js) — sin esto, Chrome no deja
// instalar la app como PWA. Instalada (ícono en pantalla de inicio, no
// una pestaña de Chrome común) el celular es mucho más confiable
// manteniendo la reproducción continua con la pantalla bloqueada — ver
// la investigación en player.tsx. Si falla el registro (navegador
// viejo, http sin certificado, etc.) no pasa nada: la app sigue andando
// como página web común, solo sin la opción de instalarse.
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {
      /* no es crítico — ver comentario de arriba */
    });
  });
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ThemeProvider>
      <AuthProvider>
        <App />
      </AuthProvider>
    </ThemeProvider>
  </StrictMode>,
);
