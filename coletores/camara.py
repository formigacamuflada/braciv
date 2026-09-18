"""Coleta deputados e orgaos da Camara dos Deputados.
Fonte: https://dadosabertos.camara.leg.br/api/v2 - aberta, sem chave."""
import json
import pathlib
import time
import urllib.parse
import urllib.request

BASE = "https://dadosabertos.camara.leg.br/api/v2"
SAIDA = pathlib.Path(__file__).resolve().parent.parent / "dados"


def busca(caminho, **params):
    """Percorre todas as paginas de um endpoint e devolve a lista inteira."""
    params.setdefault("itens", 100)
    pagina = 1
    tudo = []
    while True:
        params["pagina"] = pagina
        url = f"{BASE}{caminho}?" + urllib.parse.urlencode(params)
        req = urllib.request.Request(url, headers={"Accept": "application/json"})
        with urllib.request.urlopen(req, timeout=30) as resposta:
            corpo = json.load(resposta)
        dados = corpo.get("dados", [])
        tudo.extend(dados)
        if len(dados) < params["itens"]:
            return tudo
        pagina += 1
        time.sleep(0.5)  # a Camara devolve 429 se apertar demais


def grava(nome, dados):
    SAIDA.mkdir(exist_ok=True)
    caminho = SAIDA / nome
    caminho.write_text(json.dumps(dados, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"{nome}: {len(dados)} registros")


def main():
    grava("camara_deputados.json", busca("/deputados"))
    grava("camara_orgaos.json", busca("/orgaos"))


if __name__ == "__main__":
    main()
