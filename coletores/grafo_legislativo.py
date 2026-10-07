"""Partes do grafo que vêm do Legislativo além dos parlamentares (chamado por grafo.py).

nucleo(...)   lideranças, comissões permanentes e Mesa do Congresso, ligadas às Casas no núcleo
estrutura(...) estrutura administrativa e servidores da Câmara e do Senado, em orgaos/67536.json e
               orgaos/67490.json (substitui o esqueleto que o SIORG tem dessas Casas)
"""
import hashlib
import json
import pathlib
import re
import unicodedata

DADOS = pathlib.Path(__file__).resolve().parent.parent / "dados"
COD_CD, COD_SF = 67536, 67490          # Câmara e Senado no SIORG


def le(nome, padrao):
    p = DADOS / nome
    return json.loads(p.read_text(encoding="utf-8")) if p.exists() else padrao


def norm(t):
    t = unicodedata.normalize("NFKD", t or "").encode("ascii", "ignore").decode()
    return re.sub(r"\s+", " ", t).strip().upper()


MINUSC = {"de", "da", "do", "das", "dos", "e", "a", "o", "em", "na", "no", "nas", "nos", "para", "com", "à", "ao", "ou", "sobre", "por"}


def bonito(t):
    """'COORDENAÇÃO DE ADMINISTRAÇÃO DE EDIFÍCIOS' -> 'Coordenação de Administração de Edifícios' (siglas curtas ficam)."""
    t = re.sub(r"\s+", " ", (t or "").strip())
    if not t or t != t.upper():
        return t
    out = []
    for i, w in enumerate(t.split(" ")):
        lw = w.lower()
        if i and lw in MINUSC:
            out.append(lw)
        elif len(w.strip(",;()/")) <= 4 and w.strip(",;()/").isalpha() and not re.search(r"[AEIOUÁÉÍÓÚÂÊÔÃÕ]", w.strip(",;()/")[1:]):
            out.append(w)            # sigla (CD, PT, PSB...)
        else:
            out.append("-".join(p[:1].upper() + p[1:].lower() for p in w.split("-")))
    return " ".join(out)


def frase(t):
    t = bonito(t)
    return t[:1].upper() + t[1:] if t else t


def hid(*p):
    return "c:" + hashlib.md5("|".join(str(x) for x in p).encode()).hexdigest()[:12]


def data_br(d):
    return "/".join(reversed(d.split("-"))) if d and re.match(r"\d{4}-\d{2}-\d{2}", d) else None


