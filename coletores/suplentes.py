"""Quem ocupa as vagas de deputado estadual/distrital deixadas por quem foi eleito prefeito ou
vice-prefeito em 2024: o suplente, pela regra do Codigo Eleitoral (Lei 4.737/1965, art. 112):
"os mais votados sob a mesma legenda e nao eleitos efetivos"; empate -> o mais velho.
Federacao conta como uma unica legenda (Lei 9.096/1995, art. 11-A).

E um CALCULO: nao confere na Assembleia se o suplente de fato assumiu (ele pode ter recusado,
ja estar em outra vaga por licenca de secretario, ter morrido etc.).

Fontes (TSE, Dados Abertos):
  consulta_cand_2022.zip            legenda, federacao, situacao, nascimento
  votacao_candidato_munzona_2022.zip votos nominais por candidato
  consulta_cand_2024.zip            suplente que tambem virou prefeito/vice e pulado
  consulta_cand_2026.zip            partido atual (candidatura de 2026), quando houver
Le dados/convergencia.json (quem saiu). Grava dados/suplentes_2022.json e dados/suplentes_relatorio.txt.
Uso: python coletores/suplentes.py
"""
import collections
import csv
import io
import json
import pathlib
import re
import sys
import tempfile
import unicodedata
import zipfile
from datetime import datetime, timezone

import requests

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from tse import Remoto, UA  # noqa: E402

DADOS = pathlib.Path(__file__).resolve().parent.parent / "dados"
CAND = "https://cdn.tse.jus.br/estatistica/sead/odsele/consulta_cand/consulta_cand_{ano}.zip"
VOT = "https://cdn.tse.jus.br/estatistica/sead/odsele/votacao_candidato_munzona/votacao_candidato_munzona_2022.zip"
FOTOS = "https://cdn.tse.jus.br/estatistica/sead/eleicoes/eleicoes2022/fotos/foto_cand2022_{uf}_div.zip"
CARGOS = {"DEPUTADO ESTADUAL", "DEPUTADO DISTRITAL"}
REL = []


def diz(*a):
    t = " ".join(str(x) for x in a)
    print(t)
    REL.append(t)


def baixa(url):
    diz("baixando", url.rsplit("/", 1)[-1], "...")
    f = tempfile.NamedTemporaryFile(delete=False, suffix=".zip")
    with requests.get(url, headers=UA, timeout=1800, stream=True) as r:
        r.raise_for_status()
        for b in r.iter_content(1 << 20):
            f.write(b)
    f.close()
    return zipfile.ZipFile(f.name)


def csvs(zf):
    nomes = [n for n in zf.namelist() if n.lower().endswith(".csv")]
    br = [n for n in nomes if n.lower().endswith("brasil.csv")]
    return br or nomes


def chave(l):
    n = unicodedata.normalize("NFKD", l.get("NM_CANDIDATO") or "").encode("ascii", "ignore").decode().upper()
    return (re.sub(r"[^A-Z]+", " ", n).strip(), (l.get("DT_NASCIMENTO") or "").strip(), l.get("SG_UF"))


def cpf(c):
    c = re.sub(r"\D", "", c or "")
    return c.zfill(11) if len(c) >= 9 and set(c) != {"0"} else None


def nasc(d):
    try:
        return datetime.strptime(d.strip(), "%d/%m/%Y")
    except Exception:
        return datetime.max


