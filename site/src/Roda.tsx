import { useEffect, useMemo, useRef, useState } from "react";
import type { Grafo } from "./tipos";
import BotoesZoom from "./Zoom";
import { C, R_MIOLO, R_POVO, SETORES, montaRoda, ponto, type Item, type Poder } from "./layoutRoda";

type Props = {
  dados: Grafo;
  selecionado: string | null;
  aoSelecionar: (id: string | null) => void;
};

// cores por Poder (claras o bastante para o fundo escuro e legíveis no claro)
export const COR_RODA: Record<Poder | "povo", { base: string; fundo: string }> = {
  // cores da bandeira: azul (Executivo), verde (Legislativo), amarelo (Judiciário) e branco (povo)
  Executivo: { base: "#5b8def", fundo: "#5b8def1f" },
  Legislativo: { base: "#3fbf9f", fundo: "#3fbf9f1f" },
  Judiciário: { base: "#f2c300", fundo: "#f2c3001c" },
  "Funções Essenciais à Justiça": { base: "#a8a29e", fundo: "#a8a29e1f" },
  povo: { base: "#f5f5f4", fundo: "#f5f5f41a" },
};
const FOCO = 180;   // o item clicado vai para a parte de baixo da roda

function arco(a0: number, a1: number, r0: number, r1: number) {
  const p = (a: number, r: number) => ponto(a, r);
  const g = a1 - a0 > 180 ? 1 : 0;
  const A = p(a0, r1), B = p(a1, r1), Cc = p(a1, r0), D = p(a0, r0);
  return `M${A.x},${A.y} A${r1},${r1} 0 ${g} 1 ${B.x},${B.y} L${Cc.x},${Cc.y} A${r0},${r0} 0 ${g} 0 ${D.x},${D.y} Z`;
}
function caminhoTexto(a0: number, a1: number, r: number, inverte = false) {
  const A = ponto(a0, r), B = ponto(a1, r);
  const g = a1 - a0 > 180 ? 1 : 0;
  // na metade de baixo da tela o texto percorre o arco ao contrário, para não ficar de cabeça para baixo
  return inverte ? `M${B.x},${B.y} A${r},${r} 0 ${g} 0 ${A.x},${A.y}` : `M${A.x},${A.y} A${r},${r} 0 ${g} 1 ${B.x},${B.y}`;
}
function estrela(r: number, pontas = 22) {
  const pts: string[] = [];
  for (let i = 0; i < pontas * 2; i++) {
    const rr = i % 2 ? r * 0.9 : r;
    const a = (i * Math.PI) / pontas;
    pts.push(`${C + rr * Math.sin(a)},${C - rr * Math.cos(a)}`);
  }
  return pts.join(" ");
}
function pentagono(x: number, y: number, r: number) {
  return Array.from({ length: 5 }, (_, i) => {
    const a = (i * 2 * Math.PI) / 5;
    return `${x + r * Math.sin(a)},${y - r * Math.cos(a)}`;
  }).join(" ");
}

