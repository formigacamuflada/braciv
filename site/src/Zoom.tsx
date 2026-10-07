// Botões de zoom usados na roda e no grafo
export default function BotoesZoom({ mais, menos, inicio }: { mais: () => void; menos: () => void; inicio: () => void }) {
  const b = "grid h-9 w-9 place-items-center text-lg leading-none text-stone-600 hover:bg-stone-100 hover:text-stone-900 dark:text-stone-300 dark:hover:bg-stone-800 dark:hover:text-white";
  return (
    <div className="absolute left-3 top-3 z-10 flex flex-col overflow-hidden rounded-lg border border-stone-300 bg-white/90 shadow-sm backdrop-blur dark:border-stone-700 dark:bg-stone-900/90"
      onClick={(e) => e.stopPropagation()}>
      <button className={b} onClick={mais} aria-label="Aproximar" title="Aproximar">+</button>
      <button className={`${b} border-y border-stone-200 dark:border-stone-700`} onClick={menos} aria-label="Afastar" title="Afastar">−</button>
      <button className={`${b} text-sm`} onClick={inicio} aria-label="Ver a roda inteira" title="Ver tudo">⤢</button>
    </div>
  );
}
