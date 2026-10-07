import { useEffect, useMemo, useRef, useState } from "react";
import BotoesZoom from "./Zoom";
import { carregaPorUf, carregaUfs, urlFoto, type Feicao, type Parlamentar, type PorUf } from "./dados";
import Hemiciclo from "./Hemiciclo";
import { corPartido, notaPartido, campo, COR_CAMPO, FONTE_IDEOLOGIA, NOTA_CENTRAO, type Campo } from "./partidos";

// Mapa do Brasil no formato do seuimposto.com, mas mostrando quem OCUPA os cargos hoje (não eleição):
// abas Presidente · Governadores · Senado · Deputados (federais/estaduais), painel à esquerda, fotos no mapa.
export type AbaBrasil = "presidente" | "governadores" | "senado" | "deputados";
const ABAS: { id: AbaBrasil; rotulo: string }[] = [
  { id: "presidente", rotulo: "Presidente" }, { id: "governadores", rotulo: "Governadores" },
  { id: "senado", rotulo: "Senado" }, { id: "deputados", rotulo: "Deputados" },
];
// estados pequenos ganham etiqueta ao lado, como no seuimposto
const ETIQUETAS = ["RN", "PB", "PE", "AL", "SE", "DF", "ES", "RJ"];

type Props = { uf: string | null; aoEscolherUf: (uf: string | null) => void; aoAbrirNo: (id: string) => void };

function projetor(feicoes: Feicao[], L = 620, A = 620) {
  const merc = ([lon, lat]: number[]) => [lon, -Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360)) * (180 / Math.PI)];
  const aneis = (f: Feicao) => (f.geometry.type === "Polygon" ? [f.geometry.coordinates] : f.geometry.coordinates) as number[][][][];
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const f of feicoes) for (const pol of aneis(f)) for (const r of pol) for (const p of r) {
    const [x, y] = merc(p); x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
  }
  const k = Math.min((L - 60) / (x1 - x0), A / (y1 - y0));
  const dy = (A - (y1 - y0) * k) / 2;
  const proj = (p: number[]) => { const [x, y] = merc(p); return [(x - x0) * k + 10, (y - y0) * k + dy]; };
  return feicoes.map((f) => {
    let d = "", maior = 0, centro = [0, 0];
    const caixa = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
    for (const pol of aneis(f)) {
      const pts = pol[0].map(proj);
      for (const [px, py] of pts) { caixa.x0 = Math.min(caixa.x0, px); caixa.y0 = Math.min(caixa.y0, py); caixa.x1 = Math.max(caixa.x1, px); caixa.y1 = Math.max(caixa.y1, py); }
      d += pol.map((r) => "M" + r.map(proj).map((q) => q.map((v) => v.toFixed(1)).join(",")).join("L") + "Z").join("");
      let area = 0, cx = 0, cy = 0;
      for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
        const c = pts[j][0] * pts[i][1] - pts[i][0] * pts[j][1];
        area += c; cx += (pts[j][0] + pts[i][0]) * c; cy += (pts[j][1] + pts[i][1]) * c;
      }
      if (Math.abs(area) > maior) { maior = Math.abs(area); centro = [cx / (3 * area), cy / (3 * area)]; }
    }
    return { sigla: f.properties.sigla, nome: f.properties.nome, d, centro, area: maior, caixa };
  });
}

const iniciais = (n: string) => n.split(/\s+/).filter((x) => x.length > 2).slice(0, 2).map((x) => x[0]).join("");

function Foto({ p, t = 36, aoClicar }: { p: Parlamentar; t?: number; aoClicar?: () => void }) {
  const [erro, setErro] = useState(false);
  const u = urlFoto(p.foto);
  return (
    <button onClick={aoClicar} title={`${p.nome}${p.partido ? ` · ${p.partido}` : ""}`} className="shrink-0 overflow-hidden rounded-full bg-stone-200 dark:bg-stone-800"
      style={{ width: t, height: t, boxShadow: `0 0 0 2px ${corPartido(p.partido)}` }}>
      {u && !erro ? <img src={u} alt={p.nome} loading="lazy" referrerPolicy="no-referrer" onError={() => setErro(true)} className="h-full w-full object-cover object-top" />
        : <span className="grid h-full w-full place-items-center text-[10px] font-semibold text-stone-500">{iniciais(p.nome)}</span>}
    </button>
  );
}

