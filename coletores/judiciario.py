"""Ministros dos tribunais superiores e conselheiros do CNJ, com foto, pelos sites oficiais de cada tribunal.

Fontes (composição atual publicada por cada tribunal):
  STF  https://portal.stf.jus.br/ostf/
  STJ  https://www.stj.jus.br/web/verMinistrosSTJ?parametro=1 (+ página de currículo de cada ministro, com a foto)
       https://www.stj.jus.br/sites/portalp/Institucional/Composicao (Presidente e Vice)
  TST  https://www.tst.jus.br/ministros
  TSE  https://www.tse.jus.br/institucional/ministros (+ página de cada ministro, com a foto)
  STM  https://www.stm.jus.br/institucional/conheca-o-superior-tribunal-militar/composicao-da-corte
  CNJ  https://www.cnj.jus.br/composicao-atual/

Cada tribunal é coletado em separado: se um site falhar ou mudar, os outros seguem e o erro vai para o relatório.
Grava dados/judiciario.json, dados/fotos/jud/<SIGLA>/<nome>.jpg e dados/judiciario_relatorio.txt.
Uso: python coletores/judiciario.py
"""
import io
import json
import pathlib
import re
import time
import unicodedata
from urllib.parse import urljoin

import requests
from bs4 import BeautifulSoup

DADOS = pathlib.Path(__file__).resolve().parent.parent / "dados"
FOTOS = DADOS / "fotos" / "jud"
UA = {"User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36 BRA.CIV-coletor",
      "Accept-Language": "pt-BR,pt;q=0.9"}
REL = []
S = requests.Session()
S.headers.update(UA)


def diz(*a):
    t = " ".join(str(x) for x in a)
    print(t)
    REL.append(t)


def pagina(url):
    for i in range(3):
        try:
            r = S.get(url, timeout=60)
            r.raise_for_status()
            r.encoding = r.apparent_encoding if not r.encoding or r.encoding.lower() == "iso-8859-1" else r.encoding
            return BeautifulSoup(r.text, "html.parser")
        except requests.RequestException:
            if i == 2:
                raise
            time.sleep(4 * (i + 1))


def slug(t):
    t = unicodedata.normalize("NFKD", t).encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z0-9]+", "-", t).strip("-")


def limpa(t):
    return re.sub(r"\s+", " ", t or "").strip()


def foto(sigla, nome, url):
    """Baixa e reduz a foto (200 px de altura); devolve o caminho relativo ou None."""
    if not url:
        return None
    destino = FOTOS / sigla / f"{slug(nome)}.jpg"
    try:
        r = S.get(url.split("#")[0], timeout=60)
        r.raise_for_status()
        from PIL import Image
        im = Image.open(io.BytesIO(r.content)).convert("RGB")
        im.thumbnail((160, 200))
        destino.parent.mkdir(parents=True, exist_ok=True)
        im.save(destino, quality=82)
        return str(destino.relative_to(DADOS)).replace("\\", "/")
    except Exception as e:      # noqa: BLE001
        diz(f"  {sigla}: foto de {nome} falhou ({type(e).__name__})")
        return None


def tira_titulo(n):
    return limpa(re.sub(r"^(Foto d[oa] )?(Ministr[oa]|Min\.|Conselheir[oa]|Dr[a]?\.)\s+", "", n))


