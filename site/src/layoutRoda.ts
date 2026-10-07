import type { Grafo, No } from "./tipos";
import { CF, REG, type Base } from "./constituicao";

// Ângulos em graus: 0 = topo, sentido horário. Centro em (500, 500).
export const C = 500;
export const R_POVO = 92;
export const R_MIOLO = 150;

export type Poder = "Legislativo" | "Executivo" | "Funções Essenciais à Justiça" | "Judiciário";
export type Setor = { poder: Poder; a0: number; a1: number; rMax: number; rotulo: string };
export const SETORES: Setor[] = [
  // "Funções Essenciais à Justiça" saiu da roda (poucos órgãos no SIORG); o espaço foi para o Legislativo
  { poder: "Legislativo", a0: -55, a1: 55, rMax: 466, rotulo: "LEGISLATIVO" },
  { poder: "Executivo", a0: 55, a1: 250, rMax: 478, rotulo: "EXECUTIVO" },
  { poder: "Judiciário", a0: 250, a1: 305, rMax: 440, rotulo: "JUDICIÁRIO" },
];

export type Forma = "circulo" | "quadrado" | "pentagono" | "ponto" | "casa";
export type Item = {
  id: string;
  rotulo: string;
  nome: string;
  poder: Poder | "povo";
  forma: Forma;
  a: number;
  r: number;
  t: number;              // tamanho
  tom: number;            // 0..1, variação de cor dentro do Poder
  ocupante?: string;
  detalhe?: string;
};
export type Relacao = { de: string; para: string; verbo: string; base: Base };
export type Faixa = { poder: Poder; r: number; a0: number; a1: number; rotulo: string };
export type Roda = { itens: Item[]; relacoes: Relacao[]; faixas: Faixa[]; porId: Map<string, Item> };

export function ponto(a: number, r: number) {
  const rad = (a * Math.PI) / 180;
  return { x: C + r * Math.sin(rad), y: C - r * Math.cos(rad) };
}

// distribui n pontos em linhas concêntricas dentro de [a0, a1], a partir do raio r0
function emLinhas(n: number, a0: number, a1: number, r0: number, passoR: number, espaco: number) {
  const pos: { a: number; r: number }[] = [];
  let r = r0;
  while (pos.length < n) {
    const arco = ((a1 - a0) * Math.PI * r) / 180;
    const cabem = Math.max(1, Math.floor(arco / espaco));
    const k = Math.min(cabem, n - pos.length);
    const passoA = (a1 - a0) / cabem;
    const inicio = a0 + (a1 - a0 - passoA * (k - 1)) / 2;
    for (let i = 0; i < k; i++) pos.push({ a: inicio + i * passoA, r });
    r += passoR;
  }
  return pos;
}

function peso(c?: string | null) {
  if (!c) return 0;
  const e: Record<string, number> = { PR: 1000, VPR: 990, MEST: 980, NE: 970 };
  if (e[c]) return e[c];
  const m = c.match(/^(CCE|FCE) \d\.(\d\d)$/);
  return m ? 100 + Number(m[2]) : 1;
}