function Linha({ p, sub, aoAbrir }: { p: Parlamentar; sub?: string; aoAbrir: (id: string) => void }) {
  return (
    <li>
      <button onClick={() => aoAbrir(p.id)} className="flex w-full items-center gap-2.5 rounded-lg px-1.5 py-1 text-left hover:bg-stone-100 dark:hover:bg-stone-800">
        <Foto p={p} t={32} />
        <span className="min-w-0">
          <span className="block truncate text-sm font-medium">{p.nome}</span>
          <span className="block truncate text-xs"><b style={{ color: corPartido(p.partido) }}>{p.partido}</b>{sub ? <span className="text-stone-500"> · {sub}</span> : null}</span>
        </span>
      </button>
    </li>
  );
}

function contaPartidos(lista: Parlamentar[]) {
  const m = new Map<string, number>();
  for (const p of lista) m.set(p.partido ?? "?", (m.get(p.partido ?? "?") ?? 0) + 1);
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
}

function BarraPartidos({ lista, topo = 6 }: { lista: Parlamentar[]; topo?: number }) {
  const c = contaPartidos(lista);
  const ord = [...c].sort((a, b) => notaPartido(a[0]) - notaPartido(b[0]));
  const total = lista.length;
  const outros = c.slice(topo).reduce((s, [, n]) => s + n, 0);
  return (
    <div>
      <div className="flex h-2.5 overflow-hidden rounded-full">
        {ord.map(([p, n]) => <span key={p} title={`${p} ${n}`} style={{ width: `${(100 * n) / total}%`, background: corPartido(p) }} />)}
      </div>
      <p className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs">
        {c.slice(0, topo).map(([p, n]) => <span key={p} className="flex items-center gap-1"><span className="h-2 w-2 rounded-full" style={{ background: corPartido(p) }} />{p} <b>{n}</b></span>)}
        {outros > 0 && <span className="text-stone-500">Outros <b>{outros}</b></span>}
      </p>
    </div>
  );
}

function Espectro({ lista }: { lista: Parlamentar[] }) {
  const c: Record<Campo, number> = { Esquerda: 0, Centro: 0, Direita: 0, "Sem classificação": 0 };
  for (const p of lista) c[campo(p.partido)]++;
  return (
    <div>
      <div className="flex items-end justify-between text-xs">
        <span><span className="text-stone-500">Esquerda</span> <b className="text-lg">{c.Esquerda}</b></span>
        <span><span className="text-stone-500">Centrão</span> <b className="text-lg">{c.Centro}</b></span>
        <span><b className="text-lg">{c.Direita}</b> <span className="text-stone-500">Direita</span></span>
      </div>
      <div className="mt-1 flex h-1.5 overflow-hidden rounded-full">
        {(["Esquerda", "Centro", "Direita", "Sem classificação"] as Campo[]).map((k) => <span key={k} style={{ width: `${(100 * c[k]) / Math.max(1, lista.length)}%`, background: COR_CAMPO[k] }} />)}
      </div>
    </div>
  );
}