# --------------------------------------------------------------------------------------------
def nucleo(nos, arestas, DEP, SEN, cn_id):
    foto_dep = {str(d["id"]): (d.get("urlFoto") or "").replace("http:", "https:") or None for d in DEP}
    part_dep = {str(d["id"]): d.get("siglaPartido") for d in DEP}
    dep_nome = {norm(d["nome"]): str(d["id"]) for d in DEP}
    sen_ip = {s["IdentificacaoParlamentar"]["CodigoParlamentar"]: s["IdentificacaoParlamentar"] for s in SEN}
    sen_nome = {norm(ip["NomeParlamentar"]): c for c, ip in sen_ip.items()}

    def pessoa(nome, cod_sen=None, cod_dep=None, partido=None, uf=None):
        nome = re.sub(r"^(Senador|Senadora|Deputado|Deputada)\s+", "", nome or "").strip()
        cod_sen = str(cod_sen) if cod_sen and str(cod_sen) in sen_ip else sen_nome.get(norm(nome)) if not cod_dep else None
        cod_dep = str(cod_dep) if cod_dep and str(cod_dep) in foto_dep else (dep_nome.get(norm(nome)) if not cod_sen else None)
        if cod_sen:
            ip = sen_ip[cod_sen]
            return {"nome": nome, "foto": (ip.get("UrlFotoParlamentar") or "").replace("http:", "https:") or None,
                    "partido": partido or ip.get("SiglaPartidoParlamentar"), "uf": uf or ip.get("UfParlamentar"), "parlamentar": f"sen:{cod_sen}"}
        if cod_dep:
            return {"nome": nome, "foto": foto_dep[cod_dep], "partido": part_dep.get(cod_dep) or partido, "uf": uf, "parlamentar": f"dep:{cod_dep}"}
        return {"nome": nome, "partido": partido, "uf": uf}

    casa_de = {"CD": "casa:camara", "SF": "casa:senado", "CN": cn_id}
    nome_casa = {"CD": "na Câmara", "SF": "no Senado", "CN": "no Congresso"}
    contagem = {}

    # ---- lideranças ----
    ORDEM = {"G": 1, "M": 2, "MI": 3, "O": 4, "P": 5, "B": 6}
    unidades = {}
    for x in le("lideranca.json", []):
        casa = x.get("casa")
        if casa not in casa_de or not casa_de[casa]:
            continue
        tipo = x.get("siglaTipoUnidadeLideranca") or ""
        chave = (casa, x.get("idTipoUnidadeLideranca"), x.get("siglaPartido") or x.get("codigoBloco") or "")
        u = unidades.setdefault(chave, {"casa": casa, "tipo": tipo, "lider": None, "vices": [], "x": x})
        p = pessoa(x.get("nomeParlamentar"), x.get("codigoParlamentar") if x.get("formaTratamentoParlamentar", "").startswith("Senador") else None,
                   x.get("codigoDeputado") if x.get("formaTratamentoParlamentar", "").startswith("Deputad") else None,
                   x.get("siglaPartidoFiliacao"), x.get("uf"))
        p["desde"] = data_br(x.get("dataDesignacao"))
        if x.get("siglaTipoLideranca") == "L":
            u["lider"] = p
        else:
            p["ordem"] = x.get("numeroOrdemViceLider") or 99
            p["titulo"] = x.get("descricaoTipoLideranca", "").split(" d")[0]
            u["vices"].append(p)
    n_lid = 0
    for (casa, idt, sig), u in unidades.items():
        if not u["lider"]:
            continue
        x = u["x"]
        desc = x.get("descricaoTipoUnidadeLideranca") or "Liderança"
        if u["tipo"] == "P":
            rot = f"Líder do {x.get('siglaPartido') or x.get('nomePartido')} {nome_casa[casa]}"
        elif u["tipo"] == "B":
            nb = x.get("nomeBloco") or x.get("siglaBloco") or "bloco"
            nb = nb if "," in nb else bonito(nb.upper())
            rot = f"Líder da {nb}" if nb.startswith("Federação") else f"Líder do {nb}" if nb.startswith("Bloco") else f"Líder do bloco {nb}"
        else:
            rot = desc.replace("Liderança", "Líder", 1)
        i = f"lid:{casa.lower()}:{idt}:{re.sub(r'[^A-Za-z0-9]+', '-', str(sig)) or 'x'}"
        oc = dict(u["lider"]); oc["fonte"] = "Senado Federal, dados abertos (lideranças)"
        nos[i] = {"id": i, "tipo": "cargo", "rotulo": rot, "codigoCargo": "LID", "ordem": ORDEM.get(u["tipo"], 7), "casa": casa,
                  "parlamentar": oc.get("parlamentar"), "ocupantes": [oc],
                  "vices": sorted(u["vices"], key=lambda v: (v.get("ordem") or 99, v["nome"]))}
        arestas.append({"de": i, "para": casa_de[casa], "tipo": "cargo"})
        n_lid += 1
    contagem["lideranças"] = n_lid

    # ---- comissões permanentes ----
    n_com = 0
    for c in le("comissoes_cd.json", []):
        i = f"com:cd:{c['id']}"
        ms = sorted(c.get("membros", []), key=lambda m: (m.get("codTitulo") or 999, m.get("nome") or ""))
        nos[i] = {"id": i, "tipo": "unidade", "rotulo": c.get("sigla"), "nome": c.get("nome"), "sigla": c.get("sigla"), "poder": "Legislativo",
                  "casa": "CD", "comissao": True,
                  "membros": [{"n": m.get("nome"), "p": m.get("siglaPartido"), "u": m.get("siglaUf"), "t": m.get("titulo"), "i": f"dep:{m.get('id')}"} for m in ms]}
        arestas.append({"de": i, "para": "casa:camara", "tipo": "subordinada"})
        for m in ms:
            if (m.get("codTitulo") or 999) < 100:          # Presidente e vices
                j = f"{i}:{m['codTitulo']}"
                oc = pessoa(m.get("nome"), cod_dep=m.get("id"), partido=m.get("siglaPartido"), uf=m.get("siglaUf"))
                oc["fonte"] = "Câmara dos Deputados, dados abertos"
                nos[j] = {"id": j, "tipo": "cargo", "rotulo": f"{m.get('titulo')} da {c.get('sigla')}", "codigoCargo": "PRES" if m["codTitulo"] == 1 else "VICE",
                          "ordem": m["codTitulo"], "parlamentar": oc.get("parlamentar"), "ocupantes": [oc]}
                arestas.append({"de": j, "para": i, "tipo": "cargo"})
        n_com += 1
    for c in le("comissoes_sf.json", []):
        casa = c.get("casa") or "SF"
        if not casa_de.get(casa):
            continue
        i = f"com:{casa.lower()}:{c['codigo']}"
        membros = []
        for m in c.get("membros", []):
            p = pessoa(m.get("NomeParlamentar"), m.get("CodigoParlamentar") if (m.get("OrigemParlamentar") or "Senado").startswith("Senado") else None,
                       None, m.get("Partido"), m.get("SiglaUf"))
            membros.append({"n": p["nome"], "p": p.get("partido"), "u": p.get("uf"), "t": m.get("TipoVaga"), "i": p.get("parlamentar")})
        membros.sort(key=lambda m: (0 if (m["t"] or "").startswith("Titular") else 1, m["n"] or ""))
        nos[i] = {"id": i, "tipo": "unidade", "rotulo": c.get("sigla"), "nome": c.get("nome"), "sigla": c.get("sigla"), "poder": "Legislativo",
                  "casa": casa, "comissao": True, "membros": membros}
        arestas.append({"de": i, "para": casa_de[casa], "tipo": "subordinada"})
        for k, cg in enumerate(c.get("cargos", [])):
            ban = (cg.get("Bancada") or "").strip("()").split("-")
            oc = pessoa(cg.get("NomeParlamentar"), cg.get("CodigoParlamentar"), None, "-".join(ban[:-1]) or None, ban[-1] if len(ban) > 1 else None)
            oc["fonte"] = "Senado Federal, dados abertos"
            pres = (cg.get("TipoCargo") or "").upper() == "PRESIDENTE"
            j = f"{i}:{k + 1}"
            nos[j] = {"id": j, "tipo": "cargo", "rotulo": f"{frase(cg.get('TipoCargo'))} da {c.get('sigla')}", "codigoCargo": "PRES" if pres else "VICE",
                      "ordem": 1 if pres else k + 2, "parlamentar": oc.get("parlamentar"), "ocupantes": [oc]}
            arestas.append({"de": j, "para": i, "tipo": "cargo"})
        n_com += 1
    contagem["comissões"] = n_com

    # ---- Mesa do Congresso Nacional (presidida pelo Presidente do Senado, CF art. 57, § 5º) ----
    n_mcn = 0
    if cn_id:
        for k, m in enumerate(le("cn_mesa.json", {"cargos": []})["cargos"]):
            ordem = int(m.get("NumeroOrdemImpressao") or k + 1)
            cargo = m.get("TipoCargo") or (m["Cargo"][0] if isinstance(m.get("Cargo"), list) else m.get("Cargo")) or ""
            ban = (m.get("Bancada") or "").strip("()").split("-")
            sen = (m.get("NomeParlamentar") or "").startswith("Senador")
            oc = pessoa(m.get("NomeParlamentar"), (m.get("CodigoParlamentar") or m.get("Http")) if sen else None,
                        None if sen else m.get("CodigoDeputadoNaCamara"), "-".join(ban[:-1]) or None, ban[-1] if len(ban) > 1 else None)
            oc["fonte"] = "Senado Federal, Mesa do Congresso Nacional"
            oc["url"] = "https://www.congressonacional.leg.br/institucional/mesa-do-congresso-nacional"
            i = f"mesa:cn:{ordem}"
            nos[i] = {"id": i, "tipo": "cargo", "rotulo": "Presidente do Congresso Nacional" if ordem == 1 else f"{frase(cargo)} da Mesa do Congresso",
                      "codigoCargo": "MESA", "ordem": ordem, "parlamentar": oc.get("parlamentar"), "ocupantes": [oc]}
            arestas.append({"de": i, "para": cn_id, "tipo": "cargo"})
            n_mcn += 1
    contagem["Mesa do Congresso"] = n_mcn
    return contagem


