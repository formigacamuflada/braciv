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
  cargo: "Cargo",
  pessoa: "Pessoa",
  partido: "Partido",
};

export function corDoNo(n: No): string {
  if (n.tipo === "poder") return COR_PODER[n.rotulo] ?? "#57534e";
  if (n.tipo === "casa") return COR_PODER.Legislativo;
  if (n.tipo === "partido") return "#0891b2";
  if (n.tipo === "cargo") {
    if (n.id.startsWith("dep:") || n.id.startsWith("sen:")) return "#60a5fa";
    return "#e11d48";
  }
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
    case "cargo": {
      const c = n.codigoCargo ?? "";
      if (["PR", "VPR", "MEST", "NE"].includes(c)) return 8;
      if (c === "DEP" || c === "SEN") return 3;
      const m = c.match(/^(CCE|FCE) \d\.(\d\d)$/);
      const nivel = m ? Number(m[2]) : 2;
      return 2.4 + Math.max(0, nivel - 10) * 0.45 + Math.min(3, Math.sqrt((n.ocupantes?.length ?? 1) - 1) * 0.4);
    }
    default:
      if (n.fonte?.startsWith("Planalto")) return 8;          // Presidente, Vice e Ministros
      if (n.id.startsWith("dep:") || n.id.startsWith("sen:")) return 3;
      return 2.6;
  }
}
