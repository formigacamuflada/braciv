"""Junta tudo num grafo: pessoas, cargos, unidades, orgaos, Poderes, partidos.

Entradas (dados/): siorg_*, transparencia_ocupantes.json, ocupacao.json,
dou_mudancas.json, planalto_cupula.json, camara_deputados.json, senado_senadores.json.

Saidas (dados/grafo/), no formato {"nos": [...], "arestas": [...]}:
  nucleo.json            visao geral: Poderes, orgaos, a cupula de cada um (CCE/FCE 1.15 para
                         cima e cargos de natureza especial), parlamentares e partidos
  orgaos/<codigo>.json   um arquivo por orgao com a arvore inteira e todos os ocupantes
                         (o site so carrega quando alguem abre aquele orgao)
  busca.json             [nome, id do no, codigo do orgao] de todas as pessoas, para a busca
  resumo.txt             contagens e o que ficou de fora

Nos: {"id", "tipo", "rotulo", ...}. Tipos: poder, casa, orgao, unidade, pessoa, partido.
Arestas: {"de", "para", "tipo", ...}. Tipos:
  subordinada  unidade/orgao -> unidade/orgao/poder de cima
  ocupa        pessoa -> unidade (ou orgao, se a unidade exata nao foi achada); leva o cargo
  membro       parlamentar -> casa
  filiado      parlamentar -> partido

Uso: python coletores/grafo.py
"""
import collections
import json
import pathlib
import re
import shutil
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from casamento import casa_orgaos, norm  # noqa: E402

DADOS = pathlib.Path(__file__).resolve().parent.parent / "dados"
SAIDA = DADOS / "grafo"
NIVEL_NUCLEO = 15
TOPO = {"ente", "entidade", "orgao"}
ESPECIAIS = {"PR", "VPR", "MEST", "NE"}


def le(nome):
    return json.loads((DADOS / nome).read_text(encoding="utf-8"))


def nivel(codigo):
    if codigo in ESPECIAIS:
        return 99
    m = re.fullmatch(r"(?:CCE|FCE) \d\.(\d\d)", codigo or "")
    return int(m.group(1)) if m else 0