export default function Brasil({ uf, aoEscolherUf, aoAbrirNo }: Props) {
  const [geo, setGeo] = useState<{ features: Feicao[] } | null>(null);
  const [dados, setDados] = useState<PorUf | null>(null);
  const [aba, setAba] = useState<AbaBrasil>("senado");
  const [esfera, setEsfera] = useState<"federais" | "estaduais">("federais");
  const [hover, setHover] = useState<string | null>(null);
  useEffect(() => { carregaUfs().then(setGeo).catch(() => {}); carregaPorUf().then(setDados).catch(() => {}); }, []);
  const formas = useMemo(() => (geo ? projetor(geo.features) : []), [geo]);
  // ---- zoom: roda do mouse, arrastar, botões e aproximação suave ao escolher um estado ----
  const CHEIO = { x: 0, y: 0, w: 680, h: 640 };
  const [vista, setVista] = useState(CHEIO);
  const vistaRef = useRef(vista);
  vistaRef.current = vista;
  const svgRef = useRef<SVGSVGElement>(null);
  const anima = useRef(0);
  const arrastou = useRef(false);
  const animaPara = (alvo: typeof CHEIO) => {
    cancelAnimationFrame(anima.current);
    const de = { ...vistaRef.current }, t0 = performance.now();
    const passo = (t: number) => {
      const k = Math.min(1, (t - t0) / 700), e = 1 - Math.pow(1 - k, 3);
      setVista({ x: de.x + (alvo.x - de.x) * e, y: de.y + (alvo.y - de.y) * e, w: de.w + (alvo.w - de.w) * e, h: de.h + (alvo.h - de.h) * e });
      if (k < 1) anima.current = requestAnimationFrame(passo);
    };
    anima.current = requestAnimationFrame(passo);
  };
  const limita = (v: typeof CHEIO) => {
    const w = Math.min(680, Math.max(60, v.w)), h = (w * 640) / 680;
    return { w, h, x: Math.min(680 - w * 0.4, Math.max(-w * 0.6, v.x)), y: Math.min(640 - h * 0.4, Math.max(-h * 0.6, v.y)) };
  };
  const zoomEm = (fator: number, cx?: number, cy?: number, suave = false) => {
    const v = vistaRef.current;
    const w = Math.min(680, Math.max(60, v.w / fator)), k = w / v.w;
    const px = cx ?? v.x + v.w / 2, py = cy ?? v.y + v.h / 2;
    const alvo = limita({ w, h: v.h * k, x: px - (px - v.x) * k, y: py - (py - v.y) * k });
    if (suave) animaPara(alvo); else { cancelAnimationFrame(anima.current); setVista(alvo); }
  };
  const paraSvg = (x: number, y: number) => {
    const svg = svgRef.current, m = svg?.getScreenCTM();
    if (!svg || !m) return null;
    const pt = svg.createSVGPoint(); pt.x = x; pt.y = y;
    return pt.matrixTransform(m.inverse());
  };
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const roda = (e: WheelEvent) => { e.preventDefault(); const q = paraSvg(e.clientX, e.clientY); zoomEm(Math.exp(-e.deltaY * 0.0015), q?.x, q?.y); };
    svg.addEventListener("wheel", roda, { passive: false });
    return () => svg.removeEventListener("wheel", roda);
  });
  const aoApertar = (e: React.PointerEvent) => {
    arrastou.current = false;
    let ult = { x: e.clientX, y: e.clientY };
    const ini = { ...ult };
    const mover = (ev: PointerEvent) => {
      if (Math.hypot(ev.clientX - ini.x, ev.clientY - ini.y) > 5) arrastou.current = true;
      if (!arrastou.current || !svgRef.current) return;
      const m = svgRef.current.getScreenCTM();
      if (!m) return;
      const v = vistaRef.current;
      cancelAnimationFrame(anima.current);
      setVista(limita({ ...v, x: v.x - (ev.clientX - ult.x) / m.a, y: v.y - (ev.clientY - ult.y) / m.d }));
      ult = { x: ev.clientX, y: ev.clientY };
    };
    const soltar = () => { removeEventListener("pointermove", mover); removeEventListener("pointerup", soltar); };
    addEventListener("pointermove", mover); addEventListener("pointerup", soltar);
  };
  // ao escolher um estado, aproxima suavemente até ele; ao voltar para o Brasil, afasta
  useEffect(() => {
    if (!formas.length) return;
    const f = uf ? formas.find((x) => x.sigla === uf) : null;
    if (!f) { animaPara(CHEIO); return; }
    const { x0, y0, x1, y1 } = f.caixa;
    const w = Math.min(680, Math.max(110, Math.max(x1 - x0, ((y1 - y0) * 680) / 640) * 1.7)), h = (w * 640) / 680;
    animaPara(limita({ w, h, x: (x0 + x1) / 2 - w / 2, y: (y0 + y1) / 2 - h / 2 }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uf, formas]);
  const esc = Math.max(0.3, vista.w / 680);          // fotos e textos mantêm o tamanho na tela
  const perto = vista.w < 420;                        // perto: estados pequenos mostram as fotos no próprio mapa

  const coresSenado = (s: string) => [...new Set((dados?.ufs[s]?.senadores ?? []).sort((a, b) => notaPartido(a.partido) - notaPartido(b.partido)).map((p) => corPartido(p.partido)))];

  const deps = (s: string) => (esfera === "federais" ? dados?.ufs[s]?.deputados : dados?.ufs[s]?.estaduais) ?? [];
  const lider = (lista: Parlamentar[]) => contaPartidos(lista)[0]?.[0];
  const corUf = (s: string) => {
    const d = dados?.ufs[s];
    if (!d) return "#44403c";
    if (aba === "governadores") return d.governador ? corPartido(d.governador.partido) : "#44403c";
    if (aba === "deputados") { const l = lider(deps(s)); return l ? corPartido(l) : "#44403c"; }
    if (aba === "presidente") return s === "DF" ? "#8b8cf0" : "#3f3d56";
    return "#44403c";
  };
  const todos = useMemo(() => {
    const v = Object.entries(dados?.ufs ?? {});
    return {
      senado: v.flatMap(([, d]) => d.senadores), federais: v.flatMap(([, d]) => d.deputados),
      estaduais: v.flatMap(([, d]) => d.estaduais ?? []), governadores: v.map(([s, d]) => d.governador && { ...d.governador, uf: s }).filter(Boolean) as (Parlamentar & { uf: string })[],
    };
  }, [dados]);
  const legendaMapa = useMemo(() => {
    if (!dados || aba === "presidente") return [];
    const c = new Map<string, number>();
    for (const [s, d] of Object.entries(dados.ufs)) {
      const ps = aba === "governadores" ? [d.governador?.partido] : aba === "senado" ? d.senadores.map((x) => x.partido) : [lider(deps(s))];
      for (const p of ps) if (p) c.set(p, (c.get(p) ?? 0) + 1);
    }
    return [...c.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
  }, [dados, aba, esfera]);

  if (!geo || !dados) return <p className="absolute inset-0 grid place-items-center text-sm text-stone-500">Carregando o mapa…</p>;
  const atual = uf ? dados.ufs[uf] : null;
  const nomeUf = formas.find((f) => f.sigla === uf)?.nome;
  const pr = dados.nacional.filter((n) => n.codigoCargo === "PR" || n.codigoCargo === "VPR");
  const ministros = dados.nacional.filter((n) => n.codigoCargo === "MEST");
  const semTse = !todos.governadores.length;

  // ---------- painel da esquerda ----------
  const painel = () => {
    if (aba === "presidente") return (
      <>
        <h2 className="font-semibold">Presidência da República</h2>
        <ul className="mt-3 space-y-2">
          {pr.map((n) => (
            <li key={n.cargo}>
              <button onClick={() => n.orgaoCodigo && aoAbrirNo(`u:${n.orgaoCodigo}`)} className="flex w-full items-center gap-3 rounded-lg border border-stone-200 p-2.5 text-left hover:border-stone-400 dark:border-stone-700">
                <Foto p={{ id: n.cargo, nome: n.nome, foto: n.foto, partido: n.partido ?? undefined }} t={56} />
                <span><span className="block font-medium">{n.nome}</span><span className="text-xs">{n.partido && <b style={{ color: corPartido(n.partido) }}>{n.partido} </b>}<span className="text-stone-500">{n.cargo}</span></span></span>
              </button>
            </li>
          ))}
        </ul>
        <h3 className="mt-5 text-xs font-semibold uppercase tracking-wide text-stone-500">Ministros de Estado ({ministros.length})</h3>
        <ul className="mt-2 space-y-0.5">
          {ministros.map((n) => (
            <li key={n.cargo}>
              <button onClick={() => n.orgaoCodigo && aoAbrirNo(`u:${n.orgaoCodigo}`)} className="flex w-full items-center gap-2.5 rounded-lg px-1.5 py-1 text-left hover:bg-stone-100 dark:hover:bg-stone-800">
                <Foto p={{ id: n.cargo, nome: n.nome, foto: n.foto }} t={30} />
                <span className="min-w-0"><span className="block truncate text-sm font-medium">{n.nome}</span><span className="block truncate text-xs text-stone-500">{n.cargo.replace(/^Ministr[oa] de Estado (d[aoe]s? )?/, "")}</span></span>
              </button>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-[11px] text-stone-500">Ocupantes: lista oficial do Planalto. Fotos e partido do Presidente e do Vice: candidatura eleita em 2022 (TSE). Fotos dos ministros ainda não coletadas.</p>
      </>
    );
    if (aba === "governadores") {
      if (semTse) return <p className="text-sm text-stone-500">Os governadores ainda estão sendo coletados no TSE.</p>;
      if (atual?.governador) return (
        <>
          <ul className="space-y-2">
            {[["Governador(a)", atual.governador], ["Vice-governador(a)", atual.vice]].filter(([, p]) => p).map(([c, p]) => (
              <li key={c as string} className="flex items-center gap-3 rounded-lg border border-stone-200 p-2.5 dark:border-stone-700">
                <Foto p={p as Parlamentar} t={52} />
                <span><span className="block font-medium">{(p as Parlamentar).nome}</span><span className="text-xs"><b style={{ color: corPartido((p as Parlamentar).partido) }}>{(p as Parlamentar).partido}</b> <span className="text-stone-500">· {c as string}</span></span></span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-[11px] text-stone-500">Eleitos em 2022 (TSE). Substituições posteriores, como vice que assumiu o governo, ainda não são acompanhadas.</p>
        </>
      );
      return (
        <>
          <div className="flex items-baseline justify-between"><h2 className="font-semibold">Governadores</h2><span className="text-xs text-stone-500">27 estados</span></div>
          <div className="mt-3"><Espectro lista={todos.governadores} /></div>
          <div className="mt-3"><BarraPartidos lista={todos.governadores} /></div>
          <ul className="mt-4 space-y-0.5">{[...todos.governadores].sort((a, b) => a.uf.localeCompare(b.uf)).map((g) => <Linha key={g.id} p={g} sub={g.uf} aoAbrir={() => aoEscolherUf(g.uf)} />)}</ul>
          <p className="mt-3 text-[11px] text-stone-500">Eleitos em 2022 (TSE). Substituições posteriores ainda não são acompanhadas.</p>
        </>
      );
    }
    if (aba === "senado") {
      const lista = atual ? atual.senadores : todos.senado;
      return (
        <>
          <div className="flex items-baseline justify-between"><h2 className="font-semibold">Senado{atual ? ` · ${uf}` : ""}</h2><span className="text-xs text-stone-500">{atual ? "3 por estado" : `${lista.length} senadores`}</span></div>
          {!atual && <div className="mt-3"><Hemiciclo pessoas={lista} titulo="" semTitulo quadrado aoAbrir={aoAbrirNo} /></div>}
          {!atual && (
            <>
              <h3 className="mt-4 text-xs font-semibold text-stone-500">27 estados · 3 senadores cada</h3>
              <div className="mt-2 grid grid-cols-9 gap-1">
                {Object.keys(dados.ufs).sort().map((s) => {
                  const cs = coresSenado(s);
                  const fundo = cs.length <= 1 ? (cs[0] ?? "#44403c") : `linear-gradient(135deg, ${cs.map((c, i) => `${c} ${(100 * i) / cs.length}% ${(100 * (i + 1)) / cs.length}%`).join(", ")})`;
                  return (
                    <button key={s} onClick={() => aoEscolherUf(s)} className="h-7 rounded text-[10px] font-bold text-white" title={dados.ufs[s].senadores.map((p) => `${p.nome} (${p.partido})`).join(", ")}
                      style={{ background: fundo, textShadow: "0 1px 2px #0008" }}>{s}</button>
                  );
                })}
              </div>
            </>
          )}
          <ul className="mt-4 space-y-0.5">{[...lista].sort((a, b) => notaPartido(a.partido) - notaPartido(b.partido) || a.nome.localeCompare(b.nome)).map((p) => <Linha key={p.id} p={p} aoAbrir={aoAbrirNo} />)}</ul>
        </>
      );
    }
    // deputados
    const lista = atual ? deps(uf!) : esfera === "federais" ? todos.federais : todos.estaduais;
    return (
      <>
        <div className="flex items-baseline justify-between">
          <h2 className="font-semibold">{esfera === "federais" ? (atual ? `Bancada na Câmara · ${uf}` : "Câmara dos Deputados") : atual ? (uf === "DF" ? "Câmara Legislativa · DF" : `Assembleia Legislativa · ${uf}`) : "Assembleias Legislativas"}</h2>
          <span className="shrink-0 whitespace-nowrap pl-2 text-xs text-stone-500">{lista.length} {esfera === "federais" ? "cadeiras" : "deputados"}</span>
        </div>
        <div className="mt-2 inline-flex rounded-lg bg-stone-100 p-0.5 text-sm dark:bg-stone-800">
          {(["federais", "estaduais"] as const).map((e) => (
            <button key={e} onClick={() => setEsfera(e)} className={`rounded-md px-3 py-1 ${esfera === e ? "bg-white font-medium shadow-sm dark:bg-stone-700" : "text-stone-500"}`}>{e === "federais" ? "Federais" : "Estaduais"}</button>
          ))}
        </div>
        {esfera === "estaduais" && semTse && <p className="mt-3 text-sm text-stone-500">Os deputados estaduais ainda estão sendo coletados no TSE.</p>}
        {!!lista.length && (
          <>
            {esfera === "federais" || atual ? <div className="mt-3"><Hemiciclo pessoas={lista} titulo="" semTitulo aoAbrir={aoAbrirNo} /></div>
              : <><div className="mt-3"><Espectro lista={lista} /></div><div className="mt-3"><BarraPartidos lista={lista} /></div></>}
            {esfera === "estaduais" && !atual && (
              <>
                <h3 className="mt-4 text-xs font-semibold text-stone-500">As 27 assembleias</h3>
                <ul className="mt-2 space-y-1 text-xs">
                  {Object.keys(dados.ufs).sort().map((s) => {
                    const l = dados.ufs[s].estaduais ?? [];
                    const c = [...contaPartidos(l)].sort((a, b) => notaPartido(a[0]) - notaPartido(b[0]));
                    return (
                      <li key={s}>
                        <button onClick={() => aoEscolherUf(s)} className="flex w-full items-center gap-2">
                          <b className="w-6 text-left">{s}</b>
                          <span className="flex h-2 flex-1 overflow-hidden rounded-full">{c.map(([p, n]) => <span key={p} style={{ width: `${(100 * n) / l.length}%`, background: corPartido(p) }} />)}</span>
                          <span className="w-6 text-right text-stone-500">{l.length}</span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </>
            )}
            <h3 className="mt-4 text-xs font-semibold text-stone-500">Por partido</h3>
            <div className="mt-2 space-y-3">
              {[...contaPartidos(lista)].sort((a, b) => notaPartido(a[0]) - notaPartido(b[0])).map(([p, n]) => (
                <div key={p}>
                  <p className="text-xs font-semibold" style={{ color: corPartido(p) }}>{p} <span className="text-stone-500">{n}</span></p>
                  <div className="mt-1 flex flex-wrap gap-1.5 p-0.5">{lista.filter((x) => (x.partido ?? "?") === p).map((x) => <Foto key={x.id} p={x} t={26} aoClicar={() => x.id.startsWith("dep:") && aoAbrirNo(x.id)} />)}</div>
                </div>
              ))}
            </div>
            {esfera === "estaduais" && <p className="mt-3 text-[11px] text-stone-500">Eleitos em 2022 (TSE). Suplentes que assumiram depois ainda não são acompanhados.</p>}
          </>
        )}
      </>
    );
  };

  // ---------- fotos sobre o mapa ----------
  const fotosNoMapa = (s: string): Parlamentar[] => {
    const d = dados.ufs[s];
    if (!d) return [];
    if (aba === "senado") return d.senadores;
    if (aba === "governadores") return d.governador ? [d.governador] : [];
    if (aba === "presidente" && s === "DF") return pr.map((n) => ({ id: n.cargo, nome: n.nome, foto: n.foto, partido: n.partido ?? undefined }));
    return [];
  };
  const posEtiqueta = (s: string) => ({ x: 600, y: 215 + ETIQUETAS.indexOf(s) * 34 });

  return (
    <div className="absolute inset-0 flex flex-col lg:flex-row">
      <aside className="order-2 max-h-[55vh] overflow-y-auto border-t border-stone-200 bg-white p-4 lg:order-1 lg:max-h-none lg:w-[340px] lg:shrink-0 lg:border-r lg:border-t-0 dark:border-stone-800 dark:bg-stone-900">
        {atual && (
          <button onClick={() => aoEscolherUf(null)} className="mb-3 text-xs text-stone-500 hover:text-stone-900 dark:hover:text-white">← Brasil</button>
        )}
        {atual && <h2 className="mb-3 text-lg font-semibold">{nomeUf}</h2>}
        {painel()}
        <p className="mt-4 text-[11px] text-stone-500">{NOTA_CENTRAO} <a className="underline" href={FONTE_IDEOLOGIA} target="_blank" rel="noreferrer">Bolognesi, Ribeiro e Codato (DADOS, 2023)</a>: até 5,5 à esquerda, acima à direita.</p>
      </aside>

      <div className="relative order-1 min-h-[52vh] flex-1 lg:order-2">
        <div className="absolute left-1/2 top-3 z-10 flex -translate-x-1/2 rounded-full border border-stone-300 bg-white/90 p-0.5 text-sm backdrop-blur dark:border-stone-700 dark:bg-stone-900/90">
          {ABAS.map((a) => (
            <button key={a.id} onClick={() => setAba(a.id)} className={`rounded-full px-3.5 py-1 ${aba === a.id ? "bg-stone-900 font-medium text-white dark:bg-stone-100 dark:text-stone-900" : "text-stone-500 hover:text-stone-900 dark:hover:text-white"}`}>{a.rotulo}</button>
          ))}
        </div>
        {!!legendaMapa.length && (
          <p className="absolute right-3 top-14 z-10 flex flex-wrap justify-end gap-x-3 text-xs">
            {legendaMapa.map(([p, n]) => <span key={p} className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: corPartido(p) }} />{p} <b>{n}</b></span>)}
            <span className="text-stone-500">{aba === "senado" ? "cadeiras" : "estados"}</span>
          </p>
        )}
        <BotoesZoom mais={() => zoomEm(1.6, undefined, undefined, true)} menos={() => zoomEm(1 / 1.6, undefined, undefined, true)} inicio={() => { aoEscolherUf(null); animaPara(CHEIO); }} />
        <svg ref={svgRef} viewBox={`${vista.x} ${vista.y} ${vista.w} ${vista.h}`} onPointerDown={aoApertar}
          onClickCapture={(e) => { if (arrastou.current) { e.stopPropagation(); e.preventDefault(); arrastou.current = false; } }}
          className={`absolute inset-0 h-full w-full touch-none px-2 pb-2 pt-20 ${vista.w < 680 ? "cursor-grab active:cursor-grabbing" : ""}`} onClick={() => aoEscolherUf(null)} role="img" aria-label="Mapa do Brasil">
          <defs>
            {aba === "senado" && formas.map((f) => {
              // uma faixa diagonal por partido diferente, cobrindo o estado inteiro: 3 partidos = 3 faixas, 2 = 2, 1 = cor única
              const cs = coresSenado(f.sigla);
              const lista = cs.length ? cs : ["#44403c"];
              return (
                <linearGradient key={f.sigla} id={`sen-${f.sigla}`} x1="0" y1="0" x2="1" y2="1">
                  {lista.flatMap((c, i) => [
                    <stop key={`${i}a`} offset={i / lista.length} stopColor={c} />,
                    <stop key={`${i}b`} offset={(i + 1) / lista.length} stopColor={c} />,
                  ])}
                </linearGradient>
              );
            })}
            <clipPath id="circulo" clipPathUnits="objectBoundingBox"><circle cx="0.5" cy="0.5" r="0.5" /></clipPath>
          </defs>
          {formas.map((f) => {
            const sel = uf === f.sigla, over = hover === f.sigla;
            return (
              <path key={f.sigla} d={f.d} fill={aba === "senado" ? `url(#sen-${f.sigla})` : corUf(f.sigla)} fillOpacity={uf && !sel ? 0.4 : 0.9}
                stroke={sel || over ? "#fff" : "#0c0a09"} strokeWidth={(sel ? 2.2 : over ? 1.6 : 0.7) * esc} style={{ cursor: "pointer" }}
                onClick={(e) => { e.stopPropagation(); aoEscolherUf(sel ? null : f.sigla); }} onMouseEnter={() => setHover(f.sigla)} onMouseLeave={() => setHover(null)} />
            );
          })}
          {/* siglas e fotos */}
          {formas.map((f) => {
            const fotos = fotosNoMapa(f.sigla);
            const pequeno = ETIQUETAS.includes(f.sigla) && !perto;
            const [cx, cy] = f.centro;
            if (pequeno) return null;
            return (
              <g key={f.sigla} pointerEvents="none">
                {fotos.map((p, i) => {
                  const t = (fotos.length === 1 ? 30 : 22) * esc, x = cx - (fotos.length * (t - 6 * esc)) / 2 + i * (t - 6 * esc) - 3 * esc;
                  const u = urlFoto(p.foto);
                  return (
                    <g key={p.id}>
                      <circle cx={x + t / 2} cy={cy - 6 * esc} r={t / 2 + 1.5 * esc} fill={corPartido(p.partido)} />
                      {u ? <image href={u} x={x} y={cy - 6 * esc - t / 2} width={t} height={t} clipPath="url(#circulo)" preserveAspectRatio="xMidYMin slice" />
                        : <circle cx={x + t / 2} cy={cy - 6 * esc} r={t / 2} fill="#292524" />}
                    </g>
                  );
                })}
                <text x={cx} y={cy + (fotos.length === 1 ? 24 : fotos.length ? 20 : 4) * esc} textAnchor="middle" fontSize={10 * esc} fontWeight="700" fill="#fff" stroke="#0c0a09" strokeWidth={2.5 * esc} paintOrder="stroke">{f.sigla}</text>
              </g>
            );
          })}
          {/* etiquetas dos estados pequenos, ao lado do mapa */}
          {!perto && formas.filter((f) => ETIQUETAS.includes(f.sigla)).map((f) => {
            const { x, y } = posEtiqueta(f.sigla);
            const fotos = fotosNoMapa(f.sigla);
            const cor = aba === "senado" ? corPartido(dados.ufs[f.sigla]?.senadores[0]?.partido) : corUf(f.sigla);
            const larg = 34 + fotos.length * 16;
            return (
              <g key={f.sigla} style={{ cursor: "pointer" }} onClick={(e) => { e.stopPropagation(); aoEscolherUf(uf === f.sigla ? null : f.sigla); }}
                onMouseEnter={() => setHover(f.sigla)} onMouseLeave={() => setHover(null)}>
                <line x1={f.centro[0]} y1={f.centro[1]} x2={x} y2={y + 11} stroke="#a8a29e" strokeOpacity={0.6} strokeWidth={0.8} />
                <rect x={x} y={y} width={larg} height={22} rx={4} fill={aba === "senado" ? `url(#sen-${f.sigla})` : cor} fillOpacity={0.9} stroke={uf === f.sigla || hover === f.sigla ? "#fff" : "none"} />
                {fotos.map((p, i) => {
                  const u = urlFoto(p.foto);
                  return u ? <image key={p.id} href={u} x={x + 3 + i * 16} y={y + 3} width={16} height={16} clipPath="url(#circulo)" preserveAspectRatio="xMidYMin slice" /> : null;
                })}
                <text x={x + larg - 6} y={y + 15} textAnchor="end" fontSize="10" fontWeight="700" fill="#fff">{f.sigla}</text>
              </g>
            );
          })}
        </svg>
        {hover && (() => {
          const d = dados.ufs[hover];
          const nome = formas.find((f) => f.sigla === hover)?.nome;
          const txt = aba === "governadores" ? (d?.governador ? `${d.governador.nome} (${d.governador.partido})` : "")
            : aba === "senado" ? d?.senadores.map((p) => `${p.nome} (${p.partido})`).join(" · ")
            : aba === "deputados" ? `${deps(hover).length} ${esfera === "federais" ? "deputados federais" : "deputados estaduais"} · mais cadeiras: ${lider(deps(hover)) ?? "—"}`
            : hover === "DF" ? "Brasília: sede dos três Poderes" : "";
          return (
            <div className="pointer-events-none absolute bottom-3 left-1/2 max-w-[90%] -translate-x-1/2 rounded-lg border border-stone-200 bg-white/95 px-3 py-1.5 text-xs shadow dark:border-stone-700 dark:bg-stone-900/95">
              <b>{nome}</b>{txt ? <span className="text-stone-500"> · {txt}</span> : null}
            </div>
          );
        })()}
      </div>
    </div>
  );
}
