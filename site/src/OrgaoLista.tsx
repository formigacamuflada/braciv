import { useMemo, useState } from "react";
import type { Grafo, No } from "./tipos";

// Estrutura de um órgão como lista navegável: secretaria > departamento > coordenação,
// com o cargo mais alto de cada unidade e quem o ocupa. Substitui a "rede de bolinhas".
function peso(c?: string | null) {
  const e: Record<string, number> = { PR: 1000, VPR: 990, MEST: 980, NE: 970, TIT: 960, SUBST: 950 };
  if (c && e[c]) return e[c];
  const fc = (c ?? "").match(/^FC-?(\d+)$/);
  if (fc) return 100 + Number(fc[1]);
  const m = (c ?? "").match(/^(CCE|FCE) \d\.(\d\d)$/);
  return m ? 100 + Number(m[2]) : 1;
}

export default function OrgaoLista({ dados, raiz, selecionado, aoSelecionar }: { dados: Grafo; raiz: string; selecionado: string | null; aoSelecionar: (id: string) => void }) {
  const ix = useMemo(() => {
    const nos = new Map(dados.nos.map((n) => [n.id, n]));
    const filhos = new Map<string, string[]>(), cargos = new Map<string, No[]>(), total = new Map<string, number>();
    for (const a of dados.arestas) {
      if (a.tipo === "subordinada") { if (!filhos.has(a.para)) filhos.set(a.para, []); filhos.get(a.para)!.push(a.de); }
      if (a.tipo === "cargo") { const c = nos.get(a.de); if (c) { if (!cargos.has(a.para)) cargos.set(a.para, []); cargos.get(a.para)!.push(c); } }
    }
    for (const l of cargos.values()) l.sort((a, b) => peso(b.codigoCargo) - peso(a.codigoCargo));
    // quantas pessoas há em cada ramo (unidade + tudo abaixo dela)
    const conta = (id: string, guarda = new Set<string>()): number => {
      if (total.has(id)) return total.get(id)!;
      if (guarda.has(id)) return 0;
      guarda.add(id);
      const t = (cargos.get(id) ?? []).reduce((s, c) => s + (c.ocupantes?.length ?? 0), 0) + (filhos.get(id) ?? []).reduce((s, f) => s + conta(f, guarda), 0);
      total.set(id, t);
      return t;
    };
    conta(raiz);
    return { nos, filhos, cargos, total };
  }, [dados, raiz]);
  const [abertos, setAbertos] = useState<Set<string>>(new Set([raiz]));
  const alterna = (id: string) => setAbertos((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const linha = (id: string, prof: number): React.ReactNode => {
    const n = ix.nos.get(id);
    if (!n) return null;
    const filhos = (ix.filhos.get(id) ?? []).filter((f) => ix.nos.get(f)?.tipo === "unidade" || ix.nos.get(f)?.tipo === "orgao")
      .sort((a, b) => peso(ix.cargos.get(b)?.[0]?.codigoCargo) - peso(ix.cargos.get(a)?.[0]?.codigoCargo) || (ix.total.get(b) ?? 0) - (ix.total.get(a) ?? 0));
    const topo = ix.cargos.get(id)?.[0];
    const aberto = abertos.has(id);
    return (
      <li key={id}>
        <div className={`flex items-start gap-1.5 rounded-md py-1 pr-2 ${selecionado === id ? "bg-stone-200 dark:bg-stone-800" : ""}`} style={{ paddingLeft: 8 + prof * 18 }}>
          <button onClick={() => filhos.length && alterna(id)} className={`mt-0.5 w-4 shrink-0 text-stone-500 ${filhos.length ? "" : "invisible"}`} aria-label={aberto ? "Fechar" : "Abrir"}>{aberto ? "▾" : "▸"}</button>
          <button onClick={() => aoSelecionar(id)} className="min-w-0 flex-1 text-left">
            <span className={prof === 0 ? "font-semibold" : ""}>{n.nome ?? n.rotulo}</span>
            {n.sigla && n.nome && <span className="ml-1 text-xs text-stone-500">{n.sigla}</span>}
            {topo && <span className="block truncate text-xs text-stone-500">{topo.ocupantes?.[0]?.nome ?? "vago"} · {topo.rotulo}{topo.codigoCargo && !["TIT", "SUBST"].includes(topo.codigoCargo) ? ` (${topo.codigoCargo})` : ""}</span>}
          </button>
          {!!ix.total.get(id) && <span className="shrink-0 pt-0.5 text-xs text-stone-500" title="pessoas com cargo neste ramo">{ix.total.get(id)!.toLocaleString("pt-BR")}</span>}
        </div>
        {aberto && filhos.length > 0 && <ul>{filhos.slice(0, 400).map((f) => linha(f, prof + 1))}</ul>}
      </li>
    );
  };

  return (
    <div className="absolute inset-0 overflow-y-auto p-3 text-sm">
      <p className="mb-2 px-2 text-xs text-stone-500">Abra cada nível para descer na estrutura. O número à direita é quantas pessoas têm cargo naquele ramo.</p>
      <ul>{linha(raiz, 0)}</ul>
    </div>
  );
}
