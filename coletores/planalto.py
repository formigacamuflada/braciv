"""Cupula do Executivo: Presidente, Vice e Ministros de Estado, pela fonte oficial do Planalto.

Os agentes politicos nao estao no cadastro SIAPE do Portal da Transparencia, entao as
vagas PR, VPR e MEST do SIORG ficariam vazias sem esta fonte.

Fontes (gov.br/planalto):
  /pt-br/conheca-a-presidencia/ministros-e-ministras        lista "cargo" em negrito + nome
  /pt-br/conheca-a-presidencia/biografia-do-presidente
  /pt-br/vice-presidencia/acesso-a-informacao/institucional/biografia-do-vice-presidente-da-republica-1

Grava dados/planalto_cupula.json. Liga cada cargo a um orgao do SIORG pelo nome
(ex.: "Ministro de Estado da Fazenda" -> "Ministerio da Fazenda").
Uso: python coletores/planalto.py
"""
import html
import json
import pathlib
import re
import sys

import requests

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from casamento import norm  # noqa: E402

BASE = "https://www.gov.br/planalto/pt-br"
MINISTROS = BASE + "/conheca-a-presidencia/ministros-e-ministras"
PRESIDENTE = BASE + "/conheca-a-presidencia/biografia-do-presidente"
VICE = BASE + "/vice-presidencia/acesso-a-informacao/institucional/biografia-do-vice-presidente-da-republica-1"
UA = {"User-Agent": "Mozilla/5.0 (BRA.CIV coletor; github.com/formigacamuflada/braciv)"}
DADOS = pathlib.Path(__file__).resolve().parent.parent / "dados"
PR, VPR = 26, 1408      # Presidencia da Republica e Vice-Presidencia no SIORG


def texto(h):
    return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", h))).strip()


def miolo(pagina):
    m = re.search(r'id="parent-fieldname-text"[^>]*>(.*?)</div>\s*</div>', pagina, re.S) or re.search(r'id="content-core"[^>]*>(.*)', pagina, re.S)
    return m.group(1) if m else pagina


def atualizado(pagina):
    m = re.search(r"Atualizado em\s*(\d{2}/\d{2}/\d{4})", texto(pagina))
    return m.group(1) if m else None


def le_ministros(pagina):
    """Pares <p><strong>cargo</strong></p><p>nome</p>, na ordem da pagina."""
    pares, cargo = [], None
    for p in re.findall(r"<p[^>]*>(.*?)</p>", miolo(pagina), re.S):
        t = texto(p)
        if not t:
            continue
        if "<strong" in p or "<b>" in p:
            cargo = t
        elif cargo:
            pares.append((cargo, t))
            cargo = None
    return pares


def nome_do_orgao(cargo):
    """'Ministro de Estado da Fazenda' -> 'Ministerio da Fazenda'; 'Ministro de Estado Chefe do GSI...' -> 'Gabinete...'"""
    c = re.sub(r"^Ministr[oa] de Estado\s+(Chef[ea]\s+)?", "", cargo).strip()
    if c.startswith(("da Secretaria", "do Gabinete", "da Casa Civil")) or re.match(r"(Advocacia|Controladoria)", c):
        return re.sub(r"^(da|do|das|dos)\s+", "", c)
    if re.match(r"^(Gabinete|Casa Civil|Secretaria)", c):
        return c
    return "Ministério " + c


def casa_orgao(nome, unidades):
    alvo = norm(nome)
    exatos = [u for u in unidades if norm(u["nome"]) == alvo and u["tipo"] in ("orgao", "entidade", "unidade-administrativa")]
    if len(exatos) == 1:
        return exatos[0]["codigo"]
    comeca = [u for u in unidades if u["tipo"] == "orgao" and norm(u["nome"]).startswith(alvo)]
    return comeca[0]["codigo"] if len(comeca) == 1 else None


def main():
    U = json.loads((DADOS / "siorg_unidades.json").read_text(encoding="utf-8"))
    pag = requests.get(MINISTROS, headers=UA, timeout=60)
    pag.raise_for_status()
    saida = {"fonte": MINISTROS, "atualizadoNaFonte": atualizado(pag.text), "cargos": []}
    for cargo, nome in le_ministros(pag.text):
        org = nome_do_orgao(cargo)
        saida["cargos"].append({"cargo": cargo, "pessoa": nome, "codigoCargo": "MEST", "orgaoSiorg": casa_orgao(org, U), "orgaoProcurado": org})

    for url, codigo, unidade, padrao in ((PRESIDENTE, "PR", PR, r"BIOGRAFIA\s+(.+?)\s+\d+º Presidente"),
                                         (VICE, "VPR", VPR, r"^\W*([A-ZÀ-Ú][^,.]+?)\s+é\s")):
        r = requests.get(url, headers=UA, timeout=60)
        m = re.search(padrao, texto(miolo(r.text))) if r.ok else None
        saida["cargos"].insert(0 if codigo == "PR" else 1, {
            "cargo": "Presidente da República" if codigo == "PR" else "Vice-Presidente da República",
            "pessoa": m.group(1).strip() if m else None, "codigoCargo": codigo, "orgaoSiorg": unidade, "fonte": url})

    sem = [c["cargo"] for c in saida["cargos"] if not c["orgaoSiorg"] or not c["pessoa"]]
    saida["semCasamento"] = sem
    (DADOS / "planalto_cupula.json").write_text(json.dumps(saida, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"{len(saida['cargos'])} cargos (fonte atualizada em {saida['atualizadoNaFonte']}); sem casamento: {sem}")


if __name__ == "__main__":
    try:
        main()
    except Exception as e:          # o log do Actions nao e legivel daqui: o erro vai para um arquivo
        (DADOS / "planalto_erro.txt").write_text(f"{type(e).__name__}: {e}\n", encoding="utf-8")
        raise
