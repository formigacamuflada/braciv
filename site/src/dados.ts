declare const __VERSAO__: string;
import type { Grafo, ItemBusca, Meta } from "./tipos";

const BASE = import.meta.env.BASE_URL + "dados/";
const cache = new Map<string, Promise<unknown>>();

function busca<T>(arquivo: string): Promise<T> {
  if (!cache.has(arquivo)) {
    cache.set(
      arquivo,
      fetch(`${BASE}${arquivo}?v=${__VERSAO__}`).then((r) => {
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

export type Parlamentar = { id: string; nome: string; partido?: string; foto?: string | null };
export type Destaque = { nivel: number; codigoCargo?: string; cargo: string; nome: string; orgao: string; orgaoCodigo: number; cargoId: string; unidade?: string };
export type DadosUf = {
  senadores: Parlamentar[]; deputados: Parlamentar[]; cargos: number; ocupantes: number;
  porOrgao: Record<string, number>; destaques: Destaque[]; sedes: { codigo: number; sigla?: string; nome: string; poder?: string }[];
  governador?: Parlamentar; vice?: Parlamentar; estaduais?: Parlamentar[];
};
export type PorUf = { ufs: Record<string, DadosUf>; nacional: { cargo: string; nome: string; codigoCargo: string; orgaoCodigo?: number; foto?: string | null; partido?: string | null }[] };
// fotos: URL completa (Câmara, Senado) ou caminho dentro do site (TSE, Executivo)
export const urlFoto = (f?: string | null) => (!f ? null : /^https?:/.test(f) ? f.replace(/^http:/, "https:") : import.meta.env.BASE_URL + f);
export type Feicao = { type: "Feature"; properties: { sigla: string; nome: string; regiao: string }; geometry: { type: "Polygon" | "MultiPolygon"; coordinates: any } };
export const carregaPorUf = () => busca<PorUf>("por_uf.json");
export const carregaUfs = () => busca<{ features: Feicao[] }>("ufs.geojson");

export type Noticia = { titulo: string; link: string; data?: string; resumo?: string; fonte: string; imagem?: string | null };
export const carregaNoticias = () => busca<{ itens: Noticia[]; porNo: Record<string, number[]> }>("noticias.json");
