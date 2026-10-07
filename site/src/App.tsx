import { useCallback, useEffect, useMemo, useState } from "react";
import Grafo from "./Grafo";
import Estrutura from "./Estrutura";
import Mapa from "./Mapa";
import Painel, { type Conexao } from "./Painel";
import { COBERTURA, COBERTURA_PODER, DESCRICAO, DESCRICAO_POR_SIGLA, montaRoda } from "./layoutRoda";
import Busca from "./Busca";
import { carregaMeta, carregaNucleo, carregaOrgao } from "./dados";
import type { Grafo as DadosGrafo, Meta } from "./tipos";
import { COR_PODER } from "./cores";

// Endereços: #/  (visão geral) · #/orgao/308800 · qualquer um com ?no=<id> para abrir já selecionado
function leHash() {
  const [caminho, consulta] = location.hash.replace(/^#/, "").split("?");
  const m = caminho.match(/^\/orgao\/(\d+)/);
  const u = caminho.match(/^\/uf\/([A-Z]{2})/);
  const v = caminho.match(/^\/(roda|grafo)/);
  const no = new URLSearchParams(consulta ?? "").get("no");
  return { orgao: m ? Number(m[1]) : null, no, uf: u ? u[1] : null, vista: (v ? v[1] : no ? "roda" : "mapa") as "mapa" | "roda" | "grafo" };
}
function escreveHash(orgao: number | null, no: string | null, vista: string, uf: string | null) {
  const base = orgao ? `orgao/${orgao}` : vista === "mapa" ? (uf ? `uf/${uf}` : "") : vista;
  const h = `#/${base}${no && vista !== "mapa" || orgao ? (no ? `?no=${encodeURIComponent(no)}` : "") : ""}`;
  if (location.hash !== h) history.replaceState(null, "", h);
}

export default function App() {
  const inicial = leHash();
  const [orgao, setOrgao] = useState<number | null>(inicial.orgao);
  const [selecionado, setSelecionado] = useState<string | null>(inicial.no);
  const [dados, setDados] = useState<DadosGrafo | null>(null);
  const [nucleo, setNucleo] = useState<DadosGrafo | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [escuro, setEscuro] = useState(() => matchMedia("(prefers-color-scheme: dark)").matches);
  const [vista, setVista] = useState<"mapa" | "roda" | "grafo">(inicial.vista);
  const [uf, setUf] = useState<string | null>(inicial.uf);

  useEffect(() => {
    const mq = matchMedia("(prefers-color-scheme: dark)");
    const f = () => setEscuro(mq.matches);
    mq.addEventListener("change", f);
    return () => mq.removeEventListener("change", f);
  }, []);
  useEffect(() => { carregaNucleo().then(setNucleo).catch((e) => setErro(String(e))); carregaMeta().then(setMeta).catch(() => {}); }, []);
  useEffect(() => {
    setDados(null);
    setErro(null);
    (orgao ? carregaOrgao(orgao) : carregaNucleo()).then(setDados).catch((e) => setErro(String(e)));
  }, [orgao]);
  useEffect(() => escreveHash(orgao, selecionado, vista, uf), [orgao, selecionado, vista, uf]);
  useEffect(() => {
    const f = () => { const h = leHash(); setOrgao(h.orgao); setSelecionado(h.no); setVista(h.vista); setUf(h.uf); };
    addEventListener("hashchange", f);
    return () => removeEventListener("hashchange", f);
  }, []);

  const nomesOrgao = useMemo(() => new Map((nucleo?.nos ?? []).filter((n) => n.tipo === "orgao").map((n) => [Number(n.id.slice(2)), n.sigla ?? n.rotulo])), [nucleo]);
  const nomeOrgao = useCallback((c: number) => nomesOrgao.get(c) ?? `órgão ${c}`, [nomesOrgao]);
  const aoSelecionar = useCallback((id: string | null) => setSelecionado(id), []);
  const abreOrgao = useCallback((c: number) => { setOrgao(c); setSelecionado(`u:${c}`); }, []);

  // dados extras do painel na visão geral: papel constitucional, relações e integrantes de cada Poder
  const roda = useMemo(() => (nucleo ? montaRoda(nucleo) : null), [nucleo]);
  const dadosPainel = useMemo(() => {
    if (!dados || orgao) return dados;
    return { ...dados, nos: [...dados.nos, { id: "povo", tipo: "poder" as const, rotulo: "Povo brasileiro", papel: "Soberania popular" }] };
  }, [dados, orgao]);
  const extras = useMemo(() => {
    if (!selecionado || !roda || orgao) return {};
    const no = dadosPainel?.nos.find((n) => n.id === selecionado);
    const descricao = DESCRICAO[selecionado] ?? (no?.sigla ? DESCRICAO_POR_SIGLA[no.sigla] : undefined);
    const grupos = new Map<string, Conexao>();
    for (const r of roda.relacoes) {
      const sentido = r.de === selecionado ? "sai" : r.para === selecionado ? "chega" : null;
      if (!sentido) continue;
      const outro = sentido === "sai" ? r.para : r.de;
      const k = `${sentido}|${r.verbo}|${r.base.dispositivo}`;
      if (!grupos.has(k)) grupos.set(k, { verbo: r.verbo, base: r.base, sentido, itens: [] });
      grupos.get(k)!.itens.push({ id: outro, rotulo: outro === "povo" ? "Povo brasileiro" : roda.porId.get(outro)?.nome ?? outro });
    }
    const integrantes = selecionado.startsWith("poder:")
      ? roda.itens.filter((i) => i.poder === selecionado.slice(6))
          .sort((a, b) => b.t - a.t)
          .map((i) => ({ id: i.id, rotulo: i.nome, detalhe: i.ocupante ?? i.detalhe }))
      : undefined;
    const temCargo = dadosPainel?.arestas.some((a) => a.para === selecionado && a.tipo === "cargo");
    const aviso = COBERTURA[selecionado] ?? (no?.poder && !temCargo && no.tipo !== "cargo" ? COBERTURA_PODER[no.poder] : undefined);
    return { descricao, conexoes: [...grupos.values()], integrantes, aviso };
  }, [selecionado, roda, orgao, dadosPainel]);

  const contagem = useMemo(() => {
    if (!dados) return null;
    const cargos = dados.nos.filter((n) => n.tipo === "cargo");
    const pessoas = cargos.reduce((s, n) => s + (n.ocupantes?.length ?? 0), 0);
    const raiz = orgao ? `u:${orgao}` : null;
    const soltas = raiz ? dados.arestas.filter((a) => a.tipo === "cargo" && a.exata === false && a.para === raiz).length : 0;
    return {
      texto: `${cargos.length.toLocaleString("pt-BR")} cargos · ${pessoas.toLocaleString("pt-BR")} ocupantes`,
      soltas: soltas ? `${soltas.toLocaleString("pt-BR")} cargos sem unidade identificada aparecem só na lista do órgão` : null,
    };
  }, [dados, orgao]);

  return (
    <div className="flex h-full flex-col">
      <header className="flex flex-wrap items-center gap-3 border-b border-stone-200 px-4 py-3 dark:border-stone-800">
        <button onClick={() => { setOrgao(null); setSelecionado(null); }} className="text-left">
          <h1 className="text-lg font-bold tracking-tight">BRA.CIV</h1>
          <p className="-mt-0.5 text-xs text-stone-500">Grafo dos 3 Poderes · dados oficiais</p>
        </button>
        <div className="order-3 w-full sm:order-2 sm:ml-6 sm:w-auto sm:flex-1">
          <Busca
            dados={dados}
            nomeOrgao={nomeOrgao}
            aoEscolher={(r) => {
              if (vista === "mapa") setVista("roda");
              if (!dados?.nos.some((n) => n.id === r.id)) setOrgao(r.orgao ? r.orgao : null);
              setSelecionado(r.id);
            }}
          />
        </div>
        {orgao && (
          <button onClick={() => { setOrgao(null); setSelecionado(`u:${orgao}`); }} className="order-2 ml-auto rounded-lg border border-stone-300 px-3 py-1.5 text-sm hover:bg-stone-100 sm:order-3 dark:border-stone-700 dark:hover:bg-stone-800">
            ← Visão geral
          </button>
        )}
      </header>

      <main className="relative flex min-h-0 flex-1 flex-col md:flex-row">
        <div className="relative min-h-[50vh] flex-1">
          {!orgao && vista === "mapa" && (
            <Mapa uf={uf} aoEscolherUf={setUf}
              aoAbrirCargo={(o, c) => { setOrgao(o); setSelecionado(c); }}
              aoAbrirNo={(id) => { setVista("roda"); setSelecionado(id); }} />
          )}
          {dados && !orgao && vista === "roda" && (
            <Estrutura dados={dados} selecionado={selecionado} aoSelecionar={aoSelecionar}
              aoAbrirOrgao={(c, no) => { setOrgao(c); setSelecionado(no ?? `u:${c}`); }} />
          )}
          {dados && (orgao || vista === "grafo") && <Grafo dados={dados} raiz={orgao ? `u:${orgao}` : null} selecionado={selecionado} aoSelecionar={aoSelecionar} escuro={escuro} />}
          {!orgao && (
            <div className={`absolute z-20 flex ${vista === "mapa" ? "left-3 bottom-3 lg:left-auto lg:right-[436px]" : "bottom-3 right-3"} overflow-hidden rounded-lg border border-stone-300 bg-white text-sm dark:border-stone-700 dark:bg-stone-900`}>
              {(["mapa", "roda", "grafo"] as const).map((v) => (
                <button key={v} onClick={() => setVista(v)} className={`px-3 py-1.5 ${vista === v ? "bg-stone-900 text-white dark:bg-stone-100 dark:text-stone-900" : "text-stone-500 hover:text-stone-900 dark:hover:text-white"}`}>
                  {v === "mapa" ? "Mapa" : v === "roda" ? "Estrutura" : "Grafo"}
                </button>
              ))}
            </div>
          )}
          {!dados && !erro && <p className="absolute inset-0 grid place-items-center text-sm text-stone-500">Carregando o grafo…</p>}
          {erro && <p className="absolute inset-0 grid place-items-center px-6 text-center text-sm text-red-700">{erro}</p>}

          <div className={`pointer-events-none absolute bottom-3 left-3 rounded-lg ${selecionado ? "hidden md:block" : ""} ${!orgao && vista !== "grafo" ? "!hidden" : ""} bg-white/85 p-3 text-xs shadow-sm backdrop-blur dark:bg-stone-900/85`}>
            <p className="font-semibold">{orgao ? `Órgão: ${nomeOrgao(orgao)}` : "Visão geral"}</p>
            {contagem && <p className="text-stone-500">{contagem.texto}</p>}
            {contagem?.soltas && <p className="max-w-56 text-stone-500">{contagem.soltas}</p>}
            <ul className="mt-2 space-y-0.5">
              {Object.entries(COR_PODER).map(([p, c]) => (
                <li key={p} className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full" style={{ background: c }} />{p}</li>
              ))}
              <li className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full" style={{ background: "#e11d48" }} />Cargo (com quem ocupa dentro)</li>
              <li className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full" style={{ background: "#60a5fa" }} />Cadeira no Congresso</li>
              <li className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full" style={{ background: "#0891b2" }} />Partido</li>
            </ul>
          </div>
        </div>

        {(orgao || vista !== "mapa") && selecionado && dadosPainel && dadosPainel.nos.some((n) => n.id === selecionado) && (
          <div className="max-h-[50vh] border-t border-stone-200 bg-white md:max-h-none md:w-[400px] md:border-l md:border-t-0 dark:border-stone-800 dark:bg-stone-900">
            <Painel dados={dadosPainel} id={selecionado} {...extras} aoSelecionar={setSelecionado} aoAbrirOrgao={orgao ? undefined : abreOrgao} aoFechar={() => setSelecionado(null)} />
          </div>
        )}
      </main>

      <footer className="border-t border-stone-200 px-4 py-2 text-[11px] leading-relaxed text-stone-500 dark:border-stone-800">
        Fontes: SIORG (estrutura e vagas), Portal da Transparência (ocupantes{meta?.retratoPortal ? `, retrato de ${meta.retratoPortal}` : ""}),
        Diário Oficial da União via INLABS (nomeações e exonerações{meta?.douAte ? ` até ${meta.douAte}` : ""}), Planalto (Presidente, Vice e Ministros{meta?.planalto ? `, página de ${meta.planalto}` : ""}),
        Câmara e Senado (parlamentares).{meta?.geradoEm ? ` Atualizado em ${meta.geradoEm}.` : ""}{" "}
        Ligações entre fontes são feitas por nome e código de cargo e podem conter erros.{" "}
        <a className="underline" href="https://github.com/formigacamuflada/braciv">Código e dados</a>
      </footer>
    </div>
  );
}
