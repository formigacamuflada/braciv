import { useState } from "react";
import type { No, Ocupante } from "./tipos";
import { Retrato } from "./Ficha";
import { corPartido } from "./partidos";

// Blocos do painel para o Legislativo: Mesa, lideranças, comissões e membros.
type Idx = Map<string, No>;
type Sel = (id: string) => void;
export type Membro = { n: string; p?: string; u?: string; t?: string; i?: string };

const ord = (a: No, b: No) => (a.ordem ?? 99) - (b.ordem ?? 99) || a.rotulo.localeCompare(b.rotulo, "pt-BR");
const sub = (o?: Partial<Ocupante>) => [o?.partido && `${o.partido}${o.uf ? `-${o.uf}` : ""}`, o?.desde && `desde ${o.desde}`].filter(Boolean).join(" · ");

function Titulo({ children, n }: { children: React.ReactNode; n?: number }) {
  return <h3 className="mt-5 text-xs font-semibold uppercase tracking-wide text-stone-500">{children}{n != null && <span className="font-normal"> ({n})</span>}</h3>;
}

export function CartaoGrande({ rotulo, c, aoSelecionar }: { rotulo: string; c: No; aoSelecionar: Sel }) {
  const o = c.ocupantes?.[0];
  if (!o) return null;
  return (
    <section className="mt-5">
      <h3 className="text-sm text-stone-500">{rotulo}</h3>
      <button onClick={() => aoSelecionar(c.id)} className="mt-2 flex w-full items-center gap-3 rounded-xl border border-stone-200 p-2.5 text-left hover:border-stone-400 dark:border-stone-700 dark:hover:border-stone-500">
        <Retrato o={o} />
        <span className="min-w-0">
          <span className="block font-medium">{o.nome}</span>
          <span className="block text-xs text-stone-500">{sub(o)}</span>
        </span>
      </button>
    </section>
  );
}

function CartaoPequeno({ o, linha, aoClicar }: { o: Partial<Ocupante> & { nome: string }; linha?: string; aoClicar?: () => void }) {
  return (
    <button onClick={aoClicar} disabled={!aoClicar} className="flex items-center gap-2 rounded-lg border border-stone-200 p-1.5 text-left enabled:hover:border-stone-400 dark:border-stone-700 dark:enabled:hover:border-stone-500">
      <Retrato o={o as Ocupante} t={36} />
      <span className="min-w-0 text-xs leading-tight">
        <span className="block truncate font-medium">{o.nome}</span>
        <span className="block truncate text-stone-500">
          {o.partido && <b style={{ color: corPartido(o.partido) }}>{o.partido}{o.uf ? `-${o.uf}` : ""} </b>}
          {linha}
        </span>
      </span>
    </button>
  );
}

function Grade({ children }: { children: React.ReactNode }) {
  return <div className="mt-2 grid grid-cols-2 gap-1.5">{children}</div>;
}

const curto = (r: string) => r.replace(/ da Mesa d[ao] (Câmara|Senado|Congresso)$/, "").replace(/ (na Câmara|no Senado|no Congresso)( dos Deputados| Federal| Nacional)?$/, "");

