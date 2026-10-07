import { useEffect, useMemo, useState } from "react";
import { carregaPorUf, carregaUfs, type Feicao, type Parlamentar, type PorUf } from "./dados";
import Hemiciclo from "./Hemiciclo";
import { corPartido, notaPartido } from "./partidos";


type Props = {
  uf: string | null;
  aoEscolherUf: (uf: string | null) => void;
  aoAbrirNo: (id: string) => void;
};

// projeção de Mercator ajustada à caixa do Brasil
function projetor(feicoes: Feicao[], L = 620, A = 620) {
  const merc = ([lon, lat]: number[]) => [lon, -Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360)) * (180 / Math.PI)];
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  const anel = (f: Feicao) => (f.geometry.type === "Polygon" ? [f.geometry.coordinates] : f.geometry.coordinates) as number[][][][];
  for (const f of feicoes) for (const pol of anel(f)) for (const r of pol) for (const p of r) {
    const [x, y] = merc(p); x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
  }
  const k = Math.min(L / (x1 - x0), A / (y1 - y0));
  const dx = (L - (x1 - x0) * k) / 2, dy = (A - (y1 - y0) * k) / 2;
  const proj = (p: number[]) => { const [x, y] = merc(p); return [(x - x0) * k + dx, (y - y0) * k + dy]; };
  return feicoes.map((f) => {
    let d = "", maior = 0, centro = [0, 0];
    for (const pol of anel(f)) {
      const pts = pol[0].map(proj);
      d += pol.map((r) => "M" + r.map(proj).map((q) => q.map((v) => v.toFixed(1)).join(",")).join("L") + "Z").join("");
      // centro do maior polígono, para a sigla
      let area = 0, cx = 0, cy = 0;
      for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
        const c = pts[j][0] * pts[i][1] - pts[i][0] * pts[j][1];
        area += c; cx += (pts[j][0] + pts[i][0]) * c; cy += (pts[j][1] + pts[i][1]) * c;
      }
      if (Math.abs(area) > maior) { maior = Math.abs(area); centro = [cx / (3 * area), cy / (3 * area)]; }
    }
    return { sigla: f.properties.sigla, nome: f.properties.nome, regiao: f.properties.regiao, d, centro };
  });
}

function Foto({ p, tamanho = 44, aoClicar }: { p: Parlamentar; tamanho?: number; aoClicar?: () => void }) {
  const [erro, setErro] = useState(false);
  const iniciais = p.nome.split(/\s+/).filter((x) => x.length > 2).slice(0, 2).map((x) => x[0]).join("");
  return (
    <button onClick={aoClicar} title={`${p.nome}${p.partido ? ` · ${p.partido}` : ""}`}
      className="group relative shrink-0 overflow-hidden rounded-md bg-stone-200 hover:opacity-80 dark:bg-stone-800"
      style={{ width: tamanho, height: tamanho * 1.2, boxShadow: `0 0 0 2px ${p.partido ? corPartido(p.partido) : "#78716c"}` }}>
      {p.foto && !erro
        ? <img src={p.foto} alt={p.nome} loading="lazy" onError={() => setErro(true)} className="h-full w-full object-cover" />
        : <span className="grid h-full w-full place-items-center text-xs font-semibold text-stone-500">{iniciais}</span>}
    </button>
  );
}

function Pessoas({ lista, tamanho, aoAbrirNo }: { lista: Parlamentar[]; tamanho: number; aoAbrirNo: (id: string) => void }) {
  return <div className="flex flex-wrap gap-2 p-0.5">{[...lista].sort((a, b) => notaPartido(a.partido) - notaPartido(b.partido) || a.nome.localeCompare(b.nome)).map((p) => <Foto key={p.id} p={p} tamanho={tamanho} aoClicar={() => aoAbrirNo(p.id)} />)}</div>;
}


