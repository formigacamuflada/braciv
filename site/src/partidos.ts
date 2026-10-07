// Posição ideológica dos partidos (0 = esquerda, 10 = direita).
// Fonte: Bolognesi, Ribeiro e Codato, "Uma Nova Classificação Ideológica dos Partidos Políticos
// Brasileiros", DADOS 66(2), 2023 — tabela de médias conferida em
// https://www.scielo.br/j/dados/a/zzyM3gzHD4P45WWdytXjZWg/?lang=pt (07/10/2026).
// Partidos que mudaram de nome ou nasceram de fusão depois da pesquisa estão marcados em "obs";
// as fusões NÃO foram conferidas no TSE ainda.
export const FONTE_IDEOLOGIA = "https://www.scielo.br/j/dados/a/zzyM3gzHD4P45WWdytXjZWg/?lang=pt";

type Info = { nota: number | null; nome: string; obs?: string };
export const PARTIDOS: Record<string, Info> = {
  PSOL: { nota: 1.28, nome: "PSOL" },
  PCdoB: { nota: 1.92, nome: "PCdoB" },
  PT: { nota: 2.97, nome: "PT" },
  PDT: { nota: 3.92, nome: "PDT" },
  PSB: { nota: 4.05, nome: "PSB" },
  REDE: { nota: 4.77, nome: "Rede" },
  CIDADANIA: { nota: 4.92, nome: "Cidadania", obs: "nota do PPS (antigo nome)" },
  PV: { nota: 5.29, nome: "PV" },
  AVANTE: { nota: 6.32, nome: "Avante" },
  SOLIDARIEDADE: { nota: 6.5, nome: "Solidariedade", obs: "nota do SDD (sigla anterior)" },
  MDB: { nota: 7.01, nome: "MDB" },
  PSD: { nota: 7.09, nome: "PSD" },
  PSDB: { nota: 7.11, nome: "PSDB" },
  PODE: { nota: 7.24, nome: "Podemos" },
  PRD: { nota: 7.33, nome: "PRD", obs: "média de PTB e Patriota (fusão não conferida no TSE)" },
  REPUBLICANOS: { nota: 7.78, nome: "Republicanos", obs: "nota do PRB (antigo nome)" },
  PL: { nota: 7.78, nome: "PL", obs: "nota do PR (antigo nome)" },
  DC: { nota: 8.11, nome: "DC" },
  NOVO: { nota: 8.13, nome: "Novo" },
  PP: { nota: 8.2, nome: "PP", obs: "nota do Progressistas" },
  "UNIÃO": { nota: 8.34, nome: "União Brasil", obs: "média de DEM e PSL (fusão não conferida no TSE)" },
  "MISSÃO": { nota: null, nome: "Missão", obs: "partido não avaliado na pesquisa" },
  "S/Partido": { nota: null, nome: "Sem partido" },
};

// Faixas da própria pesquisa: até 4,49 esquerda (inclui extrema e centro-esquerda), 4,5–5,5 centro, acima direita.
export type Campo = "Esquerda" | "Centro" | "Direita" | "Sem classificação";
export function campo(sigla?: string): Campo {
  const n = PARTIDOS[sigla ?? ""]?.nota;
  if (n == null) return "Sem classificação";
  return n <= 4.49 ? "Esquerda" : n <= 5.5 ? "Centro" : "Direita";
}
export const COR_CAMPO: Record<Campo, string> = { Esquerda: "#e5484d", Centro: "#a8a29e", Direita: "#3e63dd", "Sem classificação": "#57534e" };

// Cor de cada partido: tons do campo, escurecendo/clareando para distinguir vizinhos
const CORES: Record<string, string> = {
  PSOL: "#facc15", PCdoB: "#b91c1c", PT: "#e5484d", PDT: "#f97316", PSB: "#fb923c", REDE: "#14b8a6", CIDADANIA: "#ec4899",
  PV: "#22c55e", AVANTE: "#a3e635", SOLIDARIEDADE: "#f59e0b", MDB: "#15803d", PSD: "#84cc16", PSDB: "#38bdf8", PODE: "#a855f7",
  PRD: "#64748b", REPUBLICANOS: "#0ea5e9", PL: "#3e63dd", DC: "#94a3b8", NOVO: "#fb7185", PP: "#7dd3fc", "UNIÃO": "#22d3ee",
};
export const corPartido = (s?: string) => CORES[s ?? ""] ?? "#78716c";
export const notaPartido = (s?: string) => PARTIDOS[s ?? ""]?.nota ?? 99;