export function montaRoda(g: Grafo): Roda {
  const nos = new Map(g.nos.map((n) => [n.id, n]));
  const pai = new Map<string, string>();
  const ocupante = new Map<string, { nome: string; peso: number; funcao: string }>();
  for (const a of g.arestas) {
    if (a.tipo === "subordinada") pai.set(a.de, a.para);
    if (a.tipo === "cargo") {
      const c = nos.get(a.de);
      const oc = c?.ocupantes?.find((o) => !o.ate);
      if (!c || !oc) continue;
      const p = peso(c.codigoCargo);
      const atual = ocupante.get(a.para);
      if (!atual || p > atual.peso) ocupante.set(a.para, { nome: oc.nome, peso: p, funcao: c.rotulo });
    }
  }
  const sobe = (id: string, alvo: string) => {
    for (let c: string | undefined = id, i = 0; c && i < 40; c = pai.get(c), i++) if (c === alvo) return true;
    return false;
  };
  const itens: Item[] = [];
  const faixas: Faixa[] = [];
  const add = (n: No | undefined, extra: Partial<Item> & Pick<Item, "a" | "r" | "t" | "forma" | "poder">) => {
    if (!n) return;
    const oc = ocupante.get(n.id);
    itens.push({ id: n.id, rotulo: n.sigla || n.rotulo, nome: n.nome ?? n.rotulo, tom: 0.5, ocupante: oc ? `${oc.nome}${oc.funcao ? ` · ${oc.funcao}` : ""}` : undefined, ...extra });
  };
  const porSigla = (sigla: string, poder: string) => g.nos.find((n) => n.tipo === "orgao" && n.sigla === sigla && n.poder === poder);
  const orgaos = g.nos.filter((n) => n.tipo === "orgao");

  // ---- Executivo ----
  const ex = SETORES[1];
  const meio = (ex.a0 + ex.a1) / 2;
  const PR = nos.get("u:26"), VPR = nos.get("u:1408");
  add(PR, { a: meio - 4, r: 205, t: 17, forma: "circulo", poder: "Executivo", tom: 1 });
  add(VPR, { a: meio + 5, r: 205, t: 11, forma: "circulo", poder: "Executivo", tom: 0.8 });
  faixas.push({ poder: "Executivo", r: 232, a0: meio - 25, a1: meio + 25, rotulo: "PRESIDÊNCIA" });

  const ministerios = orgaos
    .filter((n) => n.poder === "Executivo" && n.tipoSiorg === "orgao" && n.id !== "u:26" && n.id !== "u:1408" && sobe(n.id, "u:26"))
    .sort((a, b) => (a.nome ?? "").localeCompare(b.nome ?? "", "pt-BR"));
  const idsMin = new Set(ministerios.map((m) => m.id));
  const vinculadas = new Map<string, No[]>(ministerios.map((m) => [m.id, []]));
  const semMinisterio: No[] = [];
  for (const n of orgaos) {
    if (n.poder !== "Executivo" || n.tipoSiorg === "orgao" && idsMin.has(n.id) || n.id === "u:26" || n.id === "u:1408") continue;
    if (n.tipoSiorg !== "entidade") continue;
    let dono: string | undefined;
    for (let c = pai.get(n.id), i = 0; c && i < 40; c = pai.get(c), i++) if (idsMin.has(c)) { dono = c; break; }
    (dono ? vinculadas.get(dono)! : semMinisterio).push(n);
  }
  const grupos = ministerios.map((m) => ({ m: m as No | null, ents: vinculadas.get(m.id)! }));
  if (semMinisterio.length) grupos.push({ m: null, ents: semMinisterio });
  // cada ministério ganha uma fatia base igual + um pouco a mais conforme o tamanho do grupo
  const largura = grupos.map((g) => 2.8 + 0.9 * Math.sqrt(g.ents.length));
  const total = largura.reduce((s, x) => s + x, 0);
  const escala = (ex.a1 - ex.a0 - 6) / total;
  let cursor = ex.a0 + 3;
  grupos.forEach((gr, i) => {
    const w = largura[i] * escala;
    const centro = cursor + w / 2;
    if (gr.m) add(gr.m, { a: centro, r: 300, t: 9, forma: "quadrado", poder: "Executivo", tom: 0.75, detalhe: `${gr.ents.length} entidade(s) vinculada(s)` });
    // entidades vinculadas: grade de pontos para fora, na mesma fatia do ministério
    const n = gr.ents.length;
    const linhas = Math.min(7, Math.max(2, Math.ceil(Math.sqrt(n * 0.8))));
    const cols = Math.ceil(n / linhas);
    const passoA = Math.min(1.15, (w * 0.8) / Math.max(1, cols));
    gr.ents.forEach((e, k) => {
      const col = Math.floor(k / linhas), lin = k % linhas;
      const a = centro + (col - (cols - 1) / 2) * passoA;
      add(e, { a, r: 362 + lin * 12, t: n > 40 ? 2.4 : 3, forma: "ponto", poder: "Executivo", tom: 0.35, detalhe: e.natureza ?? undefined });
    });
    cursor += w;
  });
  faixas.push({ poder: "Executivo", r: 330, a0: ex.a0 + 3, a1: ex.a1 - 3, rotulo: "MINISTÉRIOS E ÓRGÃOS DA PRESIDÊNCIA" });
  faixas.push({ poder: "Executivo", r: 352, a0: ex.a0 + 3, a1: ex.a1 - 3, rotulo: "AUTARQUIAS, FUNDAÇÕES E EMPRESAS VINCULADAS" });

  // ---- Legislativo ----
  const lg = SETORES[0];
  const CN = porSigla("CN", "Legislativo");
  add(CN, { a: 0, r: 218, t: 30, forma: "casa", poder: "Legislativo", tom: 0.3 });
  add(nos.get("casa:camara"), { a: -6.5, r: 218, t: 13, forma: "circulo", poder: "Legislativo", tom: 0.9 });
  add(nos.get("casa:senado"), { a: 6.5, r: 218, t: 13, forma: "circulo", poder: "Legislativo", tom: 0.9 });
  const senadores = g.nos.filter((n) => n.id.startsWith("sen:")).sort((a, b) => (a.partido ?? "").localeCompare(b.partido ?? "") || a.rotulo.localeCompare(b.rotulo));
  const deputados = g.nos.filter((n) => n.id.startsWith("dep:")).sort((a, b) => (a.partido ?? "").localeCompare(b.partido ?? "") || a.rotulo.localeCompare(b.rotulo));
  const tomPartido = (lista: No[]) => { const ps = [...new Set(lista.map((n) => n.partido))]; return (n: No) => (ps.indexOf(n.partido) % 2 ? 0.45 : 0.75); };
  const ts = tomPartido(senadores), td = tomPartido(deputados);
  emLinhas(senadores.length, lg.a0 + 4, lg.a1 - 4, 282, 9, 7.2).forEach((p, i) => {
    const n = senadores[i];
    add(n, { ...p, t: 2.6, forma: "ponto", poder: "Legislativo", tom: ts(n), ocupante: n.ocupantes?.[0]?.nome, detalhe: `${n.partido ?? "?"}-${n.uf ?? ""}` });
  });
  emLinhas(deputados.length, lg.a0 + 3, lg.a1 - 3, 322, 8.5, 6.2).forEach((p, i) => {
    const n = deputados[i];
    add(n, { ...p, t: 2.2, forma: "ponto", poder: "Legislativo", tom: td(n), ocupante: n.ocupantes?.[0]?.nome, detalhe: `${n.partido ?? "?"}-${n.uf ?? ""}` });
  });
  faixas.push({ poder: "Legislativo", r: 306, a0: lg.a0 + 4, a1: lg.a1 - 4, rotulo: "SENADORES · DEPUTADOS" });
  // Lideranças: Câmara à esquerda, Senado à direita, Congresso no meio
  const lideres = g.nos.filter((n) => n.codigoCargo === "LID").sort((a, b) => (a.ordem ?? 99) - (b.ordem ?? 99) || a.rotulo.localeCompare(b.rotulo, "pt-BR"));
  const lidCasa = (c: string) => lideres.filter((n) => n.casa === c);
  const det = (n: No) => { const o = n.ocupantes?.[0]; return o ? `${o.nome}${o.partido ? ` · ${o.partido}${o.uf ? `-${o.uf}` : ""}` : ""}` : undefined; };
  for (const [c, lado] of [["CD", -1], ["SF", 1]] as const) {
    const l = lidCasa(c), passo = Math.min(2.2, (lg.a1 - 9) / Math.max(1, l.length));
    l.forEach((n, k) => add(n, { a: lado * (4.5 + k * passo), r: 259, t: 2.6, forma: "circulo", poder: "Legislativo", tom: 0.95, ocupante: n.ocupantes?.[0]?.nome, detalhe: det(n) }));
  }
  lidCasa("CN").forEach((n, k, l) => add(n, { a: (k - (l.length - 1) / 2) * 2, r: 252, t: 2.6, forma: "circulo", poder: "Legislativo", tom: 1, ocupante: n.ocupantes?.[0]?.nome, detalhe: det(n) }));
  // Comissões permanentes, na borda do setor
  const comissoes = g.nos.filter((n) => n.comissao).sort((a, b) => (a.sigla ?? "").localeCompare(b.sigla ?? ""));
  for (const [casas, lado] of [[["CD"], -1], [["SF", "CN"], 1]] as const) {
    const l = comissoes.filter((n) => (casas as readonly string[]).includes(n.casa ?? ""));
    const porLinha = Math.ceil(l.length / 2), passo = Math.min(3.2, (lg.a1 - 7) / Math.max(1, porLinha));
    l.forEach((n, k) => add(n, { a: lado * (3.5 + (k % porLinha) * passo), r: 420 + Math.floor(k / porLinha) * 14, t: 4, forma: "quadrado", poder: "Legislativo", tom: 0.6,
      detalhe: n.nome ?? undefined }));
  }
  if (comissoes.length) faixas.push({ poder: "Legislativo", r: 402, a0: lg.a0 + 4, a1: lg.a1 - 4, rotulo: "COMISSÕES PERMANENTES" });
  // Mesas de cada Casa: o Presidente junto da Casa, os demais membros em arco para o lado de fora
  for (const [pref, lado] of [["mesa:cd:", -1], ["mesa:sf:", 1]] as const) {
    const mesa = g.nos.filter((n) => n.id.startsWith(pref)).sort((a, b) => (a.ordem ?? 99) - (b.ordem ?? 99));
    mesa.forEach((n, k) => add(n, { a: lado * (k === 0 ? 7 : 10 + (k - 1) * 3.4), r: k === 0 ? 243 : 242, t: k === 0 ? 7 : 4, forma: "quadrado", poder: "Legislativo", tom: k === 0 ? 1 : 0.8,
      ocupante: n.ocupantes?.[0]?.nome, detalhe: n.ocupantes?.[0]?.partido ? `${n.ocupantes[0].partido}${n.ocupantes[0].uf ? `-${n.ocupantes[0].uf}` : ""}` : undefined }));
  }

  // ---- Judiciário ----
  const jd = SETORES[2];
  const relJud: [string, string, Base][] = [];
  const mj = (jd.a0 + jd.a1) / 2;
  add(porSigla("STF", "Judiciário"), { a: mj, r: 212, t: 15, forma: "pentagono", poder: "Judiciário", tom: 1 });
  const superiores = ["STJ", "TST", "TSE", "STM", "CNJ", "CJF", "CSJT"].map((s) => porSigla(s, "Judiciário")).filter(Boolean) as No[];
  superiores.forEach((n, i) => add(n, { a: jd.a0 + 4 + ((jd.a1 - jd.a0 - 8) * (i + 0.5)) / superiores.length, r: i < 4 ? 285 : 330, t: i < 4 ? 9 : 7, forma: "pentagono", poder: "Judiciário", tom: 0.7 }));
  const usados = new Set(["STF", ...superiores.map((n) => n.sigla)]);
  const regionais = orgaos.filter((n) => n.poder === "Judiciário" && n.tipoSiorg === "orgao" && !usados.has(n.sigla ?? "") && n.sigla !== "PJ").sort((a, b) => (a.sigla ?? "").localeCompare(b.sigla ?? ""));
  emLinhas(regionais.length, jd.a0 + 3, jd.a1 - 3, 372, 11, 9).forEach((p, i) => add(regionais[i], { ...p, t: 3, forma: "ponto", poder: "Judiciário", tom: 0.4, detalhe: "tribunal / órgão da Justiça" }));
  faixas.push({ poder: "Judiciário", r: 245, a0: jd.a0 + 3, a1: jd.a1 - 3, rotulo: "STF" });
  // Ministros e conselheiros: pontinhos junto de cada tribunal; ao clicar no tribunal eles se abrem (ver Roda.tsx)
  const juizes = g.nos.filter((n) => n.juiz);
  const BASE_TRIB: Record<string, Base> = { STF: CF["101"], STJ: CF["104"], TST: CF["111a"], TSE: CF["119"], STM: CF["123"], CNJ: CF["103b"] };
  for (const corte of [porSigla("STF", "Judiciário"), ...superiores]) {
    if (!corte) continue;
    const it = itens.find((x) => x.id === corte.id);
    const membros = juizes.filter((n) => n.tribunal === corte.sigla).sort((a, b) => (a.ordem ?? 99) - (b.ordem ?? 99) || (a.ocupantes?.[0]?.nome ?? "").localeCompare(b.ocupantes?.[0]?.nome ?? "", "pt-BR"));
    if (!it || !membros.length) continue;
    const fora = it.r < 250;                      // STF: grade para fora; os demais: para dentro (entre o STF e o tribunal)
    const cols = 6;
    membros.forEach((n, k) => {
      const col = k % cols, lin = Math.floor(k / cols);
      const o = n.ocupantes?.[0];
      add(n, { a: it.a + (col - (cols - 1) / 2) * (fora ? 1.15 : 0.95), r: fora ? it.r + it.t + 6 + lin * 4.5 : it.r - it.t - 6 - lin * 4.5,
        t: 1.7, forma: "ponto", poder: "Judiciário", tom: 0.9, nome: o ? `${o.nome} · ${n.rotulo}` : n.rotulo, ocupante: o?.nome, detalhe: n.rotulo });
    });
    for (const n of membros) relJud.push([n.id, corte.id, BASE_TRIB[corte.sigla ?? ""] ?? CF["2"]]);
  }

  // ---- Relações (o que cada um faz) ----
  const porId = new Map(itens.map((i) => [i.id, i]));
  const relacoes: Relacao[] = [];
  const rel = (de: string | undefined, para: string | undefined, verbo: string, base: Base) => {
    if (de && para && (porId.has(de) || de === "povo") && porId.has(para)) relacoes.push({ de, para, verbo, base });
  };
  rel("povo", "u:26", "elege", CF["77"]);
  rel("povo", "u:1408", "elege", CF["77"]);
  rel("povo", "casa:camara", "elege", CF["45"]);
  rel("povo", "casa:senado", "elege", CF["46"]);
  // só onde há Ministro(a) de Estado de fato (cargo MEST), não em todo órgão da Presidência
  const comMinistro = new Set(g.arestas.filter((a) => a.tipo === "cargo" && nos.get(a.de)?.codigoCargo === "MEST").map((a) => a.para));
  for (const m of ministerios) if (comMinistro.has(m.id)) rel("u:26", m.id, "nomeia e exonera o(a) ministro(a)", CF["84i"]);
  const nomeadosComSenado = ["STF", "STJ", "TST", "STM"].map((s) => porSigla(s, "Judiciário")?.id);
  const bcb = orgaos.find((n) => n.sigla === "BCB" || n.nome === "Banco Central do Brasil")?.id;
  for (const alvo of [...nomeadosComSenado, bcb]) {
    rel("u:26", alvo, "indica e nomeia, após aprovação do Senado", alvo === nomeadosComSenado[0] ? CF["101u"] : CF["84xiv"]);
    rel("casa:senado", alvo, "aprova a escolha", CF["52iii"]);
  }
  for (const [de, para, base] of relJud) rel(de, para, "compõe o tribunal", base);
  rel("casa:camara", "mesa:cd:1", "elege a Mesa", CF["57p4"]);
  rel("casa:senado", "mesa:sf:1", "elege a Mesa", CF["57p4"]);
  // quem escolhe quem dentro do Legislativo (Regimentos Internos de cada Casa)
  for (const d of deputados) rel(d.id, "mesa:cd:1", "elegem a Mesa", REG.ricd7);
  for (const s of senadores) rel(s.id, "mesa:sf:1", "elegem a Mesa", REG.risf60);
  const sigla = (p?: string | null) => (p ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/^PODEMOS$/, "PODE").replace(/^REPUBLIC$/, "REPUBLICANOS");
  for (const l of lideres) {
    if (!l.partidoLid) continue;
    const bancada = l.casa === "CD" ? deputados : l.casa === "SF" ? senadores : [];
    for (const m of bancada) if (sigla(m.partido) === sigla(l.partidoLid)) rel(m.id, l.id, "escolhem o líder", l.casa === "CD" ? REG.ricd9 : REG.risf65p6);
  }
  for (const c of comissoes) {
    for (const m of (c.membros ?? []) as { i?: string; t?: string }[]) {
      if (!m.i) continue;
      const base = c.casa === "CD" ? REG.ricd39 : c.casa === "SF" ? REG.risf88 : CF["58p1"];
      rel(m.i, c.id, /suplente/i.test(m.t ?? "") ? "suplente" : "integra e elege a presidência", base);
    }
    if (c.casa === "CD") for (const l of lideres) if (l.casa === "CD" && l.partidoLid) rel(l.id, c.id, "indica os membros da bancada", REG.ricd28);
    if (c.casa === "SF") rel("mesa:sf:1", c.id, "designa os membros, por indicação dos líderes", REG.risf78);
  }
  rel("mesa:sf:1", CN?.id, "preside a Mesa do Congresso Nacional", CF["57p5"]);
  rel("casa:camara", "u:26", "fiscaliza e controla", CF["49x"]);
  rel("casa:senado", "u:26", "fiscaliza e controla", CF["49x"]);
  for (const [min, ents] of vinculadas) for (const e of ents) rel(min, e.id, "supervisiona", CF["87i"]);

  itens.push({ id: "povo", rotulo: "Povo brasileiro", nome: "Povo brasileiro", poder: "povo", forma: "circulo", a: 0, r: 0, t: R_POVO, tom: 1 });
  porId.set("povo", itens[itens.length - 1]);
  return { itens, relacoes, faixas, porId };
}