# --------------------------------------------------------------------------------------------
def _casa_vazia(cod, nome, sigla):
    raiz = f"u:{cod}"
    return raiz, {raiz: {"id": raiz, "tipo": "orgao", "rotulo": sigla, "nome": nome, "sigla": sigla, "poder": "Legislativo", "tipoSiorg": "orgao"}}, []


def _unidade(nos, arestas, uid, nome, sigla, pai):
    if uid not in nos:
        nos[uid] = {"id": uid, "tipo": "unidade", "rotulo": sigla or nome, "nome": nome, "sigla": sigla, "poder": "Legislativo"}
        arestas.append({"de": uid, "para": pai, "tipo": "subordinada"})
    return uid


def _ocupa(nos, arestas, cargos, unidade, rotulo, codigo, oc):
    cid = hid(unidade, rotulo, codigo)
    if cid not in nos:
        nos[cid] = {"id": cid, "tipo": "cargo", "rotulo": rotulo, "codigoCargo": codigo, "ocupantes": []}
        arestas.append({"de": cid, "para": unidade, "tipo": "cargo"})
    nos[cid]["ocupantes"].append({k: v for k, v in oc.items() if v})
    cargos.add(cid)


# agrupa as unidades soltas na raiz por tipo, para a lista não abrir com centenas de itens
GRUPOS = [
    (r"^(Gabinete d[oa] Senador|Gabinete de |Gabinete do Deputado|Gabinete da Deputada)", "gab", "Gabinetes parlamentares"),
    (r"^(Escrit[óo]rio (de )?(Ap\.?|Apoio)|Esc\. de Apoio)", "esc", "Escritórios de apoio dos senadores"),
    (r"(Lideran[çc]a|^Bloco|Bancada)", "lid", "Lideranças, blocos e bancadas"),
    (r"^(Comiss[ãa]o|Subcomiss[ãa]o|Conselho|Comit[êe]|Frente|Procuradoria|Ouvidoria|Corregedoria|Observat[óo]rio|Secretaria da Mulher|Procuradoria da Mulher)", "col", "Comissões, conselhos e órgãos de representação"),
    (r"(Secretaria$|Suplente de Secret[áa]rio|Vice-Presid[êe]ncia|^Presid[êe]ncia|Gabinete d[oa] (Primeir|Segund|Terceir|Quart)|Gabinete da Presid)", "mesa", "Mesa: Presidência, vice-presidências e secretarias"),
]


