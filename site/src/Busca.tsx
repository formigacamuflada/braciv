import { useEffect, useMemo, useRef, useState } from "react";
import type { Grafo, ItemBusca } from "./tipos";
import { carregaBusca, normaliza } from "./dados";

type Resultado = { rotulo: string; id: string; orgao?: number; detalhe: string };
type Props = { dados: Grafo | null; aoEscolher: (r: Resultado) => void; nomeOrgao: (codigo: number) => string };

export default function Busca({ dados, aoEscolher, nomeOrgao }: Props) {
  const [texto, setTexto] = useState("");
  const [todas, setTodas] = useState<ItemBusca[] | null>(null);
  const [aberto, setAberto] = useState(false);
  const carregou = useRef(false);

  const doGrafo = useMemo(
    () => (dados?.nos ?? []).filter((n) => n.tipo !== "pessoa" && n.tipo !== "cargo").map((n) => ({ n, chave: normaliza(`${n.rotulo} ${n.nome ?? ""}`) })),
    [dados],
  );
  const pessoasGrafo = useMemo(
    () => (dados?.nos ?? []).filter((n) => n.tipo === "cargo").flatMap((n) => (n.ocupantes ?? []).map((o) => ({ n: { ...n, rotulo: o.nome, papel: n.rotulo }, chave: normaliza(o.nome) }))),
    [dados],
  );
  const chaves = useMemo(() => todas?.map((t) => normaliza(t[0])) ?? [], [todas]);

  useEffect(() => {
    if (aberto && !carregou.current) {
      carregou.current = true;
      carregaBusca().then(setTodas).catch(() => setTodas([]));
    }
  }, [aberto]);

  const resultados = useMemo<Resultado[]>(() => {
    const q = normaliza(texto.trim());
    if (q.length < 3) return [];
    const saida: Resultado[] = [];
    const vistos = new Set<string>();
    for (const { n, chave } of [...pessoasGrafo, ...doGrafo]) {
      if (chave.includes(q)) {
        saida.push({ rotulo: n.rotulo, id: n.id, detalhe: n.papel ?? (n.tipo === "orgao" ? "órgão" : n.tipo) });
        vistos.add(`${normaliza(n.rotulo)}|${n.id}`);
        if (saida.length >= 12) return saida;
      }
    }
    if (todas) {
      for (let i = 0; i < todas.length && saida.length < 25; i++) {
        if (chaves[i].includes(q) && !vistos.has(`${chaves[i]}|${todas[i][1]}`)) {
          saida.push({ rotulo: todas[i][0], id: todas[i][1], orgao: todas[i][2], detalhe: todas[i][2] ? nomeOrgao(todas[i][2]) : "cúpula / Congresso" });
          vistos.add(`${chaves[i]}|${todas[i][1]}`);
        }
      }
    }
    return saida;
  }, [texto, doGrafo, pessoasGrafo, todas, chaves, nomeOrgao]);

  return (
    <div className="relative w-full max-w-md">
      <input
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        onFocus={() => setAberto(true)}
        onBlur={() => setTimeout(() => setAberto(false), 150)}
        placeholder="Buscar pessoa, órgão ou unidade…"
        className="w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm outline-none focus:border-stone-500 dark:border-stone-700 dark:bg-stone-900"
      />
      {aberto && texto.trim().length >= 3 && (
        <ul className="absolute z-20 mt-1 max-h-96 w-full overflow-y-auto rounded-lg border border-stone-200 bg-white py-1 text-sm shadow-lg dark:border-stone-700 dark:bg-stone-900">
          {resultados.map((r) => (
            <li key={r.id + (r.orgao ?? "")}>
              <button onMouseDown={() => { aoEscolher(r); setTexto(""); }} className="w-full px-3 py-1.5 text-left hover:bg-stone-100 dark:hover:bg-stone-800">
                {r.rotulo} <span className="text-xs text-stone-500">· {r.detalhe}</span>
              </button>
            </li>
          ))}
          {!resultados.length && <li className="px-3 py-1.5 text-stone-500">{todas ? "Nada encontrado." : "Carregando índice de pessoas…"}</li>}
        </ul>
      )}
    </div>
  );
}
