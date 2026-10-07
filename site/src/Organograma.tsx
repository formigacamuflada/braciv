import { useMemo, useState } from "react";
import type { Grafo, No } from "./tipos";
import { carregaOrgao } from "./dados";

// Organograma navegável: Poder → órgão → unidades, abrindo nível por nível.
// Cada linha mostra o cargo mais alto da unidade e quem o ocupa.
function peso(c?: string | null) {
  const e: Record<string, number> = { PR: 1000, VPR: 990, MEST: 980, NE: 970 };
  if (c && e[c]) return e[c];
  const m = (c ?? "").match(/^(CCE|FCE) \d\.(\d\d)$/);
  return m ? 100 + Number(m[2]) : 1;
}
function indice(g: Grafo) {
  const filhos = new Map<string, string[]>(), cargos = new Map<string, No[]>();
  const nos = new Map(g.nos.map((n) => [n.id, n]));
  for (const a of g.arestas) {
    if (a.tipo === "subordinada") { if (!filhos.has(a.para)) filhos.set(a.para, []); filhos.get(a.para)!.push(a.de); }
    if (a.tipo === "cargo") { const c = nos.get(a.de); if (c) { if (!cargos.has(a.para)) cargos.set(a.para, []); cargos.get(a.para)!.push(c); } }
  }
  for (const l of cargos.values()) l.sort((a, b) => peso(b.codigoCargo) - peso(a.codigoCargo));
  return { nos, filhos, cargos };
}

export default function Organograma({ nucleo, aoAbrirOrgao }: { nucleo: Grafo; aoAbrirOrgao: (codigo: number, no?: string) => void }) {
  const base = useMemo(() => indice(nucleo), [nucleo]);
  const [abertos, setAbertos] = useState<Set<string>>(new Set(["poder:Executivo"]));
  const [detalhe, setDetalhe] = useState<Map<number, ReturnType<typeof indice>>>(new Map());

  const alterna = async (id: string) => {
    const novo = new Set(abertos);
    if (novo.has(id)) { novo.delete(id); setAbertos(novo); return; }
    novo.add(id); setAbertos(novo);
    const n = base.nos.get(id);
    if (n?.tipo === "orgao") {
      const cod = Number(id.slice(2));
      if (!detalhe.has(cod)) {
        try { const g = await carregaOrgao(cod); setDetalhe((d) => new Map(d).set(cod, indice(g))); } catch { /* sem arquivo do órgão */ }
      }
    }
  };

  const linha = (id: string, prof: number, ix: ReturnType<typeof indice>, orgao: number | null): React.ReactNode => {
    const n = ix.nos.get(id) ?? base.nos.get(id);
    if (!n || n.tipo === "cargo" || n.tipo === "partido") return null;
    const ehOrgao = n.tipo === "orgao";
    // dentro de um órgão aberto, os filhos vêm do arquivo completo dele
    const ixFilhos = ehOrgao && detalhe.has(Number(id.slice(2))) ? detalhe.get(Number(id.slice(2)))! : ix;
    const filhos = (ixFilhos.filhos.get(id) ?? []).filter((f) => { const t = ixFilhos.nos.get(f)?.tipo; return t && t !== "cargo"; });
    const topo = (ixFilhos.cargos.get(id) ?? [])[0];
    const aberto = abertos.has(id);
    const podeAbrir = filhos.length > 0 || (ehOrgao && !detalhe.has(Number(id.slice(2))));
    const orgaoAqui = ehOrgao ? Number(id.slice(2)) : orgao;
    return (
      <li key={id}>
        <div className="flex items-start gap-1.5 py-1" style={{ paddingLeft: prof * 18 }}>
          <button onClick={() => podeAbrir && alterna(id)} className={`mt-0.5 w-4 shrink-0 text-stone-500 ${podeAbrir ? "" : "invisible"}`} aria-label={aberto ? "Fechar" : "Abrir"}>
            {aberto ? "▾" : "▸"}
          </button>
          <div className="min-w-0">
            <button onClick={() => orgaoAqui && aoAbrirOrgao(orgaoAqui, id)} className={`text-left ${n.tipo === "poder" ? "font-semibold" : ehOrgao ? "font-medium" : ""} hover:underline`}>
              {n.nome ?? n.rotulo}{n.sigla && n.nome ? <span className="ml-1 text-xs text-stone-500">{n.sigla}</span> : null}
            </button>
            {topo && (
              <span className="block truncate text-xs text-stone-500">
                {topo.ocupantes?.[0]?.nome ?? "—"} · {topo.rotulo}{topo.codigoCargo ? ` (${topo.codigoCargo})` : ""}
              </span>
            )}
          </div>
          {filhos.length > 0 && <span className="ml-auto shrink-0 pl-2 text-xs text-stone-500">{filhos.length}</span>}
        </div>
        {aberto && filhos.length > 0 && (
          <ul>{filhos
            .sort((a, b) => peso((ixFilhos.cargos.get(b) ?? [])[0]?.codigoCargo) - peso((ixFilhos.cargos.get(a) ?? [])[0]?.codigoCargo)
              || (ixFilhos.filhos.get(b)?.length ?? 0) - (ixFilhos.filhos.get(a)?.length ?? 0))
            .slice(0, 300).map((f) => linha(f, prof + 1, ixFilhos, orgaoAqui))}</ul>
        )}
      </li>
    );
  };

  return (
    <div className="h-full overflow-y-auto p-4">
      <h2 className="text-lg font-semibold">Organograma</h2>
      <p className="max-w-2xl text-sm text-stone-500">Abra nível por nível: Poder, órgão, secretarias, departamentos, coordenações. Ao lado de cada unidade, o cargo mais alto e quem o ocupa. Clique no nome para ver no grafo do órgão.</p>
      <ul className="mt-3 text-sm">{["poder:Executivo", "poder:Legislativo", "poder:Judiciário", "poder:Funções Essenciais à Justiça"].map((p) => linha(p, 0, base, null))}</ul>
    </div>
  );
}
