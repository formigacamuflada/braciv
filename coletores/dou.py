"""Baixa o Diario Oficial da Uniao no INLABS e extrai atos de pessoal.

Fonte: https://inlabs.in.gov.br - oficial da Imprensa Nacional, XML, gratuito
desde 01/01/2020. Exige conta (cadastro gratuito) e login por cookie.

Secoes: DO1 e DO1E trazem decretos presidenciais sob "Atos do Poder Executivo";
DO2 e DO2E trazem os atos de pessoal (Portaria IN/CC/PR 1/2024, art. 30).

Uso:
    python coletores/dou.py                 # ontem
    python coletores/dou.py 2026-09-16      # data especifica
    python coletores/dou.py --diagnostico   # mostra a estrutura do XML sem extrair
    python coletores/dou.py 2023-01-01:2023-12-31 --secoes=DO1,DO1E --relatorio=dados/x.txt   # retroativo

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

# Verbo no inicio do paragrafo (o DOU escreve "Nomear", "NOMEAR" ou "CONCEDER APOSENTADORIA")
ENTRADA = ["nomear", "designar", "promover", "reintegrar"]
SAIDA_CARGO = ["exonerar", "dispensar", "destituir", "demitir", "aposentar", "conceder aposentadoria"]
OUTROS = ["tornar sem efeito", "remover", "ceder", "redistribuir"]
VERBO = re.compile(r"^(" + "|".join(ENTRADA + SAIDA_CARGO + OUTROS) + r")\b", re.I)

MAI, MIN = "A-ZÀÁÂÃÉÊÍÓÔÕÚÜÇ", "a-zàáâãéêíóôõúüç"
# nome em CAIXA ALTA (padrao do DOU), com particulas DA/DE/DO/DOS/DAS/E
NOME = re.compile(rf"\b([{MAI}][{MAI}'\-]+(?:\s+(?:D[AEO]S?|E|[{MAI}][{MAI}'\-]+))*\s+[{MAI}][{MAI}'\-]+)\b")
# plano B: nome em Caixa De Titulo seguido de virgula (alguns orgaos publicam assim)
NOME_TITULO = re.compile(rf"\b([{MAI}][{MIN}]+(?:\s+(?:d[aeo]s?|e|[{MAI}][{MIN}]+))*\s+[{MAI}][{MIN}]+)\s*,")
# onde comeca o cargo: "para exercer a funcao..." tem prioridade sobre "ocupante do cargo..."
CARGO_EXERCER = re.compile(r"\bexercer\s+(?:[oa]\s+)?(?:cargo|fun[çc][ãa]o|encargo)\b", re.I)
CARGO_GERAL = re.compile(r"\b(?:d[oa]s?|para\s+[oa]|n[oa]|ao|à)\s+(?:cargo|fun[çc][ãa]o|encargo)\b", re.I)
FIM_CARGO = re.compile(r";|\.\s+(?=[A-ZÀ-Ú])|\.$")
CODIGO = re.compile(r"\b(CCE|FCE|CCT|CGE|CCA|CA|DAS|FCPE|CJ|FC|FG|CD)\s*-?\s*([IVX]+|\d+(?:\.\d+)?)\b")
SIGLAS = {"SIAPE", "DOU", "CPF", "FCE", "CCE", "DAS"}


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


def filho(art, tag):
    """Acha o filho pela tag sem depender de maiuscula. Nao usar `find(...) or find(...)`:
    no ElementTree um elemento sem filhos e falso, e o <Texto> so tem CDATA."""
    for el in art.iter():
        if el.tag.lower() == tag.lower():
            return el
    return None


def texto_limpo(bruto):
    bruto = re.sub(r"<[^>]+>", " ", bruto or "")
    return re.sub(r"\s+", " ", bruto).strip()


def paragrafos(art):
    """O <Texto> traz HTML dentro de CDATA; cada ato fica num <p>."""
    el = filho(art, "Texto")
    html = el.text if el is not None else ""
    return [texto_limpo(p) for p in re.split(r"</p>", html or "", flags=re.I) if texto_limpo(p)]


def data_iso(br):
    m = re.fullmatch(r"(\d{2})/(\d{2})/(\d{4})", br or "")
    return f"{m.group(3)}-{m.group(2)}-{m.group(1)}" if m else br


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
    """Mostra a estrutura real do XML e amostras do que a extracao pega."""
    vistos = 0
    for art in artigos(zf):
        if vistos < limite:
            print("  atributos:", {k: v[:60] for k, v in art.attrib.items()})
            print("  identifica:", texto_limpo((filho(art, "Identifica").text if filho(art, "Identifica") is not None else ""))[:120])
            for m in extrai(art, "diag")[:2]:
                print("  ->", m["verbo"], "|", m["pessoa"], "|", (m["cargo"] or "")[:100], "|", m["codigoCargo"])
            print("  ---")
        vistos += 1
    print(f"  total de materias: {vistos}")


def codigo_cargo(cod):
    """Mesmo formato do SIORG: nivel com ponto fica como veio (FCE 1.05); nivel simples sem zero (FG 07 -> FG 7)."""
    if not cod:
        return None
    sigla, nivel = cod.group(1), cod.group(2)
    if nivel.isdigit():
        nivel = str(int(nivel))
    return f"{sigla} {nivel}"


def extrai(art, secao):
    ps = paragrafos(art)
    ident = filho(art, "Identifica")
    achados = []
    for i, p in enumerate(ps):
        v = VERBO.match(p)
        if not v:
            continue
        corpo = p[v.end():]
        m = NOME.search(corpo) or NOME_TITULO.search(corpo)
        # verbo sozinho num paragrafo ("EXONERAR") e o resto no seguinte
        if not m and i + 1 < len(ps) and not VERBO.match(ps[i + 1]):
            corpo += " " + ps[i + 1]
            m = NOME.search(corpo) or NOME_TITULO.search(corpo)
        if not m or m.group(1).split()[0] in SIGLAS:
            continue
        resto = corpo[m.end():]
        c = CARGO_EXERCER.search(resto) or CARGO_GERAL.search(resto)
        cargo = FIM_CARGO.split(resto[c.start():])[0][:250].strip(" ,") if c else None
        cod = CODIGO.search(p)
        verbo = v.group(1).lower()
        achados.append({
            "tipo": "entrada" if verbo in ENTRADA else "saida" if verbo in SAIDA_CARGO else "outro",
            "verbo": verbo,
            "pessoa": re.sub(r"\s+", " ", m.group(1)).title(),
            "cargo": cargo,
            "codigoCargo": codigo_cargo(cod),
            "orgao": art.attrib.get("artCategory"),
            "secao": secao,
            "tipoAto": art.attrib.get("artType"),
            "identifica": texto_limpo(ident.text if ident is not None else ""),
            "data": data_iso(art.attrib.get("pubDate")),
            "idAto": art.attrib.get("id"),
            "url": art.attrib.get("pdfPage"),
            "trecho": p[:400],
        })
    return achados


def datas_pedidas(args):
    """AAAA-MM-DD (um dia) ou AAAA-MM-DD:AAAA-MM-DD (intervalo). Sem nada: ontem."""
    saida = []
    for a in args:
        m = re.fullmatch(r"(\d{4}-\d{2}-\d{2})(?::(\d{4}-\d{2}-\d{2}))?", a)
        if not m:
            continue
        ini = datetime.date.fromisoformat(m.group(1))
        fim = datetime.date.fromisoformat(m.group(2)) if m.group(2) else ini
        while ini <= fim:
            saida.append(ini.isoformat())
            ini += datetime.timedelta(days=1)
    return saida or [(datetime.date.today() - datetime.timedelta(days=1)).isoformat()]


def main():
    args = sys.argv[1:]
    modo_diag = "--diagnostico" in args
    secoes = SECOES
    for a in args:
        if a.startswith("--secoes="):
            secoes = [x.strip().upper() for x in a.split("=", 1)[1].split(",") if x.strip()]
    datas = datas_pedidas(args)
    relatorio_path = next((a.split("=", 1)[1] for a in args if a.startswith("--relatorio=")), None)
    relatorio = []

    email, senha = os.environ.get("INLABS_EMAIL"), os.environ.get("INLABS_SENHA")
    if not email or not senha:
        raise SystemExit("faltam INLABS_EMAIL e INLABS_SENHA no ambiente")

    sessao = requests.Session()
    cookie = entrar(sessao, email, senha)
    mudancas = []
    for i, data in enumerate(datas):
        if i and i % 40 == 0:                      # a sessao do INLABS expira: renova de tempos em tempos
            sessao = requests.Session()
            cookie = entrar(sessao, email, senha)
        print(f"DOU de {data}")
        achados_dia, secoes_ok = 0, []
        for secao in secoes:
            try:
                zf = baixa(sessao, cookie, data, secao)
            except requests.RequestException as e:
                print(f"  {secao}: erro de rede {e}")
                zf = None
            if zf is None:
                continue
            secoes_ok.append(secao)
            if modo_diag:
                print(f"--- estrutura de {secao} ---")
                diagnostico(zf)
                continue
            for art in artigos(zf):
                achados = extrai(art, secao)
                achados_dia += len(achados)
                mudancas.extend(achados)
        relatorio.append(f"{data} {','.join(secoes_ok) or '-'} {achados_dia}")

    if relatorio_path:
        pathlib.Path(relatorio_path).write_text("\n".join(relatorio) + "\n", encoding="utf-8")
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
