"""Diagnostico: onde e em que formato o TSE publica os resultados de 2026.
So inspeciona e grava dados/tse2026_diagnostico.txt (nao extrai nada).
"""
import io, json, pathlib, zipfile, csv, collections
import requests

DADOS = pathlib.Path(__file__).resolve().parent.parent / "dados"
UA = {"User-Agent": "Mozilla/5.0 (BRA.CIV coletor; github.com/formigacamuflada/braciv)"}
OUT = []

def diz(*a):
    t = " ".join(str(x) for x in a); print(t); OUT.append(t)

def get(url, **kw):
    try:
        r = requests.get(url, headers=UA, timeout=kw.pop("timeout", 60), **kw)
        diz(f"GET {url} -> {r.status_code} {len(r.content)} bytes")
        return r if r.ok else None
    except Exception as ex:
        diz(f"GET {url} -> ERRO {type(ex).__name__}: {ex}"); return None

def head(url):
    try:
        r = requests.head(url, headers=UA, timeout=60, allow_redirects=True)
        diz(f"HEAD {url} -> {r.status_code} {r.headers.get('Content-Length')} {r.headers.get('Last-Modified')}")
    except Exception as ex:
        diz(f"HEAD {url} -> ERRO {type(ex).__name__}: {ex}")

def main():
    diz("== 1. configuracao de eleicoes (resultados.tse.jus.br)")
    codigos = []
    for amb in ("oficial", "simulado"):
        r = get(f"https://resultados.tse.jus.br/{amb}/comum/config/ele-c.json")
        if r:
            txt = r.text
            diz(txt[:1500])
            try:
                j = r.json()
                def anda(o, cam=""):
                    if isinstance(o, dict):
                        if any("2026" in str(v) for v in o.values() if not isinstance(v, (dict, list))):
                            diz("  2026 em", cam, json.dumps({k: v for k, v in o.items() if not isinstance(v, (dict, list))}, ensure_ascii=False))
                            if "cd" in o: codigos.append((amb, str(o["cd"])))
                        for k, v in o.items(): anda(v, cam + "/" + k)
                    elif isinstance(o, list):
                        for i, v in enumerate(o): anda(v, cam + f"[{i}]")
                anda(j)
            except Exception as ex:
                diz("  json invalido:", ex)
    diz("codigos 2026:", codigos)
    diz("== 2. resultados simplificados por codigo")
    for amb, cd in codigos[:8]:
        e = cd.zfill(6)
        for uf, cargo in (("br", 1), ("sp", 3), ("sp", 5), ("sp", 6), ("ac", 7)):
            r = get(f"https://resultados.tse.jus.br/{amb}/ele2026/{int(cd)}/dados-simplificados/{uf}/{uf}-c{cargo:04d}-e{e}-r.json")
            if r:
                try:
                    j = r.json()
                    diz("  chaves:", list(j.keys())[:40])
                    cands = j.get("cand") or []
                    diz("  n cand:", len(cands), "exemplo:", json.dumps(cands[:2], ensure_ascii=False)[:800])
                    diz("  st:", dict(collections.Counter(c.get("st") for c in cands)))
                    diz("  topo:", json.dumps({k: v for k, v in j.items() if k != "cand"}, ensure_ascii=False)[:600])
                except Exception as ex:
                    diz("  nao json:", ex, r.text[:200])
    diz("== 3. dados abertos (cdn.tse.jus.br)")
    head("https://cdn.tse.jus.br/estatistica/sead/eleicoes/eleicoes2026/fotos/foto_cand2026_SP_div.zip")
    head("https://cdn.tse.jus.br/estatistica/sead/eleicoes/eleicoes2026/fotos/foto_cand2026_BR_div.zip")
    r = get("https://cdn.tse.jus.br/estatistica/sead/odsele/consulta_cand/consulta_cand_2026.zip", timeout=600)
    if r:
        zf = zipfile.ZipFile(io.BytesIO(r.content))
        diz("arquivos:", zf.namelist()[:40])
        nome = next((n for n in zf.namelist() if n.lower().endswith("brasil.csv")), None) or next(n for n in zf.namelist() if n.lower().endswith(".csv"))
        leitor = csv.DictReader(io.TextIOWrapper(zf.open(nome), encoding="latin-1"), delimiter=";")
        diz("colunas:", leitor.fieldnames)
        cont = collections.Counter()
        exemplo = {}
        for l in leitor:
            k = (l.get("NR_TURNO"), l.get("DS_CARGO"), l.get("DS_SIT_TOT_TURNO"))
            cont[k] += 1
            exemplo.setdefault(l.get("DS_CARGO"), {c: l[c] for c in list(l)[:60]})
        for k, v in sorted(cont.items(), key=lambda x: (str(x[0]))):
            diz("  ", k, v)
        diz("exemplo de linha:", json.dumps(exemplo.get("SENADOR") or next(iter(exemplo.values())), ensure_ascii=False)[:2500])

if __name__ == "__main__":
    try:
        main()
    finally:
        (DADOS / "tse2026_diagnostico.txt").write_text("\n".join(OUT) + "\n", encoding="utf-8")
