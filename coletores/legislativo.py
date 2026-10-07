"""Legislativo além dos parlamentares: Mesa do Congresso, lideranças, comissões permanentes e servidores.

Fontes (todas oficiais e abertas, sem chave):
  Senado  https://legis.senado.leg.br/dadosabertos/composicao/mesaCN.json        Mesa do Congresso Nacional
          https://legis.senado.leg.br/dadosabertos/composicao/lideranca.json     lideranças de SF, CD e CN
          https://legis.senado.leg.br/dadosabertos/comissao/lista/colegiados.json + /comissao/{codigo}.json
          https://adm.senado.gov.br/adm-dadosabertos/api/v1/gestao/diretores-e-coordenadores   estrutura administrativa
          https://adm.senado.gov.br/adm-dadosabertos/api/v1/servidores/servidores/ativos       servidores
  Câmara  https://dadosabertos.camara.leg.br/api/v2/orgaos?codTipoOrgao=2 + /orgaos/{id}/membros   comissões permanentes
          https://dadosabertos.camara.leg.br/arquivos/funcionarios/json/funcionarios.json            funcionários

Grava em dados/: cn_mesa.json, lideranca.json, comissoes_sf.json, comissoes_cd.json,
senado_estrutura.json, senado_servidores.json, camara_funcionarios.json e legislativo_relatorio.txt.
Cada parte é independente: se uma fonte falhar, as outras seguem e o erro vai para o relatório.
Uso: python coletores/legislativo.py
"""
import json
import pathlib
import time

import requests

DADOS = pathlib.Path(__file__).resolve().parent.parent / "dados"
UA = {"User-Agent": "Mozilla/5.0 (BRA.CIV coletor; github.com/formigacamuflada/braciv)", "Accept": "application/json"}
LEG = "https://legis.senado.leg.br/dadosabertos"
ADM = "https://adm.senado.gov.br/adm-dadosabertos/api/v1"
CAM = "https://dadosabertos.camara.leg.br/api/v2"
REL = []


def diz(*a):
    t = " ".join(str(x) for x in a)
    print(t)
    REL.append(t)


def pega(url, tentativas=4, timeout=120):
    for i in range(tentativas):
        try:
            r = requests.get(url, headers=UA, timeout=timeout)
            if r.status_code == 429 or r.status_code >= 500:
                raise requests.HTTPError(f"HTTP {r.status_code}")
            r.raise_for_status()
            return r.json()
        except (requests.RequestException, ValueError) as e:
            if i == tentativas - 1:
                raise
            time.sleep(5 * (i + 1))


def lista(v):
    return v if isinstance(v, list) else [] if v is None else [v]


