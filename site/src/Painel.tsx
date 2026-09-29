import { useMemo } from "react";
import type { Aresta, Grafo, No } from "./tipos";
import { ROTULO_TIPO, corDoNo } from "./cores";

type Props = {
  dados: Grafo;
  id: string;
  aoSelecionar: (id: string) => void;
  aoAbrirOrgao?: (codigo: number) => void;
  aoFechar: () => void;
};

const LIMITE = 40;

// ordena ocupantes do cargo mais alto para o mais baixo
function peso(codigo?: string | null) {
  if (!codigo) return 0;
  const especiais: Record<string, number> = { PR: 1000, VPR: 990, MEST: 980, NE: 970 };
  if (especiais[codigo]) return especiais[codigo];
  const m = codigo.match(/^(CCE|FCE) \d\.(\d\d)$/);
  if (m) return 100 + Number(m[2]);
  const n = codigo.match(/(\d+)$/);
  return n ? Number(n[1]) : 1;
}

function Lista({ titulo, itens, render }: { titulo: string; itens: unknown[]; render: (x: any, i: number) => React.ReactNode }) {
  if (!itens.length) return null;
  return (
    <section className="mt-5">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-stone-500">
        {titulo} <span className="font-normal">({itens.length.toLocaleString("pt-BR")})</span>
      </h3>
      <ul className="mt-2 space-y-1.5 text-sm">{itens.slice(0, LIMITE).map(render)}</ul>
      {itens.length > LIMITE && <p className="mt-1 text-xs text-stone-500">e mais {(itens.length - LIMITE).toLocaleString("pt-BR")}…</p>}
    </section>
  );
}

export default function Painel({ dados, id, aoSelecionar, aoAbrirOrgao, aoFechar }: Props) {
  const idx = useMemo(() => new Map(dados.nos.map((n) => [n.id, n])), [dados]);
  const no = idx.get(id);
  const { saem, chegam } = useMemo(() => {
    const saem: Aresta[] = [], chegam: Aresta[] = [];
    for (const a of dados.arestas) {
      if (a.de === id) saem.push(a);
      if (a.para === id) chegam.push(a);
    }
    return { saem, chegam };
  }, [dados, id]);
  if (!no) return null;

  const link = (alvo: string, texto?: string) => {
    const n = idx.get(alvo);
    return (
      <button onClick={() => aoSelecionar(alvo)} className="text-left underline decoration-stone-300 underline-offset-2 hover:decoration-stone-800 dark:decoration-stone-600 dark:hover:decoration-stone-200">
        {texto ?? n?.rotulo ?? alvo}
      </button>
    );
  };

  const cargos = saem.filter((a) => a.tipo === "ocupa");
  const acima = saem.filter((a) => a.tipo === "subordinada");
  const abaixo = chegam.filter((a) => a.tipo === "subordinada");
  const ocupantes = chegam.filter((a) => a.tipo === "ocupa").sort((a, b) => peso(b.codigoCargo) - peso(a.codigoCargo));
  const membros = chegam.filter((a) => a.tipo === "membro" || a.tipo === "filiado");
  const codigoOrgao = no.tipo === "orgao" ? Number(no.id.slice(2)) : null;

  return (
    <aside className="flex h-full flex-col overflow-y-auto p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-stone-500">
            <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: corDoNo(no) }} />
            {no.papel ?? ROTULO_TIPO[no.tipo]}
          </p>
          <h2 className="mt-1 text-xl font-semibold leading-tight">{no.nome ?? no.rotulo}</h2>
          {no.sigla && no.nome && <p className="text-sm text-stone-500">{no.sigla}</p>}
        </div>
        <button onClick={aoFechar} aria-label="Fechar" className="rounded-md px-2 py-1 text-stone-500 hover:bg-stone-200 dark:hover:bg-stone-800">✕</button>
      </div>

      {no.foto && <img src={no.foto} alt="" className="mt-4 h-28 w-24 rounded-md object-cover" loading="lazy" />}

      <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
        {no.poder && <><dt className="text-stone-500">Poder</dt><dd>{no.poder}</dd></>}
        {no.natureza && <><dt className="text-stone-500">Natureza</dt><dd>{no.natureza}</dd></>}
        {no.partido && <><dt className="text-stone-500">Partido</dt><dd>{no.partido}{no.uf ? ` · ${no.uf}` : ""}</dd></>}
        {no.mesa && <><dt className="text-stone-500">Mesa</dt><dd>membro da Mesa</dd></>}
        {no.fonte && <><dt className="text-stone-500">Fonte</dt><dd>{no.fonte}</dd></>}
      </dl>

      {codigoOrgao !== null && aoAbrirOrgao && (
        <button onClick={() => aoAbrirOrgao(codigoOrgao)} className="mt-5 rounded-lg bg-stone-900 px-4 py-2 text-sm font-medium text-white hover:bg-stone-700 dark:bg-stone-100 dark:text-stone-900 dark:hover:bg-stone-300">
          Abrir estrutura completa do órgão
        </button>
      )}

      <Lista titulo="Cargos" itens={cargos} render={(a: Aresta, i) => (
        <li key={i} className={a.ate ? "opacity-60" : ""}>
          <span className="font-medium">{a.funcao ?? "Cargo"}</span>
          {a.codigoCargo && <span className="ml-1 rounded bg-stone-200 px-1 text-xs dark:bg-stone-800">{a.codigoCargo}</span>}
          <br />em {link(a.para)}
          {a.exata === false && a.unidadePortal && <span className="block text-xs text-stone-500">unidade no Portal: {a.unidadePortal}</span>}
          {a.desde && <span className="block text-xs text-stone-500">desde {a.desde} (DOU)</span>}
          {a.ate && <span className="block text-xs text-stone-500">saiu em {a.ate} (DOU)</span>}
        </li>
      )} />

      <Lista titulo="Atos no Diário Oficial" itens={no.dou ?? []} render={(d: any, i) => (
        <li key={i}>
          <span className="text-stone-500">{d.data}</span> · {d.verbo} {d.codigoCargo && <span className="text-xs">({d.codigoCargo})</span>}
          {d.url && <a href={d.url} target="_blank" rel="noreferrer" className="ml-1 text-xs underline">ver no DOU</a>}
        </li>
      )} />

      <Lista titulo="Fica em" itens={acima} render={(a: Aresta, i) => <li key={i}>{link(a.para)}</li>} />
      {no.vagas && (
        <section className="mt-5">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-stone-500">Vagas previstas (SIORG)</h3>
          <p className="mt-2 flex flex-wrap gap-1.5 text-xs">
            {Object.entries(no.vagas).sort().map(([k, v]) => (
              <span key={k} className="rounded bg-stone-200 px-1.5 py-0.5 dark:bg-stone-800">{k} × {v}</span>
            ))}
          </p>
        </section>
      )}
      <Lista titulo="Ocupantes" itens={ocupantes} render={(a: Aresta, i) => (
        <li key={i}>{link(a.de)} <span className="text-xs text-stone-500">{a.funcao}{a.codigoCargo ? ` · ${a.codigoCargo}` : ""}</span></li>
      )} />
      <Lista titulo="Unidades abaixo" itens={abaixo} render={(a: Aresta, i) => <li key={i}>{link(a.de)}</li>} />
      <Lista titulo="Membros" itens={membros} render={(a: Aresta, i) => {
        const m = idx.get(a.de) as No | undefined;
        return <li key={i}>{link(a.de)} <span className="text-xs text-stone-500">{m?.partido}{m?.uf ? ` · ${m.uf}` : ""}</span></li>;
      }} />
    </aside>
  );
}
