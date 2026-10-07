import { useEffect, useMemo, useState } from "react";
import { carregaPorUf, carregaUfs, type DadosUf, type Feicao, type Parlamentar, type PorUf } from "./dados";

export type Camada = "camara" | "senado" | "executivo" | "sedes";
const CAMADAS: { id: Camada; rotulo: string; cor: string }[] = [
  { id: "executivo", rotulo: "Executivo federal", cor: "#8b8cf0" },
  { id: "camara", rotulo: "Câmara", cor: "#f0644b" },
  { id: "senado", rotulo: "Senado", cor: "#f59e0b" },
  { id: "sedes", rotulo: "Sedes de órgãos", cor: "#3fbf9f" },
];

type Props = {
  uf: string | null;
  aoEscolherUf: (uf: string | null) => void;
  aoAbrirCargo: (orgao: number, cargoId: string) => void;
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
      className="group relative shrink-0 overflow-hidden rounded-md bg-stone-200 ring-1 ring-stone-300 hover:ring-2 hover:ring-stone-500 dark:bg-stone-800 dark:ring-stone-700"
      style={{ width: tamanho, height: tamanho * 1.2 }}>
      {p.foto && !erro
        ? <img src={p.foto} alt={p.nome} loading="lazy" onError={() => setErro(true)} className="h-full w-full object-cover" />
        : <span className="grid h-full w-full place-items-center text-xs font-semibold text-stone-500">{iniciais}</span>}
    </button>
  );
}

function Pessoas({ lista, tamanho, aoAbrirNo }: { lista: Parlamentar[]; tamanho: number; aoAbrirNo: (id: string) => void }) {
  return <div className="flex flex-wrap gap-1.5">{lista.map((p) => <Foto key={p.id} p={p} tamanho={tamanho} aoClicar={() => aoAbrirNo(p.id)} />)}</div>;
}

function partidos(lista: Parlamentar[]) {
  const c = new Map<string, number>();
  for (const p of lista) c.set(p.partido ?? "?", (c.get(p.partido ?? "?") ?? 0) + 1);
  return [...c.entries()].sort((a, b) => b[1] - a[1]);
}

