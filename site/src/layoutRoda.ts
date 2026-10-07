import type { Grafo, No } from "./tipos";
import { CF, type Base } from "./constituicao";

// Ângulos em graus: 0 = topo, sentido horário. Centro em (500, 500).
export const C = 500;
export const R_POVO = 92;
export const R_MIOLO = 150;

export type Poder = "Legislativo" | "Executivo" | "Funções Essenciais à Justiça" | "Judiciário";
export type Setor = { poder: Poder; a0: number; a1: number; rMax: number; rotulo: string };
export const SETORES: Setor[] = [
  { poder: "Legislativo", a0: -38, a1: 38, rMax: 440, rotulo: "LEGISLATIVO" },
  { poder: "Executivo", a0: 38, a1: 248, rMax: 478, rotulo: "EXECUTIVO" },
  { poder: "Funções Essenciais à Justiça", a0: 248, a1: 282, rMax: 400, rotulo: "FUNÇÕES ESSENCIAIS" },
  { poder: "Judiciário", a0: 282, a1: 322, rMax: 430, rotulo: "JUDICIÁRIO" },
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
  emLinhas(senadores.length, lg.a0 + 4, lg.a1 - 4, 270, 9, 7.2).forEach((p, i) => {
    const n = senadores[i];
    add(n, { ...p, t: 2.6, forma: "ponto", poder: "Legislativo", tom: ts(n), ocupante: n.ocupantes?.[0]?.nome, detalhe: `${n.partido ?? "?"}-${n.uf ?? ""}` });
  });
  emLinhas(deputados.length, lg.a0 + 3, lg.a1 - 3, 312, 8.5, 6.2).forEach((p, i) => {
    const n = deputados[i];
    add(n, { ...p, t: 2.2, forma: "ponto", poder: "Legislativo", tom: td(n), ocupante: n.ocupantes?.[0]?.nome, detalhe: `${n.partido ?? "?"}-${n.uf ?? ""}` });
  });
  faixas.push({ poder: "Legislativo", r: 255, a0: lg.a0 + 4, a1: lg.a1 - 4, rotulo: "CONGRESSO NACIONAL" });

  // ---- Judiciário ----
  const jd = SETORES[3];
  const mj = (jd.a0 + jd.a1) / 2;
  add(porSigla("STF", "Judiciário"), { a: mj, r: 212, t: 15, forma: "pentagono", poder: "Judiciário", tom: 1 });
  const superiores = ["STJ", "TST", "TSE", "STM", "CNJ", "CJF", "CSJT"].map((s) => porSigla(s, "Judiciário")).filter(Boolean) as No[];
  superiores.forEach((n, i) => add(n, { a: jd.a0 + 4 + ((jd.a1 - jd.a0 - 8) * (i + 0.5)) / superiores.length, r: i < 4 ? 285 : 330, t: i < 4 ? 9 : 7, forma: "pentagono", poder: "Judiciário", tom: 0.7 }));
  const usados = new Set(["STF", ...superiores.map((n) => n.sigla)]);
  const regionais = orgaos.filter((n) => n.poder === "Judiciário" && n.tipoSiorg === "orgao" && !usados.has(n.sigla ?? "") && n.sigla !== "PJ").sort((a, b) => (a.sigla ?? "").localeCompare(b.sigla ?? ""));
  emLinhas(regionais.length, jd.a0 + 3, jd.a1 - 3, 372, 11, 9).forEach((p, i) => add(regionais[i], { ...p, t: 3, forma: "ponto", poder: "Judiciário", tom: 0.4, detalhe: "tribunal / órgão da Justiça" }));
  faixas.push({ poder: "Judiciário", r: 245, a0: jd.a0 + 3, a1: jd.a1 - 3, rotulo: "STF" });

  // ---- Funções essenciais à Justiça ----
  const fj = SETORES[2];
  const fejs = orgaos.filter((n) => n.poder === "Funções Essenciais à Justiça" && n.tipoSiorg === "orgao");
  fejs.forEach((n, i) => add(n, { a: fj.a0 + ((fj.a1 - fj.a0) * (i + 0.5)) / fejs.length, r: 260 + (i % 2) * 40, t: 8, forma: "pentagono", poder: "Funções Essenciais à Justiça", tom: 0.7 }));

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
};
export const DESCRICAO_POR_SIGLA: Record<string, Base[]> = {
  STF: [CF["101u"], CF["102"]],
  CN: [CF["44"], CF["49x"]],
};

// O que ainda não está coberto pelos dados: aparece no painel em vez de deixá-lo vazio
export const COBERTURA: Record<string, string> = {
  "poder:Judiciário": "Ainda não coletamos quem ocupa os cargos do Judiciário (ministros, desembargadores, juízes e servidores). O SIORG traz a estrutura dos tribunais; o Portal da Transparência cobre só o Executivo.",
  "poder:Funções Essenciais à Justiça": "O SIORG traz poucos órgãos deste grupo (CNMP, MPDFT, ESMPU). Ministério Público Federal, Procuradoria-Geral da República e Defensoria Pública da União ainda não estão no mapa. A AGU aparece no Executivo, como no SIORG.",
  "poder:Legislativo": "Deputados e senadores vêm das APIs da Câmara e do Senado. Mesa, lideranças, comissões e servidores do Legislativo ainda não estão no mapa.",
};
export const COBERTURA_PODER: Record<string, string> = {
  Judiciário: "Estrutura vinda do SIORG. Quem ocupa os cargos deste órgão ainda não foi coletado.",
  "Funções Essenciais à Justiça": "Estrutura vinda do SIORG. Quem ocupa os cargos deste órgão ainda não foi coletado.",
  Legislativo: "Estrutura vinda do SIORG. Servidores e cargos internos desta Casa ainda não foram coletados.",
};
