import { useEffect, useState } from "react";
import type { No, Ocupante } from "./tipos";
import { urlFoto } from "./dados";

// Ficha oficial da unidade no SIORG (consultada ao vivo: a API aceita chamadas do navegador).
// Traz finalidade, competências, o cargo da autoridade máxima, o último ato normativo e o site.
const SIORG = "https://estruturaorganizacional.dados.gov.br/doc/unidade-organizacional";

export type FichaSiorg = {
  finalidade: { intro?: string; itens: string[] };
  competencias: { intro?: string; itens: string[] };
  autoridade?: { codigo: string; denominacao?: string };
  ato?: { rotulo: string; ementa?: string; url?: string };
  site?: string;
  versao?: string;
};

const cache = new Map<number, Promise<FichaSiorg | null>>();
const um = <T,>(v: T | T[] | undefined | null): T | undefined => (Array.isArray(v) ? v[0] : v ?? undefined);
const limpa = (t?: string | null) => (t ?? "").replace(/\s+/g, " ").trim();

// "Compete: I - moeda...; II - política..." -> { intro: "Compete:", itens: ["Moeda...", "Política..."] }
const maiuscula = (x: string) => x.charAt(0).toUpperCase() + x.slice(1);
function itens(t?: string | null): { intro?: string; itens: string[] } {
  const s = limpa(t);
  if (!s) return { itens: [] };
  const m = s.match(/(?:^|\s)I\s*[-–—]\s*/);
  if (!m || m.index === undefined) return { intro: maiuscula(s), itens: [] };
  const intro = s.slice(0, m.index).trim().replace(/[,:]\s*$/, "") || undefined;
  const resto = s.slice(m.index);
  const partes = resto.split(/(?:;\s*(?:e\s+)?|\.\s+|\s)(?=[IVXLC]+\s*[-–—]\s+)/)
    .map((x) => x.replace(/^\s*[IVXLC]+\s*[-–—]\s*/, "").replace(/[;.,]\s*(e\s*)?$/, "").trim()).filter(Boolean).map(maiuscula);
  return { intro, itens: partes };
}

export function buscaFicha(codigo: number) {
  if (!cache.has(codigo)) {
    cache.set(codigo, fetch(`${SIORG}/${codigo}/completa`, { headers: { Accept: "application/json" } })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        const u = j?.unidade;
        if (!u) return null;
        const cf = um<any>(u.autoridade)?.cargoFuncao;
        const den = um<any>(u.autoridade)?.denominacao?.descricao;
        const sig = cf?.siglaTipo as string | undefined;
        const codigo = !sig ? "" : cf?.categoria && cf?.nivel ? `${sig} ${cf.categoria}.${String(cf.nivel).padStart(2, "0")}` : sig;
        const ato = um<any>(u.atoNormativo);
        const sites = [].concat(...((u.contato ?? []) as any[]).map((c) => [].concat(c.site ?? []))).map((s: any) => s?.site).filter(Boolean);
        const data = (ato?.dataPublicacao || ato?.dataAssinatura || "").split("-").reverse().join("/");
        return {
          finalidade: itens(u.finalidade),
          competencias: itens(u.competencia),
          autoridade: sig ? { codigo, denominacao: den } : undefined,
          ato: ato ? { rotulo: `${ato.tipoAto ?? "Ato"}${ato.numero ? ` nº ${ato.numero}` : ""}${data ? `, de ${data}` : ""}`, ementa: ato.ementa, url: ato.url } : undefined,
          site: sites[0] ? (/^https?:/.test(sites[0]) ? sites[0] : `https://${sites[0]}`) : undefined,
          versao: u.dataInicialVersaoConsulta,
        } as FichaSiorg;
      })
      .catch(() => null));
  }
  return cache.get(codigo)!;
}

export function useFicha(codigo: number | null) {
  const [f, setF] = useState<FichaSiorg | null | undefined>(undefined);
  useEffect(() => {
    if (codigo == null) { setF(null); return; }
    let vivo = true;
    setF(undefined);
    buscaFicha(codigo).then((x) => vivo && setF(x));
    return () => { vivo = false; };
  }, [codigo]);
  return f;
}

const norm = (t?: string) => (t ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\(a\)|\(o\)|\(as\)|\(os\)/g, "").trim();
const peso = (c?: string | null) => {
  const esp: Record<string, number> = { PR: 1000, VPR: 990, MEST: 980, NE: 970 };
  if (!c) return 0;
  if (esp[c]) return esp[c];
  const m = c.match(/^(CCE|FCE) (\d)\.(\d\d)$/);
  return m ? 100 + Number(m[3]) - (m[2] === "1" ? 0 : 0.5) : 1;
};

// cargo da autoridade máxima da unidade, entre os cargos ligados a ela no grafo
export function titular(cargos: No[], f?: FichaSiorg | null): No | undefined {
  const com = cargos.filter((c) => c.ocupantes?.some((o) => !o.ate));
  if (f?.autoridade) {
    const mesmos = com.filter((c) => c.codigoCargo === f.autoridade!.codigo);
    const d = norm(f.autoridade.denominacao);
    const porNome = mesmos.find((c) => d && norm(c.rotulo).startsWith(d.split(" ")[0]));
    if (porNome || mesmos[0]) return porNome ?? mesmos[0];
  }
  const ord = [...com].sort((a, b) => peso(b.codigoCargo) - peso(a.codigoCargo));
  return ord[0] && peso(ord[0].codigoCargo) >= 117 ? ord[0] : undefined;
}

const iniciais = (n: string) => n.split(/\s+/).filter((x) => x.length > 2).slice(0, 2).map((x) => x[0]).join("").toUpperCase();