# ---------------------------------------------------------------------------
def stf():
    url = "https://portal.stf.jus.br/ostf/"
    s = pagina(url)
    texto = limpa(s.get_text(" "))
    vice = re.search(r"Min\. ([^.]+?) VICE-PRESIDENTE", texto)
    vice = limpa(vice.group(1)) if vice else None
    membros = []
    for img in s.find_all("img"):
        src = img.get("src") or ""
        if not re.search(r"/assets/img/[a-z0-9\-]+\.(jpe?g|png)$", src) or "/ministros/" in src or not re.search(r"Minist", img.get("alt") or ""):
            continue
        nome = tira_titulo(img.get("alt"))
        bloco = img
        for _ in range(4):
            bloco = bloco.parent or bloco
        t = limpa(bloco.get_text(" "))
        papel = "Presidente" if re.search(r"\bPresidente\b", t) and "Vice" not in t else ("Vice-Presidente" if vice and slug(vice) in slug(nome) else None)
        posse = re.search(r"\((\d{2}/\d{2}/\d{4})\)", t)
        membros.append({"nome": nome, "papel": papel, "desde": posse.group(1) if posse else None, "foto": foto("STF", nome, urljoin(url, src))})
    return {"url": url, "membros": membros, "vagasLegais": 11}


def stj():
    url = "https://www.stj.jus.br/web/verMinistrosSTJ?parametro=1"
    s = pagina(url)
    comp = limpa(pagina("https://www.stj.jus.br/sites/portalp/Institucional/Composicao").get_text(" "))
    pres = re.search(r"Presidente Ministro\W*(.+?) Vice-Presidente Ministro\W*(.+?) Veja", comp)
    membros = []
    for a in s.find_all("a", href=re.compile("verCurriculoMinistro")):
        bruto = limpa(a.get_text(" "))
        if not bruto:
            continue
        nome, _, extra = bruto.partition(" - ")
        try:
            p = pagina(urljoin(url, a["href"]))
            im = next((i for i in p.find_all("img") if "/ministros/fotos/" in (i.get("src") or "")), None)
            f = foto("STJ", nome, urljoin(url, im["src"])) if im else None
        except Exception as e:      # noqa: BLE001
            diz(f"  STJ: currículo de {nome} falhou ({type(e).__name__})")
            f = None
        papel = None
        if pres and slug(pres.group(1).split()[-1]) in slug(nome) and slug(pres.group(1).split()[0]) in slug(nome):
            papel = "Presidente"
        elif pres and slug(pres.group(2).split()[-1]) in slug(nome) and slug(pres.group(2).split()[0]) in slug(nome):
            papel = "Vice-Presidente"
        membros.append({"nome": nome, "papel": papel, "funcao": extra or None, "foto": f})
        time.sleep(0.3)
    return {"url": url, "membros": membros, "vagasLegais": 33}


def tst():
    url = "https://www.tst.jus.br/ministros"
    s = pagina(url)
    membros = []
    for img in s.find_all("img"):
        alt = limpa(img.get("alt"))
        if "image/journal/article" not in (img.get("src") or "") or not re.match(r"^\d+\s*-\s*", alt):
            continue
        partes = [limpa(x) for x in re.split(r"\s+-\s+", alt)]
        nome = partes[1] if len(partes) > 1 else alt
        papel = " - ".join(partes[2:]) or None
        membros.append({"nome": nome, "papel": papel, "foto": foto("TST", nome, urljoin(url, img["src"]))})
    return {"url": url, "membros": membros, "vagasLegais": 27}


def tse():
    url = "https://www.tse.jus.br/institucional/ministros"
    s = pagina(url)
    membros, grupo = [], "Efetivo"
    for tr in s.find_all("tr"):
        t = limpa(tr.get_text(" "))
        if "EFETIVOS" in t.upper():
            grupo = "Efetivo"
            continue
        if "SUBSTITUTOS" in t.upper():
            grupo = "Substituto"
            continue
        a = tr.find("a", href=re.compile(r"/institucional/ministros/ministr"))
        celulas = [limpa(td.get_text(" ")) for td in tr.find_all(["td", "th"])]
        if not a or not celulas:
            continue
        nome = limpa(a.get_text(" "))
        papel = re.search(r"\(([^)]+)\)", celulas[0])
        origem = celulas[1] if len(celulas) > 1 else None
        try:
            p = pagina(urljoin(url, a["href"]))
            im = next((i for i in p.find_all("img") if "/imagens/fotos/" in (i.get("src") or "")), None)
            f = foto("TSE", nome, urljoin(url, im["src"])) if im else None
        except Exception as e:      # noqa: BLE001
            diz(f"  TSE: página de {nome} falhou ({type(e).__name__})")
            f = None
        membros.append({"nome": nome, "papel": papel.group(1) if papel else None, "grupo": grupo, "origem": origem, "foto": f})
        time.sleep(0.3)
    return {"url": url, "membros": membros, "vagasLegais": 7}


