import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

export type Tema = "claro" | "oscuro";
const STORAGE_KEY = "clubpack-tema";

interface ThemeContextValue {
  tema: Tema;
  alternarTema: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function temaInicial(): Tema {
  try {
    const guardado = localStorage.getItem(STORAGE_KEY);
    if (guardado === "claro" || guardado === "oscuro") return guardado;
  } catch {
    /* localStorage puede no estar disponible — se sigue con la preferencia del sistema */
  }
  const prefiereOscuro = window.matchMedia?.("(prefers-color-scheme: dark)").matches;
  return prefiereOscuro ? "oscuro" : "claro";
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [tema, setTema] = useState<Tema>(temaInicial);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", tema === "oscuro");
    try {
      localStorage.setItem(STORAGE_KEY, tema);
    } catch {
      /* no pasa nada si no se puede guardar la preferencia */
    }
  }, [tema]);

  const alternarTema = () => setTema((t) => (t === "claro" ? "oscuro" : "claro"));

  return (
    <ThemeContext.Provider value={{ tema, alternarTema }}>{children}</ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme debe usarse dentro de <ThemeProvider>");
  return ctx;
}
