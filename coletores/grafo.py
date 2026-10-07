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

Nos: {"id", "tipo", "rotulo", ...}. Tipos: poder, casa, orgao, unidade, cargo, partido.
Pessoas nao sao nos: ficam dentro do no de CARGO, em "ocupantes" (nome, fonte, atos do DOU...).
Arestas: {"de", "para", "tipo", ...}. Tipos:
  subordinada  unidade/orgao -> unidade/orgao/poder de cima
  cargo        cargo -> unidade (ou orgao, se a unidade exata nao foi achada)
  membro       cadeira de parlamentar -> casa
  filiado      cadeira de parlamentar -> partido (do ocupante)

Uso: python coletores/grafo.py
"""
import collections
import hashlib
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


def id_cargo(para, codigo, funcao):
    chave = f"{para}|{codigo or ''}|{norm(funcao or '')}"
    return "c:" + hashlib.md5(chave.encode()).hexdigest()[:12]


def rotulo_cargo(funcao, codigo):
    f = (funcao or "").strip()
    if f and f.isupper():
        f = f.capitalize()
    return f or codigo or "Cargo"


def agrega_cargos(pares, nos, arestas, busca=None, orgao=None):
    """Um no por CARGO (unidade + codigo + funcao); as pessoas ficam dentro dele em "ocupantes"."""
    for p, a in pares:
        cid = id_cargo(a["para"], a.get("codigoCargo"), a.get("funcao"))
        if cid not in nos:
            nos[cid] = {"id": cid, "tipo": "cargo", "rotulo": rotulo_cargo(a.get("funcao"), a.get("codigoCargo")),
                        "codigoCargo": a.get("codigoCargo"), "ocupantes": []}
            arestas.append({"de": cid, "para": a["para"], "tipo": "cargo", "exata": a.get("exata", True)})
        oc = {k: v for k, v in {
            "nome": p["no"]["rotulo"], "pessoa": p["no"]["id"], "fonte": p["no"].get("fonte"), "dou": p["no"].get("dou"),
            "desde": a.get("desde"), "ate": a.get("ate"), "unidadePortal": a.get("unidadePortal"), "uf": a.get("uf"),
            "url": a.get("url"), "exata": a.get("exata", True)}.items() if v not in (None, [], "")}
        nos[cid]["ocupantes"].append(oc)
        if busca is not None:
            busca.append([p["no"]["rotulo"], cid, orgao])


def grava(caminho, nos, arestas):
    caminho.parent.mkdir(parents=True, exist_ok=True)
    corpo = {"nos": list(nos.values()) if isinstance(nos, dict) else nos, "arestas": arestas}
    caminho.write_text(json.dumps(corpo, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")


UFS = ["AC", "AL", "AM", "AP", "BA", "CE", "DF", "ES", "GO", "MA", "MG", "MS", "MT", "PA", "PB", "PE",
       "PI", "PR", "RJ", "RN", "RO", "RR", "RS", "SC", "SE", "SP", "TO"]


def grava_por_uf(nos, pessoas, unid, orgao_de, cupula):
    """dados/grafo/por_uf.json: o que o governo federal tem em cada estado.
    Senadores e deputados (com foto), cargos federais exercidos no estado (Portal da Transparencia,
    UF de exercicio) e orgaos com sede no estado (endereco no SIORG). Mais a cupula nacional."""
    sedes = {}
    if (DADOS / "siorg_orgaos.json").exists():
        sedes = {o["codigo"]: o for o in le("siorg_orgaos.json")}
    saida = {uf: {"senadores": [], "deputados": [], "cargos": 0, "ocupantes": 0, "porOrgao": {}, "destaques": [], "sedes": []} for uf in UFS}
    for n in nos.values():
        if n["tipo"] != "cargo" or not n["id"].startswith(("dep:", "sen:")):
            continue
        uf = n.get("uf")
        if uf not in saida:
            continue
        oc = n["ocupantes"][0]
        item = {"id": n["id"], "nome": oc["nome"], "partido": oc.get("partido"), "foto": (oc.get("foto") or "").replace("http:", "https:") or None}
        saida[uf]["senadores" if n["id"].startswith("sen:") else "deputados"].append(item)
    destaques = collections.defaultdict(list)
    for pid, p in pessoas.items():
        for a in p["cargos"]:
            uf = a.get("uf")
            if uf not in saida or a.get("ate") or not a["para"]:
                continue
            saida[uf]["ocupantes"] += 1
            dono = orgao_de(int(a["para"][2:]))
            sg = (unid.get(dono) or {}).get("sigla") or "?"
            saida[uf]["porOrgao"][sg] = saida[uf]["porOrgao"].get(sg, 0) + 1
            destaques[uf].append((nivel(a["codigoCargo"]), a.get("codigoCargo"), a.get("funcao"), p["no"]["rotulo"], sg, dono,
                                  id_cargo(a["para"], a.get("codigoCargo"), a.get("funcao")), a.get("unidadePortal")))
    for uf, lista in destaques.items():
        lista.sort(key=lambda x: (-x[0], x[3]))
        saida[uf]["destaques"] = [{"nivel": n_, "codigoCargo": c, "cargo": rotulo_cargo(f, c), "nome": nome, "orgao": sg, "orgaoCodigo": dono, "cargoId": cid, "unidade": up}
                                  for n_, c, f, nome, sg, dono, cid, up in lista[:40]]
        saida[uf]["cargos"] = len({x[6] for x in lista})
    for uf in saida:
        saida[uf]["porOrgao"] = dict(sorted(saida[uf]["porOrgao"].items(), key=lambda kv: -kv[1])[:15])
    for cod, o in sedes.items():
        if o.get("ufSede") in saida and o.get("tipo") in ("orgao", "entidade"):
            saida[o["ufSede"]]["sedes"].append({"codigo": cod, "sigla": o.get("sigla"), "nome": o.get("nome"), "poder": o.get("poder")})
    # governadores e deputados estaduais: eleitos em 2022 segundo o TSE (coletores/tse.py)
    tse = le("tse_eleitos_2022.json") if (DADOS / "tse_eleitos_2022.json").exists() else []
    for e in tse:
        if e["uf"] not in saida:
            continue
        item = {"id": f"tse:{e['sq']}", "nome": e["nome"], "partido": {"PC do B": "PCdoB"}.get(e["partido"], e["partido"]), "foto": e.get("foto")}
        if e["cargo"] == "Governador":
            saida[e["uf"]]["governador"] = item
        elif e["cargo"] == "Vice-governador":
            saida[e["uf"]]["vice"] = item
        else:
            saida[e["uf"]].setdefault("estaduais", []).append(item)
    # Presidente e Vice: foto e partido da candidatura eleita em 2022 no TSE (mesma fonte dos governadores);
    # uma foto valida colocada a mao em dados/fotos/Executivo tem prioridade
    tse_br = {{"Presidente": "PR", "Vice-presidente": "VPR"}.get(e["cargo"]): e for e in tse if e["uf"] == "BR"}
    def foto_exec(cod):
        arq = {"PR": "fotos/Executivo/Presidente.jpg", "VPR": "fotos/Executivo/Vice_Presidente.jpg"}.get(cod)
        if arq and (DADOS / arq).exists() and (DADOS / arq).read_bytes()[:4] in (b"\xff\xd8\xff\xe0", b"\xff\xd8\xff\xe1", b"\xff\xd8\xff\xdb", b"\x89PNG"):
            return arq
        return (tse_br.get(cod) or {}).get("foto")
    nacional = [{"cargo": c["cargo"], "nome": c["pessoa"], "codigoCargo": c["codigoCargo"], "orgaoCodigo": c.get("orgaoSiorg"),
                 "foto": foto_exec(c["codigoCargo"]), "partido": (tse_br.get(c["codigoCargo"]) or {}).get("partido")}
                for c in cupula.get("cargos", []) if c.get("pessoa")]
    (SAIDA / "por_uf.json").write_text(json.dumps({"ufs": saida, "nacional": nacional}, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    ibge = DADOS / "ibge_ufs.json"
    if ibge.exists():
        shutil.copy(ibge, SAIDA / "ufs.geojson")


# nomes pelos quais a imprensa chama algumas pessoas da cupula (o resto casa pelo nome completo
# ou por primeiro + ultimo nome)
APELIDOS_NOTICIA = {"Luiz Inácio Lula da Silva": ["Lula"], "Geraldo José Rodrigues Alckmin Filho": ["Alckmin"]}
SIGLAS_AMBIGUAS = {"PR", "SE", "MD", "MT", "MS", "PE", "PL", "PT", "PP", "CN", "SG", "AGU", "MIR", "MPI", "MPA", "MPO", "MPS"}


def grava_noticias(nos):
    """dados/grafo/noticias.json: noticias de fontes oficiais ligadas aos nos da visao geral.
    Liga por: feed do proprio orgao no gov.br; nome do orgao; sigla (so siglas pouco ambiguas);
    nome do parlamentar; nome completo ou primeiro+ultimo nome da cupula."""
    arq = DADOS / "noticias.json"
    if not arq.exists():
        return 0
    noticias = json.loads(arq.read_text(encoding="utf-8"))
    sem_acento = lambda t: norm(t).lower()
    alvos = []   # (ids, padrao, sensivel_a_caixa)

    def termo(t):
        return re.compile(r"(?<![\w])" + re.escape(t) + r"(?![\w])")

    for n in nos.values():
        if n["tipo"] == "orgao" and n.get("tipoSiorg") in ("orgao", "entidade"):
            alvos.append(([n["id"]], termo(sem_acento(n["nome"])), False))
            sg = (n.get("sigla") or "").split("/")[0]
            if len(sg) >= 3 and sg.upper() == sg and sg not in SIGLAS_AMBIGUAS:
                alvos.append(([n["id"]], termo(sg), True))
        elif n["tipo"] == "cargo" and n.get("ocupantes"):
            nome = n["ocupantes"][0]["nome"]
            ids = [n["id"]]
            if n["id"].startswith(("dep:", "sen:")):
                if len(nome.split()) >= 2:
                    alvos.append((ids, termo(nome), True))
            elif n.get("codigoCargo") in ESPECIAIS:
                partes = nome.split()
                formas = {nome, f"{partes[0]} {partes[-1]}"} | set(APELIDOS_NOTICIA.get(nome, []))
                for f in formas:
                    alvos.append((ids, termo(f), True))
    for casa, termos in (("casa:camara", ["Câmara dos Deputados"]), ("casa:senado", ["Senado Federal"])):
        for t in termos:
            alvos.append(([casa], termo(t), True))
    # o cargo da cupula tambem empresta a noticia ao orgao (ex.: Presidente -> Presidencia)
    orgao_do_cargo = {}
    for a in grafo_arestas_nucleo:
        if a["tipo"] == "cargo":
            orgao_do_cargo[a["de"]] = a["para"]

    por_no = collections.defaultdict(list)
    for i, nt in enumerate(noticias):
        texto = f"{nt['titulo']} {nt.get('resumo', '')}"
        texto_sa = sem_acento(texto)
        achados = set()
        if nt.get("orgaoFonte"):
            achados.add(f"u:{nt['orgaoFonte']}")
        if nt["fonte"] == "Agência Câmara":
            achados.add("casa:camara")
        if nt["fonte"] == "Agência Senado":
            achados.add("casa:senado")
        for ids, padrao, sensivel in alvos:
            if padrao.search(texto if sensivel else texto_sa):
                achados.update(ids)
        for a in list(achados):
            if a in orgao_do_cargo:
                achados.add(orgao_do_cargo[a])
        for a in achados:
            if len(por_no[a]) < 15:
                por_no[a].append(i)
    usados = sorted({i for l in por_no.values() for i in l})
    novo = {i: k for k, i in enumerate(usados)}
    saida = {"itens": [noticias[i] for i in usados], "porNo": {k: [novo[i] for i in v] for k, v in por_no.items()}}
    (SAIDA / "noticias.json").write_text(json.dumps(saida, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    return len(por_no)


grafo_arestas_nucleo = []


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
        agrega_cargos(por_orgao_p.get(dono, []), nos, arestas, busca, dono)
        grava(SAIDA / "orgaos" / f"{dono}.json", nos, arestas)

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
            if u["tipo"] == "ente" and u["poder"]:
                # "Poder Judiciario", "Poder Legislativo" etc. no SIORG: liga direto ao no do Poder
                arestas.append({"de": n["id"], "para": f"poder:{u['poder']}", "tipo": "subordinada"})
                return
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
    pares_altos = []
    for pid, p in pessoas.items():
        for a in p["cargos"]:
            if a["para"] and nivel(a["codigoCargo"]) >= NIVEL_NUCLEO and not a.get("ate"):
                inclui_unidade(int(a["para"][2:]))
                pares_altos.append((p, a))
    agrega_cargos(pares_altos, nos, arestas)

    # Legislativo
    busca_nucleo = []
    for casa, nome in (("casa:camara", "Câmara dos Deputados"), ("casa:senado", "Senado Federal")):
        nos[casa] = {"id": casa, "tipo": "casa", "rotulo": nome}
        arestas.append({"de": casa, "para": "poder:Legislativo", "tipo": "subordinada"})

    def partido(sigla):
        pid = f"partido:{sigla}"
        nos.setdefault(pid, {"id": pid, "tipo": "partido", "rotulo": sigla})
        return pid

    for d in DEP:
        i = f"dep:{d['id']}"
        nos[i] = {"id": i, "tipo": "cargo", "rotulo": f"Deputado(a) federal · {d['siglaUf']}", "codigoCargo": "DEP", "uf": d["siglaUf"],
                  "partido": d["siglaPartido"],
                  "ocupantes": [{"nome": d["nome"], "foto": d.get("urlFoto"), "partido": d["siglaPartido"], "fonte": "Câmara dos Deputados"}]}
        arestas.append({"de": i, "para": "casa:camara", "tipo": "membro"})
        if d.get("siglaPartido"):
            arestas.append({"de": i, "para": partido(d["siglaPartido"]), "tipo": "filiado"})
        busca_nucleo.append([d["nome"], i, 0])
    for s_ in SEN:
        ip = s_["IdentificacaoParlamentar"]
        i = f"sen:{ip['CodigoParlamentar']}"
        nos[i] = {"id": i, "tipo": "cargo", "rotulo": f"Senador(a) · {ip.get('UfParlamentar')}", "codigoCargo": "SEN", "uf": ip.get("UfParlamentar"),
                  "partido": ip.get("SiglaPartidoParlamentar"), "mesa": ip.get("MembroMesa") == "Sim", "lideranca": ip.get("MembroLideranca") == "Sim",
                  "ocupantes": [{"nome": ip["NomeParlamentar"], "foto": ip.get("UrlFotoParlamentar"), "partido": ip.get("SiglaPartidoParlamentar"), "fonte": "Senado Federal"}]}
        arestas.append({"de": i, "para": "casa:senado", "tipo": "membro"})
        if ip.get("SiglaPartidoParlamentar"):
            arestas.append({"de": i, "para": partido(ip["SiglaPartidoParlamentar"]), "tipo": "filiado"})
        busca_nucleo.append([ip["NomeParlamentar"], i, 0])

    grava(SAIDA / "nucleo.json", nos, arestas)
    grafo_arestas_nucleo.extend(arestas)
    com_noticia = grava_noticias(nos)
    resumo.append(f"noticias: {com_noticia} nos da visao geral com pelo menos uma noticia")
    for n in nos.values():
        if n["tipo"] == "cargo" and not n["id"].startswith(("dep:", "sen:")):
            for oc in n["ocupantes"]:
                busca_nucleo.append([oc["nome"], n["id"], 0])
    busca_total = sorted(busca_nucleo + busca)
    (SAIDA / "busca.json").write_text("[\n" + ",\n".join(json.dumps(b, ensure_ascii=False) for b in busca_total) + "\n]\n", encoding="utf-8")

    # ---- por estado (mapa do site) ----
    grava_por_uf(nos, pessoas, unid, orgao_de, cupula)

    # conferencias
    ids = set(nos)
    soltas = [a for a in arestas if a["de"] not in ids or a["para"] not in ids]
    tipos = collections.Counter(n["tipo"] for n in nos.values())
    especiais = collections.Counter()
    for n in nos.values():
        for k, v in (n.get("vagas") or {}).items():
            if k in ESPECIAIS:
                especiais[k] += v
    com_dono = collections.Counter(n["codigoCargo"] for n in nos.values() if n["tipo"] == "cargo" and n.get("codigoCargo") in ESPECIAIS)
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