def agrupa_raiz(nos, arestas, raiz, pref):
    criados = {}
    for a in arestas:
        if a["tipo"] != "subordinada" or a["para"] not in (raiz, f"u:{pref}:outras") or a["de"] in (f"u:{pref}:gabinetes", f"u:{pref}:outras"):
            continue
        nome = nos[a["de"]].get("nome") or ""
        for padrao, chave, rotulo in GRUPOS:
            if re.search(padrao, nome, re.I):
                gid = f"u:{pref}:grupo:{chave}"
                if gid not in criados:
                    criados[gid] = True
                    nos[gid] = {"id": gid, "tipo": "unidade", "rotulo": rotulo, "nome": rotulo, "sigla": None, "poder": "Legislativo"}
                a["para"] = gid
                break
    for gid in criados:
        arestas.append({"de": gid, "para": raiz, "tipo": "subordinada"})


def estrutura_camara():
    func = le("camara_funcionarios.json", [])
    if not func:
        return None
    raiz, nos, arestas = _casa_vazia(COD_CD, "Câmara dos Deputados", "CD")
    cargos = set()
    gab = _unidade(nos, arestas, "u:cd:gabinetes", "Gabinetes parlamentares", None, raiz)
    for f in func:
        lot = f.get("lotacao") or ""
        cod, _, nome = lot.partition(" - ")
        if f.get("dep") or lot.startswith("GAB"):
            uid = _unidade(nos, arestas, f"u:cd:gab:{f.get('dep') or cod}", f"Gabinete de {bonito(nome) or cod}", None, gab)
        else:
            toks = [t for t in cod.split("/") if t]
            limpo = [t for k, t in enumerate(toks) if k == 0 or t != toks[k - 1]]
            if len(limpo) > 1 and limpo[-1] == limpo[0]:
                limpo = limpo[:-1]
            if not limpo:
                limpo = ["SEM-LOTACAO"]
            pai = raiz
            for k in range(len(limpo)):
                uid = "u:cd:" + "/".join(limpo[: k + 1])
                ultimo = k == len(limpo) - 1
                pai = _unidade(nos, arestas, uid, frase(nome) if ultimo and nome else limpo[k], limpo[k], pai)
                if ultimo and nome and nos[uid]["nome"] == limpo[k]:
                    nos[uid]["nome"] = frase(nome)
            uid = pai
        fn = f.get("funcao") or ""
        m = re.match(r"^\s*([A-Z]{2,4}-?\d+[A-Z]?)\s*-\s*(.+?)\s*(\([A-Z0-9]+\))?\s*$", fn)
        if m:
            codigo, rotulo = m.group(1), frase(m.group(2))
        elif f.get("grupo") == "Secretário Parlamentar":
            codigo, rotulo = f.get("cargo"), "Secretário(a) parlamentar"
        else:
            codigo, rotulo = None, frase(f.get("cargo")) or f.get("grupo") or "Servidor(a)"
        _ocupa(nos, arestas, cargos, uid, rotulo, codigo,
               {"nome": bonito(f.get("nome")), "desde": data_br(f.get("desde")), "fonte": "Câmara dos Deputados, arquivo Funcionários", "vinculo": f.get("grupo")})
    agrupa_raiz(nos, arestas, raiz, "cd")
    return raiz, nos, arestas, len(func)


