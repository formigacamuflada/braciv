"""Baixa o Diario Oficial da Uniao no INLABS e extrai atos de pessoal.

Fonte: https://inlabs.in.gov.br - oficial da Imprensa Nacional, XML, gratuito
desde 01/01/2020. Exige conta (cadastro gratuito) e login por cookie.

Secoes: DO1 e DO1E trazem decretos presidenciais sob "Atos do Poder Executivo";
DO2 e DO2E trazem os atos de pessoal (Portaria IN/CC/PR 1/2024, art. 30).

Uso:
    python coletores/dou.py                 # ontem
    python coletores/dou.py 2026-09-16      # data especifica
    python coletores/dou.py --diagnostico   # mostra a estrutura do XML sem extrair

Credenciais vem das variaveis de ambiente INLABS_EMAIL e INLABS_SENHA.
"""
import datetime
import io
import json
import os
import pathlib
import re
import sys
import zipfile
import xml.etree.ElementTree as ET

import requests

LOGIN = "https://inlabs.in.gov.br/logar.php"
DOWNLOAD = "https://inlabs.in.gov.br/index.php"
ORIGEM = {"origem": "736372697074"}
SECOES = ["DO1", "DO2", "DO1E", "DO2E"]
SAIDA = pathlib.Path(__file__).resolve().parent.parent / "dados"

ENTRADA = ["NOMEAR", "DESIGNAR", "PROMOVER", "REINTEGRAR"]
SAIDA_CARGO = ["EXONERAR", "DISPENSAR", "DESTITUIR", "DEMITIR", "APOSENTAR", "TORNAR SEM EFEITO"]
VERBOS = ENTRADA + SAIDA_CARGO

CONECTORES = r"(?:para exercer o cargo de|para exercer a fun[çc][ãa]o de|no cargo de|do cargo de|da fun[çc][ãa]o de|para o cargo de)"
CODIGO = re.compile(r"\b(CCE|FCE|DAS|FCPE|CJ)\s*-?\s*(\d+[\.\d]*)", re.I)
# NOME EM CAIXA ALTA seguido do conector e do cargo, ate ponto/virgula/ponto-e-virgula
ATO = re.compile(
    r"\b(" + "|".join(VERBOS) + r")\b"
    r"(?P<meio>[^.;]{0,120}?)"
    r"(?P<nome>[A-ZÁÂÃÀÉÊÍÓÔÕÚÇ][A-ZÁÂÃÀÉÊÍÓÔÕÚÇ\s]{6,80}?)\s*,?\s*"
    + CONECTORES +
    r"\s+(?P<cargo>[^.;]{3,200})",
    re.S,
)


def entrar(sessao, email, senha):
    """Headers conforme o script oficial da Imprensa Nacional
    (github.com/Imprensa-Nacional/inlabs), mais o origem, que a versao em bash envia."""
    cabecalho = {
        "Content-Type": "application/x-www-form-urlencoded",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        **ORIGEM,
    }
    r = sessao.post(LOGIN, data={"email": email, "password": senha}, headers=cabecalho, timeout=60)
    cookie = sessao.cookies.get("inlabs_session_cookie")
    if not cookie:
        raise SystemExit(f"falha de autenticacao no INLABS (HTTP {r.status_code}) - confira INLABS_EMAIL e INLABS_SENHA")
    print("login ok")
    return cookie


def baixa(sessao, cookie, data, secao):
    nome = f"{data}-{secao}.zip"
    cabecalho = {"Cookie": f"inlabs_session_cookie={cookie}", **ORIGEM}
    r = sessao.get(DOWNLOAD, params={"p": data, "dl": nome}, headers=cabecalho, timeout=180)
    if r.status_code == 404:
        print(f"  {secao}: nao publicado")
        return None
    if r.status_code != 200 or not r.content[:2] == b"PK":
        print(f"  {secao}: resposta inesperada (HTTP {r.status_code}, {len(r.content)} bytes)")
        return None
    print(f"  {secao}: {len(r.content)//1024} KB")
    return zipfile.ZipFile(io.BytesIO(r.content))


def texto_limpo(elemento):
    if elemento is None:
        return ""
    bruto = "".join(elemento.itertext())
    bruto = re.sub(r"<[^>]+>", " ", bruto)
    return re.sub(r"\s+", " ", bruto).strip()


