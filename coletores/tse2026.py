"""Eleicao geral de 2026 pelo TSE: eleitos e quem disputa o 2o turno, com partido e foto.

Fonte (Portal de Dados Abertos do TSE, conjunto "Candidatos - 2026"), atualizada pelo TSE
durante a totalizacao (coluna DS_SIT_TOT_TURNO):
  https://cdn.tse.jus.br/estatistica/sead/odsele/consulta_cand/consulta_cand_2026.zip
  https://cdn.tse.jus.br/estatistica/sead/eleicoes/eleicoes2026/fotos/foto_cand2026_<UF>_div.zip

Para cada candidato vale a linha do turno mais recente (depois de 25/10 o 2o turno substitui
o "2o TURNO" do 1o turno por ELEITO / NAO ELEITO). CPF, e-mail e demais dados pessoais nao sao gravados.

Grava dados/tse_eleicao_2026.json, dados/fotos/tse2026/<SQ_CANDIDATO>.jpg e dados/tse2026_relatorio.txt.
Uso: python coletores/tse2026.py
"""
import collections
import csv
import io
import json
import pathlib
import re
import sys
import zipfile
from datetime import datetime, timezone

import requests

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from tse import Remoto, UA  # leitura do zip de fotos por HTTP Range (mesmo metodo de 2022)

CAND = "https://cdn.tse.jus.br/estatistica/sead/odsele/consulta_cand/consulta_cand_2026.zip"
FOTOS = "https://cdn.tse.jus.br/estatistica/sead/eleicoes/eleicoes2026/fotos/foto_cand2026_{uf}_div.zip"
DADOS = pathlib.Path(__file__).resolve().parent.parent / "dados"
CARGOS = {"PRESIDENTE": "Presidente", "VICE-PRESIDENTE": "Vice-presidente", "GOVERNADOR": "Governador", "VICE-GOVERNADOR": "Vice-governador",
          "SENADOR": "Senador", "DEPUTADO FEDERAL": "Deputado Federal", "DEPUTADO ESTADUAL": "Deputado Estadual", "DEPUTADO DISTRITAL": "Deputado Distrital"}
REL = []


def diz(*a):
    t = " ".join(str(x) for x in a)
    print(t)
    REL.append(t)


def situacao(s):
    s = (s or "").upper()
    if s.startswith("ELEITO"):
        return "eleito"
    if "2º TURNO" in s or "2O TURNO" in s or "2° TURNO" in s:
        return "segundoTurno"
    return None


def main():
    diz("baixando lista de candidatos de 2026 ...")
    r = requests.get(CAND, headers=UA, timeout=600)
    r.raise_for_status()
    zf = zipfile.ZipFile(io.BytesIO(r.content))
    nome = next(n for n in zf.namelist() if n.lower().endswith("brasil.csv"))
    gerado = None
    ultimo = {}   # SQ_CANDIDATO -> linha do turno mais recente
    for l in csv.DictReader(io.TextIOWrapper(zf.open(nome), encoding="latin-1"), delimiter=";"):
        if l.get("DS_CARGO") not in CARGOS:
            continue
        gerado = gerado or f"{l.get('DT_GERACAO')} {l.get('HH_GERACAO')}"
        sq = l["SQ_CANDIDATO"]
        if sq not in ultimo or int(l.get("NR_TURNO") or 1) >= int(ultimo[sq].get("NR_TURNO") or 1):
            ultimo[sq] = l
    diz("arquivo gerado pelo TSE em:", gerado)
    cands = []
    for sq, l in ultimo.items():
        st = situacao(l.get("DS_SIT_TOT_TURNO"))
        if not st:
            continue
        cands.append({
            "sq": sq, "uf": l["SG_UF"], "cargo": CARGOS[l["DS_CARGO"]], "situacao": st, "situacaoTse": l.get("DS_SIT_TOT_TURNO"),
            "turno": int(l.get("NR_TURNO") or 1), "nome": (l.get("NM_URNA_CANDIDATO") or l.get("NM_CANDIDATO") or "").title(),
            "nomeCompleto": (l.get("NM_CANDIDATO") or "").title(), "partido": {"PC do B": "PCdoB"}.get(l.get("SG_PARTIDO"), l.get("SG_PARTIDO")),
            "numero": l.get("NR_CANDIDATO"),
        })
    cands.sort(key=lambda e: (e["uf"], e["cargo"], e["situacao"], e["nome"]))
    cont = collections.Counter((e["cargo"], e["situacao"]) for e in cands)
    for k, v in sorted(cont.items()):
        diz(f"  {k[0]:<20} {k[1]:<13} {v}")

    destino = DADOS / "fotos" / "tse2026"
    destino.mkdir(parents=True, exist_ok=True)
    try:
        from PIL import Image
    except ImportError:
        Image = None
    por_uf = collections.defaultdict(list)
    for e in cands:
        por_uf[e["uf"]].append(e)
    for uf, lista in sorted(por_uf.items()):
        faltam = [e for e in lista if not (destino / f"{e['sq']}.jpg").exists()]
        if not faltam:
            continue
        try:
            zf_f = zipfile.ZipFile(Remoto(FOTOS.format(uf=uf)))
        except Exception as ex:
            diz(f"  {uf}: fotos indisponiveis ({type(ex).__name__}: {ex})")
            continue
        indice = {}
        for n in zf_f.namelist():
            m = re.search(r"(\d{9,})", n)
            if m:
                indice[m.group(1)] = n
        ok = 0
        for e in faltam:
            n = indice.get(e["sq"])
            if not n:
                continue
            try:
                bruto = zf_f.read(n)
                if Image:
                    im = Image.open(io.BytesIO(bruto)).convert("RGB")
                    im.thumbnail((160, 200))
                    im.save(destino / f"{e['sq']}.jpg", quality=80)
                else:
                    (destino / f"{e['sq']}.jpg").write_bytes(bruto)
                ok += 1
            except Exception as ex:
                diz(f"  {uf}: foto {e['sq']} falhou ({type(ex).__name__})")
        diz(f"  {uf}: {ok}/{len(faltam)} fotos novas")
    for e in cands:
        e["foto"] = f"fotos/tse2026/{e['sq']}.jpg" if (destino / f"{e['sq']}.jpg").exists() else None
    diz(f"com foto: {sum(1 for e in cands if e['foto'])}/{len(cands)}")
    saida = {"geradoTse": gerado, "coletadoEm": datetime.now(timezone.utc).isoformat(timespec="minutes"),
             "fonte": CAND, "candidatos": cands}
    (DADOS / "tse_eleicao_2026.json").write_text(json.dumps(saida, ensure_ascii=False, indent=1), encoding="utf-8")


if __name__ == "__main__":
    try:
        main()
    finally:
        (DADOS / "tse2026_relatorio.txt").write_text("\n".join(REL) + "\n", encoding="utf-8")
