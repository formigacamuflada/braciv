"""Ministros dos tribunais superiores e conselheiros do CNJ no núcleo do grafo (chamado por grafo.py).
Lê dados/judiciario.json (coletores/judiciario.py) e liga cada pessoa ao nó do tribunal vindo do SIORG."""
import json
import pathlib
import re
import unicodedata

DADOS = pathlib.Path(__file__).resolve().parent.parent / "dados"
FONTE_NOME = {"STF": "Supremo Tribunal Federal", "STJ": "Superior Tribunal de Justiça", "TST": "Tribunal Superior do Trabalho",
              "TSE": "Tribunal Superior Eleitoral", "STM": "Superior Tribunal Militar", "CNJ": "Conselho Nacional de Justiça"}


def slug(t):
    t = unicodedata.normalize("NFKD", t or "").encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z0-9]+", "-", t).strip("-")


def nucleo(nos, arestas):
    arq = DADOS / "judiciario.json"
    dados = json.loads(arq.read_text(encoding="utf-8")).get("tribunais", {}) if arq.exists() else {}
    # os sites do STF, STJ e TSE bloqueiam o robô no GitHub; para eles vale a coleta feita pelo navegador
    nav = DADOS / "judiciario_navegador.json"
    if nav.exists():
        n = json.loads(nav.read_text(encoding="utf-8"))
        for sigla, t in n.get("tribunais", {}).items():
            if not (dados.get(sigla) or {}).get("membros"):
                dados[sigla] = {**t, "coletadoPor": n.get("coletadoPor"), "coletadoEm": n.get("coletadoEm")}
    contagem = {}
    for sigla, t in dados.items():
        corte = next((k for k, v in nos.items() if v.get("sigla") == sigla and v.get("poder") == "Judiciário" and v.get("tipo") == "orgao"), None)
        if not corte:
            contagem[sigla] = "tribunal não encontrado no núcleo"
            continue
        nos[corte]["vagasLegais"] = t.get("vagasLegais")
        nos[corte]["membrosConhecidos"] = len(t.get("membros", []))
        conselho = sigla == "CNJ"
        for m in t.get("membros", []):
            papel = (m.get("papel") or "").strip()
            pl = papel.lower()
            if "vice" in pl:
                rot, ordem = f"Vice-Presidente do {sigla}", 2
            elif pl.startswith("presidente"):
                rot, ordem = f"Presidente do {sigla}", 1
            elif "corregedor" in pl:
                rot, ordem = (papel if conselho else f"Corregedor(a) do {sigla}"), 3
            elif m.get("grupo") == "Substituto":
                rot, ordem = f"Ministro(a) substituto(a) do {sigla}", 20
            else:
                rot, ordem = (f"Conselheiro(a) do {sigla}" if conselho else f"Ministro(a) do {sigla}"), 10
            i = f"jud:{sigla.lower()}:{slug(m['nome'])}"
            oc = {k: v for k, v in {"nome": m["nome"], "foto": m.get("foto"), "desde": m.get("desde"), "papel": papel or None,
                                     "fonte": f"{sigla}, composição atual (site oficial{', consultado em ' + t['coletadoEm'] if t.get('coletadoEm') else ''})", "url": t.get("url"),
                                     "origem": m.get("origem") or m.get("vaga")}.items() if v}
            nos[i] = {"id": i, "tipo": "cargo", "rotulo": rot, "codigoCargo": "MIN", "ordem": ordem, "juiz": True, "tribunal": sigla,
                      "grupo": m.get("grupo"), "ocupantes": [oc]}
            arestas.append({"de": i, "para": corte, "tipo": "cargo"})
        contagem[sigla] = len(t.get("membros", []))
    return contagem