def main():
    conv = json.loads((DADOS / "convergencia.json").read_text(encoding="utf-8"))
    sairam = {sq: r for sq, r in conv.get("eleitos2022", {}).items()
              if r.get("cargo2022", "").startswith("Deputado") and (r.get("2024") or {}).get("cargo") in ("Prefeito", "Vice-prefeito")}
    diz("vagas a preencher (eleitos em 2022 que viraram prefeito/vice em 2024):", len(sairam))

    # candidatos de 2022 (estaduais/distritais)
    c22 = {}
    zf = baixa(CAND.format(ano=2022))
    for a in csvs(zf):
        for l in csv.DictReader(io.TextIOWrapper(zf.open(a), encoding="latin-1"), delimiter=";"):
            if l.get("DS_CARGO") in CARGOS and l.get("NR_TURNO", "1") == "1":
                c22[l["SQ_CANDIDATO"]] = l
    diz("candidatos 2022 (estadual/distrital):", len(c22))
    # votos nominais
    votos = collections.Counter()
    zf = baixa(VOT)
    for a in csvs(zf):
        leitor = csv.DictReader(io.TextIOWrapper(zf.open(a), encoding="latin-1"), delimiter=";")
        col = next((c for c in ("QT_VOTOS_NOMINAIS_VALIDOS", "QT_VOTOS_NOMINAIS") if c in (leitor.fieldnames or [])), None)
        if not col:
            diz("  coluna de votos nao achada em", a, leitor.fieldnames)
            continue
        for l in leitor:
            if l.get("DS_CARGO", "").upper() in CARGOS and l.get("NR_TURNO", "1") == "1":
                votos[l["SQ_CANDIDATO"]] += int(l[col] or 0)
    diz("candidatos com votos:", len(votos))
    # 2024: quem virou prefeito/vice (suplente nessa situacao e pulado)
    k24 = set()
    zf = baixa(CAND.format(ano=2024))
    for a in csvs(zf):
        for l in csv.DictReader(io.TextIOWrapper(zf.open(a), encoding="latin-1"), delimiter=";"):
            if l.get("DS_CARGO") in ("PREFEITO", "VICE-PREFEITO") and (l.get("DS_SIT_TOT_TURNO") or "").upper().startswith("ELEITO"):
                k24.add(chave(l))
    # 2026: partido atual por CPF
    p26 = {}
    zf = baixa(CAND.format(ano=2026))
    for a in csvs(zf):
        for l in csv.DictReader(io.TextIOWrapper(zf.open(a), encoding="latin-1"), delimiter=";"):
            c = cpf(l.get("NR_CPF_CANDIDATO"))
            if c:
                p26[c] = l.get("SG_PARTIDO")

    def legenda(l):
        f = (l.get("NR_FEDERACAO") or "").strip()
        return (l["SG_UF"], f"F{f}" if f and f not in ("-1", "-3", "#NULO#") else f"P{l.get('NR_PARTIDO')}")

    def nome_legenda(l):
        f = (l.get("SG_FEDERACAO") or "").strip()
        return f if f and f not in ("#NULO#", "#NULO") else l.get("SG_PARTIDO")

    # fila de suplentes por legenda
    filas = collections.defaultdict(list)
    for sq, l in c22.items():
        if (l.get("DS_SIT_TOT_TURNO") or "").upper().startswith("SUPLENTE"):
            filas[legenda(l)].append(sq)
    for k in filas:
        filas[k].sort(key=lambda s: (-votos[s], nasc(c22[s].get("DT_NASCIMENTO"))))
    usados = collections.defaultdict(int)
    saida = {}
    # vagas na ordem de votacao do titular (so define quem aparece como "suplente de quem")
    for sq in sorted(sairam, key=lambda s: -votos[s]):
        t = c22.get(sq)
        if not t:
            diz("  titular fora da lista de 2022:", sq)
            continue
        k = legenda(t)
        fila = filas.get(k, [])
        pulados = []
        while usados[k] < len(fila):
            cand = c22[fila[usados[k]]]
            usados[k] += 1
            if chave(cand) in k24:
                pulados.append((cand.get("NM_URNA_CANDIDATO") or "").title())
                continue
            p = p26.get(cpf(cand.get("NR_CPF_CANDIDATO")))
            saida[sq] = {"sq": cand["SQ_CANDIDATO"], "nome": (cand.get("NM_URNA_CANDIDATO") or "").title().strip(),
                         "partido2022": cand.get("SG_PARTIDO"), "partido": p or cand.get("SG_PARTIDO"), "partidoFonte": "candidatura de 2026" if p else "eleição de 2022",
                         "legenda": nome_legenda(t), "ordem": usados[k], "votos": votos[cand["SQ_CANDIDATO"]], "pulados": pulados,
                         "titular": (t.get("NM_URNA_CANDIDATO") or "").title().strip(), "uf": t["SG_UF"]}
            break
        else:
            diz(f"  {t['SG_UF']} {t.get('NM_URNA_CANDIDATO')}: sem suplente disponivel na legenda {nome_legenda(t)}")
    # fotos dos suplentes (candidatura de 2022)
    destino = DADOS / "fotos" / "tse"
    destino.mkdir(parents=True, exist_ok=True)
    try:
        from PIL import Image
    except ImportError:
        Image = None
    por_uf = collections.defaultdict(list)
    for s in saida.values():
        por_uf[s["uf"]].append(s)
    for uf, lista in por_uf.items():
        faltam = [s for s in lista if not (destino / f"{s['sq']}.jpg").exists()]
        if faltam:
            try:
                zf_f = zipfile.ZipFile(Remoto(FOTOS.format(uf=uf)))
                for s in faltam:
                    n = next((x for x in zf_f.namelist() if s["sq"] in x), None)
                    if not n:
                        continue
                    bruto = zf_f.read(n)
                    if Image:
                        im = Image.open(io.BytesIO(bruto)).convert("RGB")
                        im.thumbnail((160, 200))
                        im.save(destino / f"{s['sq']}.jpg", quality=80)
                    else:
                        (destino / f"{s['sq']}.jpg").write_bytes(bruto)
            except Exception as ex:
                diz(f"  {uf}: fotos indisponiveis ({type(ex).__name__})")
        for s in lista:
            s["foto"] = f"fotos/tse/{s['sq']}.jpg" if (destino / f"{s['sq']}.jpg").exists() else None
    for sq, s in sorted(saida.items(), key=lambda x: (x[1]["uf"], x[1]["titular"])):
        diz(f"  {s['uf']} vaga de {s['titular']} ({s['legenda']}) -> {s['nome']} ({s['partido']}, {s['votos']} votos, {s['ordem']}o da fila)" + (f"; pulados: {', '.join(s['pulados'])}" if s["pulados"] else ""))
    diz(f"vagas com suplente calculado: {len(saida)}/{len(sairam)}")
    (DADOS / "suplentes_2022.json").write_text(json.dumps({"geradoEm": datetime.now(timezone.utc).isoformat(timespec="minutes"), "vagas": saida},
                                                          ensure_ascii=False, indent=1), encoding="utf-8")


if __name__ == "__main__":
    try:
        main()
    finally:
        (DADOS / "suplentes_relatorio.txt").write_text("\n".join(REL) + "\n", encoding="utf-8")