export function Retrato({ o, t = 56 }: { o: Ocupante; t?: number }) {
  const [erro, setErro] = useState(false);
  const u = urlFoto(o.foto);
  return (
    <span className="grid shrink-0 place-items-center overflow-hidden rounded-lg bg-stone-200 text-sm font-semibold text-stone-500 dark:bg-stone-800" style={{ width: t, height: t }}>
      {u && !erro ? <img src={u} alt={o.nome} loading="lazy" referrerPolicy="no-referrer" onError={() => setErro(true)} className="h-full w-full object-cover object-top" /> : iniciais(o.nome)}
    </span>
  );
}

function CartaoTitular({ rotulo, c, aoSelecionar }: { rotulo: string; c: No; aoSelecionar: (id: string) => void }) {
  const ativos = (c.ocupantes ?? []).filter((o) => !o.ate);
  const o = ativos.find((x) => x.exata !== false) ?? ativos[0];
  if (!o) return null;
  const desde = o.desde ?? o.dou?.find((d) => /nomea|designa/i.test(d.verbo))?.data;
  return (
    <section className="mt-5">
      <h3 className="text-sm text-stone-500">{rotulo}</h3>
      <button onClick={() => aoSelecionar(c.id)} className="mt-2 flex w-full items-center gap-3 rounded-xl border border-stone-200 p-2.5 text-left hover:border-stone-400 dark:border-stone-700 dark:hover:border-stone-500">
        <Retrato o={o} />
        <span className="min-w-0">
          <span className="block font-medium">{o.nome}</span>
          <span className="block text-xs text-stone-500">
            {[o.partido, desde ? `desde ${desde}` : null, o.fonte].filter(Boolean).join(" · ")}
          </span>
          {o.fotoFonte && <span className="block text-[11px] text-stone-500">foto: {o.fotoFonte}</span>}
          {ativos.length > 1 && <span className="block text-[11px] text-stone-500">+{ativos.length - 1} no mesmo cargo</span>}
        </span>
      </button>
    </section>
  );
}

export default function Ficha({ codigo, cargos, aoSelecionar, sobre, sigla }: { codigo: number | null; cargos: No[]; aoSelecionar: (id: string) => void; sobre?: string; sigla?: string | null }) {
  const f = useFicha(codigo);
  const [todas, setTodas] = useState(false);
  const t = titular(cargos, f);
  const base = f?.autoridade?.denominacao && t && t.codigoCargo === f.autoridade.codigo ? (t.rotulo.length > f.autoridade.denominacao.length ? t.rotulo : f.autoridade.denominacao) : t?.rotulo;
  const rotuloTit = base && sigla && base.split(" ").length <= 2 ? `${base.replace(/\(a\)/g, "")} · ${sigla}` : base;
  const fin = f?.finalidade;
  const comp = f?.competencias.itens ?? [];
  const mostrar = todas ? comp : comp.slice(0, 3);
  const temTexto = !!(fin?.intro || fin?.itens.length || comp.length || f?.competencias.intro);
  return (
    <>
      {sobre && f && temTexto ? <h3 className="mt-5 text-xs font-semibold uppercase tracking-wide text-stone-500">{sobre}</h3> : null}
      {f === undefined && codigo != null && <p className="mt-4 h-16 animate-pulse rounded-lg bg-stone-100 dark:bg-stone-800" />}
      {fin?.intro && <p className="mt-3 text-[15px] leading-relaxed text-stone-700 dark:text-stone-300">{fin.intro}</p>}
      {!!fin?.itens.length && (fin.itens.length === 1
        ? <p className="mt-3 text-[15px] leading-relaxed text-stone-700 dark:text-stone-300">{fin.itens[0]}.</p>
        : <ul className="mt-3 list-disc space-y-1 pl-5 text-[15px] leading-relaxed text-stone-700 dark:text-stone-300">{fin.itens.map((x, i) => <li key={i}>{x}</li>)}</ul>)}
      {(!!comp.length || f?.competencias.intro) && (
        <div className="mt-3 text-sm leading-relaxed text-stone-700 dark:text-stone-300">
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-stone-500">{fin?.itens.length || fin?.intro ? "Competências" : "O que faz"}</p>
          {f?.competencias.intro && <p className="mb-1">{f.competencias.intro}{comp.length ? ":" : ""}</p>}
          <ul className="list-disc space-y-0.5 pl-5">{mostrar.map((c, i) => <li key={i}>{c}</li>)}</ul>
          {comp.length > 3 && (
            <button onClick={() => setTodas(!todas)} className="mt-1 text-xs text-stone-500 underline">{todas ? "mostrar menos" : `ver todas as ${comp.length}`}</button>
          )}
        </div>
      )}
      {f && (
        <p className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm">
          {f.ato?.url && <a href={f.ato.url} target="_blank" rel="noreferrer" className="underline underline-offset-2" title={f.ato.ementa}>Último ato no SIORG: {f.ato.rotulo}</a>}
          {f.site && <a href={f.site} target="_blank" rel="noreferrer" className="underline underline-offset-2">Site oficial</a>}
          {codigo != null && <a href={`${SIORG}/${codigo}/completa`} target="_blank" rel="noreferrer" className="text-stone-500 underline underline-offset-2">Ficha no SIORG</a>}
        </p>
      )}
      {f === null && codigo != null && <p className="mt-3 text-xs text-stone-500">Não foi possível consultar a ficha desta unidade no SIORG agora.</p>}
      {t && rotuloTit && <CartaoTitular rotulo={rotuloTit} c={t} aoSelecionar={aoSelecionar} />}
    </>
  );
}
