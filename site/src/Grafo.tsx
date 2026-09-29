import { useEffect, useRef } from "react";
import Graph from "graphology";
import Sigma from "sigma";
import FA2Layout from "graphology-layout-forceatlas2/worker";
import forceAtlas2 from "graphology-layout-forceatlas2";
import type { Grafo as DadosGrafo } from "./tipos";
import { corDoNo, tamanhoDoNo } from "./cores";

type Props = {
  dados: DadosGrafo;
  raiz?: string | null;       // na visão de um órgão: quem ficou só "no órgão" não vira ponto no desenho
  selecionado: string | null;
  aoSelecionar: (id: string | null) => void;
  escuro: boolean;
};

// Desenha o grafo com sigma.js (WebGL): aguenta dezenas de milhares de nós, ao contrário de SVG.
export default function Grafo({ dados, raiz, selecionado, aoSelecionar, escuro }: Props) {
  const caixa = useRef<HTMLDivElement>(null);
  const sigmaRef = useRef<Sigma | null>(null);
  const grafoRef = useRef<Graph | null>(null);
  const selRef = useRef<string | null>(null);
  const vizinhosRef = useRef<Set<string>>(new Set());

  // monta o grafo quando os dados mudam
  useEffect(() => {
    if (!caixa.current) return;
    const g = new Graph({ multi: true, type: "directed" });
    // numa visão de órgão, milhares de pessoas sem unidade exata iriam todas para o centro:
    // ficam fora do desenho (continuam na lista do painel)
    const soltas = (a: DadosGrafo["arestas"][number]) => !!raiz && a.tipo === "ocupa" && a.exata === false && a.para === raiz;
    const comLigacao = new Set<string>();
    for (const a of dados.arestas) if (!soltas(a)) { comLigacao.add(a.de); comLigacao.add(a.para); }
    const nos = dados.nos.filter((no) => no.tipo !== "pessoa" || comLigacao.has(no.id));
    const n = nos.length;
    nos.forEach((no, i) => {
      const angulo = (2 * Math.PI * i) / n;
      const raio = 100 + Math.random() * 50;
      g.addNode(no.id, {
        x: Math.cos(angulo) * raio,
        y: Math.sin(angulo) * raio,
        size: tamanhoDoNo(no),
        color: corDoNo(no),
        label: no.rotulo,
        tipo: no.tipo,
      });
    });
    for (const a of dados.arestas) {
      if (!soltas(a) && g.hasNode(a.de) && g.hasNode(a.para)) {
        g.addEdge(a.de, a.para, { tipo: a.tipo, size: a.tipo === "ocupa" ? 0.6 : 0.4, color: a.tipo === "ocupa" ? "#e11d4855" : "#a8a29e55" });
      }
    }

    // posições: umas rodadas síncronas para sair do círculo, depois o worker refina por alguns segundos
    const config = forceAtlas2.inferSettings(g);
    forceAtlas2.assign(g, { iterations: n > 8000 ? 30 : 80, settings: { ...config, barnesHutOptimize: true } });
    const layout = new FA2Layout(g, { settings: { ...config, barnesHutOptimize: true, slowDown: 5 } });
    layout.start();
    const parar = setTimeout(() => layout.stop(), n > 8000 ? 6000 : 4000);

    const s = new Sigma(g, caixa.current, {
      renderEdgeLabels: false,
      labelRenderedSizeThreshold: 7,
      labelDensity: 0.4,
      labelColor: { color: escuro ? "#e7e5e4" : "#292524" },
      defaultEdgeType: "line",
      zIndex: true,
      nodeReducer: (no, attr) => {
        const sel = selRef.current;
        if (!sel) return attr;
        if (no === sel) return { ...attr, highlighted: true, zIndex: 2, forceLabel: true };
        if (vizinhosRef.current.has(no)) return { ...attr, zIndex: 1, forceLabel: true };
        return { ...attr, color: escuro ? "#44403c" : "#e7e5e4", label: "", zIndex: 0 };
      },
      edgeReducer: (aresta, attr) => {
        const sel = selRef.current;
        if (!sel) return attr;
        const [a, b] = g.extremities(aresta);
        if ((a === sel || b === sel) && vizinhosRef.current.size <= 300) return { ...attr, color: escuro ? "#fafaf9" : "#1c1917", size: 1.2 };
        return { ...attr, hidden: true };
      },
    });
    s.on("clickNode", ({ node }) => aoSelecionar(node));
    s.on("clickStage", () => aoSelecionar(null));
    s.on("enterNode", () => { if (caixa.current) caixa.current.style.cursor = "pointer"; });
    s.on("leaveNode", () => { if (caixa.current) caixa.current.style.cursor = "default"; });

    sigmaRef.current = s;
    grafoRef.current = g;
    return () => {
      clearTimeout(parar);
      layout.kill();
      s.kill();
      sigmaRef.current = null;
      grafoRef.current = null;
    };
  }, [dados, raiz, aoSelecionar, escuro]);

  // destaque e câmera quando a seleção muda
  useEffect(() => {
    const s = sigmaRef.current, g = grafoRef.current;
    if (!s || !g) return;
    selRef.current = selecionado && g.hasNode(selecionado) ? selecionado : null;
    vizinhosRef.current = new Set(selRef.current ? g.neighbors(selRef.current) : []);
    s.refresh();
    if (selRef.current) {
      const pos = s.getNodeDisplayData(selRef.current);
      if (pos) s.getCamera().animate({ x: pos.x, y: pos.y, ratio: 0.25 }, { duration: 500 });
    }
  }, [selecionado, dados]);

  return <div ref={caixa} className="absolute inset-0" aria-label="Grafo interativo" />;
}