export default function Roda({ dados, selecionado, aoSelecionar }: Props) {
  const roda = useMemo(() => montaRoda(dados), [dados]);
  const [giro, setGiro] = useState(0);
  const [hover, setHover] = useState<{ id: string; x: number; y: number; h: number } | null>(null);
  const caixa = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  // ---- zoom e arraste: mexe no viewBox (roda do mouse, pinça no celular, arrastar, botões) ----
  const CHEIO = { x: 0, y: 0, w: 1000 };
  const [vista, setVista] = useState(CHEIO);
  const vistaRef = useRef(vista);
  vistaRef.current = vista;
  const arrastou = useRef(false);
  const limita = (v: { x: number; y: number; w: number }) => {
    const w = Math.min(1000, Math.max(120, v.w));
    const folga = w * 0.5;
    return { w, x: Math.min(1000 - folga, Math.max(-folga, v.x)), y: Math.min(1000 - folga, Math.max(-folga, v.y)) };
  };
  const paraSvg = (cx: number, cy: number) => {
    const svg = svgRef.current;
    const m = svg?.getScreenCTM();
    if (!svg || !m) return null;
    const pt = svg.createSVGPoint();
    pt.x = cx; pt.y = cy;
    return pt.matrixTransform(m.inverse());
  };
  const zoomEm = (fator: number, px?: number, py?: number) => {
    const v = vistaRef.current;
    const w = Math.min(1000, Math.max(120, v.w / fator));
    const cx = px ?? v.x + v.w / 2, cy = py ?? v.y + v.w / 2;
    const k = w / v.w;
    setVista(limita({ w, x: cx - (cx - v.x) * k, y: cy - (cy - v.y) * k }));
  };
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const roda = (e: WheelEvent) => {
      e.preventDefault();
      const p = paraSvg(e.clientX, e.clientY);
      zoomEm(Math.exp(-e.deltaY * 0.0015), p?.x, p?.y);
    };
    svg.addEventListener("wheel", roda, { passive: false });
    return () => svg.removeEventListener("wheel", roda);
  });
  const ponteiros = useRef(new Map<number, { x: number; y: number }>());
  const aoApertar = (e: React.PointerEvent) => {
    ponteiros.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    arrastou.current = false;
    let inicio = { x: e.clientX, y: e.clientY };
    const mover = (ev: PointerEvent) => {
      if (!ponteiros.current.has(ev.pointerId)) return;
      const antes = ponteiros.current.get(ev.pointerId)!;
      ponteiros.current.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
      if (Math.hypot(ev.clientX - inicio.x, ev.clientY - inicio.y) > 5) arrastou.current = true;
      if (!arrastou.current) return;
      const svg = svgRef.current;
      if (!svg) return;
      const escala = vistaRef.current.w / Math.min(svg.clientWidth, svg.clientHeight);
      if (ponteiros.current.size >= 2) {
        // pinça: compara a distância entre os dois dedos
        const [a, b] = [...ponteiros.current.values()];
        const outro = [...ponteiros.current.entries()].find(([id]) => id !== ev.pointerId)?.[1] ?? b;
        const dAntes = Math.hypot(antes.x - outro.x, antes.y - outro.y);
        const dAgora = Math.hypot(a.x - b.x, a.y - b.y);
        const meio = paraSvg((a.x + b.x) / 2, (a.y + b.y) / 2);
        if (dAntes > 0) zoomEm(dAgora / dAntes, meio?.x, meio?.y);
        return;
      }
      const v = vistaRef.current;
      setVista(limita({ ...v, x: v.x - (ev.clientX - antes.x) * escala, y: v.y - (ev.clientY - antes.y) * escala }));
    };
    const soltar = (ev: PointerEvent) => {
      ponteiros.current.delete(ev.pointerId);
      if (!ponteiros.current.size) {
        removeEventListener("pointermove", mover);
        removeEventListener("pointerup", soltar);
        removeEventListener("pointercancel", soltar);
      }
    };
    if (ponteiros.current.size === 1) {
      addEventListener("pointermove", mover);
      addEventListener("pointerup", soltar);
      addEventListener("pointercancel", soltar);
    } else inicio = { x: -1e9, y: -1e9 };
  };
  // quem não está desenhado na roda (pessoa, unidade) gira até o órgão a que pertence
  const ancestral = useMemo(() => {
    const sobe = new Map<string, string>();
    for (const a of dados.arestas) if ((a.tipo === "subordinada" || a.tipo === "ocupa" || a.tipo === "cargo" || a.tipo === "membro") && !sobe.has(a.de)) sobe.set(a.de, a.para);
    return (id: string) => {
      for (let c: string | undefined = id, i = 0; c && i < 40; c = sobe.get(c), i++) if (roda.porId.has(c)) return roda.porId.get(c)!;
      return null;
    };
  }, [dados, roda]);

  // Como no CivLab: ao selecionar um ministério (ou uma entidade dele), as entidades vinculadas saem da
  // grade de pontos e se abrem numa fileira de quadradinhos na borda; ao tirar a seleção, voltam a ser pontos.
  const expandido = useMemo(() => {
    if (!selecionado) return null;
    // ministério → entidades vinculadas; tribunal → ministros
    const filhosDe = (id: string) => [
      ...roda.relacoes.filter((r) => r.de === id && r.verbo === "supervisiona").map((r) => r.para),
      ...roda.relacoes.filter((r) => r.para === id && r.verbo === "compõe o tribunal").map((r) => r.de),
    ];
    let dono = selecionado, filhos = filhosDe(selecionado);
    if (!filhos.length) {
      const pai = roda.relacoes.find((r) => r.para === selecionado && r.verbo === "supervisiona")?.de
        ?? roda.relacoes.find((r) => r.de === selecionado && r.verbo === "compõe o tribunal")?.para;
      if (pai) { dono = pai; filhos = filhosDe(pai); }
    }
    const m = roda.porId.get(dono);
    if (!filhos.length || !m) return null;
    const porLinha = m.poder === "Executivo" ? 24 : 11, passo = 2.15;
    const pos = new Map<string, { a: number; r: number }>();
    filhos.forEach((id, k) => {
      const lin = Math.floor(k / porLinha), col = k % porLinha, naLinha = Math.min(porLinha, filhos.length - lin * porLinha);
      const base = m.poder === "Executivo" ? 372 : m.r < 250 ? 254 : m.r + 30;
      pos.set(id, { a: m.a + (col - (naLinha - 1) / 2) * passo, r: base + lin * 15 });
    });
    return { dono, pos };
  }, [selecionado, roda]);
  // gira pelo caminho mais curto até o item selecionado ficar embaixo; sem seleção, volta ao eixo
  useEffect(() => {
    if (ultimoSel.current === selecionado) return;
    ultimoSel.current = selecionado;
    const alvoSel = selecionado ? roda.porId.get(selecionado) ?? setorDoPoder(selecionado) ?? ancestral(selecionado) : null;
    const angulo = (selecionado ? expandido?.pos.get(selecionado)?.a : undefined) ?? alvoSel?.a ?? 0;
    const alvo = alvoSel && alvoSel.r > 0 ? FOCO - angulo : 0;
    setGiro((g) => g + ((((alvo - g) % 360) + 540) % 360 - 180));
    // com zoom ligado, acompanha o item até onde ele vai parar (embaixo da roda)
    const v = vistaRef.current;
    if (alvoSel && alvoSel.r > 0 && v.w < 1000) setVista(limita({ w: v.w, x: C - v.w / 2, y: C + alvoSel.r - v.w / 2 }));
  }, [selecionado, roda, ancestral, expandido]);

  // depois de arrastar, o clique que vem junto não deve selecionar nem limpar a seleção
  const engoleClique = (e: React.MouseEvent) => {
    if (arrastou.current) { e.stopPropagation(); e.preventDefault(); arrastou.current = false; }
  };
  const ultimoSel = useRef<string | null>(null);



  const foco = hover?.id ?? selecionado;
  const ligadas = useMemo(() => {
    if (!foco) return { rel: [], ids: new Set<string>() };
    const id = foco.startsWith("poder:") ? null : foco;
    const rel = id ? roda.relacoes.filter((r) => r.de === id || r.para === id) : [];
    const ids = new Set<string>([foco, ...rel.flatMap((r) => [r.de, r.para])]);
    if (foco.startsWith("poder:")) roda.itens.filter((i) => i.poder === foco.slice(6)).forEach((i) => ids.add(i.id));
    return { rel, ids };
  }, [foco, roda]);

  const onde = (id: string) => expandido?.pos.get(id) ?? roda.porId.get(id)!;

  const dim = (id: string) => (foco && !ligadas.ids.has(id) ? (expandido?.pos.has(id) ? 0.55 : expandido && roda.porId.get(id)?.forma === "ponto" && roda.porId.get(id)?.poder === roda.porId.get(expandido.dono)?.poder ? 0.07 : 0.22) : 1);

  // a etiqueta do hover fica presa ao nó (acima dele), não ao ponteiro
  const aoMover = (e: React.MouseEvent, id: string) => {
    if (hover?.id === id) return;
    const b = caixa.current?.getBoundingClientRect();
    const r = (e.currentTarget as Element).getBoundingClientRect();
    if (b) setHover({ id, x: r.left + r.width / 2 - b.left, y: r.top - b.top, h: r.height });
  };

  const forma = (orig: Item) => {
    const novo = expandido?.pos.get(orig.id);
    // desenha na posição original e desliza (transform com transição) até a posição aberta
    const it: Item = novo ? { ...orig, forma: "quadrado", t: 4.2 } : orig;
    const { x, y } = ponto(it.a, it.r);
    const alvo = novo ? ponto(novo.a, novo.r) : { x, y };
    const desliza = { transform: `translate(${alvo.x - x}px, ${alvo.y - y}px)`, transition: "transform 450ms cubic-bezier(.22,.8,.2,1)" };
    const cor = COR_RODA[it.poder as Poder]?.base ?? "#999";
    const sel = it.id === selecionado;
    const comum = {
      style: { cursor: "pointer", opacity: dim(it.id), transition: "opacity 200ms" },
      onMouseMove: (e: React.MouseEvent) => aoMover(e, it.id),
      onMouseLeave: () => setHover(null),
      onClick: (e: React.MouseEvent) => { e.stopPropagation(); aoSelecionar(it.id === selecionado ? null : it.id); },
    };
    const traco = sel ? "currentColor" : cor;
    const largura = sel ? 2 : 1.2;
    return <g key={it.id} style={desliza}>{desenho()}</g>;
    function desenho() {
    switch (it.forma) {
      case "casa":
        return (
          <g {...comum}>
            <rect x={x - it.t * 1.9} y={y - it.t * 0.75} width={it.t * 3.8} height={it.t * 1.5} rx={it.t * 0.75}
              transform={`rotate(${it.a} ${x} ${y})`} fill={COR_RODA.Legislativo.fundo} stroke={traco} strokeWidth={largura} />
          </g>
        );
      case "quadrado":
        return (
          <g {...comum}>
            <rect x={x - it.t} y={y - it.t} width={it.t * 2} height={it.t * 2} rx={3} transform={`rotate(${it.a} ${x} ${y})`}
              fill={cor + "40"} stroke={traco} strokeWidth={largura} />
            <circle cx={ponto(it.a, it.r - it.t).x} cy={ponto(it.a, it.r - it.t).y} r={it.t * 0.42} fill={cor} />
          </g>
        );
      case "pentagono":
        return <polygon {...comum} points={pentagono(x, y, it.t)} transform={`rotate(${it.a} ${x} ${y})`} fill={cor + "55"} stroke={traco} strokeWidth={largura} />;
      case "circulo":
        return <circle {...comum} cx={x} cy={y} r={it.t} fill={it.tom > 0.95 ? cor : cor + "70"} stroke={traco} strokeWidth={largura} />;
      default:
        return <circle {...comum} cx={x} cy={y} r={sel ? it.t * 1.8 : it.t} fill={cor} fillOpacity={0.45 + it.tom * 0.55} />;
    }
    }
  };

  const itemHover = hover ? roda.porId.get(hover.id) : null;
  // depois do giro, o arco fica na metade de baixo da tela? (aí o texto é desenhado ao contrário)
  const embaixo = (a: number) => { const x = (((a + giro) % 360) + 360) % 360; return x > 90 && x < 270; };
  const rotulados = new Set<string>();

  return (
    <div ref={caixa} className="absolute inset-0 select-none" onClick={() => aoSelecionar(null)} onClickCapture={engoleClique}>
      <BotoesZoom mais={() => zoomEm(1.5)} menos={() => zoomEm(1 / 1.5)} inicio={() => setVista(CHEIO)} />
      <svg ref={svgRef} viewBox={`${vista.x} ${vista.y} ${vista.w} ${vista.w}`} onPointerDown={aoApertar}
        className={`h-full w-full touch-none text-stone-900 dark:text-white ${vista.w < 1000 ? "cursor-grab active:cursor-grabbing" : ""}`}
        style={{ transition: arrastou.current ? "none" : undefined }} role="img" aria-label="Roda dos três Poderes">
        <defs>
          <marker id="seta" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M0,0 L10,5 L0,10 z" fill="context-stroke" />
          </marker>
        </defs>
        <g style={{ transform: `rotate(${giro}deg)`, transformOrigin: "500px 500px", transition: "transform 900ms cubic-bezier(.22,.8,.2,1)" }}>
          {SETORES.map((s) => (
            <g key={s.poder} onClick={(e) => { e.stopPropagation(); aoSelecionar(`poder:${s.poder}`); }} style={{ cursor: "pointer" }}>
              <path d={arco(s.a0 + 0.4, s.a1 - 0.4, R_MIOLO, s.rMax)} fill={COR_RODA[s.poder].fundo}
                stroke={selecionado === `poder:${s.poder}` ? COR_RODA[s.poder].base : "none"} strokeWidth={1.5} />
              <path id={`rot-${s.poder}`} d={embaixo((s.a0 + s.a1) / 2) ? caminhoTexto(s.a0, s.a1, s.rMax - 6, true) : caminhoTexto(s.a0, s.a1, s.rMax - 14)} fill="none" />
              <text fontSize="13" letterSpacing="3" fontWeight="600" fill={COR_RODA[s.poder].base}>
                <textPath href={`#rot-${s.poder}`} startOffset="50%" textAnchor="middle">{s.rotulo}</textPath>
              </text>
            </g>
          ))}
          {roda.faixas.map((f, i) => (
            <g key={i} pointerEvents="none">
              <path d={caminhoTexto(f.a0, f.a1, f.r)} fill="none" stroke={COR_RODA[f.poder].base} strokeOpacity={0.18} strokeDasharray="2 5" />
              <path id={`faixa-${i}`} d={embaixo((f.a0 + f.a1) / 2) ? caminhoTexto(f.a0, f.a1, f.r + 10, true) : caminhoTexto(f.a0, f.a1, f.r + 4)} fill="none" />
              <text fontSize="8.5" letterSpacing="2" fill={COR_RODA[f.poder].base} fillOpacity={0.75}>
                <textPath href={`#faixa-${i}`} startOffset="50%" textAnchor="middle">{f.rotulo}</textPath>
              </text>
            </g>
          ))}
          {roda.itens.filter((i) => i.id !== "povo").map(forma)}
        </g>

        {/* miolo fixo: não gira */}
        <circle cx={C} cy={C} r={R_MIOLO - 6} className="fill-stone-100 dark:fill-stone-950" pointerEvents="none" />
        <g style={{ cursor: "pointer", opacity: dim("povo") }}
          onClick={(e) => { e.stopPropagation(); aoSelecionar(selecionado === "povo" ? null : "povo"); }}
          onMouseMove={(e) => aoMover(e, "povo")} onMouseLeave={() => setHover(null)}>
          <polygon points={estrela(R_POVO)} fill={COR_RODA.povo.fundo} stroke={COR_RODA.povo.base} strokeWidth={1.5} />
          <text x={C} y={C - 4} textAnchor="middle" fontSize="15" fontWeight="700" fill={COR_RODA.povo.base}>Povo</text>
          <text x={C} y={C + 15} textAnchor="middle" fontSize="15" fontWeight="700" fill={COR_RODA.povo.base}>brasileiro</text>
        </g>
        {/* ligações por cima do miolo, para as setas e os rótulos não sumirem no centro */}
        <g style={{ transform: `rotate(${giro}deg)`, transformOrigin: "500px 500px", transition: "transform 900ms cubic-bezier(.22,.8,.2,1)" }} pointerEvents="none">
          {(() => {
            const caixas: { x: number; y: number; w: number; h: number }[] = [];
            const rad = (giro * Math.PI) / 180;
            const naTela = (q: { x: number; y: number }) => ({
              x: C + (q.x - C) * Math.cos(rad) - (q.y - C) * Math.sin(rad),
              y: C + (q.x - C) * Math.sin(rad) + (q.y - C) * Math.cos(rad),
            });
            const livre = (c: { x: number; y: number; w: number; h: number }) =>
              caixas.every((o) => Math.abs(o.x - c.x) > (o.w + c.w) / 2 + 2 || Math.abs(o.y - c.y) > (o.h + c.h) / 2 + 1);
            const linhas: React.ReactNode[] = [], rotulos: React.ReactNode[] = [];
            // quantas ligações iguais (mesmo verbo) chegam ou saem do nó em foco: acima de 8 vira leque tracejado
            const grupo = new Map<string, number>();
            for (const r of ligadas.rel) { const k = `${r.verbo}|${r.para === foco ? "c" : "s"}`; grupo.set(k, (grupo.get(k) ?? 0) + 1); }
            ligadas.rel.forEach((r, i) => {
              const destino = { ...roda.porId.get(r.para)!, ...onde(r.para) };
              // do povo, a seta sai da borda da estrela na direção do alvo
              const de = r.de === "povo" ? ponto(destino.a, R_POVO + 4) : ponto(onde(r.de).a, onde(r.de).r);
              const leque = (grupo.get(`${r.verbo}|${r.para === foco ? "c" : "s"}`) ?? 0) > 8 || (!!expandido && (r.verbo === "supervisiona" || r.verbo === "compõe o tribunal"));
              const ate = ponto(destino.a, destino.r - (expandido?.pos.has(r.para) ? 4.2 : destino.t) - 2);
              const cor = r.de === "povo" ? COR_RODA.povo.base : COR_RODA[(roda.porId.get(r.de)!.poder as Poder)]?.base;
              const meio = leque ? { x: (de.x + ate.x) / 2, y: (de.y + ate.y) / 2 }
                : { x: (de.x + ate.x) / 2 + (C - (de.x + ate.x) / 2) * 0.25, y: (de.y + ate.y) / 2 + (C - (de.y + ate.y) / 2) * 0.25 };
              const naCurva = (t: number) => ({ x: (1 - t) ** 2 * de.x + 2 * (1 - t) * t * meio.x + t * t * ate.x, y: (1 - t) ** 2 * de.y + 2 * (1 - t) * t * meio.y + t * t * ate.y });
              linhas.push(leque
                // muitas ligações iguais: linhas finas tracejadas e retas, como um leque
                ? <path key={i} d={`M${de.x},${de.y} L${ate.x},${ate.y}`} fill="none" stroke={cor} strokeWidth={0.7} strokeOpacity={0.45} strokeDasharray="2 3" />
                : <path key={i} d={`M${de.x},${de.y} Q${meio.x},${meio.y} ${ate.x},${ate.y}`} fill="none" stroke={cor} strokeWidth={1.3} strokeOpacity={0.85} markerEnd="url(#seta)" />);
              const txt = verboCurto(r.verbo);
              // um rótulo por ação: várias setas iguais (saindo do mesmo nó, ou chegando ao nó em foco) mostram o rótulo uma vez
              const chaveRot = r.para === foco ? `>${r.para}|${txt}` : `${r.de}|${txt}`;
              if (rotulados.has(chaveRot)) return;
              rotulados.add(chaveRot);
              const w = txt.length * 5.8 + 12, h = 16;
              // procura um ponto da curva em que o rótulo não cubra outro rótulo
              let m = naCurva(0.5);
              for (const t of [0.5, 0.38, 0.62, 0.27, 0.73, 0.18, 0.82]) {
                const q = naCurva(t), sq = naTela(q);
                if (livre({ x: sq.x, y: sq.y, w, h })) { m = q; break; }
              }
              const sm = naTela(m);
              caixas.push({ x: sm.x, y: sm.y, w, h });
              rotulos.push(
                // o rótulo gira ao contrário da roda para ficar de pé; aparece depois que a roda para
                <g key={`r${i}-${giro}-${foco}`} transform={`rotate(${-giro} ${m.x} ${m.y})`} className={foco === selecionado ? "etiqueta-acao" : ""}>
                  <rect x={m.x - w / 2} y={m.y - 8} width={w} height={h} rx={4} fill="#1c1917" fillOpacity={0.92} stroke={cor} strokeOpacity={0.6} />
                  <text x={m.x} y={m.y + 3.5} textAnchor="middle" fontSize="10" fontWeight="600" fill={cor}>{txt}</text>
                </g>);
            });
            rotulados.clear();
            return <>{linhas}{rotulos}</>;
          })()}
        </g>
      </svg>

      {itemHover && hover && (() => {
        const largura = caixa.current?.clientWidth ?? 9999;
        const embaixo = hover.y < 44;
        const ancora = hover.x < 140 ? "0%" : hover.x > largura - 140 ? "-100%" : "-50%";
        const cor = COR_RODA[itemHover.poder as Poder]?.base ?? COR_RODA.povo.base;
        return (
          <div className="pointer-events-none absolute z-30 max-w-64 truncate rounded-md px-2 py-0.5 text-xs font-medium shadow"
            style={{
              left: Math.min(Math.max(hover.x, 8), largura - 8),
              top: embaixo ? hover.y + hover.h + 6 : hover.y - 6,
              transform: `translate(${ancora}, ${embaixo ? "0" : "-100%"})`,
              background: cor + "33", color: cor, border: `1px solid ${cor}66`, backdropFilter: "blur(6px)",
            }}>
            {itemHover.nome}
          </div>
        );
      })()}

      {selecionado && roda.porId.get(selecionado) && (
        <div className="pointer-events-none absolute top-3 left-1/2 max-w-[60%] -translate-x-1/2 truncate rounded-md px-2 py-0.5 text-xs font-medium"
          style={{ background: (COR_RODA[roda.porId.get(selecionado)!.poder as Poder]?.base ?? COR_RODA.povo.base) + "26", color: COR_RODA[roda.porId.get(selecionado)!.poder as Poder]?.base ?? COR_RODA.povo.base }}>
          {roda.porId.get(selecionado)!.nome}
        </div>
      )}
    </div>
  );
}

// rótulo curto da ação, para caber sobre a seta (o texto completo e o artigo ficam no painel)
function verboCurto(v: string) {
  if (v.startsWith("indica")) return "indica";
  if (v.startsWith("nomeia")) return "nomeia";
  if (v.startsWith("aprova")) return "aprova";
  if (v.startsWith("fiscaliza")) return "fiscaliza";
  if (v.startsWith("designa")) return "designa membros";
  if (v.startsWith("integra")) return "integra";
  return v;
}

function setorDoPoder(id: string): Item | null {
  if (!id.startsWith("poder:")) return null;
  const s = SETORES.find((x) => x.poder === id.slice(6));
  return s ? { id, rotulo: s.poder, nome: s.poder, poder: s.poder, forma: "circulo", a: (s.a0 + s.a1) / 2, r: 1, t: 0, tom: 0 } : null;
}
