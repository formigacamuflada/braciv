import { useEffect, useMemo, useState } from "react";
import { carregaVagas, type VagaOrgao } from "./dados";

// Treemap "squarified": retângulos com área proporcional às vagas previstas no SIORG
type Ret = { x: number; y: number; w: number; h: number };
function squarify<T>(itens: { v: number; d: T }[], r: Ret): (Ret & { d: T })[] {
  const saida: (Ret & { d: T })[] = [];
  const total = itens.reduce((s, i) => s + i.v, 0);
  if (!total) return saida;
  let rest = [...itens].sort((a, b) => b.v - a.v);
  let { x, y, w, h } = r;
  const escala = (w * h) / total;
  while (rest.length) {
    const lado = Math.min(w, h);
    let linha: typeof rest = [], pior = Infinity;
    for (const it of rest) {
      const teste = [...linha, it];
      const soma = teste.reduce((s, i) => s + i.v * escala, 0);
      const mx = Math.max(...teste.map((i) => i.v * escala)), mn = Math.min(...teste.map((i) => i.v * escala));
      const p = Math.max((lado * lado * mx) / (soma * soma), (soma * soma) / (lado * lado * mn));
      if (p > pior) break;
      pior = p; linha = teste;
    }
    const soma = linha.reduce((s, i) => s + i.v * escala, 0);
    const espessura = soma / lado;
    let pos = 0;
    for (const it of linha) {
      const comp = (it.v * escala) / espessura;
      if (w >= h) saida.push({ x, y: y + pos, w: espessura, h: comp, d: it.d });
      else saida.push({ x: x + pos, y, w: comp, h: espessura, d: it.d });
      pos += comp;
    }
    if (w >= h) { x += espessura; w -= espessura; } else { y += espessura; h -= espessura; }
    rest = rest.slice(linha.length);
  }
  return saida;
}

// cor: quanto das vagas está ocupado (vermelho = muitas vagas sem ocupante identificado)
function corOcupacao(t: number) {
  const c = Math.max(0, Math.min(1, t));
  const de = [240, 100, 75], ate = [63, 191, 159];
  const m = de.map((v, i) => Math.round(v + (ate[i] - v) * c));
  return `rgb(${m.join(",")})`;
}

export default function Vagas({ aoAbrirOrgao }: { aoAbrirOrgao: (codigo: number) => void }) {
  const [lista, setLista] = useState<VagaOrgao[] | null>(null);
  const [hover, setHover] = useState<VagaOrgao | null>(null);
  useEffect(() => { carregaVagas().then(setLista).catch(() => setLista([])); }, []);

  const W = 1000, H = 620;
  const blocos = useMemo(() => {
    if (!lista) return [];
    // 1º nível: ministério (ou o próprio órgão, fora do Executivo); 2º nível: órgãos e entidades dele
    const grupos = new Map<string, VagaOrgao[]>();
    for (const o of lista) {
      const g = o.siglaMinisterio ?? (o.poder && o.poder !== "Executivo" ? o.poder : "Outros");
      if (!grupos.has(g)) grupos.set(g, []);
      grupos.get(g)!.push(o);
    }
    const nivel1 = squarify([...grupos.entries()].map(([g, os]) => ({ v: os.reduce((s, o) => s + o.previstas, 0), d: { g, os } })), { x: 0, y: 0, w: W, h: H });
    return nivel1.map((b) => ({ ...b, filhos: squarify(b.d.os.map((o) => ({ v: o.previstas, d: o })), { x: b.x + 1.5, y: b.y + 14, w: Math.max(0, b.w - 3), h: Math.max(0, b.h - 15.5) }) }));
  }, [lista]);

  if (!lista) return <p className="p-6 text-sm text-stone-500">Carregando…</p>;
  const tp = lista.reduce((s, o) => s + o.previstas, 0), to = lista.reduce((s, o) => s + Math.min(o.ocupadas, o.previstas), 0);

  return (
    <div className="flex h-full flex-col p-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Vagas × ocupados</h2>
          <p className="max-w-2xl text-sm text-stone-500">
            Área = cargos e funções de confiança previstos no SIORG. Cor = parte deles com ocupante identificado no Portal da Transparência
            ({Math.round((100 * to) / tp)}% no total). Vermelho pode ser vaga de fato ou pessoa que o Portal registra em outro órgão.
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs text-stone-500">
          <span>0%</span><span className="h-2.5 w-32 rounded" style={{ background: `linear-gradient(90deg, ${corOcupacao(0)}, ${corOcupacao(0.5)}, ${corOcupacao(1)})` }} /><span>100% ocupado</span>
        </div>
      </div>
      <div className="relative mt-3 min-h-0 flex-1">
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="h-full w-full">
          {blocos.map((b, i) => (
            <g key={i}>
              <rect x={b.x} y={b.y} width={b.w} height={b.h} className="fill-stone-200 dark:fill-stone-800" stroke="currentColor" strokeOpacity={0.15} />
              {b.w > 40 && <text x={b.x + 4} y={b.y + 11} fontSize="9.5" fontWeight="700" className="fill-stone-700 dark:fill-stone-300">{b.d.g}</text>}
              {b.filhos.map((f) => {
                const o = f.d;
                return (
                  <g key={o.codigo} onMouseEnter={() => setHover(o)} onMouseLeave={() => setHover(null)} onClick={() => aoAbrirOrgao(o.codigo)} style={{ cursor: "pointer" }}>
                    <rect x={f.x + 0.5} y={f.y + 0.5} width={Math.max(0, f.w - 1)} height={Math.max(0, f.h - 1)} rx={1.5}
                      fill={corOcupacao(o.ocupadas / Math.max(1, o.previstas))} fillOpacity={hover?.codigo === o.codigo ? 1 : 0.8} />
                    {f.w > 34 && f.h > 14 && <text x={f.x + 3} y={f.y + 10} fontSize="8.5" fontWeight="600" fill="#1c1917" pointerEvents="none">{o.sigla}</text>}
                  </g>
                );
              })}
            </g>
          ))}
        </svg>
        {hover && (
          <div className="pointer-events-none absolute right-2 top-2 w-72 rounded-lg border border-stone-200 bg-white/95 p-3 text-xs shadow-lg dark:border-stone-700 dark:bg-stone-900/95">
            <p className="text-sm font-semibold">{hover.nome}</p>
            <p className="text-stone-500">{hover.sigla}{hover.siglaMinisterio && hover.siglaMinisterio !== hover.sigla ? ` · vinculado a ${hover.siglaMinisterio}` : ""}</p>
            <p className="mt-1.5">{hover.previstas.toLocaleString("pt-BR")} previstos · {hover.ocupadas.toLocaleString("pt-BR")} com ocupante ({Math.round((100 * hover.ocupadas) / Math.max(1, hover.previstas))}%)</p>
            <table className="mt-1.5 w-full">
              <tbody>
                {Object.entries(hover.porCodigo).slice(0, 8).map(([k, [p, o]]) => (
                  <tr key={k}><td className="pr-2">{k}</td><td className="text-right text-stone-500">{o}/{p}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
