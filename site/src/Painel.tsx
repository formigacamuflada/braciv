import { useMemo, useState } from "react";
import type { Aresta, Grafo, No, Ocupante } from "./tipos";
import { ROTULO_TIPO, corDoNo } from "./cores";
import { FONTE_CF, type Base } from "./constituicao";
import Ficha, { Retrato } from "./Ficha";
import { BlocoCasa, BlocoComissao, BlocoLideranca, BlocoTribunal } from "./Legislativo";

export type Conexao = { verbo: string; base: Base; sentido: "sai" | "chega"; itens: { id: string; rotulo: string }[] };

type Props = {
  dados: Grafo;
  id: string;
  descricao?: Base[];
  conexoes?: Conexao[];
  integrantes?: { id: string; rotulo: string; detalhe?: string }[];
  aviso?: string;
  noticias?: { titulo: string; link: string; data?: string; resumo?: string; fonte: string; imagem?: string | null }[];
  aoSelecionar: (id: string) => void;
  aoAbrirOrgao?: (codigo: number) => void;
  aoFechar: () => void;
};

const LIMITE = 40;

// ordena ocupantes do cargo mais alto para o mais baixo
function peso(codigo?: string | null) {
  if (!codigo) return 0;
  const especiais: Record<string, number> = { PR: 1000, VPR: 990, MEST: 980, NE: 970, MESA: 965, TIT: 960, PRES: 958, SUBST: 950, VICE: 948, LID: 945 };
  const fc = codigo.match(/^FC-?(\d+)$/);
  if (fc) return 100 + Number(fc[1]);
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

export default function Painel({ dados, id, descricao, conexoes, integrantes, aviso, noticias, aoSelecionar, aoAbrirOrgao, aoFechar }: Props) {
  const idx = useMemo(() => new Map(dados.nos.map((n) => [n.id, n])), [dados]);
  const [aba, setAba] = useState<"noticias" | "conectado" | null>(null);
  const abaAtiva = aba ?? (noticias?.length ? "noticias" : "conectado");
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
  const acima = saem.filter((a) => a.tipo === "subordinada" || a.tipo === "cargo");
  const abaixo = chegam.filter((a) => a.tipo === "subordinada");
  const ocupantes = chegam.filter((a) => a.tipo === "ocupa").sort((a, b) => peso(b.codigoCargo) - peso(a.codigoCargo));
  const cargosAqui = chegam
    .filter((a) => a.tipo === "cargo")
    .map((a) => idx.get(a.de))
    .filter((n): n is No => !!n)
    .sort((a, b) => peso(b.codigoCargo) - peso(a.codigoCargo) || (b.ocupantes?.length ?? 0) - (a.ocupantes?.length ?? 0));
  const membros = chegam.filter((a) => a.tipo === "membro" || a.tipo === "filiado");
  const CASAS: Record<string, number> = { "casa:camara": 67536, "casa:senado": 67490 };
  const codigoOrgao = no.tipo === "orgao" && /^u:\d+$/.test(no.id) ? Number(no.id.slice(2)) : CASAS[no.id] ?? null;
  const numU = (s?: string) => (s && /^u:\d+$/.test(s) ? Number(s.slice(2)) : null);
  const codigoFicha = no.tipo === "orgao" || no.tipo === "unidade" ? numU(no.id) : no.tipo === "cargo" && !["MESA", "LID", "PRES", "VICE", "MIN"].includes(no.codigoCargo ?? "") ? numU(acima.find((a) => a.tipo === "cargo")?.para) : null;

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

      {!!descricao?.length && (
        <section className="mt-4 space-y-3">
          {descricao.map((b) => (
            <blockquote key={b.dispositivo} className="border-l-2 border-stone-300 pl-3 text-sm leading-relaxed dark:border-stone-600">
              “{b.texto}”
              <footer className="mt-0.5 text-xs text-stone-500">
                <a href={b.fonte ?? FONTE_CF} target="_blank" rel="noreferrer" className="underline">{b.dispositivo}</a>
              </footer>
            </blockquote>
          ))}
        </section>
      )}

      {codigoFicha != null && (
        <Ficha key={codigoFicha} codigo={codigoFicha} sigla={no.tipo === "cargo" ? null : no.sigla} cargos={no.tipo === "cargo" ? [] : cargosAqui} aoSelecionar={aoSelecionar}
          sobre={no.tipo === "cargo" ? `Sobre a unidade: ${idx.get(`u:${codigoFicha}`)?.nome ?? idx.get(`u:${codigoFicha}`)?.rotulo ?? ""}` : undefined} />
      )}

      {(no.tipo === "casa" || no.sigla === "CN") && (
        <BlocoCasa no={no} cargos={cargosAqui} unidades={abaixo.map((a) => idx.get(a.de)).filter((n): n is No => !!n)} idx={idx} aoSelecionar={aoSelecionar} />
      )}
      {cargosAqui.some((c) => c.juiz) && <BlocoTribunal no={no} cargos={cargosAqui} aoSelecionar={aoSelecionar} />}
      {no.comissao && <BlocoComissao no={no} cargos={cargosAqui} idx={idx} aoSelecionar={aoSelecionar} />}


      {no.tipo === "cargo" && no.parlamentar && idx.has(no.parlamentar) && (
        <p className="mt-3 text-sm">{link(no.parlamentar, no.parlamentar.startsWith("sen:") ? "Ver o mandato de senador(a)" : "Ver o mandato de deputado(a)")}</p>
      )}

      {no.tipo === "cargo" && (
        <>
          {no.codigoCargo && !["DEP", "SEN", "MESA", "LID", "PRES", "VICE", "TIT", "SUBST", "MIN"].includes(no.codigoCargo) && (
            <p className="mt-3"><span className="rounded bg-stone-200 px-1.5 py-0.5 text-xs dark:bg-stone-800">{no.codigoCargo}</span></p>
          )}
          <Lista titulo={(no.ocupantes?.length ?? 0) > 1 ? "Quem ocupa" : "Quem ocupa"} itens={no.ocupantes ?? []} render={(o: Ocupante, i) => (
            <li key={i} className={`flex gap-3 rounded-lg border border-stone-200 p-2.5 dark:border-stone-700 ${o.ate ? "opacity-60" : ""}`}>
              <Retrato o={o} t={52} />
              <div className="min-w-0">
                <p className="font-medium">{o.nome}</p>
                <p className="text-xs text-stone-500">
                  {[o.partido && `${o.partido}${o.uf ? `-${o.uf}` : ""}`, o.fonte, o.desde && `desde ${o.desde}`, o.ate && `saiu em ${o.ate}`].filter(Boolean).join(" · ")}
                </p>
                {o.fotoFonte && <p className="text-[11px] text-stone-500">foto: {o.fotoFonte}</p>}
                {o.exata === false && o.unidadePortal && <p className="text-xs text-stone-500">unidade no Portal: {o.unidadePortal}</p>}
                {o.dou?.map((d, k) => (
                  <p key={k} className="text-xs text-stone-500">
                    {d.data} · {d.verbo}{d.url && <> · <a className="underline" href={d.url} target="_blank" rel="noreferrer">ver no DOU</a></>}
                  </p>
                ))}
              </div>
            </li>
          )} />
        </>
      )}

      {no.codigoCargo === "LID" && <BlocoLideranca no={no} idx={idx} aoSelecionar={aoSelecionar} />}

      {aviso && <p className="mt-4 rounded-lg bg-amber-100 px-3 py-2 text-xs leading-relaxed text-amber-900 dark:bg-amber-950/60 dark:text-amber-200">{aviso}</p>}

      {codigoOrgao !== null && aoAbrirOrgao && (
        <button onClick={() => aoAbrirOrgao(codigoOrgao)} className="mt-5 rounded-lg bg-stone-900 px-4 py-2 text-sm font-medium text-white hover:bg-stone-700 dark:bg-stone-100 dark:text-stone-900 dark:hover:bg-stone-300">
          {CASAS[no.id] ? "Abrir estrutura administrativa e servidores" : "Abrir estrutura completa do órgão"}
        </button>
      )}


      {/* abas, como no CivLab: notícias e quem está conectado */}
      <div className="mt-6 grid grid-cols-2 rounded-lg bg-stone-100 p-0.5 text-sm dark:bg-stone-800">
        {(["noticias", "conectado"] as const).map((a) => (
          <button key={a} onClick={() => setAba(a)} className={`rounded-md py-1.5 ${abaAtiva === a ? "bg-white font-medium shadow-sm dark:bg-stone-700" : "text-stone-500"}`}>
            {a === "noticias" ? `Notícias${noticias?.length ? ` (${noticias.length})` : ""}` : "Quem está conectado"}
          </button>
        ))}
      </div>

      {abaAtiva === "noticias" && (
        <section className="mt-4 space-y-4">
          {!noticias?.length && <p className="text-sm text-stone-500">Nenhuma notícia recente das agências públicas (Agência Brasil, Câmara, Senado e gov.br) cita esta posição.</p>}
          {noticias?.map((n, i) => (
            <article key={i} className="flex gap-3 border-b border-stone-200 pb-4 last:border-0 dark:border-stone-800">
              <div className="min-w-0 flex-1">
                <a href={n.link} target="_blank" rel="noreferrer" className="font-semibold leading-snug hover:underline">{n.titulo}</a>
                {n.data && <p className="mt-1 text-xs font-medium text-stone-500">{n.data.split("-").reverse().join("/")}</p>}
                {n.resumo && <p className="mt-1 line-clamp-4 text-sm text-stone-600 dark:text-stone-300">{n.resumo}</p>}
                <a href={n.link} target="_blank" rel="noreferrer" className="mt-1.5 inline-block rounded bg-stone-100 px-1.5 py-0.5 text-xs dark:bg-stone-800">{n.fonte} ↗</a>
              </div>
              {n.imagem && <img src={n.imagem} alt="" loading="lazy" className="h-20 w-28 shrink-0 rounded-md object-cover" onError={(e) => (e.currentTarget.style.display = "none")} />}
            </article>
          ))}
        </section>
      )}

      {abaAtiva === "conectado" && (
        <>
      {!!conexoes?.length && (
        <section className="mt-5">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-stone-500">Quem se conecta</h3>
          <ul className="mt-2 space-y-2.5 text-sm">
            {conexoes.map((c, i) => (
              <li key={i}>
                <p>
                  {c.sentido === "sai" ? <span className="font-medium">{c.verbo}</span> : <><span className="font-medium">{c.itens.length === 1 ? c.itens[0].rotulo : `${c.itens.length} posições`}</span> {c.verbo}</>}
                  <a href={c.base.fonte ?? FONTE_CF} target="_blank" rel="noreferrer" className="ml-1.5 text-xs text-stone-500 underline">{c.base.dispositivo}</a>
                </p>
                {(c.sentido === "sai" || c.itens.length > 1) && (
                  <div className="mt-1.5 grid grid-cols-2 gap-1.5">
                    {c.itens.slice(0, 12).map((x) => (
                      <button key={x.id} onClick={() => aoSelecionar(x.id)} className="rounded-lg border border-stone-200 px-2.5 py-1.5 text-left text-xs leading-snug hover:border-stone-400 dark:border-stone-700 dark:hover:border-stone-500">{x.rotulo}</button>
                    ))}
                  </div>
                )}
                {c.itens.length > 12 && <p className="mt-1 text-xs text-stone-500">e mais {c.itens.length - 12}</p>}
              </li>
            ))}
          </ul>
        </section>
      )}

      <Lista titulo="Neste Poder" itens={integrantes ?? []} render={(x: { id: string; rotulo: string; detalhe?: string }, i) => (
        <li key={i}>{link(x.id, x.rotulo)} {x.detalhe && <span className="text-xs text-stone-500">{x.detalhe}</span>}</li>
      )} />

      <Lista titulo="Cargos aqui" itens={cargosAqui.filter((c) => !["MESA", "LID", "PRES", "VICE", "MIN"].includes(c.codigoCargo ?? ""))} render={(c: No, i) => (
        <li key={i}>
          {link(c.id, /^exercer o encargo de substitut/i.test(c.rotulo) ? "Substituto(a) eventual" : c.rotulo)}
          {c.codigoCargo && <span className="ml-1 rounded bg-stone-200 px-1 text-xs dark:bg-stone-800">{c.codigoCargo}</span>}
          <span className="block text-xs text-stone-500">
            {(c.ocupantes ?? []).slice(0, 2).map((o) => o.nome).join(", ")}
            {(c.ocupantes?.length ?? 0) > 2 ? ` e mais ${(c.ocupantes!.length - 2).toLocaleString("pt-BR")}` : ""}
          </span>
        </li>
      )} />

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

      <Lista titulo={no.tipo === "cargo" ? "Onde fica" : "Fica em"} itens={acima} render={(a: Aresta, i) => <li key={i}>{link(a.para)}</li>} />
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
      <Lista titulo="Ocupantes (formato antigo)" itens={ocupantes} render={(a: Aresta, i) => (
        <li key={i}>{link(a.de)} <span className="text-xs text-stone-500">{a.funcao}{a.codigoCargo ? ` · ${a.codigoCargo}` : ""}</span></li>
      )} />
      <Lista titulo="Unidades abaixo" itens={abaixo.filter((a) => !idx.get(a.de)?.comissao)} render={(a: Aresta, i) => <li key={i}>{link(a.de)}</li>} />
      <Lista titulo="Membros" itens={membros} render={(a: Aresta, i) => {
        const m = idx.get(a.de) as No | undefined;
        return <li key={i}>{link(a.de, m?.ocupantes?.[0]?.nome ?? m?.rotulo)} <span className="text-xs text-stone-500">{m?.partido}{m?.uf ? ` · ${m.uf}` : ""}</span></li>;
      }} />
      {!descricao?.length && !conexoes?.length && !integrantes?.length && !aviso && !acima.length && !abaixo.length && !cargosAqui.length && !membros.length && !ocupantes.length && no.tipo !== "cargo" && (
        <p className="mt-4 text-sm text-stone-500">Ainda não há dados coletados sobre quem ocupa ou se liga a esta posição.</p>
      )}

        </>
      )}
    </aside>
  );
}