// Câmara, Senado e Congresso: Presidente, Mesa, lideranças e comissões permanentes
export function BlocoCasa({ no, cargos, unidades, idx, aoSelecionar }: { no: No; cargos: No[]; unidades: No[]; idx: Idx; aoSelecionar: Sel }) {
  const [todasLid, setTodasLid] = useState(false);
  const mesa = cargos.filter((c) => c.codigoCargo === "MESA").sort(ord);
  const lideres = cargos.filter((c) => c.codigoCargo === "LID").sort(ord);
  const comissoes = unidades.filter((u) => u.comissao).sort((a, b) => (a.nome ?? "").localeCompare(b.nome ?? "", "pt-BR"));
  if (!mesa.length && !lideres.length && !comissoes.length) return null;
  const [pres, ...resto] = mesa;
  const nomeMesa = no.id === "casa:senado" ? "Comissão Diretora (Mesa)" : no.id === "casa:camara" ? "Mesa Diretora" : "Mesa do Congresso Nacional";
  const presDe = (c: No) => [...idx.values()].find((x) => x.id.startsWith(`${c.id}:`) && x.codigoCargo === "PRES");
  const lidMostra = todasLid ? lideres : lideres.slice(0, 10);
  return (
    <>
      {pres && <CartaoGrande rotulo={pres.rotulo} c={pres} aoSelecionar={aoSelecionar} />}
      {!!resto.length && (
        <>
          <Titulo>{nomeMesa}</Titulo>
          <Grade>{resto.map((c) => c.ocupantes?.[0] && <CartaoPequeno key={c.id} o={c.ocupantes[0]} linha={curto(c.rotulo)} aoClicar={() => aoSelecionar(c.id)} />)}</Grade>
          <p className="mt-2 text-[11px] text-stone-500">{no.id === "casa:camara" || no.id === "casa:senado"
            ? "Eleita pela própria Casa para mandato de 2 anos (CF, art. 57, § 4º)."
            : "Presidida pelo Presidente do Senado; os demais cargos são exercidos, alternadamente, pelos ocupantes de cargos equivalentes na Câmara e no Senado (CF, art. 57, § 5º)."}</p>
        </>
      )}
      {!!lideres.length && (
        <>
          <Titulo n={lideres.length}>Lideranças</Titulo>
          <Grade>{lidMostra.map((c) => c.ocupantes?.[0] && <CartaoPequeno key={c.id} o={c.ocupantes[0]} linha={curto(c.rotulo)} aoClicar={() => aoSelecionar(c.id)} />)}</Grade>
          {lideres.length > 10 && <button onClick={() => setTodasLid(!todasLid)} className="mt-1 text-xs text-stone-500 underline">{todasLid ? "mostrar menos" : `ver todas as ${lideres.length}`}</button>}
        </>
      )}
      {!!comissoes.length && (
        <>
          <Titulo n={comissoes.length}>Comissões permanentes</Titulo>
          <ul className="mt-2 space-y-1 text-sm">
            {comissoes.map((c) => {
              const p = presDe(c)?.ocupantes?.[0];
              return (
                <li key={c.id}>
                  <button onClick={() => aoSelecionar(c.id)} className="w-full rounded-md px-1.5 py-1 text-left hover:bg-stone-100 dark:hover:bg-stone-800">
                    <span className="font-medium">{c.sigla}</span> <span className="text-stone-600 dark:text-stone-300">{(c.nome ?? "").replace(/^Comissão (de |do |da )?/, "")}</span>
                    {p && <span className="block text-xs text-stone-500">Presidente: {p.nome}{p.partido ? ` (${p.partido}${p.uf ? `-${p.uf}` : ""})` : ""}</span>}
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </>
  );
}

// Uma comissão: presidência e membros com foto
export function BlocoComissao({ no, cargos, idx, aoSelecionar }: { no: No; cargos: No[]; idx: Idx; aoSelecionar: Sel }) {
  const membros = (no.membros ?? []) as Membro[];
  const presid = cargos.filter((c) => c.codigoCargo === "PRES" || c.codigoCargo === "VICE").sort(ord);
  const [pres, ...vices] = presid;
  const foto = (m: Membro) => (m.i ? idx.get(m.i)?.ocupantes?.[0]?.foto : undefined);
  const grupos = new Map<string, Membro[]>();
  for (const m of membros) {
    const g = /suplente/i.test(m.t ?? "") ? "Suplentes" : "Titulares";
    if (!grupos.has(g)) grupos.set(g, []);
    grupos.get(g)!.push(m);
  }
  return (
    <>
      {pres && <CartaoGrande rotulo={pres.rotulo} c={pres} aoSelecionar={aoSelecionar} />}
      {!!vices.length && <Grade>{vices.map((c) => c.ocupantes?.[0] && <CartaoPequeno key={c.id} o={c.ocupantes[0]} linha={c.rotulo.replace(/ d[ao] .+$/, "")} aoClicar={() => aoSelecionar(c.id)} />)}</Grade>}
      {["Titulares", "Suplentes"].map((g) => grupos.get(g)?.length ? (
        <div key={g}>
          <Titulo n={grupos.get(g)!.length}>{g}</Titulo>
          <Grade>{grupos.get(g)!.map((m, k) => (
            <CartaoPequeno key={k} o={{ nome: m.n, partido: m.p, uf: m.u, foto: foto(m) }} aoClicar={m.i && idx.has(m.i) ? () => aoSelecionar(m.i!) : undefined} />
          ))}</Grade>
        </div>
      ) : null)}
      {!membros.length && !presid.length && <p className="mt-4 text-sm text-stone-500">A composição desta comissão não veio na última coleta.</p>}
    </>
  );
}

// Uma liderança: vice-líderes
export function BlocoLideranca({ no, idx, aoSelecionar }: { no: No; idx: Idx; aoSelecionar: Sel }) {
  const vices = (no.vices ?? []) as (Partial<Ocupante> & { nome: string; parlamentar?: string; titulo?: string })[];
  if (!vices.length) return null;
  return (
    <>
      <Titulo n={vices.length}>Vice-líderes</Titulo>
      <Grade>{vices.map((v, k) => (
        <CartaoPequeno key={k} o={v} linha={v.titulo && v.titulo !== "Vice-líder" ? v.titulo : undefined} aoClicar={v.parlamentar && idx.has(v.parlamentar) ? () => aoSelecionar(v.parlamentar!) : undefined} />
      ))}</Grade>
    </>
  );
}
