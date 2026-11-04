export default function PlaceholderPage({
  titulo,
  descripcion,
}: {
  titulo: string;
  descripcion: string;
}) {
  return (
    <div className="flex flex-col items-start gap-3 py-10">
      <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-ink text-cream text-xs font-semibold">
        Próximamente
      </div>
      <h1 className="font-display font-extrabold text-3xl tracking-[-0.5px] m-0">
        {titulo}
      </h1>
      <p className="text-body text-base leading-relaxed max-w-xl m-0">
        {descripcion}
      </p>
    </div>
  );
}
