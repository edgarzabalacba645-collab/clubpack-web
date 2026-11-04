import { useState, type FormEvent } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../lib/auth";

type Tab = "login" | "signup";

function IconCatalogo() {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="var(--color-accent)"
      strokeWidth="2.4"
      strokeLinecap="round"
      aria-hidden="true"
      className="shrink-0 mt-0.5"
    >
      <path d="M4 16 L4 10 M9 19 L9 6 M14 16 L14 11 M19 19 L19 4" />
    </svg>
  );
}

function IconCheck() {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="var(--color-accent)"
      strokeWidth="2.4"
      strokeLinecap="round"
      aria-hidden="true"
      className="shrink-0 mt-0.5"
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M9 12 L11 14 L16 9" />
    </svg>
  );
}

function IconMp3() {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="var(--color-accent)"
      strokeWidth="2.4"
      strokeLinecap="round"
      aria-hidden="true"
      className="shrink-0 mt-0.5"
    >
      <path d="M12 3 L12 15 M7 10 L12 15 L17 10" />
      <path d="M5 19 L19 19" />
    </svg>
  );
}

function Feature({
  icon,
  title,
  subtitle,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
}) {
  return (
    <div className="flex items-start gap-3.5">
      {icon}
      <div>
        <div className="font-bold text-[15px]">{title}</div>
        <div className="text-sm text-muted mt-0.5">{subtitle}</div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  const { session, cargando, signIn, signUp } = useAuth();
  const [tab, setTab] = useState<Tab>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mensaje, setMensaje] = useState<string | null>(null);

  // Ya logueado: no mostrar el login.
  if (!cargando && session) return <Navigate to="/catalogo" replace />;

  const isSignup = tab === "signup";

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setMensaje(null);
    setEnviando(true);
    try {
      if (isSignup) {
        const { error, necesitaConfirmacion } = await signUp(email, password);
        if (error) {
          setError(error);
        } else if (necesitaConfirmacion) {
          setMensaje("Listo — revisá tu email para confirmar la cuenta antes de entrar.");
        }
      } else {
        const { error } = await signIn(email, password);
        if (error) setError(error);
      }
    } finally {
      setEnviando(false);
    }
  }

  function tabBtnClass(active: boolean) {
    return [
      "flex-1 py-2.5 rounded-[9px] font-semibold text-sm transition-colors appearance-none border-none cursor-pointer",
      "focus:outline-none focus-visible:ring-2 focus-visible:ring-ink/30",
      active ? "bg-ink text-cream" : "bg-transparent text-muted hover:text-ink",
    ].join(" ");
  }

  return (
    <div className="min-h-screen w-full bg-cream text-ink font-sans">
      {/* Header */}
      <div className="max-w-[1240px] mx-auto px-6 pt-8 flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-baseline gap-0.5 font-display font-extrabold text-[22px] tracking-[-0.5px] leading-none">
          <span>CLUB</span>
          <span>PACK</span>
        </div>
        <div className="text-[13px] text-muted font-medium">
          Catálogo privado · Solo DJs invitados
        </div>
      </div>

      {/* Hero */}
      <div className="max-w-[1240px] mx-auto px-6 pt-14 pb-16 flex flex-wrap gap-14">
        {/* Left: pitch */}
        <div className="flex-[999_1_480px] min-w-0 flex flex-col gap-7 pt-3">
          <div className="inline-flex self-start items-center gap-2 px-3.5 py-1.5 rounded-full bg-ink text-cream text-[13px] font-semibold tracking-[0.2px]">
            Hecho en Argentina
          </div>

          <h1 className="font-display font-extrabold text-[56px] leading-[1.04] tracking-[-1.5px] m-0">
            Tu librería de remixes,
            <br />
            armada entre DJs.
          </h1>

          <p className="max-w-[480px] text-lg leading-[1.55] text-body m-0">
            Subí tus versiones, bajá las de tus amigos. Un catálogo privado de
            remixes y edits hechos acá, sin vueltas.
          </p>

          <div className="flex flex-col gap-[18px] mt-2">
            <Feature
              icon={<IconCatalogo />}
              title="Catálogo colaborativo"
              subtitle="Cada DJ sube sus propias versiones — todo el grupo accede a todo."
            />
            <Feature
              icon={<IconCheck />}
              title="100% remixes argentinos"
              subtitle="Solo versiones hechas acá — nada de bajar de cualquier lado."
            />
            <Feature
              icon={<IconMp3 />}
              title="Siempre en MP3 320"
              subtitle="Subís cualquier formato, se convierte solo. Catálogo parejo."
            />
          </div>
        </div>

        {/* Right: auth card */}
        <div className="flex-[1_1_400px] min-w-0 max-w-[440px]">
          <div
            className="bg-card rounded-[20px] p-9"
            style={{
              boxShadow:
                "0 1px 2px rgba(10,10,12,0.04), 0 16px 40px rgba(10,10,12,0.08)",
            }}
          >
            <div className="flex gap-1 bg-cream p-1 rounded-xl mb-7">
              <button
                type="button"
                onClick={() => {
                  setTab("login");
                  setError(null);
                  setMensaje(null);
                }}
                className={tabBtnClass(!isSignup)}
              >
                Iniciar sesión
              </button>
              <button
                type="button"
                onClick={() => {
                  setTab("signup");
                  setError(null);
                  setMensaje(null);
                }}
                className={tabBtnClass(isSignup)}
              >
                Crear cuenta
              </button>
            </div>

            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <label htmlFor="email" className="text-[13px] font-semibold text-body">
                  Email
                </label>
                <input
                  id="email"
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="vos@ejemplo.com"
                  className="px-3.5 py-3 rounded-[10px] border-[1.5px] border-border text-[15px] font-sans bg-[color:var(--color-cream-soft)] focus:outline-2 focus:outline-accent focus:outline-offset-1"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label htmlFor="password" className="text-[13px] font-semibold text-body">
                  Contraseña
                </label>
                <input
                  id="password"
                  type="password"
                  required
                  minLength={6}
                  autoComplete={isSignup ? "new-password" : "current-password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="px-3.5 py-3 rounded-[10px] border-[1.5px] border-border text-[15px] font-sans bg-[color:var(--color-cream-soft)] focus:outline-2 focus:outline-accent focus:outline-offset-1"
                />
              </div>

              {error && (
                <p role="alert" className="text-sm text-accent font-medium m-0">
                  {error}
                </p>
              )}
              {mensaje && (
                <p className="text-sm text-ink font-medium m-0">{mensaje}</p>
              )}

              <button
                type="submit"
                disabled={enviando}
                className="mt-1.5 py-[13px] rounded-[10px] appearance-none border-none bg-accent text-white text-[15px] font-bold font-sans cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:ring-offset-2"
              >
                {enviando ? "Un momento…" : isSignup ? "Crear cuenta" : "Entrar"}
              </button>
            </form>

            {isSignup && (
              <p className="mt-[18px] text-[12.5px] text-muted-2 leading-[1.5] m-0">
                Un admin del grupo tiene que activar tu suscripción después de
                que te registres.
              </p>
            )}
          </div>

          <p className="mt-4 mx-1 text-[12.5px] text-muted-2 text-center">
            ¿Problemas para entrar? Escribile a un admin del grupo.
          </p>
        </div>
      </div>

      {/* Footer */}
      <div className="border-t border-border-soft mt-6">
        <div className="max-w-[1240px] mx-auto px-6 py-6 flex flex-wrap gap-2 justify-between text-[13px] text-muted-2">
          <div>ClubPack — hecho por DJs, para DJs.</div>
          <div>Catálogo cerrado · uso privado del grupo</div>
        </div>
      </div>
    </div>
  );
}
