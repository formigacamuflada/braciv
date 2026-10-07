"""Baixa do SIORG a estrutura de orgaos e os cargos de chefia do governo federal.

Fonte: https://estruturaorganizacional.dados.gov.br (SIORG, Ministerio da Gestao).
Publico, sem login. Dois arquivos grandes trazem tudo de uma vez:
  /doc/estrutura-organizacional       todas as unidades (~97 mil, ~97 MB)
  /doc/cargo-funcao/alocados-estrutura  cargos e funcoes por unidade (~98 mil linhas, ~55 MB)

O SIORG diz QUAIS posicoes existem e onde ficam; QUEM ocupa cada uma vem do DOU
(coletores/dou.py). O codigo do cargo sai no mesmo formato do DOU ("FCE 1.05",
"CCE 1.13") para os dois se encontrarem no grafo.

Grava em dados/:
  siorg_orgaos.json    orgaos, entidades e entes (o "topo" da arvore, ~350)
  siorg_unidades.json  todas as unidades, com o codigo da unidade-pai
  siorg_cargos.json    as posicoes: unidade, codigo do cargo, denominacao, vagas

Uso: python coletores/siorg.py
"""
import json
import pathlib

import requests

BASE = "https://estruturaorganizacional.dados.gov.br"
SAIDA = pathlib.Path(__file__).resolve().parent.parent / "dados"
PODER = {"1": "Executivo", "2": "Legislativo", "3": "Judiciário", "4": "Funções Essenciais à Justiça"}
ESFERA = {"1": "Federal", "2": "Estadual/Distrital", "3": "Municipal"}
TOPO = {"ente", "entidade", "orgao"}


def baixa(caminho):
    print(f"baixando {caminho} ...")
    r = requests.get(BASE + caminho, headers={"Accept": "application/json"}, timeout=900)
    r.raise_for_status()
    d = r.json()
    erro = (d.get("servico") or {}).get("codigoErro")
    if erro:
        raise SystemExit(f"SIORG devolveu erro {erro}: {d['servico'].get('mensagem')}")
    print(f"  {len(r.content)//1_000_000} MB")
    return d


def ultimo(url):
    """O SIORG manda referencias como URL (.../id/unidade-organizacional/26); fica so o final."""
    return str(url).rstrip("/").rsplit("/", 1)[-1] if url not in (None, "") else None


def inteiro(v):
    try:
        return int(v)
    except (TypeError, ValueError):
        return None


def grava(nome, registros):
    """Um registro por linha: o historico do Git mostra so o que mudou de um dia para o outro."""
    SAIDA.mkdir(exist_ok=True)
    linhas = ",\n".join(json.dumps(r, ensure_ascii=False, sort_keys=False) for r in registros)
    (SAIDA / nome).write_text("[\n" + linhas + "\n]\n", encoding="utf-8")
    print(f"  {nome}: {len(registros)} registros")


def codigo_cargo(c):
    """Mesmo formato do DOU: CCE 1.13, FCE 2.11, FG 7, NE."""
    sigla, cat, niv = c.get("siglaCargo"), c.get("categoriaCargo"), c.get("nivelCargo")
    if not sigla:
        return None
    if cat and niv:
        return f"{sigla} {cat}.{str(niv).zfill(2)}"
    if niv:
        niv = str(int(niv)) if str(niv).isdigit() else niv
        return f"{sigla} {niv}"
    return sigla


def main():
    naturezas = {str(n.get("codigoNaturezaJuridica")): n.get("descricaoNaturezaJuridica")
                 for n in baixa("/doc/natureza-juridica").get("naturezaJuridica", [])}

    unidades = []
    for u in baixa("/doc/estrutura-organizacional")["unidades"]:
        unidades.append({
            "codigo": inteiro(ultimo(u.get("codigoUnidade"))),
            "pai": inteiro(ultimo(u.get("codigoUnidadePai"))),
            "orgao": inteiro(ultimo(u.get("codigoOrgaoEntidade"))),
            "tipo": ultimo(u.get("codigoTipoUnidade")),
            "sigla": (u.get("sigla") or "").strip() or None,
            "nome": (u.get("nome") or "").strip(),
            "poder": PODER.get(ultimo(u.get("codigoPoder"))),
            "esfera": ESFERA.get(ultimo(u.get("codigoEsfera"))),
            "natureza": naturezas.get(ultimo(u.get("codigoNaturezaJuridica"))),
            "desde": u.get("dataInicialVersaoConsulta"),
        })
    unidades.sort(key=lambda r: r["codigo"] or 0)
    orgaos = [u for u in unidades if u["tipo"] in TOPO]

    cargos = []
    for c in baixa("/doc/cargo-funcao/alocados-estrutura")["cargosAlocadosEstrutura"]:
        cargos.append({
            "unidade": inteiro(c.get("codigoUnidade")),
            "orgao": inteiro(c.get("codigoOrgao")),
            "codigoCargo": codigo_cargo(c),
            "tipoCargo": c.get("nomeCargo"),
            "denominacao": c.get("denominacaoCargo"),
            "ordem": c.get("nrOrdem"),
            "vagas": c.get("total"),
            "autoridade": c.get("autoridade") == "AUTORIDADE",
            "area": c.get("areaAtuacao"),
        })
    cargos.sort(key=lambda r: (r["orgao"] or 0, r["unidade"] or 0, r["codigoCargo"] or "", r["denominacao"] or "", str(r["ordem"])))

    # sede (UF) e site de cada orgao: so a ficha "completa" traz o endereco
    for o in orgaos:
        try:
            r = requests.get(f"{BASE}/doc/unidade-organizacional/{o['codigo']}/completa", headers={"Accept": "application/json"}, timeout=40)
            u = r.json().get("unidade", {}) if r.ok else {}
        except (requests.RequestException, ValueError):
            u = {}
        end = next((e for e in (u.get("endereco") or []) if e.get("uf")), None)
        o["ufSede"] = end.get("uf") if end else None
        sites = [s_.get("site") for c in (u.get("contato") or []) for s_ in (c.get("site") or []) if s_.get("site")]
        o["site"] = sites[0] if sites else None
    print(f"  sede conhecida: {sum(1 for o in orgaos if o['ufSede'])}/{len(orgaos)} orgaos")
    grava("siorg_orgaos.json", orgaos)
    grava("siorg_unidades.json", unidades)
    grava("siorg_cargos.json", cargos)
    semunidade = sum(1 for c in cargos if c["unidade"] is None)
    print(f"vagas no total: {sum(c['vagas'] or 0 for c in cargos)} | cargos sem unidade: {semunidade}")


if __name__ == "__main__":
    main()