def grava(caminho, nos, arestas):
    caminho.parent.mkdir(parents=True, exist_ok=True)
    corpo = {"nos": list(nos.values()) if isinstance(nos, dict) else nos, "arestas": arestas}
    caminho.write_text(json.dumps(corpo, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")


def main():
    U, C = le("siorg_unidades.json"), le("siorg_cargos.json")
    O, OC = le("transparencia_ocupantes.json"), le("ocupacao.json")
    DOU = le("dou_mudancas.json") if (DADOS / "dou_mudancas.json").exists() else []
    DEP, SEN = le("camara_deputados.json"), le("senado_senadores.json")
    mes = (DADOS / "transparencia_mes.txt").read_text().strip() if (DADOS / "transparencia_mes.txt").exists() else ""
    fim_retrato = f"{mes[:4]}-{mes[4:]}-31" if mes else "0000"
    resumo = []

    unid = {u["codigo"]: u for u in U}

    def id_u(c):
        return f"u:{c}"

    def no_unidade(u):
        return {"id": id_u(u["codigo"]), "tipo": "orgao" if u["tipo"] in TOPO else "unidade",
                "rotulo": u["sigla"] or u["nome"], "nome": u["nome"], "sigla": u["sigla"],
                "tipoSiorg": u["tipo"], "poder": u["poder"], "natureza": u["natureza"], "orgao": u["orgao"]}

    def orgao_de(c):
        """Orgao/entidade 'dono' de uma unidade (sobe ate achar um do topo)."""
        for _ in range(40):
            u = unid.get(c)
            if u is None:
                return None
            if u["tipo"] in TOPO:
                return u["codigo"]
            c = u["pai"]
        return None

    # vagas por unidade
    vagas = collections.defaultdict(collections.Counter)
    for c in C:
        if c["unidade"] is not None and c["codigoCargo"]:
            vagas[c["unidade"]][c["codigoCargo"]] += c["vagas"] or 1

    # ---- pessoas do Portal ----
    pessoas = {}
    for o, r in zip(O, OC):
        pid = f"p:{o['idPortal']}"
        alvo = r["unidadeSiorg"] or r["orgaoSiorg"]
        pessoas.setdefault(pid, {"no": {"id": pid, "tipo": "pessoa", "rotulo": o["pessoa"], "fonte": f"Portal da Transparência {mes}"},
                                 "cargos": []})
        pessoas[pid]["cargos"].append({"de": pid, "para": id_u(alvo) if alvo else None, "tipo": "ocupa",
                                       "codigoCargo": o["codigoCargo"], "funcao": o["atividade"] or o["funcao"],
                                       "unidadePortal": o["unidadeExercicio"], "exata": bool(r["unidadeSiorg"]),
                                       "uf": o["uf"], "fonte": "portal"})

    # ---- DOU: liga os atos as pessoas pelo nome; quem entrou depois do retrato vira pessoa nova ----
    segs = sorted({s.strip() for m in DOU for s in (m.get("orgao") or "").split("/") if s.strip()})
    mapa_seg, _ = casa_orgaos(segs, [u for u in U if u["tipo"] in TOPO])
    por_nome = collections.defaultdict(list)
    for pid, p in pessoas.items():
        por_nome[norm(p["no"]["rotulo"])].append(pid)
    novos = encerrados = ligados = 0
    for m in sorted(DOU, key=lambda m: m.get("data") or ""):
        if (m.get("data") or "") <= fim_retrato:
            continue
        org = None
        for s in reversed((m.get("orgao") or "").split("/")):
            if s.strip() in mapa_seg:
                org = mapa_seg[s.strip()][0]
                break
        ato = {"data": m["data"], "verbo": m["verbo"], "cargo": m.get("cargo"), "codigoCargo": m.get("codigoCargo"),
               "ato": m.get("identifica"), "url": m.get("url")}
        ids = por_nome.get(norm(m["pessoa"]), [])
        if len(ids) == 1:
            p = pessoas[ids[0]]
            p["no"].setdefault("dou", []).append(ato)
            ligados += 1
            if m["tipo"] == "saida":
                for a in p["cargos"]:
                    if a["fonte"] == "portal" and (not m.get("codigoCargo") or a["codigoCargo"] == m["codigoCargo"]):
                        a["ate"] = m["data"]
                        encerrados += 1
                continue
        elif ids:
            continue                      # nome repetido: nao arrisca
        if m["tipo"] != "entrada" or org is None:
            continue
        pid = ids[0] if ids else f"d:{norm(m['pessoa']).replace(' ', '-').lower()}"
        if pid not in pessoas:
            pessoas[pid] = {"no": {"id": pid, "tipo": "pessoa", "rotulo": m["pessoa"], "fonte": "DOU", "dou": [ato]}, "cargos": []}
            por_nome[norm(m["pessoa"])].append(pid)
            novos += 1
        pessoas[pid]["cargos"].append({"de": pid, "para": id_u(org), "tipo": "ocupa", "codigoCargo": m.get("codigoCargo"),
                                       "funcao": m.get("cargo"), "exata": False, "desde": m["data"], "fonte": "dou"})
    resumo.append(f"DOU depois de {fim_retrato}: {ligados} atos ligados a pessoas do retrato, {encerrados} cargos encerrados, {novos} pessoas novas")

    # ---- Planalto: Presidente, Vice e Ministros (nao estao no SIAPE) ----
    cupula = le("planalto_cupula.json") if (DADOS / "planalto_cupula.json").exists() else {"cargos": []}
    n_cupula = 0
    for c in cupula["cargos"]:
        if not c.get("pessoa") or not c.get("orgaoSiorg"):
            continue
        ids = por_nome.get(norm(c["pessoa"]), [])
        pid = ids[0] if len(ids) == 1 else f"pl:{norm(c['pessoa']).replace(' ', '-').lower()}"
        if pid not in pessoas:
            pessoas[pid] = {"no": {"id": pid, "tipo": "pessoa", "rotulo": c["pessoa"],
                                   "fonte": f"Planalto (página atualizada em {cupula.get('atualizadoNaFonte') or '?'})"}, "cargos": []}
            por_nome[norm(c["pessoa"])].append(pid)
        pessoas[pid]["no"]["papel"] = c["cargo"]
        pessoas[pid]["cargos"].append({"de": pid, "para": id_u(c["orgaoSiorg"]), "tipo": "ocupa", "codigoCargo": c["codigoCargo"],
                                       "funcao": c["cargo"], "exata": True, "fonte": "planalto", "url": c.get("fonte") or cupula.get("fonte")})
        n_cupula += 1
    resumo.append(f"Planalto: {n_cupula} cargos da cupula ligados (fonte atualizada em {cupula.get('atualizadoNaFonte')})")

    # ---- arquivos por orgao ----
    if SAIDA.exists():
        shutil.rmtree(SAIDA)
    por_orgao_u = collections.defaultdict(list)
    for u in U:
        dono = orgao_de(u["codigo"])
        if dono is not None:
            por_orgao_u[dono].append(u)
    por_orgao_p = collections.defaultdict(list)
    for pid, p in pessoas.items():
        for a in p["cargos"]:
            if a["para"]:
                por_orgao_p[orgao_de(int(a["para"][2:]))].append((p, a))
    busca = []
    for dono, lista in por_orgao_u.items():
        nos, arestas = {}, []
        for u in lista:
            n = no_unidade(u)
            if vagas.get(u["codigo"]):
                n["vagas"] = dict(vagas[u["codigo"]])
            nos[n["id"]] = n
            if u["pai"] is not None and u["codigo"] != dono:
                arestas.append({"de": n["id"], "para": id_u(u["pai"]), "tipo": "subordinada"})
        for p, a in por_orgao_p.get(dono, []):
            nos.setdefault(p["no"]["id"], p["no"])
            arestas.append(a)
            busca.append([p["no"]["rotulo"], p["no"]["id"], dono])
        grava(SAIDA / "orgaos" / f"{dono}.json", nos, arestas)
    busca.sort()
    (SAIDA / "busca.json").write_text("[\n" + ",\n".join(json.dumps(b, ensure_ascii=False) for b in busca) + "\n]\n", encoding="utf-8")

    # ---- nucleo ----
    nos, arestas = {}, []
    for poder in ("Executivo", "Legislativo", "Judiciário", "Funções Essenciais à Justiça"):
        nos[f"poder:{poder}"] = {"id": f"poder:{poder}", "tipo": "poder", "rotulo": poder}

    def inclui_unidade(c):
        """Inclui a unidade e toda a cadeia ate o orgao (o grafo fica ligado)."""
        while c is not None and id_u(c) not in nos:
            u = unid.get(c)
            if u is None:
                return
            n = no_unidade(u)
            if vagas.get(c):
                n["vagas"] = {k: v for k, v in vagas[c].items() if nivel(k) >= NIVEL_NUCLEO}
            nos[n["id"]] = n
            if u["tipo"] in TOPO:
                pai = u["pai"] if unid.get(u["pai"], {}).get("tipo") in TOPO else None
                arestas.append({"de": n["id"], "para": id_u(pai) if pai else f"poder:{u['poder'] or 'Executivo'}", "tipo": "subordinada"})
                if pai:
                    c = pai
                    continue
                return
            arestas.append({"de": n["id"], "para": id_u(u["pai"]), "tipo": "subordinada"})
            c = u["pai"]

    for u in U:
        if u["tipo"] in TOPO:
            inclui_unidade(u["codigo"])
    for c, cont in vagas.items():
        if any(nivel(k) >= NIVEL_NUCLEO for k in cont):
            inclui_unidade(c)
    for pid, p in pessoas.items():
        altos = [a for a in p["cargos"] if a["para"] and nivel(a["codigoCargo"]) >= NIVEL_NUCLEO and not a.get("ate")]
        for a in altos:
            inclui_unidade(int(a["para"][2:]))
            nos.setdefault(pid, p["no"])
            arestas.append(a)

    # Legislativo
    for casa, nome in (("casa:camara", "Câmara dos Deputados"), ("casa:senado", "Senado Federal")):
        nos[casa] = {"id": casa, "tipo": "casa", "rotulo": nome}
        arestas.append({"de": casa, "para": "poder:Legislativo", "tipo": "subordinada"})

    def partido(sigla):
        pid = f"partido:{sigla}"
        nos.setdefault(pid, {"id": pid, "tipo": "partido", "rotulo": sigla})
        return pid

    for d in DEP:
        i = f"dep:{d['id']}"
        nos[i] = {"id": i, "tipo": "pessoa", "rotulo": d["nome"], "papel": "Deputado(a) federal", "uf": d["siglaUf"],
                  "partido": d["siglaPartido"], "foto": d.get("urlFoto"), "fonte": "Câmara dos Deputados"}
        arestas.append({"de": i, "para": "casa:camara", "tipo": "membro"})
        if d.get("siglaPartido"):
            arestas.append({"de": i, "para": partido(d["siglaPartido"]), "tipo": "filiado"})
    for s in SEN:
        ip = s["IdentificacaoParlamentar"]
        i = f"sen:{ip['CodigoParlamentar']}"
        nos[i] = {"id": i, "tipo": "pessoa", "rotulo": ip["NomeParlamentar"], "papel": "Senador(a)", "uf": ip.get("UfParlamentar"),
                  "partido": ip.get("SiglaPartidoParlamentar"), "foto": ip.get("UrlFotoParlamentar"),
                  "mesa": ip.get("MembroMesa") == "Sim", "lideranca": ip.get("MembroLideranca") == "Sim", "fonte": "Senado Federal"}
        arestas.append({"de": i, "para": "casa:senado", "tipo": "membro"})
        if ip.get("SiglaPartidoParlamentar"):
            arestas.append({"de": i, "para": partido(ip["SiglaPartidoParlamentar"]), "tipo": "filiado"})

    grava(SAIDA / "nucleo.json", nos, arestas)

    # conferencias
    ids = set(nos)
    soltas = [a for a in arestas if a["de"] not in ids or a["para"] not in ids]
    tipos = collections.Counter(n["tipo"] for n in nos.values())
    especiais = collections.Counter()
    for n in nos.values():
        for k, v in (n.get("vagas") or {}).items():
            if k in ESPECIAIS:
                especiais[k] += v
    com_dono = collections.Counter(a["codigoCargo"] for a in arestas if a["tipo"] == "ocupa" and a["codigoCargo"] in ESPECIAIS)
    resumo.insert(0, f"nucleo: {len(nos)} nos {dict(tipos)}, {len(arestas)} arestas, {len(soltas)} arestas com ponta faltando")
    resumo.append(f"arquivos por orgao: {len(por_orgao_u)} | pessoas na busca: {len(busca)}")
    resumo.append(f"vagas de Presidente/Vice/Ministro/Natureza Especial: {dict(especiais)} | com ocupante conhecido: {dict(com_dono)}")
    (SAIDA / "resumo.txt").write_text("\n".join(resumo) + "\n", encoding="utf-8")
    datas_dou = sorted(m["data"] for m in DOU if m.get("data"))
    meta = {"geradoEm": __import__("datetime").date.today().strftime("%d/%m/%Y"),
            "retratoPortal": f"{mes[4:]}/{mes[:4]}" if mes else None,
            "planalto": cupula.get("atualizadoNaFonte"),
            "douAte": "/".join(reversed(datas_dou[-1].split("-"))) if datas_dou else None}
    (SAIDA / "meta.json").write_text(json.dumps(meta, ensure_ascii=False), encoding="utf-8")
    print("\n".join(resumo))


if __name__ == "__main__":
    main()
