import { useState } from "react";
import type { Grafo } from "./tipos";
import Roda from "./Roda";
import Vagas from "./Vagas";
import Diario from "./Diario";
import Fluxo from "./Fluxo";
import Organograma from "./Organograma";

export type Aba = "vagas" | "diario" | "fluxo" | "organograma" | "roda";
const ABAS: { id: Aba; rotulo: string }[] = [
  { id: "vagas", rotulo: "Vagas × ocupados" },
  { id: "diario", rotulo: "Diário Oficial" },
  { id: "fluxo", rotulo: "Quem nomeia quem" },
  { id: "organograma", rotulo: "Organograma" },
  { id: "roda", rotulo: "Roda dos Poderes" },
];

type Props = {
  dados: Grafo;
  selecionado: string | null;
  aoSelecionar: (id: string | null) => void;
  aoAbrirOrgao: (codigo: number, no?: string) => void;
};

export default function Estrutura({ dados, selecionado, aoSelecionar, aoAbrirOrgao }: Props) {
  const [aba, setAba] = useState<Aba>(() => {
    try { return (localStorage.getItem("braciv-aba") as Aba) || "vagas"; } catch { return "vagas"; }
  });
  const muda = (a: Aba) => { setAba(a); try { localStorage.setItem("braciv-aba", a); } catch { /* sem armazenamento */ } };
  return (
    <div className="absolute inset-0 flex flex-col">
      <nav className="flex shrink-0 gap-1 overflow-x-auto border-b border-stone-200 px-3 pt-2 dark:border-stone-800">
        {ABAS.map((a) => (
          <button key={a.id} onClick={() => muda(a.id)}
            className={`whitespace-nowrap rounded-t-md px-3 py-1.5 text-sm ${aba === a.id ? "border border-b-0 border-stone-200 bg-white font-medium dark:border-stone-800 dark:bg-stone-900" : "text-stone-500 hover:text-stone-900 dark:hover:text-white"}`}>
            {a.rotulo}
          </button>
        ))}
      </nav>
      <div className="relative min-h-0 flex-1">
        {aba === "vagas" && <Vagas aoAbrirOrgao={(c) => aoSelecionar(`u:${c}`)} />}
        {aba === "diario" && <Diario />}
        {aba === "fluxo" && <Fluxo dados={dados} aoAbrir={aoSelecionar} />}
        {aba === "organograma" && <Organograma nucleo={dados} aoAbrirOrgao={aoAbrirOrgao} />}
        {aba === "roda" && <Roda dados={dados} selecionado={selecionado} aoSelecionar={aoSelecionar} />}
      </div>
    </div>
  );
}