def estrutura_senado():
    est = le("senado_estrutura.json", [])
    serv = le("senado_servidores.json", [])
    if not est and not serv:
        return None
    raiz, nos, arestas = _casa_vazia(COD_SF, "Senado Federal", "SF")
    cargos = set()
    pai_de = {}
    for x in est:
        s = x.get("setor") or {}
        if s.get("sigla"):
            pai_de[s["sigla"]] = (s.get("siglaSetorSuperior"), s.get("nomeSetorSuperior"), s.get("nome"))

    def garante(sig, guarda=()):
        if not sig or sig == "SF":
            return raiz
        if sig == "__OUTRAS__":
            return _unidade(nos, arestas, "u:sf:outras", "Outras lotações (o Senado não informa a unidade superior)", None, raiz)
        uid = f"u:sf:{sig}"
        if uid in nos:
            return uid
        sup, nome_sup, nome = pai_de.get(sig, (None, None, None))
        if sup and sup not in pai_de and sup != "SF":
            pai_de[sup] = ("SF", None, nome_sup)
        pai = garante(sup, guarda + (sig,)) if sup and sup not in guarda else raiz
        return _unidade(nos, arestas, uid, frase(nome) or sig, sig, pai)

    titulares = set()
    for x in est:
        s = x.get("setor") or {}
        uid = garante(s.get("sigla"))
        for chave, cod in (("titular", "TIT"), ("substituto", "SUBST")):
            t = x.get(chave)
            if t and t.get("nome"):
                rot = frase(t.get("cargo")) if chave == "titular" else "Substituto(a) eventual"
                _ocupa(nos, arestas, cargos, uid, rot or "Titular", cod, {"nome": bonito(t["nome"]), "fonte": "Senado Federal, diretores e coordenadores"})
                titulares.add((uid, norm(t["nome"])))
    da_estrutura = set(pai_de)
    for s in serv:
        sig = s.get("lotacao")
        if sig and sig not in pai_de:
            pai_de[sig] = ("__OUTRAS__", None, s.get("lotacaoNome"))
        uid = garante(sig) if sig else raiz
        if (uid, norm(s.get("nome"))) in titulares:
            continue
        rot = frase(s.get("funcao")) or frase(s.get("cargo")) or frase(s.get("vinculo")) or "Servidor(a)"
        _ocupa(nos, arestas, cargos, uid, rot, None, {"nome": bonito(s.get("nome")), "fonte": "Senado Federal, servidores ativos", "vinculo": frase(s.get("vinculo"))})
    agrupa_raiz(nos, arestas, raiz, "sf")
    return raiz, nos, arestas, len(serv)


def estrutura(saida, grava, busca):
    feito = {}
    for cod, fn in ((COD_CD, estrutura_camara), (COD_SF, estrutura_senado)):
        try:
            r = fn()
        except Exception as e:      # noqa: BLE001  (uma Casa com dado estranho não derruba o grafo)
            feito[cod] = f"falhou: {type(e).__name__}: {e}"
            continue
        if not r:
            continue
        raiz, nos, arestas, n = r
        grava(saida / "orgaos" / f"{cod}.json", nos, arestas)
        for v in nos.values():
            if v["tipo"] == "cargo":
                busca.extend([o["nome"], v["id"], cod] for o in v["ocupantes"])
        feito[cod] = f"{n} pessoas, {sum(1 for v in nos.values() if v['tipo'] == 'unidade')} unidades"
    return feito
