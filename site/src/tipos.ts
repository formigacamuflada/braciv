// Formato dos arquivos gerados por coletores/grafo.py
export type Ato = { data: string; verbo: string; cargo?: string | null; codigoCargo?: string | null; ato?: string; url?: string };

// quem ocupa um cargo: as pessoas ficam DENTRO do nó de cargo, não viram nós
export type Ocupante = {
  nome: string;
  pessoa?: string;
  fonte?: string;
  foto?: string;
  fotoFonte?: string;
  papel?: string;
  origem?: string;
  partido?: string;
  uf?: string;
  desde?: string;
  ate?: string;
  unidadePortal?: string;
  exata?: boolean;
  url?: string;
  dou?: Ato[];
};

export type No = {
  id: string;
  tipo: "poder" | "casa" | "orgao" | "unidade" | "cargo" | "pessoa" | "partido";
  codigoCargo?: string | null;
  ocupantes?: Ocupante[];
  rotulo: string;
  nome?: string;
  sigla?: string | null;
  tipoSiorg?: string;
  poder?: string | null;
  natureza?: string | null;
  vagas?: Record<string, number>;
  papel?: string;
  uf?: string;
  partido?: string;
  foto?: string;
  fonte?: string;
  mesa?: boolean;
  lideranca?: boolean;
  ordem?: number;
  parlamentar?: string;
  casa?: string;
  partidoLid?: string;
  juiz?: boolean;
  tribunal?: string;
  grupo?: string;
  vagasLegais?: number;
  membrosConhecidos?: number;
  comissao?: boolean;
  cpi?: boolean;
  apelido?: string | null;
  criacao?: string | null;
  fimPrevisto?: string | null;
  finalidade?: string | null;
  fonteOrgao?: string;
  membros?: unknown[];
  vices?: unknown[];
  dou?: Ato[];
};

export type Aresta = {
  de: string;
  para: string;
  tipo: "subordinada" | "cargo" | "ocupa" | "membro" | "filiado";
  codigoCargo?: string | null;
  funcao?: string | null;
  unidadePortal?: string | null;
  exata?: boolean;
  desde?: string;
  ate?: string;
  fonte?: string;
  url?: string;
};

export type Grafo = { nos: No[]; arestas: Aresta[] };
export type ItemBusca = [nome: string, id: string, orgao: number];
export type Meta = { geradoEm: string; retratoPortal: string; planalto: string | null; douAte: string | null };