def artigos(zf):
    for nome in zf.namelist():
        if not nome.lower().endswith(".xml"):
            continue
        try:
            raiz = ET.fromstring(zf.read(nome))
        except ET.ParseError as e:
            print(f"  xml ilegivel em {nome}: {e}")
            continue
        for art in raiz.iter():
            if art.tag.lower().endswith("article"):
                yield art


def diagnostico(zf, limite=3):
    """Mostra a estrutura real do XML - o schema nao e publicado pela Imprensa Nacional."""
    vistos = 0
    for art in artigos(zf):
        print("  atributos:", dict(art.attrib))
        print("  filhos:", [f.tag for f in art])
        corpo = texto_limpo(art.find(".//Texto") or art.find(".//texto"))
        print("  identifica:", texto_limpo(art.find(".//Identifica") or art.find(".//identifica"))[:120])
        print("  texto:", corpo[:400])
        print("  ---")
        vistos += 1
        if vistos >= limite:
            return


def extrai(art, secao):
    corpo = texto_limpo(art.find(".//Texto") or art.find(".//texto"))
    if not corpo:
        return []
    achados = []
    for m in ATO.finditer(corpo):
        verbo = m.group(1).upper()
        nome = re.sub(r"\s+", " ", m.group("nome")).strip(" ,")
        cargo = re.sub(r"\s+", " ", m.group("cargo")).strip(" ,")
        if len(nome.split()) < 2:      # nome de gente tem ao menos duas palavras
            continue
        cod = CODIGO.search(corpo[m.start():m.start() + 600])
        achados.append({
            "tipo": "entrada" if verbo in ENTRADA else "saida",
            "verbo": verbo,
            "pessoa": nome.title(),
            "cargo": cargo,
            "codigoCargo": f"{cod.group(1).upper()} {cod.group(2)}" if cod else None,
            "orgao": art.attrib.get("artCategory"),
            "secao": secao,
            "tipoAto": art.attrib.get("artType"),
            "identifica": texto_limpo(art.find(".//Identifica") or art.find(".//identifica")),
            "data": art.attrib.get("pubDate"),
            "idAto": art.attrib.get("id"),
            "url": f"https://www.in.gov.br/web/dou/-/{art.attrib.get('name', '')}",
        })
    return achados


def main():
    args = [a for a in sys.argv[1:]]
    modo_diag = "--diagnostico" in args
    datas = [a for a in args if re.fullmatch(r"\d{4}-\d{2}-\d{2}", a)]
    data = datas[0] if datas else (datetime.date.today() - datetime.timedelta(days=1)).isoformat()

    email, senha = os.environ.get("INLABS_EMAIL"), os.environ.get("INLABS_SENHA")
    if not email or not senha:
        raise SystemExit("faltam INLABS_EMAIL e INLABS_SENHA no ambiente")

    print(f"DOU de {data}")
    sessao = requests.Session()
    cookie = entrar(sessao, email, senha)

    mudancas = []
    for secao in SECOES:
        zf = baixa(sessao, cookie, data, secao)
        if zf is None:
            continue
        if modo_diag:
            print(f"--- estrutura de {secao} ---")
            diagnostico(zf)
            continue
        for art in artigos(zf):
            mudancas.extend(extrai(art, secao))

    if modo_diag:
        return

    print(f"atos de pessoal encontrados: {len(mudancas)}")
    SAIDA.mkdir(exist_ok=True)
    arquivo = SAIDA / "dou_mudancas.json"
    historico = json.loads(arquivo.read_text(encoding="utf-8")) if arquivo.exists() else []
    ja_tem = {(m.get("idAto"), m.get("pessoa"), m.get("cargo")) for m in historico}
    novas = [m for m in mudancas if (m.get("idAto"), m.get("pessoa"), m.get("cargo")) not in ja_tem]
    historico.extend(novas)
    historico.sort(key=lambda m: (m.get("data") or "", m.get("pessoa") or ""), reverse=True)
    arquivo.write_text(json.dumps(historico, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"novas: {len(novas)} | total no arquivo: {len(historico)}")


if __name__ == "__main__":
    main()
