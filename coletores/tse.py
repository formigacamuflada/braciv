"""Governadores e deputados estaduais/distritais eleitos em 2022, com foto, pelo TSE.

Fontes (Portal de Dados Abertos do TSE, conjunto "Candidatos - 2022"):
  https://cdn.tse.jus.br/estatistica/sead/odsele/consulta_cand/consulta_cand_2022.zip
  https://cdn.tse.jus.br/estatistica/sead/eleicoes/eleicoes2022/fotos/foto_cand2022_<UF>_div.zip

Os zips de fotos sao grandes; este coletor le so o indice de cada zip e baixa (por HTTP Range)
apenas as fotos dos eleitos, reduzidas para 160 px.

ATENCAO: sao os ELEITOS EM 2022. Quem assumiu depois (vice que virou governador, suplente
que virou deputado) ainda nao e acompanhado.

Grava dados/tse_eleitos_2022.json, dados/fotos/tse/<SQ_CANDIDATO>.jpg e dados/tse_relatorio.txt.
Uso: python coletores/tse.py
"""
import csv
import io
import json
import pathlib
import re
import zipfile

import requests

CAND = "https://cdn.tse.jus.br/estatistica/sead/odsele/consulta_cand/consulta_cand_2022.zip"
FOTOS = "https://cdn.tse.jus.br/estatistica/sead/eleicoes/eleicoes2022/fotos/foto_cand2022_{uf}_div.zip"
DADOS = pathlib.Path(__file__).resolve().parent.parent / "dados"
CARGOS = {"GOVERNADOR", "VICE-GOVERNADOR", "DEPUTADO ESTADUAL", "DEPUTADO DISTRITAL"}
ELEITO = re.compile(r"^ELEITO")
UA = {"User-Agent": "Mozilla/5.0 (BRA.CIV coletor; github.com/formigacamuflada/braciv)"}
REL = []


def diz(*a):
    t = " ".join(str(x) for x in a)
    print(t)
    REL.append(t)


class Remoto(io.RawIOBase):
    """Arquivo remoto lido por HTTP Range: o zipfile so busca o indice e os membros pedidos."""

    def __init__(self, url):
        self.url, self.pos = url, 0
        r = requests.head(url, headers=UA, timeout=60, allow_redirects=True)
        r.raise_for_status()
        self.tam = int(r.headers["Content-Length"])

    def seekable(self):
        return True

    def readable(self):
        return True

    def seek(self, off, whence=0):
        self.pos = off if whence == 0 else self.pos + off if whence == 1 else self.tam + off
        return self.pos

    def tell(self):
        return self.pos

    def read(self, n=-1):
        if n is None or n < 0:
            n = self.tam - self.pos
        if n == 0 or self.pos >= self.tam:
            return b""
        fim = min(self.tam, self.pos + n) - 1
        r = requests.get(self.url, headers={**UA, "Range": f"bytes={self.pos}-{fim}"}, timeout=120)
        r.raise_for_status()
        self.pos += len(r.content)
        return r.content

    def readinto(self, b):
        d = self.read(len(b))
        b[:len(d)] = d
        return len(d)


def main():
    diz("baixando lista de candidatos ...")
    r = requests.get(CAND, headers=UA, timeout=600)
    r.raise_for_status()
    zf = zipfile.ZipFile(io.BytesIO(r.content))
    nome = next(n for n in zf.namelist() if n.lower().endswith("brasil.csv")) if any(n.lower().endswith("brasil.csv") for n in zf.namelist()) else None
    arquivos = [nome] if nome else [n for n in zf.namelist() if n.lower().endswith(".csv")]
    diz("arquivos usados:", arquivos[:3], "..." if len(arquivos) > 3 else "")
    eleitos = []
    for arq in arquivos:
        leitor = csv.DictReader(io.TextIOWrapper(zf.open(arq), encoding="latin-1"), delimiter=";")
        for l in leitor:
            if l.get("DS_CARGO") in CARGOS and ELEITO.match(l.get("DS_SIT_TOT_TURNO") or ""):
                eleitos.append({
                    "sq": l["SQ_CANDIDATO"], "uf": l["SG_UF"], "cargo": l["DS_CARGO"].title().replace("-G", "-g"),
                    "nome": (l.get("NM_URNA_CANDIDATO") or l.get("NM_CANDIDATO") or "").title(),
                    "nomeCompleto": (l.get("NM_CANDIDATO") or "").title(), "partido": l.get("SG_PARTIDO"),
                    "numero": l.get("NR_CANDIDATO"), "situacao": l.get("DS_SIT_TOT_TURNO"),
                })
    vistos = {}
    for e in eleitos:
        vistos[(e["sq"], e["cargo"])] = e
    eleitos = sorted(vistos.values(), key=lambda e: (e["uf"], e["cargo"], e["nome"]))
    from collections import Counter
    diz("eleitos por cargo:", dict(Counter(e["cargo"] for e in eleitos)))

    destino = DADOS / "fotos" / "tse"
    destino.mkdir(parents=True, exist_ok=True)
    try:
        from PIL import Image
    except ImportError:
        Image = None
    por_uf = {}
    for e in eleitos:
        por_uf.setdefault(e["uf"], []).append(e)
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
        if not indice:
            diz(f"  {uf}: nomes no zip fora do padrao, ex.: {zf_f.namelist()[:3]}")
        ok = 0
        for e in faltam:
            n = indice.get(e["sq"])
            if not n:
                continue
            bruto = zf_f.read(n)
            if Image:
                im = Image.open(io.BytesIO(bruto)).convert("RGB")
                im.thumbnail((160, 200))
                im.save(destino / f"{e['sq']}.jpg", quality=80)
            else:
                (destino / f"{e['sq']}.jpg").write_bytes(bruto)
            ok += 1
        diz(f"  {uf}: {ok}/{len(faltam)} fotos novas")
    for e in eleitos:
        e["foto"] = f"fotos/tse/{e['sq']}.jpg" if (destino / f"{e['sq']}.jpg").exists() else None
    (DADOS / "tse_eleitos_2022.json").write_text(json.dumps(eleitos, ensure_ascii=False, indent=1), encoding="utf-8")
    diz(f"com foto: {sum(1 for e in eleitos if e['foto'])}/{len(eleitos)}")


if __name__ == "__main__":
    try:
        main()
    finally:
        (DADOS / "tse_relatorio.txt").write_text("\n".join(REL) + "\n", encoding="utf-8")
