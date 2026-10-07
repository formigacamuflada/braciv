"""Convergencia entre cargos: quem foi eleito em 2022 e depois saiu (ou vai sair) para outro cargo.

Cruza pelo CPF (so na memoria; o CPF NAO e gravado):
  - Camara (API v2, /deputados/{id}): deputados federais em exercicio hoje
  - TSE 2022: governadores, vices e deputados estaduais/distritais eleitos
  - TSE 2024: prefeitos, vice-prefeitos e vereadores eleitos (deputado eleito prefeito sai da Assembleia em 1/1/2025)
  - TSE 2026: todas as candidaturas (governador que disputou outro cargo teve de renunciar ate 6 meses antes, CF art. 14 par. 6)

Grava dados/convergencia.json e dados/convergencia_relatorio.txt.
Uso: python coletores/convergencia.py
"""
import collections
import csv
import io
import json
import pathlib
import re
import time
import unicodedata
import zipfile
from datetime import datetime, timezone

import requests

DADOS = pathlib.Path(__file__).resolve().parent.parent / "dados"
UA = {"User-Agent": "Mozilla/5.0 (BRA.CIV coletor; github.com/formigacamuflada/braciv)"}
CAND = "https://cdn.tse.jus.br/estatistica/sead/odsele/consulta_cand/consulta_cand_{ano}.zip"
REL = []


def diz(*a):
    t = " ".join(str(x) for x in a)
    print(t)
    REL.append(t)


def cpf(c):
    c = re.sub(r"\D", "", c or "")
    return c.zfill(11) if c and set(c) != {"0"} and c not in ("-1", "-3", "4") else None


def linhas(ano, cargos=None):
    """Linha do turno mais recente de cada candidato do ano."""
    diz(f"baixando candidatos de {ano} ...")
    r = requests.get(CAND.format(ano=ano), headers=UA, timeout=900)
    r.raise_for_status()
    zf = zipfile.ZipFile(io.BytesIO(r.content))
    nome = next((n for n in zf.namelist() if n.lower().endswith("brasil.csv")), None)
    arqs = [nome] if nome else [n for n in zf.namelist() if n.lower().endswith(".csv")]
    ult = {}
    for a in arqs:
        for l in csv.DictReader(io.TextIOWrapper(zf.open(a), encoding="latin-1"), delimiter=";"):
            if cargos and l.get("DS_CARGO") not in cargos:
                continue
            sq = l["SQ_CANDIDATO"]
            if sq not in ult or int(l.get("NR_TURNO") or 1) >= int(ult[sq].get("NR_TURNO") or 1):
                ult[sq] = l
    diz(f"  {ano}: {len(ult)} candidaturas lidas")
    return list(ult.values())


def chave(l):
    """Alternativa ao CPF (o TSE nao publica CPF em todos os anos): nome completo + nascimento + UF."""
    n = unicodedata.normalize("NFKD", l.get("NM_CANDIDATO") or "").encode("ascii", "ignore").decode().upper()
    return (re.sub(r"[^A-Z]+", " ", n).strip(), (l.get("DT_NASCIMENTO") or "").strip(), l.get("SG_UF"))


def sit(l):
    s = (l.get("DS_SIT_TOT_TURNO") or "").upper()
    return "eleito" if s.startswith("ELEITO") else "segundoTurno" if "2º TURNO" in s else "suplente" if s.startswith("SUPLENTE") else "naoEleito" if "NÃO ELEITO" in s else "outra"


def titulo(c):
    return (c or "").title().replace("-G", "-g").replace("-P", "-p")