// Papel fixo de algumas posições, além das relações
export const PAPEL: Record<string, { verbo: string; base: Base }[]> = {
  povo: [{ verbo: "é a fonte de todo o poder", base: CF["1u"] }, { verbo: "vota de forma direta e secreta", base: CF["14"] }],
  "u:26": [{ verbo: "exerce o Poder Executivo, auxiliado pelos Ministros", base: CF["76"] }],
};

// Descrição de cada Poder e das posições centrais: só trechos da Constituição, sem texto inventado
export const DESCRICAO: Record<string, Base[]> = {
  povo: [CF["1u"], CF["14"]],
  "poder:Executivo": [CF["2"], CF["76"]],
  "poder:Legislativo": [CF["2"], CF["44"]],
  "poder:Judiciário": [CF["2"]],
  "poder:Funções Essenciais à Justiça": [CF["127"]],
  "u:26": [CF["76"], CF["77"]],
  "casa:camara": [CF["45"]],
  "casa:senado": [CF["46"], CF["52iii"]],
  "mesa:cd:1": [CF["57p4"]],
  "mesa:sf:1": [CF["57p4"], CF["57p5"]],
  "mesa:cn:1": [CF["57p5"]],
};
export const DESCRICAO_POR_SIGLA: Record<string, Base[]> = {
  STF: [CF["101u"], CF["102"]],
  CN: [CF["44"], CF["49x"]],
};

