import fs from "node:fs";
import path from "node:path";

const DATA_DIR = path.join(process.cwd(), "data");
const CONFIG_PATH = path.join(process.cwd(), "config", "routes.json");

function readJson<T>(file: string, fallback: T): T {
  try {
    return JSON.parse(fs.readFileSync(path.join(DATA_DIR, file), "utf-8")) as T;
  } catch {
    return fallback;
  }
}

export interface Snapshot {
  rota: string;
  de: string;
  para: string;
  nome: string;
  teto_brl: number | null;
  data_voo: string;
  horizonte: number;
  preco: number;
  cia: string;
  paradas: number;
  duracao_min: number;
  link: string;
  coletado_em: string;
}

export interface HistoryPoint {
  ts: string;
  rota: string;
  data_voo: string;
  preco: number;
}

export interface Promo {
  fonte: string;
  tipo: string;
  canal?: string;
  titulo: string;
  link: string;
  publicado_em: string | null;
  categorias?: string[];
}

export interface Bonus {
  pct: number;
  de: string | null;
  para: string | null;
  texto: string;
  fonte: string;
  link: string;
  publicado_em: string | null;
  detectado_em: string;
}

export interface Alerta {
  tipo: string;
  titulo: string;
  detalhe: string;
  link: string;
  criado_em: string;
}

export interface Meta {
  gerado_em: string | null;
  duracao_s?: number;
  alertas_na_rodada?: number;
  fontes?: Record<string, unknown>;
}

export interface AwardDemo {
  aviso: string;
  disponibilidades: {
    rota: string;
    nome: string;
    programa: string;
    cia: string;
    cabine: string;
    milhas: number;
    taxas_brl: number;
    assentos: number;
    data_voo: string;
    exemplo: boolean;
  }[];
}

export interface RotaCfg {
  rota: string;
  nome: string;
  keywords: string[];
}

export function loadAll() {
  let rotasCfg: RotaCfg[] = [];
  try {
    const cfg = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf-8")) as {
      rotas: { de: string; para: string; nome: string; keywords?: string[] }[];
    };
    rotasCfg = cfg.rotas.map((r) => ({
      rota: `${r.de}-${r.para}`,
      nome: r.nome,
      keywords: r.keywords ?? [r.nome.toLowerCase()],
    }));
  } catch {
    rotasCfg = [];
  }
  return {
    prices: readJson<Snapshot[]>("prices.json", []),
    history: readJson<HistoryPoint[]>("history.json", []),
    promos: readJson<Promo[]>("promos.json", []),
    bonus: readJson<Bonus[]>("bonus.json", []),
    alerts: readJson<Alerta[]>("alerts.json", []),
    meta: readJson<Meta>("meta.json", { gerado_em: null }),
    awards: readJson<AwardDemo>("awards-demo.json", {
      aviso: "",
      disponibilidades: [],
    }),
    rotasCfg,
  };
}
