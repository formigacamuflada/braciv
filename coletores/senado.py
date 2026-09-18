"""Coleta senadores em exercício.
Fonte: https://legis.senado.leg.br/dadosabertos — aberta, sem chave."""
import json, pathlib, urllib.request

URL = "https://legis.senado.leg.br/dadosabertos/senador/lista/atual.json"
SAIDA = pathlib.Path(__file__).parent.parent / "dados"


def main():
    SAIDA.mkdir(exist_ok=True)
    req = urllib.request.Request(URL, headers={"Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=30) as r:
        corpo = json.load(r)
    lista = corpo["ListaParlamentarEmExercicio"]["Parlamentares"]["Parlamentar"]
    (SAIDA / "senado_senadores.json").write_text(
        json.dumps(lista, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"senadores: {len(lista)}")


if __name__ == "__main__":
    main()