export default function Mapa({ uf, aoEscolherUf, aoAbrirCargo, aoAbrirNo }: Props) {
  const [geo, setGeo] = useState<{ features: Feicao[] } | null>(null);
  const [dados, setDados] = useState<PorUf | null>(null);
  const [camada, setCamada] = useState<Camada>("executivo");
  const [hover, setHover] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  useEffect(() => { carregaUfs().then(setGeo).catch((e) => setErro(String(e))); carregaPorUf().then(setDados).catch((e) => setErro(String(e))); }, []);

  const formas = useMemo(() => (geo ? projetor(geo.features) : []), [geo]);
  const valor = (d?: DadosUf) => !d ? 0 : camada === "camara" ? d.deputados.length : camada === "senado" ? d.senadores.length : camada === "sedes" ? d.sedes.length : d.ocupantes;
  const maximo = useMemo(() => Math.max(1, ...Object.values(dados?.ufs ?? {}).map(valor)), [dados, camada]);
  const cor = CAMADAS.find((c) => c.id === camada)!.cor;
  const intensidade = (v: number) => (maximo <= 1 ? 0.35 : 0.12 + 0.78 * (Math.log1p(v) / Math.log1p(maximo)));  // escala log: o DF não apaga o resto
  const unidadeValor = camada === "camara" ? "deputados" : camada === "senado" ? "senadores" : camada === "sedes" ? "órgãos com sede" : "pessoas com cargo federal";
  const atual = uf && dados ? dados.ufs[uf] : null;
  const nomeUf = formas.find((f) => f.sigla === uf)?.nome;

  const todos = useMemo(() => {
    if (!dados) return { senado: [], camara: [] as Parlamentar[] };
    const v = Object.values(dados.ufs);
    return { senado: v.flatMap((d) => d.senadores), camara: v.flatMap((d) => d.deputados) };
  }, [dados]);

  if (erro) return <p className="absolute inset-0 grid place-items-center text-sm text-red-700">{erro}</p>;
  if (!geo || !dados) return <p className="absolute inset-0 grid place-items-center text-sm text-stone-500">Carregando o mapa…</p>;

  return (
    <div className="absolute inset-0 flex flex-col lg:flex-row">
      {/* mapa */}
      <div className="relative min-h-[48vh] flex-1">
        <div className="absolute left-3 right-3 top-3 z-10 flex flex-wrap gap-1.5">
          {CAMADAS.map((c) => (
            <button key={c.id} onClick={() => setCamada(c.id)}
              className={`rounded-full border px-3 py-1 text-xs font-medium ${camada === c.id ? "text-stone-950" : "border-stone-300 text-stone-600 hover:text-stone-900 dark:border-stone-700 dark:text-stone-300 dark:hover:text-white"}`}
              style={camada === c.id ? { background: c.cor, borderColor: c.cor } : undefined}>
              {c.rotulo}
            </button>
          ))}
        </div>
        <svg viewBox="0 0 620 620" className="absolute inset-0 h-full w-full p-4 pt-12" onClick={() => aoEscolherUf(null)} role="img" aria-label="Mapa do Brasil por estado">
          {formas.map((f) => {
            const v = valor(dados.ufs[f.sigla]);
            const sel = uf === f.sigla, over = hover === f.sigla;
            return (
              <g key={f.sigla} style={{ cursor: "pointer" }}
                onClick={(e) => { e.stopPropagation(); aoEscolherUf(sel ? null : f.sigla); }}
                onMouseEnter={() => setHover(f.sigla)} onMouseLeave={() => setHover(null)}>
                <path d={f.d} fill={cor} fillOpacity={intensidade(v) * (uf && !sel ? 0.45 : 1)}
                  stroke={sel || over ? "currentColor" : "#0c0a09"} strokeOpacity={sel || over ? 0.9 : 0.55} strokeWidth={sel ? 2 : over ? 1.5 : 0.6}
                  className="text-stone-900 transition-[fill-opacity] dark:text-white" />
                <text x={f.centro[0]} y={f.centro[1] + 3.5} textAnchor="middle" fontSize="10" fontWeight="600" pointerEvents="none"
                  className="fill-stone-900 dark:fill-white" fillOpacity={0.85}>{f.sigla}</text>
              </g>
            );
          })}
        </svg>
        {hover && (
          <div className="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 rounded-md px-2 py-0.5 text-xs font-medium" style={{ background: cor + "33", color: cor, border: `1px solid ${cor}66` }}>
            {formas.find((f) => f.sigla === hover)?.nome} · {valor(dados.ufs[hover]).toLocaleString("pt-BR")} {unidadeValor}
          </div>
        )}
      </div>

      {/* painel: o estado escolhido, ou o Brasil inteiro */}
      <aside className="max-h-[52vh] overflow-y-auto border-t border-stone-200 bg-white p-5 lg:max-h-none lg:w-[420px] lg:border-l lg:border-t-0 dark:border-stone-800 dark:bg-stone-900">
        {!atual ? (
          <>
            <p className="text-xs font-medium uppercase tracking-wide text-stone-500">Brasil · nacional</p>
            <h2 className="mt-1 text-xl font-semibold">{CAMADAS.find((c) => c.id === camada)!.rotulo}</h2>
            <p className="mt-1 text-sm text-stone-500">Clique num estado para ver quem representa e quem trabalha nele.</p>
            {camada === "executivo" && (
              <section className="mt-4">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-stone-500">Presidência e Ministérios (Planalto)</h3>
                <ul className="mt-2 grid grid-cols-1 gap-1.5 sm:grid-cols-2 lg:grid-cols-1">
                  {dados.nacional.map((n) => (
                    <li key={n.cargo}>
                      <button onClick={() => n.orgaoCodigo && aoAbrirNo(`u:${n.orgaoCodigo}`)} className="flex w-full items-center gap-2.5 rounded-lg border border-stone-200 p-2 text-left hover:border-stone-400 dark:border-stone-700 dark:hover:border-stone-500">
                        <Foto p={{ id: n.cargo, nome: n.nome }} tamanho={34} />
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-medium">{n.nome}</span>
                          <span className="block truncate text-xs text-stone-500">{n.cargo}</span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            )}
            {camada === "senado" && <section className="mt-4"><Pessoas lista={todos.senado} tamanho={40} aoAbrirNo={aoAbrirNo} /></section>}
            {camada === "camara" && <section className="mt-4"><Pessoas lista={todos.camara} tamanho={28} aoAbrirNo={aoAbrirNo} /></section>}
            {camada === "sedes" && <p className="mt-4 text-sm text-stone-500">Órgãos e entidades federais pela UF do endereço da sede no SIORG.</p>}
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

            <section className="mt-5">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-stone-500">Senadores ({atual.senadores.length})</h3>
              <ul className="mt-2 space-y-1.5">
                {atual.senadores.map((s) => (
                  <li key={s.id}>
                    <button onClick={() => aoAbrirNo(s.id)} className="flex w-full items-center gap-2.5 rounded-lg border border-stone-200 p-2 text-left hover:border-stone-400 dark:border-stone-700">
                      <Foto p={s} tamanho={36} />
                      <span><span className="block text-sm font-medium">{s.nome}</span><span className="text-xs text-stone-500">{s.partido}</span></span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>

            <section className="mt-5">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-stone-500">Deputados federais ({atual.deputados.length})</h3>
              <p className="mt-1.5 flex flex-wrap gap-1 text-xs">
                {partidos(atual.deputados).map(([p, n]) => <span key={p} className="rounded bg-stone-200 px-1.5 py-0.5 dark:bg-stone-800">{p} {n}</span>)}
              </p>
              <div className="mt-2"><Pessoas lista={atual.deputados} tamanho={30} aoAbrirNo={aoAbrirNo} /></div>
            </section>

            <section className="mt-5">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-stone-500">Executivo federal no estado</h3>
              <p className="mt-1 text-sm">{atual.ocupantes.toLocaleString("pt-BR")} pessoas em {atual.cargos.toLocaleString("pt-BR")} cargos e funções de confiança</p>
              <ul className="mt-2 space-y-1 text-xs">
                {Object.entries(atual.porOrgao).slice(0, 8).map(([o, n]) => (
                  <li key={o} className="flex items-center gap-2">
                    <span className="w-24 shrink-0 truncate">{o}</span>
                    <span className="h-2 rounded-sm" style={{ width: `${(n / Math.max(...Object.values(atual.porOrgao))) * 60}%`, background: "#8b8cf0" }} />
                    <span className="text-stone-500">{n}</span>
                  </li>
                ))}
              </ul>
              <h4 className="mt-3 text-xs font-semibold text-stone-500">Cargos mais altos exercidos aqui</h4>
              <ul className="mt-1.5 space-y-1.5 text-sm">
                {atual.destaques.slice(0, 15).map((d) => (
                  <li key={d.cargoId + d.nome}>
                    <button onClick={() => aoAbrirCargo(d.orgaoCodigo, d.cargoId)} className="text-left">
                      <span className="underline decoration-stone-300 underline-offset-2 dark:decoration-stone-600">{d.cargo}</span>
                      {d.codigoCargo && <span className="ml-1 rounded bg-stone-200 px-1 text-xs dark:bg-stone-800">{d.codigoCargo}</span>}
                      <span className="block text-xs text-stone-500">{d.nome} · {d.orgao}{d.unidade ? ` · ${d.unidade}` : ""}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>

            {!!atual.sedes.length && (
              <section className="mt-5">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-stone-500">Órgãos com sede no estado ({atual.sedes.length})</h3>
                <ul className="mt-2 space-y-1 text-sm">
                  {atual.sedes.map((s) => (
                    <li key={s.codigo}><button onClick={() => aoAbrirNo(`u:${s.codigo}`)} className="text-left underline decoration-stone-300 underline-offset-2 dark:decoration-stone-600">{s.nome}</button> <span className="text-xs text-stone-500">{s.poder}</span></li>
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
