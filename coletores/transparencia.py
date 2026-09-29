"""Retrato mensal de quem ocupa cargo ou funcao de confianca no Executivo federal.

Fonte: Portal da Transparencia (CGU), download "Servidores" -> AAAAMM_Servidores_SIAPE.
Publico, sem chave. O zip traz AAAAMM_Cadastro.csv (dicionario de dados:
portaldatransparencia.gov.br/dicionario-de-dados/servidores-cadastro), com
SIGLA_FUNCAO, NIVEL_FUNCAO, FUNCAO, unidade de exercicio e data de nomeacao.

Complementa o DOU: o Portal da a foto do mes; o DOU, as mudancas do dia a dia.
So grava quem tem funcao/cargo de confianca. CPF e matricula ficam de fora.

Grava em dados/:
  transparencia_ocupantes.json       um registro por pessoa com funcao, uma linha cada
  transparencia_mes.txt              mes que ja foi coletado (evita baixar de novo)
  transparencia_reconhecimento.txt   relatorio de conferencia (formato e cruzamento com o SIORG)

Uso:
  python coletores/transparencia.py            # ultimo mes disponivel, se ainda nao coletado
  python coletores/transparencia.py 202608     # mes especifico
  python coletores/transparencia.py --forcar   # baixa de novo mesmo se ja coletado
"""
import collections
import csv
import datetime
import io
import json
import pathlib
import re
import sys
import tempfile
import unicodedata
import zipfile

import requests

URL = "https://portaldatransparencia.gov.br/download-de-dados/servidores/{mes}_Servidores_SIAPE"
UA = {"User-Agent": "Mozilla/5.0 (BRA.CIV coletor; github.com/formigacamuflada/braciv)"}
SAIDA = pathlib.Path(__file__).resolve().parent.parent / "dados"
RELATORIO = []


def diz(*partes):
    linha = " ".join(str(p) for p in partes)
    print(linha)
    RELATORIO.append(linha)


def meses_candidatos():
    hoje = datetime.date.today().replace(day=1)
    for atras in range(0, 5):
        ano, mes = hoje.year, hoje.month - atras
        while mes <= 0:
            ano, mes = ano - 1, mes + 12
        yield f"{ano}{mes:02d}"


def baixa(mes):
    """Salva o zip num arquivo temporario (tem centenas de MB). Devolve o caminho ou None."""
    r = requests.get(URL.format(mes=mes), headers=UA, stream=True, timeout=120, allow_redirects=True)
    if r.status_code != 200:
        diz(f"  {mes}: HTTP {r.status_code} ({r.url})")
        return None
    tmp = tempfile.NamedTemporaryFile(suffix=".zip", delete=False)
    total = 0
    for bloco in r.iter_content(1 << 20):
        tmp.write(bloco)
        total += len(bloco)
    tmp.close()
    with open(tmp.name, "rb") as f:
        if f.read(2) != b"PK":
            diz(f"  {mes}: resposta nao e zip ({total} bytes, {r.headers.get('content-type')})")
            return None
    diz(f"  {mes}: {total // 1_000_000} MB de {r.url}")
    return tmp.name


def normaliza(txt):
    txt = unicodedata.normalize("NFKD", txt or "").encode("ascii", "ignore").decode().upper()
    return re.sub(r"[^A-Z0-9]+", " ", txt).strip()


def codigo_cargo(sigla, nivel):
    """Mesmo formato do SIORG e do DOU: FCE 1.05, CCE 1.13, FG 7, NE.
    O formato do NIVEL_FUNCAO no Portal nao e documentado: o relatorio mostra os formatos vistos."""
    sigla = (sigla or "").strip().upper()
    nivel = (nivel or "").strip()
    if not sigla or sigla in ("-1", "SEM INFORMACAO", "SEM INFORMAÇÃO"):
        return None
    if not nivel or nivel in ("-1", "0"):
        return sigla
    m = re.fullmatch(r"(\d)\.(\d{1,2})", nivel)
    if m:
        return f"{sigla} {m.group(1)}.{int(m.group(2)):02d}"
    m = re.fullmatch(r"0?(\d)(\d{2})", nivel)          # 0113 ou 113 -> 1.13
    if m and sigla in ("CCE", "FCE", "CCT", "CGE", "CCA"):
        return f"{sigla} {m.group(1)}.{m.group(2)}"
    if nivel.isdigit():
        return f"{sigla} {int(nivel)}"
    return f"{sigla} {nivel}"


def le_cadastro(caminho):
    zf = zipfile.ZipFile(caminho)
    diz("  arquivos no zip:", zf.namelist())
    nome = next(n for n in zf.namelist() if n.lower().endswith("_cadastro.csv"))
    bruto = zf.open(nome)
    amostra = bruto.read(4096)
    bruto.close()
    codif = "utf-8" if amostra.startswith(b"\xef\xbb\xbf") else "latin-1"
    try:
        amostra.decode("utf-8")
        codif = "utf-8-sig"
    except UnicodeDecodeError:
        codif = "latin-1"
    texto = io.TextIOWrapper(zf.open(nome), encoding=codif, newline="")
    leitor = csv.DictReader(texto, delimiter=";")
    diz(f"  {nome} ({codif}), colunas:", leitor.fieldnames)
    return leitor


