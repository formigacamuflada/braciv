"""Liga cada ocupante do Portal da Transparencia a uma unidade (e, se der, a uma posicao) do SIORG.

O Portal usa os codigos e nomes do SIAPE (abreviados, em maiusculas); o SIORG usa os
proprios. Nao existe tabela de correspondencia publica que eu tenha achado, entao o
casamento e feito em tres passos:
  1. orgao do Portal -> orgao/entidade do SIORG (219 nomes, por semelhanca + alguns apelidos)
  2. dentro da arvore desse orgao, as unidades do SIORG que tem uma vaga com o MESMO
     codigo de cargo da pessoa (ex.: FCE 1.05)
  3. entre essas, a de nome mais parecido com a unidade do Portal ("COORD DE ..." casa
     com "Coordenacao de ..." por prefixo de palavra)
Antes disso, se o Portal traz o caminho de siglas (MTE/SPT/.../DIVAP), casa pela sigla.
Se o passo 2 nao deixa candidatos, tenta so pelo nome dentro do orgao.

Grava dados/ocupacao.json (uma linha por ocupante) e dados/casamento_relatorio.txt.
Uso: python coletores/casamento.py
"""
import collections
import json
import pathlib
import re
import unicodedata

DADOS = pathlib.Path(__file__).resolve().parent.parent / "dados"
PALAVRAS_VAZIAS = {"DE", "DA", "DO", "DAS", "DOS", "E", "EM", "A", "O", "NO", "NA", "NOS", "NAS", "PARA", "AO", "AOS", "S", "SA"}
IGNORAR_ORGAO = {"FUNDACAO", "FUNCAO"} | {"AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG",
                                           "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO"}
# nomes antigos ou abreviados demais no Portal, conferidos a mao contra o SIORG
APELIDOS = {
    "FUNDACAO NACIONAL DO INDIO": 173,                       # hoje Fundacao Nacional dos Povos Indigenas
    "COMANDO DO EXERCITO": 94,
    "COMANDO DA MARINHA": 185,
    "COMANDO DA AERONAUTICA": 48,
    "MIN GESTAO E INOV EM SERV PUBLICOS": 308803,
    "MIN DESENV ASSIS SOCI FAMIL COMBATE FOME": 308796,
    "MINISTERIO DA CIENCIA TECNOLOGIA INOVACOES E COMUNICACOES": 267175,   # nome antigo do MCTI
    "HOSPITAL NOSSA SENHORA DA CONCEICAO": 2026,             # parte do Grupo Hospitalar Conceicao
    "INSTITUTO FEDERAL DO RIO GRANDE DO SUL": 100918,
    "FUNDACAO UNIVERSIDADE FEDERAL DO AMAZONAS": 465,
    "TELEBRAS TELECOM BRASILEIRAS S A": 75,
    "MIN DOS DIR HUM E DA CIDADANIA": 308816,
}
ABREV = {"COORD": "COORDENACAO", "COOR": "COORDENACAO", "DIV": "DIVISAO", "DEP": "DEPARTAMENTO", "DEPTO": "DEPARTAMENTO",
         "SEC": "SECRETARIA", "SECR": "SECRETARIA", "SUP": "SUPERINTENDENCIA", "SUPERINT": "SUPERINTENDENCIA",
         "GER": "GERENCIA", "GAB": "GABINETE", "ASS": "ASSESSORIA", "ASSES": "ASSESSORIA", "NUC": "NUCLEO",
         "SERV": "SERVICO", "SETOR": "SETOR", "SET": "SETOR", "CGER": "COORDENACAO GERAL", "CG": "COORDENACAO GERAL",
         "DIR": "DIRETORIA", "PRO": "PRO", "REIT": "REITORIA", "ADM": "ADMINISTRACAO", "ADMIN": "ADMINISTRACAO",
         "PLAN": "PLANEJAMENTO", "INF": "INFORMACAO", "TEC": "TECNOLOGIA", "GEST": "GESTAO", "PESS": "PESSOAS",
         "REG": "REGIONAL", "SUPERV": "SUPERVISAO", "PROC": "PROCURADORIA", "CONS": "CONSULTORIA", "CGU": "CGU"}


def norm(t):
    t = unicodedata.normalize("NFKD", t or "").encode("ascii", "ignore").decode().upper()
    return re.sub(r"[^A-Z0-9]+", " ", t).strip()


def palavras(t, ignorar=frozenset()):
    saida = []
    for p in norm(t).split():
        if p in PALAVRAS_VAZIAS or p in ignorar:
            continue
        saida.extend(ABREV.get(p, p).split())
    return saida