def main():
    # 1. deputados federais em exercicio: CPF pela API da Camara
    deps = json.loads((DADOS / "camara_deputados.json").read_text(encoding="utf-8"))
    cpf_dep = {}
    for d in deps:
        for tent in range(3):
            try:
                r = requests.get(f"https://dadosabertos.camara.leg.br/api/v2/deputados/{d['id']}", headers={**UA, "Accept": "application/json"}, timeout=30)
                r.raise_for_status()
                c = cpf((r.json().get("dados") or {}).get("cpf"))
                if c:
                    cpf_dep[c] = d
                break
            except Exception:
                time.sleep(2)
    diz(f"Camara: CPF de {len(cpf_dep)}/{len(deps)} deputados em exercicio")

    # 2. eleitos de 2022 que interessam
    l22 = linhas(2022, {"GOVERNADOR", "VICE-GOVERNADOR", "DEPUTADO ESTADUAL", "DEPUTADO DISTRITAL"})
    el22 = [l for l in l22 if sit(l) == "eleito"]
    diz("  eleitos 2022:", dict(collections.Counter(l["DS_CARGO"] for l in el22)))
    # 3. eleitos de 2024 (prefeitos, vices e vereadores)
    c24, k24 = {}, {}
    l24 = linhas(2024, {"PREFEITO", "VICE-PREFEITO", "VEREADOR"})
    diz("  2024: CPF publicado em", sum(1 for l in l24 if cpf(l.get("NR_CPF_CANDIDATO"))), "linhas; DT_NASCIMENTO em", sum(1 for l in l24 if (l.get("DT_NASCIMENTO") or "").strip()))
    for l in l24:
        if sit(l) != "eleito":
            continue
        reg = {"cargo": titulo(l["DS_CARGO"]), "municipio": (l.get("NM_UE") or "").title(), "uf": l.get("SG_UF"), "ano": 2024}
        c = cpf(l.get("NR_CPF_CANDIDATO"))
        if c:
            c24[c] = reg
        k24[chave(l)] = reg
    # 4. todas as candidaturas de 2026
    c26 = collections.defaultdict(list)
    for l in linhas(2026):
        c = cpf(l.get("NR_CPF_CANDIDATO"))
        if c and l.get("DS_CARGO") not in ("1º SUPLENTE", "2º SUPLENTE"):
            c26[c].append({"cargo": titulo(l["DS_CARGO"]), "uf": l.get("SG_UF"), "situacao": sit(l),
                           "candidatura": (l.get("DS_SITUACAO_CANDIDATURA") or "").title(),
                           "partido": {"PC do B": "PCdoB"}.get(l.get("SG_PARTIDO"), l.get("SG_PARTIDO"))})
    def melhor(lista):
        ordem = {"eleito": 0, "segundoTurno": 1, "suplente": 2, "naoEleito": 3, "outra": 4}
        return sorted(lista, key=lambda x: ordem.get(x["situacao"], 9))[0] if lista else None

    saida = {"geradoEm": datetime.now(timezone.utc).isoformat(timespec="minutes"), "federais": {}, "eleitos2022": {}}
    # federais de hoje: candidatos em 2026 (a outro cargo ou a reeleicao)
    for c, d in cpf_dep.items():
        m = melhor(c26.get(c, []))
        if m:
            saida["federais"][f"dep:{d['id']}"] = {"2026": m}
    # eleitos de 2022: saida para prefeitura em 2024 e candidatura em 2026
    for l in el22:
        c = cpf(l.get("NR_CPF_CANDIDATO"))
        reg = {}
        r24 = c24.get(c) or k24.get(chave(l))
        if r24:
            reg["2024"] = r24
        m = melhor(c26.get(c, []))
        if m:
            reg["2026"] = m
        if reg:
            reg["cargo2022"] = titulo(l["DS_CARGO"])
            reg["nome"] = (l.get("NM_URNA_CANDIDATO") or "").title()
            reg["uf"] = l["SG_UF"]
            saida["eleitos2022"][l["SQ_CANDIDATO"]] = reg

    # relatorio
    e22 = saida["eleitos2022"].values()
    diz("eleitos de 2022 que se elegeram em 2024:", dict(collections.Counter((r["cargo2022"], r["2024"]["cargo"]) for r in e22 if "2024" in r)))
    for r in e22:
        if "2024" in r:
            diz(f"  {r['uf']} {r['cargo2022']} {r['nome']} -> {r['2024']['cargo']} de {r['2024']['municipio']}")
    gov_out = [r for r in e22 if r["cargo2022"] == "Governador" and "2026" in r and r["2026"]["cargo"] != "Governador"]
    diz("governadores de 2022 candidatos a OUTRO cargo em 2026 (renuncia obrigatoria):", len(gov_out))
    for sq, r in saida["eleitos2022"].items():
        if r["cargo2022"] in ("Governador", "Vice-governador") and "2026" in r:
            nm = next((l.get("NM_URNA_CANDIDATO") for l in el22 if l["SQ_CANDIDATO"] == sq), "?")
            diz(f"  {r['uf']} {r['cargo2022']} {nm}: 2026 {r['2026']}")
    diz("federais de hoje em 2026:", dict(collections.Counter((v["2026"]["cargo"], v["2026"]["situacao"]) for v in saida["federais"].values())))
    diz("estaduais de 2022 em 2026:", dict(collections.Counter((v["2026"]["cargo"], v["2026"]["situacao"]) for v in e22 if "2026" in v and v["cargo2022"].startswith("Deputado"))))
    (DADOS / "convergencia.json").write_text(json.dumps(saida, ensure_ascii=False, indent=1), encoding="utf-8")


if __name__ == "__main__":
    try:
        main()
    finally:
        (DADOS / "convergencia_relatorio.txt").write_text("\n".join(REL) + "\n", encoding="utf-8")
