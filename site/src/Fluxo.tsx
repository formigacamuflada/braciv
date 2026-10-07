import { useMemo, useState } from "react";
import type { Grafo } from "./tipos";
import { montaRoda } from "./layoutRoda";
import { FONTE_CF, type Base } from "./constituicao";

// Quem nomeia quem: colunas da fonte do poder (o povo) até as entidades supervisionadas.
// Espessura ~ raiz do número de posições (para 1 Presidente e 513 deputados caberem no mesmo desenho).
type NoF = { id: string; rotulo: string; col: number; valor: number; cor: string; alvo?: string };
type LigF = { de: string; para: string; verbo: string; base: Base; valor: number };

export default function Fluxo({ dados, aoAbrir }: { dados: Grafo; aoAbrir: (id: string) => void }) {
  const [foco, setFoco] = useState<string | null>(null);
  const { nos, ligs, volta } = useMemo(() => {
    const roda = montaRoda(dados);
    const membros = (casa: string) => dados.arestas.filter((a) => a.tipo === "membro" && a.para === casa).length;
    const sup = new Set(["STF", "STJ", "TST", "STM"]);
    const cat = (id: string) => {
      if (id === "povo") return "povo";
      if (id === "u:26") return "pr";
      if (id === "u:1408") return "vpr";
      if (id === "casa:camara") return "camara";
      if (id === "casa:senado") return "senado";
      const it = roda.porId.get(id);
      if (!it) return null;
      if (it.poder === "Judiciário" && sup.has(it.rotulo)) return "tribunais";
      if (it.nome === "Banco Central do Brasil" || it.rotulo === "BCB") return "tribunais";
      if (it.forma === "quadrado") return "ministerios";
      if (it.forma === "ponto" && it.poder === "Executivo") return "entidades";
      return null;
    };
    const cont = new Map<string, number>();
    const contar = (c: string) => cont.set(c, (cont.get(c) ?? 0) + 1);
    const agreg = new Map<string, LigF>();
    for (const r of roda.relacoes) {
      const a = cat(r.de), b = cat(r.para);
      if (!a || !b) continue;
      const k = `${a}|${b}|${r.verbo}`;
      if (!agreg.has(k)) agreg.set(k, { de: a, para: b, verbo: r.verbo, base: r.base, valor: 0 });
      agreg.get(k)!.valor += 1;
      if (r.verbo.startsWith("nomeia") || r.verbo === "supervisiona" || r.verbo.startsWith("indica")) contar(b);
    }
    const nCam = membros("casa:camara"), nSen = membros("casa:senado");
    const nos: NoF[] = [
      { id: "povo", rotulo: "Povo brasileiro", col: 0, valor: nCam + nSen + 2, cor: "#f08a3c", alvo: "povo" },
      { id: "pr", rotulo: "Presidente da República", col: 1, valor: 1, cor: "#8b8cf0", alvo: "u:26" },
      { id: "vpr", rotulo: "Vice-Presidente", col: 1, valor: 1, cor: "#8b8cf0", alvo: "u:1408" },
      { id: "camara", rotulo: `Câmara · ${nCam} deputados`, col: 1, valor: nCam, cor: "#f0644b", alvo: "casa:camara" },
      { id: "senado", rotulo: `Senado · ${nSen} senadores`, col: 1, valor: nSen, cor: "#f0644b", alvo: "casa:senado" },
      { id: "ministerios", rotulo: `${cont.get("ministerios") ?? 0} Ministros de Estado`, col: 2, valor: cont.get("ministerios") ?? 0, cor: "#8b8cf0" },
      { id: "tribunais", rotulo: "Tribunais superiores e Banco Central", col: 2, valor: cont.get("tribunais") ?? 0, cor: "#e5b218" },
      { id: "entidades", rotulo: `${cont.get("entidades") ?? 0} autarquias, fundações e empresas`, col: 3, valor: cont.get("entidades") ?? 0, cor: "#8b8cf0" },
    ];
    const ligs: LigF[] = [];
    const volta: LigF[] = [];
    for (const l of agreg.values()) {
      if (l.de === "povo") l.valor = l.para === "camara" ? nCam : l.para === "senado" ? nSen : 1;
      (l.verbo.startsWith("fiscaliza") ? volta : ligs).push(l);
    }
    return { nos, ligs, volta };
  }, [dados]);

  // posições
  const W = 1240, H = 560, COLS = [150, 420, 700, 1000], LARG = 16;
  const esp = (v: number) => Math.max(4, Math.sqrt(v) * 7);
  const pos = new Map<string, { x: number; y: number; h: number }>();
  for (let c = 0; c < 4; c++) {
    const daCol = nos.filter((n) => n.col === c);
    const alturas = daCol.map((n) => esp(n.valor) * 1.6 + 6);
    const total = alturas.reduce((s, h) => s + h, 0) + (daCol.length - 1) * 46;
    let y = (H - total) / 2;
    daCol.forEach((n, i) => { pos.set(n.id, { x: COLS[c], y, h: alturas[i] }); y += alturas[i] + 46; });
  }
  const saidas = new Map<string, number>(), chegadas = new Map<string, number>();
  const ativo = (l: LigF) => !foco || l.de === foco || l.para === foco;

  return (
    <div className="flex h-full flex-col p-4">
      <h2 className="text-lg font-semibold">Quem nomeia quem</h2>
      <p className="max-w-3xl text-sm text-stone-500">
        Do povo aos eleitos, dos eleitos aos nomeados, dos ministérios às entidades que supervisionam. Espessura cresce com o número de posições.
        Cada ligação tem o artigo da Constituição que a sustenta; clique num bloco para destacar e ver no painel.
      </p>
      <div className="relative mt-2 min-h-0 flex-1">
        <svg viewBox={`0 0 ${W} ${H}`} className="h-full w-full" onClick={() => setFoco(null)}>
          {ligs.map((l, i) => {
            const a = pos.get(l.de)!, b = pos.get(l.para)!;
            const w = esp(l.valor);
            const ya = a.y + (saidas.get(l.de) ?? 0) + w / 2; saidas.set(l.de, (saidas.get(l.de) ?? 0) + w + 2);
            const yb = b.y + (chegadas.get(l.para) ?? 0) + w / 2; chegadas.set(l.para, (chegadas.get(l.para) ?? 0) + w + 2);
            const x1 = a.x + LARG, x2 = b.x, mx = (x1 + x2) / 2;
            const lx = x1 + (x2 - x1) * 0.42, ly = ya + (yb - ya) * 0.42;
            const cor = nos.find((n) => n.id === l.de)!.cor;
            return (
              <g key={i} opacity={ativo(l) ? 1 : 0.15}>
                <path d={`M${x1},${ya} C${mx},${ya} ${mx},${yb} ${x2},${yb}`} fill="none" stroke={cor} strokeOpacity={0.35} strokeWidth={w} />
                <a href={FONTE_CF} target="_blank" rel="noreferrer">
                  <text x={lx} y={ly - 3} textAnchor="middle" fontSize="10.5" fontWeight="600" fill={cor} className="stroke-stone-50 dark:stroke-stone-950" strokeWidth={3} paintOrder="stroke">{l.verbo.split(" ")[0]}</text>
                  <text x={lx} y={ly + 9} textAnchor="middle" fontSize="8.5" className="fill-stone-500 stroke-stone-50 dark:stroke-stone-950" strokeWidth={3} paintOrder="stroke">{l.base.dispositivo}</text>
                </a>
              </g>
            );
          })}
          {volta.length > 0 && (() => {
            const pr = pos.get("pr")!, cam = pos.get("camara")!;
            const x = pr.x - 26;
            return (
              <g opacity={!foco || ["pr", "camara", "senado"].includes(foco) ? 1 : 0.15}>
                <path d={`M${x + 20},${cam.y + 4} C${x - 30},${cam.y} ${x - 30},${pr.y + 8} ${x + 20},${pr.y + 6}`} fill="none" stroke="#f0644b" strokeDasharray="4 4" markerEnd="url(#setaF)" />
                <text x={x - 18} y={cam.y - 10} textAnchor="end" fontSize="10.5" fontWeight="600" fill="#f0644b" paintOrder="stroke" strokeWidth={3} className="stroke-stone-50 dark:stroke-stone-950">fiscaliza</text>
                <text x={x - 18} y={cam.y + 2} textAnchor="end" fontSize="8.5" paintOrder="stroke" strokeWidth={3} className="fill-stone-500 stroke-stone-50 dark:stroke-stone-950">{volta[0].base.dispositivo}</text>
              </g>
            );
          })()}
          <defs><marker id="setaF" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M0,0L10,5L0,10z" fill="#f0644b" /></marker></defs>
          {nos.map((n) => {
            const p = pos.get(n.id)!;
            const esquerda = n.col === 0;
            return (
              <g key={n.id} style={{ cursor: "pointer" }} onClick={(e) => { e.stopPropagation(); setFoco(n.id); if (n.alvo) aoAbrir(n.alvo); }}>
                <rect x={p.x} y={p.y} width={LARG} height={p.h} rx={3} fill={n.cor} opacity={!foco || foco === n.id ? 1 : 0.4} />
                <text x={esquerda ? p.x - 8 : p.x + LARG + 6} y={esquerda ? p.y + p.h / 2 + 4 : p.y + Math.min(p.h / 2, 12) + 4}
                  textAnchor={esquerda ? "end" : "start"} fontSize="12" fontWeight="600" paintOrder="stroke" strokeWidth={4}
                  className="fill-stone-800 stroke-stone-50 dark:fill-stone-100 dark:stroke-stone-950">{n.rotulo}</text>
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}
