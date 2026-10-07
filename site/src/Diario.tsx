import { useEffect, useMemo, useState } from "react";
import { carregaDou, type ResumoDou } from "./dados";

export default function Diario() {
  const [d, setD] = useState<ResumoDou | null>(null);
  const [orgao, setOrgao] = useState<string | null>(null);
  const [dia, setDia] = useState<string | null>(null);
  useEffect(() => { carregaDou().then(setD).catch(() => setD(null)); }, []);
  const max = useMemo(() => Math.max(1, ...(d?.dias ?? []).map((x) => x.entradas + x.saidas + x.outros)), [d]);
  const atos = useMemo(() => (d?.recentes ?? []).filter((a) => (!orgao || (a.orgao ?? "").startsWith(orgao)) && (!dia || a.data === dia)), [d, orgao, dia]);
  if (!d) return <p className="p-6 text-sm text-stone-500">Carregando…</p>;
  const fmt = (s: string) => s.split("-").reverse().slice(0, 2).join("/");

  return (
    <div className="grid h-full grid-rows-[auto_1fr] gap-4 overflow-hidden p-4 lg:grid-cols-[1fr_380px] lg:grid-rows-1">
      <div className="min-h-0 overflow-y-auto">
        <h2 className="text-lg font-semibold">O que mudou no Diário Oficial</h2>
        <p className="text-sm text-stone-500">Nomeações, designações, exonerações e dispensas lidas no DOU (INLABS) a cada dia: {d.total.toLocaleString("pt-BR")} atos desde {fmt(d.dias[0]?.data ?? "")}.</p>
        <div className="mt-4 flex h-40 items-end gap-1">
          {d.dias.map((x) => {
            const tot = x.entradas + x.saidas + x.outros;
            return (
              <button key={x.data} onClick={() => setDia(dia === x.data ? null : x.data)} title={`${fmt(x.data)}: ${x.entradas} entradas, ${x.saidas} saídas`}
                className={`flex h-full min-w-6 flex-1 flex-col justify-end rounded-sm ${dia === x.data ? "ring-2 ring-stone-500" : ""}`}>
                <span className="block rounded-t-sm" style={{ height: `${(100 * x.saidas) / max}%`, background: "#f0644b" }} />
                <span className="block" style={{ height: `${(100 * x.entradas) / max}%`, background: "#3fbf9f" }} />
                <span className="mt-1 block text-center text-[10px] text-stone-500">{fmt(x.data)}</span>
                <span className="sr-only">{tot}</span>
              </button>
            );
          })}
        </div>
        <p className="mt-2 flex gap-4 text-xs text-stone-500">
          <span><span className="mr-1 inline-block h-2 w-2 rounded-sm" style={{ background: "#3fbf9f" }} />entradas (nomear, designar…)</span>
          <span><span className="mr-1 inline-block h-2 w-2 rounded-sm" style={{ background: "#f0644b" }} />saídas (exonerar, dispensar…)</span>
        </p>
        <h3 className="mt-6 text-xs font-semibold uppercase tracking-wide text-stone-500">Órgãos com mais atos</h3>
        <ul className="mt-2 space-y-1 text-sm">
          {d.orgaos.slice(0, 15).map((o) => {
            const t = o.entradas + o.saidas + o.outros;
            return (
              <li key={o.orgao}>
                <button onClick={() => setOrgao(orgao === o.orgao ? null : o.orgao)} className={`flex w-full items-center gap-2 text-left ${orgao === o.orgao ? "font-semibold" : ""}`}>
                  <span className="w-56 shrink-0 truncate">{o.orgao}</span>
                  <span className="h-2 rounded-sm" style={{ width: `${(t / (d.orgaos[0].entradas + d.orgaos[0].saidas + d.orgaos[0].outros)) * 40}%`, background: "#8b8cf0" }} />
                  <span className="text-xs text-stone-500">{t}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
      <aside className="min-h-0 overflow-y-auto rounded-lg border border-stone-200 p-3 dark:border-stone-800">
        <p className="text-xs font-semibold uppercase tracking-wide text-stone-500">
          Atos {dia ? `de ${fmt(dia)}` : "mais recentes"}{orgao ? ` · ${orgao}` : ""} ({atos.length})
        </p>
        <ul className="mt-2 space-y-2.5 text-sm">
          {atos.slice(0, 120).map((a, i) => (
            <li key={i}>
              <span className={`mr-1 rounded px-1 text-[10px] font-semibold uppercase ${a.tipo === "entrada" ? "bg-emerald-200 text-emerald-900" : a.tipo === "saida" ? "bg-red-200 text-red-900" : "bg-stone-200 text-stone-800"}`}>{a.verbo}</span>
              <span className="font-medium">{a.pessoa}</span>
              {a.codigoCargo && <span className="ml-1 text-xs text-stone-500">{a.codigoCargo}</span>}
              <span className="block text-xs text-stone-500">{fmt(a.data)} · {(a.orgao ?? "").split("/").slice(-1)[0]}{a.url && <> · <a className="underline" href={a.url} target="_blank" rel="noreferrer">DOU</a></>}</span>
            </li>
          ))}
        </ul>
      </aside>
    </div>
  );
}
