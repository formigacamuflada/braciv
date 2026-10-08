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
# fotos achadas a mao no navegador (07/10/2026), onde a pagina do ministerio nao segue o padrao;
# so valem enquanto o ministro for o mesmo (o nome e conferido)
MANUAL = {
    "CGU": ("Vinicius Marques de Carvalho", "https://www.gov.br/cgu/pt-br/composicao/ministro/VinciusMarquesdeCarvalho.jpg",
            "https://www.gov.br/cgu/pt-br/composicao/ministro"),
    "MRE": ("Mauro Luiz Iecker Vieira", "https://www.gov.br/mre/pt-br/composicao/gabinete-do-ministro-das-relacoes-exteriores/embaixador-mauro-luiz-iecker-vieira/@@images/image",
            "https://www.gov.br/mre/pt-br/composicao/quem-e-quem"),
}
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


def imagens(pagina):
    """(alt, src) das imagens do conteudo; aceita src e data-src."""
    for m in re.finditer(r"<img\b[^>]*>", pagina):
        tag = m.group(0)
        alt = re.search(r'alt="([^"]*)"', tag)
        src = re.search(r'(?:data-src|src)="([^"]+)"', tag)
        if src and not re.search(r"logo|govbr|barra|icon|sprite|\.svg", src.group(1), re.I):
            yield html.unescape(alt.group(1) if alt else ""), html.unescape(src.group(1))


def procura(s, slug, pessoa):
    """Percorre as paginas de composicao do ministerio (ate 30) atras da foto da pessoa:
    imagem com o nome no texto alternativo, ou a imagem principal da pagina pessoal dela."""
    base = f"https://www.gov.br/{slug}/pt-br/"
    fila = [base + c for c in CAMINHOS] + [base + "acesso-a-informacao/institucional", base]
    vistos = set()
    tokens = norm(pessoa)
    while fila and len(vistos) < 30:
        url = fila.pop(0).split("#")[0].rstrip("/")
        if url in vistos:
            continue
        vistos.add(url)
        try:
            r = s.get(url, timeout=30)
        except Exception:
            continue
        if r.status_code != 200 or "text/html" not in r.headers.get("content-type", ""):
            continue
        t = r.text
        for alt, src in imagens(t):
            arq = src.split("?")[0].rsplit("/@@images", 1)[0].rsplit("/", 1)[-1]
            if bate(alt, pessoa) or bate(arq.replace("-", " ").replace("_", " "), pessoa):
                return requests.compat.urljoin(url, src), url
        titulo = re.search(r"<h1[^>]*>(.*?)</h1>", t, re.S)
        if titulo and bate(re.sub(r"<[^>]+>", " ", titulo.group(1)), pessoa):
            for alt, src in imagens(t):
                if "@@images" in src or re.search(r"\.(jpe?g|png)", src, re.I):
                    return requests.compat.urljoin(url, src), url
        # proximos: links com o nome da pessoa primeiro, depois os de ministro/quem e quem/gabinete
        novos = []
        for m in re.finditer(r'<a\b[^>]*href="([^"]+)"[^>]*>(.*?)</a>', t, re.S):
            href, txt = html.unescape(m.group(1)), re.sub(r"<[^>]+>", " ", m.group(2))
            if not href.startswith(base) or re.search(r"@@|\.pdf|/view$|download", href):
                continue
            if bate(txt, pessoa) or len([w for w in tokens if w.lower() in href.lower()]) >= 2:
                novos.insert(0, href)
            elif re.search(r"ministr|quem-e-quem|gabinete|biografia", href, re.I):
                novos.append(href)
        fila = [n for n in novos if n.rstrip("/") not in vistos][:12] + fila
    return None


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
        man = MANUAL.get(sigla)
        achou = (man[1], man[2]) if man and bate(man[0], c["pessoa"]) else procura(s, slug, c["pessoa"])
        if not achou:
            sem.append(f"{c['pessoa']} ({sigla}, gov.br/{slug}): foto nao encontrada")
            continue
        img_url = re.sub(r"/@@images/.*$", "/@@images/image", achou[0])
        try:
            for tent in range(3):
                try:
                    r = s.get(img_url, timeout=60)
                    r.raise_for_status()
                    break
                except requests.RequestException:
                    if tent == 2:
                        raise
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