export default function Mapa({ uf, aoEscolherUf, aoAbrirNo }: Props) {
  const [geo, setGeo] = useState<{ features: Feicao[] } | null>(null);
  const [dados, setDados] = useState<PorUf | null>(null);
  const [casa, setCasa] = useState<"camara" | "senado">("camara");
  const [hover, setHover] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  useEffect(() => { carregaUfs().then(setGeo).catch((e) => setErro(String(e))); carregaPorUf().then(setDados).catch((e) => setErro(String(e))); }, []);

  const formas = useMemo(() => (geo ? projetor(geo.features) : []), [geo]);
  // partido com mais cadeiras no Congresso (deputados + senadores) em cada estado
  const lider = useMemo(() => {
    const m: Record<string, { partido: string; n: number; total: number; empate: boolean }> = {};
    for (const [sigla, d] of Object.entries(dados?.ufs ?? {})) {
      const c = new Map<string, number>();
      for (const p of [...d.deputados, ...d.senadores]) c.set(p.partido ?? "?", (c.get(p.partido ?? "?") ?? 0) + 1);
      const ord = [...c.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
      if (ord.length) m[sigla] = { partido: ord[0][0], n: ord[0][1], total: d.deputados.length + d.senadores.length, empate: ord.length > 1 && ord[1][1] === ord[0][1] };
    }
    return m;
  }, [dados]);
  const legenda = useMemo(() => {
    const c = new Map<string, number>();
    for (const l of Object.values(lider)) c.set(l.partido, (c.get(l.partido) ?? 0) + 1);
    return [...c.entries()].sort((a, b) => notaPartido(a[0]) - notaPartido(b[0]));
  }, [lider]);
  const todos = useMemo(() => {
    const v = Object.values(dados?.ufs ?? {});
    return { senado: v.flatMap((d) => d.senadores), camara: v.flatMap((d) => d.deputados) };
  }, [dados]);

  if (erro) return <p className="absolute inset-0 grid place-items-center text-sm text-red-700">{erro}</p>;
  if (!geo || !dados) return <p className="absolute inset-0 grid place-items-center text-sm text-stone-500">Carregando o mapa…</p>;
  const atual = uf ? dados.ufs[uf] : null;
  const nomeUf = formas.find((f) => f.sigla === uf)?.nome;
  const hl = hover ? lider[hover] : null;

  return (
    <div className="absolute inset-0 flex flex-col lg:flex-row">
      <div className="relative min-h-[48vh] flex-1">
        <svg viewBox="0 0 620 620" className="absolute inset-0 h-full w-full p-4" onClick={() => aoEscolherUf(null)} role="img" aria-label="Mapa do Brasil: partido com mais cadeiras no Congresso em cada estado">
          {formas.map((f) => {
            const l = lider[f.sigla];
            const sel = uf === f.sigla, over = hover === f.sigla;
            return (
              <g key={f.sigla} style={{ cursor: "pointer" }}
                onClick={(e) => { e.stopPropagation(); aoEscolherUf(sel ? null : f.sigla); }}
                onMouseEnter={() => setHover(f.sigla)} onMouseLeave={() => setHover(null)}>
                <path d={f.d} fill={l ? corPartido(l.partido) : "#57534e"} fillOpacity={uf && !sel ? 0.35 : 0.85}
                  stroke={sel || over ? "currentColor" : "#0c0a09"} strokeOpacity={sel || over ? 0.95 : 0.6} strokeWidth={sel ? 2.2 : over ? 1.6 : 0.6}
                  className="text-stone-900 transition-[fill-opacity] dark:text-white" />
                <text x={f.centro[0]} y={f.centro[1] + 3.5} textAnchor="middle" fontSize="10" fontWeight="700" pointerEvents="none" fill="#0c0a09" fillOpacity={0.8}>{f.sigla}</text>
              </g>
            );
          })}
        </svg>
        <div className="absolute left-3 top-3 max-w-56 rounded-lg bg-white/85 p-2.5 text-xs backdrop-blur dark:bg-stone-900/85">
          <p className="font-semibold">Partido com mais cadeiras no Congresso</p>
          <p className="text-stone-500">deputados federais + senadores, por estado</p>
          <ul className="mt-1.5 flex flex-wrap gap-x-2.5 gap-y-1">
            {legenda.map(([p, n]) => <li key={p} className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: corPartido(p) }} />{p} <span className="text-stone-500">{n}</span></li>)}
          </ul>
        </div>
        {hover && hl && (
          <div className="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 rounded-md px-2 py-0.5 text-xs font-medium" style={{ background: corPartido(hl.partido) + "33", color: corPartido(hl.partido), border: `1px solid ${corPartido(hl.partido)}88` }}>
            {formas.find((f) => f.sigla === hover)?.nome} · {hl.partido} {hl.n} de {hl.total}{hl.empate ? " (empate)" : ""}
          </div>
        )}
      </div>

      <aside className="max-h-[52vh] overflow-y-auto border-t border-stone-200 bg-white p-5 lg:max-h-none lg:w-[440px] lg:border-l lg:border-t-0 dark:border-stone-800 dark:bg-stone-900">
        {!atual ? (
          <>
            <p className="text-xs font-medium uppercase tracking-wide text-stone-500">Brasil</p>
            <h2 className="mt-1 text-xl font-semibold">Congresso Nacional</h2>
            <div className="mt-3 inline-flex rounded-lg bg-stone-100 p-0.5 text-sm dark:bg-stone-800">
              {(["camara", "senado"] as const).map((c) => (
                <button key={c} onClick={() => setCasa(c)} className={`rounded-md px-3 py-1 ${casa === c ? "bg-white font-medium shadow-sm dark:bg-stone-700" : "text-stone-500"}`}>
                  {c === "camara" ? "Câmara" : "Senado"}
                </button>
              ))}
            </div>
            <div className="mt-4">
              <Hemiciclo pessoas={casa === "camara" ? todos.camara : todos.senado} titulo={casa === "camara" ? "Câmara dos Deputados" : "Senado Federal"} aoAbrir={aoAbrirNo} />
            </div>
            <section className="mt-6">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-stone-500">Presidência e Ministérios (Planalto)</h3>
              <ul className="mt-2 space-y-1.5">
                {dados.nacional.map((n) => (
                  <li key={n.cargo}>
                    <button onClick={() => n.orgaoCodigo && aoAbrirNo(`u:${n.orgaoCodigo}`)} className="flex w-full items-center gap-2.5 rounded-lg border border-stone-200 p-2 text-left hover:border-stone-400 dark:border-stone-700 dark:hover:border-stone-500">
                      <Foto p={{ id: n.cargo, nome: n.nome }} tamanho={30} />
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium">{n.nome}</span>
                        <span className="block truncate text-xs text-stone-500">{n.cargo}</span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          </>
        ) : (
          <>
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-stone-500">Estado</p>
                <h2 className="mt-1 text-xl font-semibold">{nomeUf} <span className="text-stone-500">· {uf}</span></h2>
              </div>
              <button onClick={() => aoEscolherUf(null)} aria-label="Fechar" className="rounded-md px-2 py-1 text-stone-500 hover:bg-stone-200 dark:hover:bg-stone-800">✕</button>
            </div>
            <section className="mt-4">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-stone-500">Senadores</h3>
              <ul className="mt-2 space-y-1.5">
                {atual.senadores.map((s) => (
                  <li key={s.id}>
                    <button onClick={() => aoAbrirNo(s.id)} className="flex w-full items-center gap-2.5 rounded-lg border border-stone-200 p-2 text-left hover:border-stone-400 dark:border-stone-700">
                      <Foto p={s} tamanho={34} />
                      <span><span className="block text-sm font-medium">{s.nome}</span><span className="text-xs font-semibold" style={{ color: corPartido(s.partido) }}>{s.partido}</span></span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
            <div className="mt-6">
              <Hemiciclo pessoas={atual.deputados} titulo={`Deputados federais por ${nomeUf}`} aoAbrir={aoAbrirNo} />
            </div>
            <div className="mt-3"><Pessoas lista={atual.deputados} tamanho={34} aoAbrirNo={aoAbrirNo} /></div>
            {!!atual.sedes.length && (
              <section className="mt-6">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-stone-500">Órgãos federais com sede no estado ({atual.sedes.length})</h3>
                <ul className="mt-2 space-y-1 text-sm">
                  {atual.sedes.map((s) => (
                    <li key={s.codigo}><button onClick={() => aoAbrirNo(`u:${s.codigo}`)} className="text-left underline decoration-stone-300 underline-offset-2 dark:decoration-stone-600">{s.nome}</button></li>
                  ))}
                </ul>
              </section>
            )}
          </>
        )}
      </aside>
    </div>
  );
}