def stm():
    url = "https://www.stm.jus.br/institucional/conheca-o-superior-tribunal-militar/composicao-da-corte"
    s = pagina(url)
    membros = []
    for img in s.find_all("img"):
        src = img.get("src") or ""
        if "composicao-da-corte/" not in src or not img.get("alt"):
            continue
        nome = limpa(img.get("alt"))
        bloco = img.parent.parent if img.parent else img
        t = limpa(bloco.get_text(" "))
        papel = "Vice-Presidente" if re.search(r"Vice-Presidente", t) else "Presidente" if re.search(r"\bPresidente\b", t) else None
        nom = re.search(r"Data de nomea[çc][ãa]o:\s*([\d.]+)", t)
        membros.append({"nome": nome, "papel": papel, "desde": nom.group(1) if nom else None, "foto": foto("STM", nome, urljoin(url, src))})
    return {"url": url, "membros": membros, "vagasLegais": 15}


def cnj():
    url = "https://www.cnj.jus.br/composicao-atual/"
    s = pagina(url)
    corpo = s.find("main") or s.find("article") or s
    membros = []
    for img in corpo.find_all("img"):
        src = img.get("src") or img.get("data-src") or ""
        if "/wp-content/uploads/" not in src or "logo" in src:
            continue
        c = img
        while c.parent is not None and len(c.parent.find_all("img")) == 1:
            c = c.parent
        t = limpa(c.get_text(" "))
        m = re.match(r"(.+?)\s+(Presidente|Corregedora? Nacional de Justiça|Conselheir[oa])\s+Ingresso no CNJ:\s*(.+?)\s+Vaga:\s*(.+?)(?:\s+Currículo|$)", t)
        if not m:
            continue
        nome = tira_titulo(m.group(1))
        membros.append({"nome": nome, "papel": m.group(2), "desde": m.group(3), "vaga": m.group(4), "foto": foto("CNJ", nome, urljoin(url, src))})
    return {"url": url, "membros": membros, "vagasLegais": 15}


def main():
    saida = {"coletadoEm": time.strftime("%Y-%m-%d"), "tribunais": {}}
    for sigla, fn in (("STF", stf), ("STJ", stj), ("TST", tst), ("TSE", tse), ("STM", stm), ("CNJ", cnj)):
        try:
            r = fn()
            saida["tribunais"][sigla] = r
            diz(f"{sigla}: {len(r['membros'])} pessoas, {sum(1 for m in r['membros'] if m.get('foto'))} com foto")
        except Exception as e:      # noqa: BLE001
            diz(f"{sigla}: FALHOU ({type(e).__name__}: {e})")
    anterior = DADOS / "judiciario.json"
    if anterior.exists():           # tribunal que falhou hoje mantém a última coleta boa
        velho = json.loads(anterior.read_text(encoding="utf-8")).get("tribunais", {})
        for sigla, r in velho.items():
            if sigla not in saida["tribunais"] or not saida["tribunais"][sigla]["membros"]:
                saida["tribunais"][sigla] = {**r, "mantidoDaColetaAnterior": True}
    anterior.write_text(json.dumps(saida, ensure_ascii=False, indent=1), encoding="utf-8")


if __name__ == "__main__":
    try:
        main()
    finally:
        (DADOS / "judiciario_relatorio.txt").write_text("\n".join(REL) + "\n", encoding="utf-8")
