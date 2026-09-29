import type { Grafo, ItemBusca, Meta } from "./tipos";

const BASE = import.meta.env.BASE_URL + "dados/";
const cache = new Map<string, Promise<unknown>>();

function busca<T>(arquivo: string): Promise<T> {
  if (!cache.has(arquivo)) {
    cache.set(
      arquivo,
      fetch(BASE + arquivo).then((r) => {
        if (!r.ok) throw new Error(`não consegui carregar ${arquivo} (HTTP ${r.status})`);
        return r.json();
      }),
    );
  }
  return cache.get(arquivo) as Promise<T>;
}

export const carregaNucleo = () => busca<Grafo>("nucleo.json");
export const carregaOrgao = (codigo: number | string) => busca<Grafo>(`orgaos/${codigo}.json`);
export const carregaBusca = () => busca<ItemBusca[]>("busca.json");
export const carregaMeta = () => busca<Meta>("meta.json");

export function normaliza(t: string) {
  return t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}
