"""Foto oficial de cada Ministro(a) de Estado, no "Quem e Quem" do site do proprio ministerio (gov.br).

Os sites do gov.br usam o mesmo componente: <img alt="Nome da Pessoa" src=".../@@images/image">.
Para cada ministro da lista oficial do Planalto (dados/planalto_cupula.json) tenta as paginas usuais
de composicao do ministerio e pega a imagem cujo texto alternativo bate com o nome.

Grava dados/fotos/ministros/<sigla>.jpg, dados/ministros_fotos.json e dados/ministros_fotos_relatorio.txt.
Uso: python coletores/ministros_fotos.py
"""
import html
import io
import json
import pathlib
import re
import sys
import unicodedata

import requests

DADOS = pathlib.Path(__file__).resolve().parent.parent / "dados"
UA = {"User-Agent": "Mozilla/5.0 (BRA.CIV coletor; github.com/formigacamuflada/braciv)"}
# endereco do ministerio no gov.br (www.gov.br/<slug>/pt-br); o orgao vem do SIORG pela lista do Planalto
SLUG = {"CC-PR": "casacivil", "SG": "secretariageral", "SRI/PR": "sri", "SECOM": "secom", "GSI/PR": "gsi", "AGU": "agu", "CGU": "cgu",
        "MAPA": "agricultura", "MCID": "cidades", "MCTI": "mcti", "MCOM": "mcom", "MinC": "cultura", "MD": "defesa", "MDA": "mda",
        "MDS": "mds", "MDIC": "mdic", "MDHC": "mdh", "MEC": "mec", "MEMP": "memp", "MESP": "esporte", "MF": "fazenda", "MGI": "gestao",
        "MIR": "igualdaderacial", "MIDR": "mdr", "MJSP": "mj", "MMA": "mma", "MME": "mme", "MMULHERES": "mulheres", "MPA": "mpa",
        "MPO": "planejamento", "MPOR": "portos-e-aeroportos", "MPI": "povosindigenas", "MPS": "previdencia", "MRE": "mre", "MS": "saude",
        "MTE": "trabalho-e-emprego", "MT": "transportes", "MTur": "turismo"}
CAMINHOS = ["composicao/quem-e-quem", "acesso-a-informacao/institucional/quem-e-quem", "composicao", "acesso-a-informacao/institucional/composicao",
            "composicao/ministro", "composicao/ministra", "acesso-a-informacao/institucional/ministro", "acesso-a-informacao/institucional/ministra",
            "composicao/gabinete-do-ministro", "composicao/gabinete-da-ministra", "acesso-a-informacao/quem-e-quem", "assuntos/quem-e-quem"]
REL = []


def diz(*a):
    t = " ".join(str(x) for x in a)
    print(t)
    REL.append(t)


def norm(t):
    t = unicodedata.normalize("NFKD", html.unescape(t or "")).encode("ascii", "ignore").decode().upper()
    return [w for w in re.sub(r"[^A-Z ]+", " ", t).split() if len(w) > 2 and w not in ("DOS", "DAS", "DES")]


def bate(alt, pessoa):
    a, p = set(norm(alt)), norm(pessoa)
    if not a or not p:
        return False
    # pelo menos dois nomes em comum (ex.: "Waldez Goes" bate com "Antonio Waldez Goes da Silva")
    return len(a & set(p)) >= 2


def main():
    cup = json.loads((DADOS / "planalto_cupula.json").read_text(encoding="utf-8"))["cargos"]
    orgaos = {o["codigo"]: o for o in json.loads((DADOS / "siorg_orgaos.json").read_text(encoding="utf-8"))}
    destino = DADOS / "fotos" / "ministros"
    destino.mkdir(parents=True, exist_ok=True)
    try:
        from PIL import Image
    except ImportError:
        Image = None
    saida, sem = {}, []
    s = requests.Session()
    s.headers.update(UA)
    for c in cup:
        if c.get("codigoCargo") != "MEST" or not c.get("pessoa"):
            continue
        sigla = (orgaos.get(c.get("orgaoSiorg")) or {}).get("sigla")
        slug = SLUG.get(sigla)
        if not slug:
            sem.append(f"{c['pessoa']} ({sigla}): ministerio sem endereco conhecido no gov.br")
            continue
        achou = None
        for cam in CAMINHOS:
            url = f"https://www.gov.br/{slug}/pt-br/{cam}"
            try:
                r = s.get(url, timeout=30)
            except Exception:
                continue
            if r.status_code != 200:
                continue
            for m in re.finditer(r"<img\b[^>]*>", r.text):
                tag = m.group(0)
                alt = re.search(r'alt="([^"]*)"', tag)
                src = re.search(r'src="([^"]+)"', tag)
                if alt and src and bate(alt.group(1), c["pessoa"]) and "@@images" in src.group(1):
                    achou = (html.unescape(src.group(1)), url)
                    break
            if achou:
                break
        if not achou:
            sem.append(f"{c['pessoa']} ({sigla}, gov.br/{slug}): foto nao encontrada")
            continue
        img_url = re.sub(r"/@@images/.*$", "/@@images/image", achou[0])
        try:
            r = s.get(img_url, timeout=60)
            r.raise_for_status()
            arq = destino / f"{re.sub(r'[^A-Za-z0-9]+', '_', sigla)}.jpg"
            if Image:
                im = Image.open(io.BytesIO(r.content)).convert("RGB")
                im.thumbnail((200, 250))
                im.save(arq, quality=82)
            else:
                arq.write_bytes(r.content)
            saida[c["pessoa"]] = {"foto": f"fotos/ministros/{arq.name}", "fonte": achou[1], "sigla": sigla}
            diz(f"  ok  {sigla:<10} {c['pessoa']}  <- {achou[1]}")
        except Exception as ex:
            sem.append(f"{c['pessoa']} ({sigla}): falha ao baixar a imagem ({type(ex).__name__})")
    for t in sem:
        diz("  sem", t)
    diz(f"ministros com foto: {len(saida)}/{len(saida) + len(sem)}")
    (DADOS / "ministros_fotos.json").write_text(json.dumps(saida, ensure_ascii=False, indent=1), encoding="utf-8")


if __name__ == "__main__":
    try:
        main()
    finally:
        (DADOS / "ministros_fotos_relatorio.txt").write_text("\n".join(REL) + "\n", encoding="utf-8")