// O que ainda não está coberto pelos dados: aparece no painel em vez de deixá-lo vazio
export const COBERTURA: Record<string, string> = {
  "poder:Judiciário": "Ainda não coletamos quem ocupa os cargos do Judiciário (ministros, desembargadores, juízes e servidores). O SIORG traz a estrutura dos tribunais; o Portal da Transparência cobre só o Executivo.",
  "poder:Funções Essenciais à Justiça": "O SIORG traz poucos órgãos deste grupo (CNMP, MPDFT, ESMPU). Ministério Público Federal, Procuradoria-Geral da República e Defensoria Pública da União ainda não estão no mapa. A AGU aparece no Executivo, como no SIORG.",
  "poder:Legislativo": "Deputados, senadores, Mesas, lideranças e comissões permanentes vêm dos dados abertos da Câmara e do Senado; a estrutura administrativa e os servidores de cada Casa também (abra a Câmara ou o Senado). Comissões temporárias (CPIs, especiais, mistas de medida provisória) e frentes parlamentares ainda não estão no mapa.",
};
export const COBERTURA_PODER: Record<string, string> = {
  Judiciário: "Estrutura vinda do SIORG. Quem ocupa os cargos deste órgão ainda não foi coletado.",
  "Funções Essenciais à Justiça": "Estrutura vinda do SIORG. Quem ocupa os cargos deste órgão ainda não foi coletado.",
  Legislativo: "Estrutura administrativa e servidores vêm dos dados abertos da própria Casa (Câmara: arquivo Funcionários; Senado: Portal de Dados Administrativos).",
};
