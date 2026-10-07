"""Noticias de fontes publicas oficiais, para a aba "Noticias" de cada orgao e pessoa.

Fontes (RSS):
  Agencia Brasil (EBC)   https://agenciabrasil.ebc.com.br/rss/<editoria>/feed.xml
  Agencia Camara         https://www.camara.leg.br/noticias/rss/ultimas-noticias
  Agencia Senado         candidatos abaixo (o primeiro que responder com RSS)
  gov.br de cada orgao   <site do orgao no SIORG>/pt-br/assuntos/noticias/RSS  (padrao Plone do gov.br)

Guarda titulo, resumo curto, data, link e imagem; mantem os ultimos 60 dias.
Grava dados/noticias.json e dados/noticias_fontes.txt (quais feeds responderam).
Uso: python coletores/noticias.py
"""
import datetime
import email.utils
import html
import json
import pathlib
import re
import xml.etree.ElementTree as ET
from concurrent.futures import ThreadPoolExecutor

import requests

DADOS = pathlib.Path(__file__).resolve().parent.parent / "dados"
UA = {"User-Agent": "Mozilla/5.0 (BRA.CIV coletor; github.com/formigacamuflada/braciv)"}
DIAS = 60
FIXAS = [
    ("Agência Brasil", "https://agenciabrasil.ebc.com.br/rss/ultimasnoticias/feed.xml", None),
    ("Agência Brasil", "https://agenciabrasil.ebc.com.br/rss/politica/feed.xml", None),
    ("Agência Brasil", "https://agenciabrasil.ebc.com.br/rss/economia/feed.xml", None),
    ("Agência Brasil", "https://agenciabrasil.ebc.com.br/rss/justica/feed.xml", None),
    ("Agência Câmara", "https://www.camara.leg.br/noticias/rss/ultimas-noticias", None),
]
SENADO = ["https://www12.senado.leg.br/noticias/rss", "https://www12.senado.leg.br/noticias/feed/todasnoticias/RSS",
          "https://www12.senado.leg.br/noticias/ultimas/RSS"]


def limpa(t):
    return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", t or ""))).strip()


def data_iso(t):
    if not t:
        return None
    try:
        return email.utils.parsedate_to_datetime(t).date().isoformat()
    except (TypeError, ValueError):
        m = re.match(r"(\d{4}-\d{2}-\d{2})", t)
        return m.group(1) if m else None


def le_feed(fonte, url, orgao):
    try:
        r = requests.get(url, headers=UA, timeout=30)
    except requests.RequestException as e:
        return url, f"erro {type(e).__name__}", []
    if r.status_code != 200 or b"<rss" not in r.content[:500] and b"<feed" not in r.content[:500] and b"<rdf" not in r.content[:500]:
        return url, f"HTTP {r.status_code}", []
    try:
        raiz = ET.fromstring(r.content)
    except ET.ParseError as e:
        return url, f"xml ilegivel: {e}", []
    itens = []
    for it in raiz.iter():
        if not it.tag.split("}")[-1] in ("item", "entry"):
            continue
        campo = {c.tag.split("}")[-1]: c for c in it}
        link = (campo.get("link").text or campo.get("link").attrib.get("href")) if campo.get("link") is not None else None
        bruto = "".join((campo[k].text or "") for k in ("description", "summary", "encoded", "content") if k in campo)
        img = None
        for c in it:
            if c.tag.split("}")[-1] in ("enclosure", "content", "thumbnail") and (c.attrib.get("type", "image").startswith("image")) and c.attrib.get("url"):
                img = c.attrib["url"]
                break
        if not img:
            m = re.search(r'<img[^>]+src="([^"]+)"', html.unescape(bruto))
            img = m.group(1) if m else None
        data = data_iso((campo.get("pubDate") or campo.get("date") or campo.get("published") or campo.get("updated") or ET.Element("x")).text)
        titulo = limpa(campo["title"].text) if "title" in campo else ""
        if link and titulo:
            itens.append({"link": link.strip(), "fonte": fonte, "titulo": titulo, "resumo": limpa(bruto)[:320],
                          "data": data, "imagem": img if img and img.startswith("http") else None, "orgaoFonte": orgao})
    return url, f"ok {len(itens)}", itens


def main():
    feeds = list(FIXAS) + [("Agência Senado", u, None) for u in SENADO]
    orgaos = json.loads((DADOS / "siorg_orgaos.json").read_text(encoding="utf-8")) if (DADOS / "siorg_orgaos.json").exists() else []
    for o in orgaos:
        site = (o.get("site") or "").strip().rstrip("/")
        if "gov.br/" in site and o.get("tipo") in ("orgao", "entidade"):
            base = site if site.startswith("http") else "https://" + site
            base = re.sub(r"/pt-br.*$", "", base)
            feeds.append((o.get("sigla") or o["nome"], base + "/pt-br/assuntos/noticias/RSS", o["codigo"]))
    with ThreadPoolExecutor(max_workers=8) as ex:
        resultados = list(ex.map(lambda f: le_feed(*f), feeds))

    arq = DADOS / "noticias.json"
    antigas = json.loads(arq.read_text(encoding="utf-8")) if arq.exists() else []
    por_link = {n["link"]: n for n in antigas}
    relatorio = []
    senado_ok = False
    for (fonte, url, _), (u, estado, itens) in zip(feeds, resultados):
        if fonte == "Agência Senado":
            if senado_ok:
                continue
            senado_ok = estado.startswith("ok")
        relatorio.append(f"{estado:14s} {fonte} {url}")
        for n in itens:
            por_link.setdefault(n["link"], n)
    corte = (datetime.date.today() - datetime.timedelta(days=DIAS)).isoformat()
    todas = sorted((n for n in por_link.values() if (n.get("data") or "9999") >= corte), key=lambda n: n.get("data") or "", reverse=True)
    arq.write_text("[\n" + ",\n".join(json.dumps(n, ensure_ascii=False) for n in todas) + "\n]\n", encoding="utf-8")
    ok = sum(1 for r in relatorio if r.startswith("ok"))
    (DADOS / "noticias_fontes.txt").write_text(f"{ok}/{len(relatorio)} feeds responderam; {len(todas)} noticias guardadas\n" + "\n".join(sorted(relatorio)) + "\n", encoding="utf-8")
    print(f"{ok}/{len(relatorio)} feeds; {len(todas)} noticias")


if __name__ == "__main__":
    main()