def main():
    args = sys.argv[1:]
    forcar = "--forcar" in args
    pedido = [a for a in args if re.fullmatch(r"\d{6}", a)]
    marca = SAIDA / "transparencia_mes.txt"
    ja = marca.read_text().strip() if marca.exists() else ""

    diz("Portal da Transparencia - servidores SIAPE", datetime.datetime.utcnow().isoformat(timespec="seconds"), "UTC")
    zipado, mes = None, None
    for candidato in (pedido or meses_candidatos()):
        if candidato == ja and not forcar:
            diz(f"  {candidato}: ja coletado, nada a fazer")
            return
        zipado = baixa(candidato)
        if zipado:
            mes = candidato
            break
    if not zipado:
        diz("nenhum mes disponivel para baixar")
        grava_relatorio()
        return

    siorg_cod, siorg_nome = set(), {}
    arq = SAIDA / "siorg_cargos.json"
    if arq.exists():
        siorg_cod = {c["codigoCargo"] for c in json.loads(arq.read_text(encoding="utf-8"))}
    arq = SAIDA / "siorg_unidades.json"
    if arq.exists():
        for u in json.loads(arq.read_text(encoding="utf-8")):
            siorg_nome.setdefault((normaliza(u["nome"])), []).append(u["codigo"])

    linhas = com_funcao = 0
    formatos = collections.Counter()
    siglas = collections.Counter()
    ocupantes = []
    for l in le_cadastro(zipado):
        linhas += 1
        sigla = (l.get("SIGLA_FUNCAO") or "").strip()
        if not sigla or sigla == "-1":
            continue
        com_funcao += 1
        nivel = (l.get("NIVEL_FUNCAO") or "").strip()
        siglas[sigla] += 1
        formatos[(sigla, re.sub(r"\d", "9", nivel))] += 1
        uorg = (l.get("UORG_EXERCICIO") or "").strip()
        casados = siorg_nome.get(normaliza(uorg), [])
        ocupantes.append({
            "idPortal": l.get("Id_SERVIDOR_PORTAL") or l.get("ID_SERVIDOR_PORTAL"),
            "pessoa": (l.get("NOME") or "").strip().title(),
            "codigoCargo": codigo_cargo(sigla, nivel),
            "funcao": (l.get("FUNCAO") or "").strip() or None,
            "atividade": (l.get("ATIVIDADE") or "").strip() or None,
            "uorgExercicio": (l.get("COD_UORG_EXERCICIO") or "").strip() or None,
            "unidadeExercicio": uorg or None,
            "orgaoExercicio": (l.get("ORGAO_EXERCICIO") or "").strip() or None,
            "unidadeSiorg": casados[0] if len(casados) == 1 else None,
            "dataNomeacao": (l.get("DATA_NOMEACAO_CARGOFUNCAO") or "").strip() or None,
            "situacao": (l.get("SITUACAO_VINCULO") or "").strip() or None,
            "uf": (l.get("UF_EXERCICIO") or "").strip() or None,
        })
        if len(ocupantes) <= 3:
            diz("  exemplo:", {k: l.get(k) for k in ("SIGLA_FUNCAO", "NIVEL_FUNCAO", "FUNCAO", "ATIVIDADE", "UORG_EXERCICIO", "ORGAO_EXERCICIO", "DATA_NOMEACAO_CARGOFUNCAO")})

    diz(f"\nmes {mes}: {linhas} vinculos no cadastro, {com_funcao} com funcao/cargo de confianca")
    diz("siglas mais comuns:", siglas.most_common(25))
    diz("formatos de NIVEL_FUNCAO (9 = digito):", formatos.most_common(40))
    if siorg_cod:
        ok = sum(1 for o in ocupantes if o["codigoCargo"] in siorg_cod)
        diz(f"codigo do cargo existe no SIORG: {ok}/{len(ocupantes)}")
        diz("codigos que nao casam (amostra):", collections.Counter(o["codigoCargo"] for o in ocupantes if o["codigoCargo"] not in siorg_cod).most_common(25))
    if siorg_nome:
        ok = sum(1 for o in ocupantes if o["unidadeSiorg"])
        amb = sum(1 for o in ocupantes if not o["unidadeSiorg"] and len(siorg_nome.get(normaliza(o["unidadeExercicio"]), [])) > 1)
        diz(f"unidade casada com o SIORG pelo nome: {ok}/{len(ocupantes)} (ambiguas, nome repetido: {amb})")

    ocupantes.sort(key=lambda o: (o["orgaoExercicio"] or "", o["unidadeExercicio"] or "", o["pessoa"]))
    SAIDA.mkdir(exist_ok=True)
    (SAIDA / "transparencia_ocupantes.json").write_text(
        "[\n" + ",\n".join(json.dumps(o, ensure_ascii=False) for o in ocupantes) + "\n]\n", encoding="utf-8")
    marca.write_text(mes + "\n")
    grava_relatorio()


def grava_relatorio():
    SAIDA.mkdir(exist_ok=True)
    (SAIDA / "transparencia_reconhecimento.txt").write_text("\n".join(RELATORIO) + "\n", encoding="utf-8")


if __name__ == "__main__":
    try:
        main()
    except Exception as e:           # o log do Actions nao e legivel daqui: o erro vai para o relatorio
        diz(f"ERRO: {type(e).__name__}: {e}")
        grava_relatorio()
        raise