def cobre(a, b):
    """Fracao das palavras de a que aparecem em b, aceitando abreviacao por prefixo (3+ letras)."""
    if not a:
        return 0.0
    ok = 0
    for x in a:
        if any(y == x or (len(x) >= 3 and y.startswith(x)) or (len(y) >= 3 and x.startswith(y)) for y in b):
            ok += 1
    return ok / len(a)


def exatas(a, b):
    return len(set(a) & set(b))


def casa_orgaos(nomes, topo):
    mapa, relatorio = {}, []
    for nome in nomes:
        k = norm(nome)
        if k in APELIDOS:
            mapa[nome] = (APELIDOS[k], "apelido")
            continue
        a = palavras(nome, IGNORAR_ORGAO)
        cands = []
        for u in topo:
            b = palavras(re.sub(r"de Educa\w+, Ci\w+ e Tecnologia ?", "", u["nome"]), IGNORAR_ORGAO)
            cands.append((cobre(a, b), cobre(b, a), exatas(a, b), u["codigo"], u["nome"]))
        cands.sort(reverse=True)
        top, seg = cands[0], cands[1]
        if top[0] >= 0.99 and top[1] >= 0.6 and top[:3] != seg[:3]:
            mapa[nome] = (top[3], "nome")
        else:
            relatorio.append(f"  orgao sem casamento: {nome!r} (melhor: {top[4]!r} {top[0]:.2f}/{top[1]:.2f})")
    return mapa, relatorio


