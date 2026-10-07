import { useMemo, useState } from "react";
import { corPartido, notaPartido, campo, COR_CAMPO, PARTIDOS, FONTE_IDEOLOGIA, type Campo } from "./partidos";
import type { Parlamentar } from "./dados";

// Cadeiras em semicírculo, da esquerda para a direita conforme a posição ideológica do partido
function lugares(n: number) {
  if (!n) return [];
  const linhas = Math.max(1, Math.round(Math.sqrt(n / 1.6)));
  const r0 = 0.42, r1 = 1;
  const raios = Array.from({ length: linhas }, (_, i) => (linhas === 1 ? 0.8 : r0 + ((r1 - r0) * i) / (linhas - 1)));
  const somaR = raios.reduce((s, r) => s + r, 0);
  const porLinha = raios.map((r) => Math.max(1, Math.round((n * r) / somaR)));
  let dif = n - porLinha.reduce((s, x) => s + x, 0);
  for (let i = porLinha.length - 1; dif !== 0; i = (i - 1 + porLinha.length) % porLinha.length) { porLinha[i] += Math.sign(dif); dif -= Math.sign(dif); }
  const pts: { x: number; y: number; a: number }[] = [];
  raios.forEach((r, i) => {
    const k = porLinha[i];
    for (let j = 0; j < k; j++) {
      const a = Math.PI - (k === 1 ? Math.PI / 2 : (Math.PI * j) / (k - 1));
      pts.push({ x: r * Math.cos(a), y: -r * Math.sin(a), a });
    }
  });
  return pts.sort((p, q) => q.a - p.a);   // da esquerda (ângulo π) para a direita (0)
}

export default function Hemiciclo({ pessoas, titulo, aoAbrir, quadrado = false, semTitulo = false }: { pessoas: Parlamentar[]; titulo: string; aoAbrir: (id: string) => void; quadrado?: boolean; semTitulo?: boolean }) {
  const [hover, setHover] = useState<Parlamentar | null>(null);
  const ordem = useMemo(() => [...pessoas].sort((a, b) => notaPartido(a.partido) - notaPartido(b.partido) || (a.partido ?? "").localeCompare(b.partido ?? "") || a.nome.localeCompare(b.nome)), [pessoas]);
  const pts = useMemo(() => lugares(ordem.length), [ordem.length]);
  const campos = useMemo(() => {
    const c: Record<Campo, number> = { Esquerda: 0, Centro: 0, Direita: 0, "Sem classificação": 0 };
    for (const p of pessoas) c[campo(p.partido)]++;
    return c;
  }, [pessoas]);
  const porPartido = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of pessoas) m.set(p.partido ?? "?", (m.get(p.partido ?? "?") ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [pessoas]);
  const tam = ordem.length > 200 ? 0.026 : ordem.length > 40 ? 0.04 : 0.07;
  const total = pessoas.length;

  return (
    <section>
      {!semTitulo && (
        <div className="flex items-baseline justify-between">
          <h3 className="text-sm font-semibold">{titulo}</h3>
          <span className="text-xs text-stone-500">{total} cadeiras</span>
        </div>
      )}
      {/* barra esquerda / centro / direita */}
      <div className="mt-3 flex items-end justify-between text-xs">
        <span><span className="text-stone-500">Esquerda</span> <b className="text-base">{campos.Esquerda}</b></span>
        <span><span className="text-stone-500">Centro</span> <b className="text-base">{campos.Centro}</b></span>
        <span><b className="text-base">{campos.Direita}</b> <span className="text-stone-500">Direita</span></span>
      </div>
      <div className="mt-1 flex h-1.5 overflow-hidden rounded-full">
        {(["Esquerda", "Centro", "Sem classificação", "Direita"] as Campo[]).map((c) => (
          <span key={c} style={{ width: `${(100 * campos[c]) / Math.max(1, total)}%`, background: COR_CAMPO[c] }} />
        ))}
      </div>
      <div className="relative mt-3">
        <svg viewBox="-1.08 -1.08 2.16 1.16" className="w-full">
          {ordem.map((p, i) => {
            const q = pts[i];
            const comum = { fill: corPartido(p.partido), style: { cursor: "pointer" }, opacity: hover && hover.partido !== p.partido ? 0.35 : 1,
              onMouseEnter: () => setHover(p), onMouseLeave: () => setHover(null), onClick: () => aoAbrir(p.id) };
            return quadrado
              ? <rect key={p.id} x={q.x - tam * 1.15} y={q.y - tam * 0.85} width={tam * 2.3} height={tam * 1.7} rx={tam * 0.35} {...comum} />
              : <circle key={p.id} cx={q.x} cy={q.y} r={tam} {...comum} />;
          })}
          <text x="0" y="-0.12" textAnchor="middle" fontSize="0.2" fontWeight="700" className="fill-stone-900 dark:fill-white">{total}</text>
        </svg>
        {hover && (
          <div className="pointer-events-none absolute left-1/2 top-1 -translate-x-1/2 rounded-md px-2 py-0.5 text-xs font-medium" style={{ background: corPartido(hover.partido) + "33", color: corPartido(hover.partido), border: `1px solid ${corPartido(hover.partido)}88` }}>
            {hover.nome} · {hover.partido}
          </div>
        )}
      </div>
      <p className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs">
        {porPartido.map(([s, n]) => (
          <span key={s} className="flex items-center gap-1" title={PARTIDOS[s]?.obs ?? ""}>
            <span className="h-2 w-2 rounded-full" style={{ background: corPartido(s) }} />{s} <b>{n}</b>
          </span>
        ))}
      </p>
      <p className="mt-1.5 text-[11px] leading-snug text-stone-500">
        Ordem da esquerda para a direita pela classificação de <a className="underline" href={FONTE_IDEOLOGIA} target="_blank" rel="noreferrer">Bolognesi, Ribeiro e Codato (DADOS, 2023)</a>.
      </p>
    </section>
  );
}