def grava(nome, dados):
    (DADOS / nome).write_text(json.dumps(dados, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")


def mesa_cn():
    j = pega(f"{LEG}/composicao/mesaCN.json")
    col = lista(j["MesaCongresso"]["Colegiados"]["Colegiado"])[0]
    cargos = lista(col["Cargos"]["Cargo"])
    grava("cn_mesa.json", {"versao": j["MesaCongresso"]["Metadados"].get("Versao"), "cargos": cargos})
    diz(f"Mesa do Congresso: {len(cargos)} cargos")


def liderancas():
    j = pega(f"{LEG}/composicao/lideranca.json")
    grava("lideranca.json", j)
    diz(f"lideranças (SF, CD e CN): {len(j)} registros, {sum(1 for x in j if x.get('siglaTipoLideranca') == 'L')} líderes")


def comissoes_sf():
    cols = lista(pega(f"{LEG}/comissao/lista/colegiados.json")["ListaColegiados"]["Colegiados"]["Colegiado"])
    alvo = [c for c in cols if c.get("SiglaCasa") in ("SF", "CN") and c.get("DescricaoTipoColegiado") == "Comissão Permanente"]
    saida = []
    for c in alvo:
        try:
            d = lista(pega(f"{LEG}/comissao/{c['Codigo']}.json")["ComissoesCongressoNacional"]["Colegiados"]["Colegiado"])[0]
        except Exception as e:      # noqa: BLE001
            diz(f"  comissão {c.get('Sigla')}: {type(e).__name__}")
            continue
        membros = []
        for chave in ("MembrosBlocoSF", "MembrosBlocoCD"):
            for pb in lista((d.get(chave) or {}).get("PartidoBloco")):
                for m in lista((pb.get("MembrosSF") or pb.get("MembrosCD") or {}).get("Membro")):
                    membros.append({k: m.get(k) for k in ("NomeParlamentar", "CodigoParlamentar", "SiglaUf", "Partido", "TipoVaga", "OrigemParlamentar")})
        saida.append({"codigo": c["Codigo"], "sigla": c.get("Sigla"), "nome": c.get("Nome"), "casa": c.get("SiglaCasa"),
                      "cargos": [{k: x.get(k) for k in ("TipoCargo", "NomeParlamentar", "CodigoParlamentar", "Bancada")} for x in lista((d.get("Cargos") or {}).get("Cargo"))],
                      "membros": membros})
        time.sleep(0.3)
    grava("comissoes_sf.json", saida)
    diz(f"comissões permanentes do Senado e do Congresso: {len(saida)}")


def comissoes_cd():
    orgs = pega(f"{CAM}/orgaos?codTipoOrgao=2&itens=100")["dados"]
    saida = []
    for o in orgs:
        try:
            ms = pega(f"{CAM}/orgaos/{o['id']}/membros?itens=200")["dados"]
        except Exception as e:      # noqa: BLE001
            diz(f"  comissão {o.get('sigla')}: {type(e).__name__}")
            continue
        ms = [m for m in ms if not m.get("dataFim")]
        saida.append({"id": o["id"], "sigla": o.get("sigla"), "nome": o.get("nome"),
                      "membros": [{k: m.get(k) for k in ("id", "nome", "siglaPartido", "siglaUf", "titulo", "codTitulo")} for m in ms]})
        time.sleep(0.5)
    grava("comissoes_cd.json", saida)
    diz(f"comissões permanentes da Câmara: {len(saida)}")


def senado_adm():
    est = pega(f"{ADM}/gestao/diretores-e-coordenadores")
    est = est.get("data", est) if isinstance(est, dict) else est
    grava("senado_estrutura.json", [{"setor": x.get("setor"), "titular": x.get("titular"), "substituto": x.get("substituto")} for x in est])
    diz(f"Senado, estrutura administrativa: {len(est)} setores com titular")
    serv = pega(f"{ADM}/servidores/servidores/ativos", timeout=300)
    red = []
    for s in serv:
        if s.get("situacao") not in (None, "ATIVO"):
            continue
        red.append({"nome": s.get("nome"), "vinculo": s.get("vinculo"), "cargo": (s.get("cargo") or {}).get("nome"),
                    "funcao": (s.get("funcao") or {}).get("nome"), "lotacao": (s.get("lotacao") or {}).get("sigla"),
                    "lotacaoNome": ((s.get("lotacao") or {}).get("nome") or "").strip()})
    grava("senado_servidores.json", red)
    diz(f"Senado, servidores ativos: {len(red)} ({sum(1 for r in red if r['funcao'])} com função)")


def camara_funcionarios():
    j = pega("https://dadosabertos.camara.leg.br/arquivos/funcionarios/json/funcionarios.json", timeout=300)
    d = j.get("dados", j)
    red = [{"nome": x.get("nome"), "grupo": x.get("grupo"), "cargo": x.get("cargo"), "funcao": x.get("funcao") or None,
            "lotacao": x.get("lotacao"), "dep": (x.get("uriLotacao") or "").rsplit("/", 1)[-1] if "/deputados/" in (x.get("uriLotacao") or "") else None,
            "desde": x.get("dataNomeacao") or x.get("dataInicioHistorico") or None}
           for x in d if x.get("grupo") != "Parlamentar"]
    grava("camara_funcionarios.json", red)
    diz(f"Câmara, funcionários: {len(red)} ({sum(1 for r in red if r['funcao'])} com função)")


def main():
    for parte in (mesa_cn, liderancas, comissoes_sf, comissoes_cd, senado_adm, camara_funcionarios):
        try:
            parte()
        except Exception as e:      # noqa: BLE001
            diz(f"{parte.__name__}: FALHOU ({type(e).__name__}: {e})")


if __name__ == "__main__":
    try:
        main()
    finally:
        (DADOS / "legislativo_relatorio.txt").write_text("\n".join(REL) + "\n", encoding="utf-8")
