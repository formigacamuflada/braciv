"""Funções Essenciais à Justiça no núcleo do grafo (chamado por grafo.py): Ministério Público da União
(PGR e os quatro ramos, CF art. 128) e Defensoria Pública da União (LC 80/1994, art. 6º).

O SIORG só traz CNMP, MPDFT e ESMPU deste grupo; MPU, MPF, MPT, MPM e DPU entram aqui como órgãos.
Ocupantes: dados/funcoes_essenciais_navegador.json, coletado no navegador nas páginas oficiais
(MPF, MPT, MPM, MPDFT e DPU), com a data da consulta.
"""
import json
import pathlib
import re
import unicodedata

DADOS = pathlib.Path(__file__).resolve().parent.parent / "dados"
PODER = "Funções Essenciais à Justiça"


def slug(t):
    t = unicodedata.normalize("NFKD", t or "").encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z0-9]+", "-", t).strip("-")


def nucleo(nos, arestas):
    arq = DADOS / "funcoes_essenciais_navegador.json"
    if not arq.exists():
        return "sem dados"
    d = json.loads(arq.read_text(encoding="utf-8"))
    quando = d.get("coletadoEm")
    ids = {}
    for sigla, inst in d.get("instituicoes", {}).items():
        # reaproveita o nó do SIORG quando existe (MPDFT); senão cria o órgão
        ex = next((k for k, v in nos.items() if v.get("tipo") == "orgao" and v.get("sigla") == sigla and v.get("poder") == PODER), None)
        i = ex or f"fej:{sigla.lower()}"
        if not ex:
            nos[i] = {"id": i, "tipo": "orgao", "rotulo": inst["nome"], "nome": inst["nome"], "sigla": sigla, "poder": PODER,
                      "tipoSiorg": "orgao", "fonteOrgao": inst.get("url")}
        ids[sigla] = i
    for sigla, inst in d.get("instituicoes", {}).items():
        if inst.get("pai") in ids:
            arestas.append({"de": ids[sigla], "para": ids[inst["pai"]], "tipo": "subordinada"})
        for m in inst.get("membros", []):
            j = f"fej:{sigla.lower()}:{slug(m['cargo'])}"
            oc = {k: v for k, v in {"nome": m["nome"], "foto": m.get("foto"), "papel": m.get("detalhe"),
                                     "fonte": f"{inst['nome']}, página oficial (consultada em {quando})", "url": m.get("fonte")}.items() if v}
            nos[j] = {"id": j, "tipo": "cargo", "rotulo": m["cargo"], "codigoCargo": m.get("codigo") or "FEJ", "ordem": m.get("ordem", 9), "ocupantes": [oc]}
            arestas.append({"de": j, "para": ids[sigla], "tipo": "cargo"})
    # CNMP e ESMPU (SIORG) ficam junto do MPU
    for s in ("CNMP", "ESMPU"):
        k = next((k for k, v in nos.items() if v.get("tipo") == "orgao" and v.get("sigla") == s and v.get("poder") == PODER), None)
        if k and "MPU" in ids and not any(a["de"] == k and a["para"] == ids["MPU"] for a in arestas):
            arestas.append({"de": k, "para": ids["MPU"], "tipo": "vinculada"})
    return {s: len(i.get("membros", [])) for s, i in d.get("instituicoes", {}).items()}
