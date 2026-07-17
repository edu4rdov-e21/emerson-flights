import fs from "node:fs";
import path from "node:path";

const DATA_DIR = path.join(process.cwd(), "data");

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

export function loadAll() {
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
  };
}

export const brl = (v: number) =>
  v.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  });

export const numero = (v: number) => v.toLocaleString("pt-BR");

export function horaSp(iso: string | null): string {
  if (!iso) return "ainda sem coleta";
  const d = new Date(iso);
  return d.toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function tempoRelativo(iso: string | null | undefined): string {
  if (!iso) return "";
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "";
  const min = Math.max(0, Math.round((Date.now() - t) / 60000));
  if (min < 60) return `há ${min} min`;
  const h = Math.round(min / 60);
  if (h < 48) return `há ${h} h`;
  return `há ${Math.round(h / 24)} dias`;
}

export function dataVooCurta(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const meses = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
  return `${d} ${meses[(m ?? 1) - 1]} ${String(y).slice(2)}`;
}
