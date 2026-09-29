import type { No } from "./tipos";

// Uma cor por Poder; tipos estruturais em tons neutros.
export const COR_PODER: Record<string, string> = {
  Executivo: "#166534",
  Legislativo: "#1d4ed8",
  Judiciário: "#b45309",
  "Funções Essenciais à Justiça": "#7c3aed",
};

export const ROTULO_TIPO: Record<No["tipo"], string> = {
  poder: "Poder",
  casa: "Casa legislativa",
  orgao: "Órgão / entidade",
  unidade: "Unidade",
  pessoa: "Pessoa",
  partido: "Partido",
};

export function corDoNo(n: No): string {
  if (n.tipo === "poder") return COR_PODER[n.rotulo] ?? "#57534e";
  if (n.tipo === "casa") return COR_PODER.Legislativo;
  if (n.tipo === "partido") return "#0891b2";
  if (n.tipo === "pessoa") {
    if (n.id.startsWith("dep:") || n.id.startsWith("sen:")) return "#60a5fa";
    return "#e11d48";
  }
  const base = COR_PODER[n.poder ?? "Executivo"] ?? "#57534e";
  return n.tipo === "orgao" ? base : base + "99";
}

export function tamanhoDoNo(n: No): number {
  switch (n.tipo) {
    case "poder": return 22;
    case "casa": return 16;
    case "partido": return 9;
    case "orgao": return n.tipoSiorg === "orgao" ? 10 : 6;
    case "unidade": return 3.2;
    default:
      if (n.fonte?.startsWith("Planalto")) return 8;          // Presidente, Vice e Ministros
      if (n.id.startsWith("dep:") || n.id.startsWith("sen:")) return 3;
      return 2.6;
  }
}
