import { useTheme } from "../lib/theme";

export default function BotonTema({ className = "" }: { className?: string }) {
  const { tema, alternarTema } = useTheme();
  const esOscuro = tema === "oscuro";
  return (
    <button
      type="button"
      onClick={alternarTema}
      aria-label={esOscuro ? "Cambiar a modo claro" : "Cambiar a modo oscuro"}
      title={esOscuro ? "Modo claro" : "Modo oscuro"}
      className={`w-9 h-9 rounded-lg border border-border hover:border-ink transition-colors appearance-none bg-transparent cursor-pointer flex items-center justify-center focus:outline-none focus-visible:ring-2 focus-visible:ring-ink/30 ${className}`}
    >
      {esOscuro ? (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="4.5" />
          <path d="M12 2.5v2.5M12 19v2.5M4.5 12H2M22 12h-2.5M5.3 5.3l1.8 1.8M18.7 5.3l-1.8 1.8M5.3 18.7l1.8-1.8M18.7 18.7l-1.8-1.8" />
        </svg>
      ) : (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" />
        </svg>
      )}
    </button>
  );
}