def main():
    U = json.loads((DADOS / "siorg_unidades.json").read_text(encoding="utf-8"))
    C = json.loads((DADOS / "siorg_cargos.json").read_text(encoding="utf-8"))
    O = json.loads((DADOS / "transparencia_ocupantes.json").read_text(encoding="utf-8"))
    rel = []

    por_codigo = {u["codigo"]: u for u in U}
    filhos = collections.defaultdict(list)
    for u in U:
        if u["pai"] is not None:
            filhos[u["pai"]].append(u["codigo"])

    def arvore(raiz):
        vistos, pilha = set(), [raiz]
        while pilha:
            c = pilha.pop()
            if c in vistos:
                continue
            vistos.add(c)
            pilha.extend(filhos.get(c, []))
        return vistos

    topo = [u for u in U if u["tipo"] in ("orgao", "entidade", "ente")]
    nomes_orgao = collections.Counter(o["orgaoExercicio"] for o in O)
    mapa_orgao, r = casa_orgaos(nomes_orgao, topo)
    rel += r
    pessoas_org = sum(n for nome, n in nomes_orgao.items() if nome in mapa_orgao)
    rel.insert(0, f"orgaos do Portal casados com o SIORG: {len(mapa_orgao)}/{len(nomes_orgao)} (pessoas: {pessoas_org}/{len(O)})")

    # vagas por (unidade, codigo do cargo)
    vagas = collections.defaultdict(list)
    for c in C:
        if c["unidade"] is not None and c["codigoCargo"]:
            vagas[c["codigoCargo"]].append(c)

    cache_arvore, cache_palavras, cache_indice, memo = {}, {}, {}, {}

    def indice(org):
        """prefixo de 4 letras -> unidades da arvore do orgao (para nao comparar com milhares)"""
        if org not in cache_indice:
            idx = collections.defaultdict(set)
            for u in cache_arvore[org]:
                for p in pal_unidade(u):
                    idx[p[:4]].add(u)
            cache_indice[org] = idx
        return cache_indice[org]

    cache_siglas = {}

    def por_sigla(org, texto):
        """O Portal as vezes traz o caminho de siglas (MTE/SPT/.../DIVAP): a ultima e a unidade."""
        if org not in cache_siglas:
            idx = collections.defaultdict(list)
            for u in cache_arvore[org]:
                sg = por_codigo[u].get("sigla")
                if sg:
                    idx[norm(sg).replace(" ", "")].append(u)
            cache_siglas[org] = idx
        brutas = [norm(x) for x in (texto or "").split("/") if norm(x)]
        if not brutas or any(" " in b and not re.fullmatch(r"[A-Z]+ \d+", b) for b in brutas):
            return None                     # tem nome por extenso: nao e caminho de siglas
        partes = [b.replace(" ", "") for b in brutas]
        cands = cache_siglas[org].get(partes[-1], [])
        if len(cands) > 1 and len(partes) > 1:
            def sobe(u):
                acima, c = set(), por_codigo[u]["pai"]
                for _ in range(8):
                    if c is None or c not in por_codigo:
                        break
                    acima.add(norm(por_codigo[c].get("sigla") or "").replace(" ", ""))
                    c = por_codigo[c]["pai"]
                return acima
            cands = [u for u in cands if partes[-2] in sobe(u)]
        if len(cands) == 1 and len(partes) == 2:
            # "COAC/FADIR" pode ser unidade/unidade-de-cima: se COAC existe abaixo de FADIR, e ela
            baixo = [u for u in cache_siglas[org].get(partes[0], []) if u in arvore(cands[0])]
            if len(baixo) == 1:
                return baixo[0]
        return cands[0] if len(cands) == 1 else None

    def preselecao(org, alvo):
        idx, conta = indice(org), collections.Counter()
        for p in set(x[:4] for x in alvo):
            for u in idx.get(p, ()):
                conta[u] += 1
        minimo = max(1, int(0.6 * len(set(x[:4] for x in alvo))))
        return {u for u, n in conta.items() if n >= minimo}

    def pal_unidade(cod):
        if cod not in cache_palavras:
            u = por_codigo.get(cod)
            cache_palavras[cod] = palavras(u["nome"] if u else "")
        return cache_palavras[cod]

    saida, cont = [], collections.Counter()
    for o in O:
        reg = {"idPortal": o["idPortal"], "orgaoSiorg": None, "unidadeSiorg": None, "metodo": None, "semelhanca": None}
        casado = mapa_orgao.get(o["orgaoExercicio"])
        if not casado:
            cont["sem orgao"] += 1
            saida.append(reg)
            continue
        org = casado[0]
        reg["orgaoSiorg"] = org
        if org not in cache_arvore:
            cache_arvore[org] = arvore(org)
        dentro = cache_arvore[org]
        chave = (org, o["unidadeExercicio"], o["codigoCargo"])
        if chave in memo:
            achado = memo[chave]
            if achado:
                reg.update(achado)
                cont[achado["metodo"]] += 1
            else:
                cont["so orgao"] += 1
            saida.append(reg)
            continue
        alvo = palavras(o["unidadeExercicio"])
        achou = por_sigla(org, o["unidadeExercicio"])
        if achou:
            memo[chave] = dict(unidadeSiorg=achou, metodo="sigla", semelhanca=1.0)
            reg.update(memo[chave])
            cont["sigla"] += 1
            saida.append(reg)
            continue

        # "SV APOIO ADMINISTRATIVO/DIGAT": a unidade fica abaixo da de sigla DIGAT
        if "/" in (o["unidadeExercicio"] or ""):
            nome_parte, _, sg = o["unidadeExercicio"].rpartition("/")
            pai = por_sigla(org, sg)
            if pai:
                dentro = arvore(pai) - {pai}
                alvo = palavras(nome_parte)
        cands = {c["unidade"] for c in vagas.get(o["codigoCargo"], []) if c["unidade"] in dentro}
        metodo = "cargo+nome"
        if not cands:
            cands, metodo = preselecao(org, alvo) & dentro, "so nome"
        melhores = sorted(((cobre(alvo, pal_unidade(u)), cobre(pal_unidade(u), alvo), exatas(alvo, pal_unidade(u)), u) for u in cands), reverse=True)
        if melhores:
            top = melhores[0]
            unico = len(melhores) == 1 or melhores[1][:3] != top[:3]
            minimo = (0.75, 0.5) if metodo == "cargo+nome" else (0.9, 0.7)
            if top[0] >= minimo[0] and top[1] >= minimo[1] and unico:
                memo[chave] = dict(unidadeSiorg=top[3], metodo=metodo, semelhanca=round((top[0] + top[1]) / 2, 2))
                reg.update(memo[chave])
                cont[metodo] += 1
            else:
                memo[chave] = None
                cont["so orgao"] += 1
        else:
            memo[chave] = None
            cont["so orgao"] += 1
        saida.append(reg)

    total = len(O)
    rel.append("\nresultado por pessoa:")
    for k in ("sigla", "cargo+nome", "so nome", "so orgao", "sem orgao"):
        rel.append(f"  {k:22s} {cont[k]:7d}  ({100 * cont[k] / total:.1f}%)")
    unid = cont["sigla"] + cont["cargo+nome"] + cont["so nome"]
    rel.append(f"  ligados a uma unidade do SIORG: {unid} ({100 * unid / total:.1f}%)")

    (DADOS / "ocupacao.json").write_text("[\n" + ",\n".join(json.dumps(r, ensure_ascii=False) for r in saida) + "\n]\n", encoding="utf-8")
    (DADOS / "casamento_relatorio.txt").write_text("\n".join(rel) + "\n", encoding="utf-8")
    print("\n".join(rel))


if __name__ == "__main__":
    main()
