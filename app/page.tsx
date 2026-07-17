import {
  brl,
  dataVooCurta,
  horaSp,
  loadAll,
  numero,
  tempoRelativo,
  type HistoryPoint,
  type Snapshot,
} from "@/lib/data";

export const dynamic = "force-static";

function Sparkline({ pontos }: { pontos: number[] }) {
  if (pontos.length < 2) {
    return <div className="spark-empty">histórico em construção, cada varredura adiciona um ponto</div>;
  }
  const w = 300;
  const h = 40;
  const min = Math.min(...pontos);
  const max = Math.max(...pontos);
  const range = max - min || 1;
  const step = w / (pontos.length - 1);
  const xy = pontos.map(
    (p, i) => [i * step, h - 4 - ((p - min) / range) * (h - 8)] as const,
  );
  const d = xy.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const last = xy[xy.length - 1];
  return (
    <svg className="spark" width="100%" height={h} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" role="img" aria-label="histórico de preços">
      <path d={d} fill="none" stroke="var(--green)" strokeWidth="1.8" strokeLinecap="round" />
      <circle cx={last[0]} cy={last[1]} r="2.6" fill="var(--green)" />
    </svg>
  );
}

function RouteCard({ grupo, historico }: { grupo: Snapshot[]; historico: HistoryPoint[] }) {
  const ref = grupo[0];
  const melhor = grupo.reduce((a, b) => (a.preco <= b.preco ? a : b));
  // melhor preco da rota em cada varredura (agrupa por timestamp da coleta)
  const porVarredura = new Map<string, number>();
  for (const p of historico) {
    if (p.rota !== ref.rota) continue;
    const atual = porVarredura.get(p.ts);
    if (atual === undefined || p.preco < atual) porVarredura.set(p.ts, p.preco);
  }
  const serie = [...porVarredura.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .slice(-48)
    .map(([, preco]) => preco);
  const temDeal = ref.teto_brl != null && grupo.some((s) => s.preco <= (s.teto_brl ?? 0));
  return (
    <article className="route-card">
      <div className="route-top">
        <div>
          <div className="dest">
            {ref.nome} {temDeal && <span className="badge deal">deal</span>}
          </div>
          <div className="code mono">
            {ref.de} → {ref.para}
          </div>
        </div>
        <div className="best-price">
          <div className="num mono">{brl(melhor.preco)}</div>
          <div className="cap">melhor tarifa · voo {dataVooCurta(melhor.data_voo)}</div>
        </div>
      </div>
      <div className="horizons">
        {grupo
          .slice()
          .sort((a, b) => a.horizonte - b.horizonte)
          .map((s) => (
            <a key={s.horizonte} className="hrow" href={s.link} target="_blank" rel="noreferrer">
              <span className="when mono">+{s.horizonte}d</span>
              <span className="meta">
                {s.cia} · {s.paradas === 0 ? "direto" : `${s.paradas} parada${s.paradas > 1 ? "s" : ""}`}
              </span>
              <span className={`price mono${s.teto_brl != null && s.preco <= s.teto_brl ? " deal" : ""}`}>
                {brl(s.preco)}
              </span>
            </a>
          ))}
      </div>
      <Sparkline pontos={serie} />
      <div className="route-foot">
        <span>
          teto de alerta: <span className="mono">{ref.teto_brl ? brl(ref.teto_brl) : "sem teto"}</span>
        </span>
        <a href={melhor.link} target="_blank" rel="noreferrer">
          ver no Google Flights ↗
        </a>
      </div>
    </article>
  );
}

export default function Home() {
  const { prices, history, promos, bonus, alerts, meta, awards } = loadAll();

  const grupos = new Map<string, Snapshot[]>();
  for (const s of prices) {
    grupos.set(s.rota, [...(grupos.get(s.rota) ?? []), s]);
  }

  const menorTarifa = prices.length
    ? prices.reduce((a, b) => (a.preco <= b.preco ? a : b))
    : null;
  const maiorBonus = bonus.length ? Math.max(...bonus.map((b) => b.pct)) : null;
  const fontes = (meta.fontes ?? {}) as Record<string, { ok?: boolean }>;

  return (
    <main className="wrap">
      <div className="topbar">
        <div className="brand">
          <div className="brand-mark">✈</div>
          <div>
            <h1>
              Emerson <span>Flights</span>
            </h1>
            <p>monitor pessoal de tarifas, promoções e milhas</p>
          </div>
        </div>
        <div className="status-line">
          <span className={`dot${fontes.precos?.ok ? "" : " off"}`}>Google Flights</span>
          <span className={`dot${fontes.rss?.ok ? "" : " off"}`}>Melhores Destinos</span>
          <span className={`dot${fontes.telegram?.ok ? "" : " off"}`}>Telegram</span>
          <span className="mono">última varredura {horaSp(meta.gerado_em)}</span>
        </div>
      </div>

      <div className="kpis">
        <div className="kpi">
          <div className="label">Menor tarifa vigiada</div>
          <div className="value mono">
            {menorTarifa ? brl(menorTarifa.preco) : "..."}{" "}
            {menorTarifa && <small>{menorTarifa.nome}</small>}
          </div>
        </div>
        <div className="kpi">
          <div className="label">Rotas vigiadas</div>
          <div className="value mono">
            {grupos.size} <small>x {prices.length ? prices.length / grupos.size : 0} datas</small>
          </div>
        </div>
        <div className="kpi">
          <div className="label">Alertas emitidos</div>
          <div className="value mono">{alerts.length}</div>
        </div>
        <div className="kpi">
          <div className="label">Maior bônus ativo</div>
          <div className="value mono">{maiorBonus ? `${maiorBonus}%` : "nenhum"}</div>
        </div>
      </div>

      <section>
        <div className="sec-head">
          <h2>
            <em>01</em> Radar de tarifas
          </h2>
          <span className="hint">preços reais do Google Flights em BRL, saída de GRU, só ida</span>
        </div>
        <div className="routes">
          {[...grupos.values()].map((g) => (
            <RouteCard key={g[0].rota} grupo={g} historico={history} />
          ))}
        </div>
      </section>

      <section>
        <div className="sec-head">
          <h2>
            <em>02</em> Milhas e prêmios
          </h2>
          <span className="hint">formato da Partner API do seats.aero</span>
        </div>
        <div className="demo-banner">
          <span className="badge demo">modo demo</span>
          <span>
            Dados de exemplo pra visualizar a interface. Ao assinar o seats.aero Pro (US$ 9,99/mês),
            a chave da API entra aqui e esta seção passa a mostrar disponibilidade real de assentos
            com milhas em Smiles, TudoAzul, Flying Blue, Aeroplan e mais 20 programas.
          </span>
        </div>
        <div className="awards">
          {awards.disponibilidades.map((a) => (
            <article className="award-card" key={`${a.rota}-${a.programa}`}>
              <div className="prog">{a.programa} · exemplo</div>
              <div className="rt">
                {a.nome} <span className="mono" style={{ color: "var(--text-3)", fontSize: 12 }}>{a.rota}</span>
              </div>
              <div className="miles mono">
                {numero(a.milhas)} <small>milhas + {brl(a.taxas_brl)}</small>
              </div>
              <div className="det">
                {a.cia} · {a.cabine} · {a.assentos} assento{a.assentos > 1 ? "s" : ""} · voo{" "}
                {dataVooCurta(a.data_voo)}
              </div>
            </article>
          ))}
        </div>
      </section>

      <section>
        <div className="sec-head">
          <h2>
            <em>03</em> Bônus de transferência
          </h2>
          <span className="hint">detectado por varredura dos canais públicos de milhas</span>
        </div>
        {bonus.length === 0 ? (
          <div className="empty">nenhum bônus de transferência detectado nas últimas varreduras</div>
        ) : (
          bonus.slice(0, 8).map((b) => (
            <a className="bonus-card" key={b.link} href={b.link} target="_blank" rel="noreferrer">
              <div className="pct mono">{b.pct}%</div>
              <div className="info">
                <div className="progs">
                  {[b.de, b.para].filter(Boolean).join(" → ") || "bônus de pontos"}
                </div>
                <div className="txt">{b.texto}</div>
                <div className="when">
                  {b.fonte} · {tempoRelativo(b.detectado_em)}
                </div>
              </div>
            </a>
          ))
        )}
      </section>

      <div className="two-col">
        <section>
          <div className="sec-head">
            <h2>
              <em>04</em> Promos no radar
            </h2>
            <span className="hint">Melhores Destinos + canais de Telegram</span>
          </div>
          <div className="feed">
            {promos.slice(0, 14).map((p) => (
              <a className="feed-item" key={p.link} href={p.link} target="_blank" rel="noreferrer">
                <div className="src">
                  <span className="tag">{p.tipo === "rss" ? "blog" : "telegram"}</span>
                  <span>{p.fonte}</span>
                  <span>{tempoRelativo(p.publicado_em)}</span>
                </div>
                <div className="tt">{p.titulo}</div>
              </a>
            ))}
          </div>
        </section>

        <section>
          <div className="sec-head">
            <h2>
              <em>05</em> Alertas
            </h2>
            <span className="hint">o que iria pro Telegram</span>
          </div>
          {alerts.length === 0 ? (
            <div className="empty">nenhum alerta emitido ainda</div>
          ) : (
            <div className="feed">
              {alerts.slice(0, 10).map((a, i) => (
                <a className="alert-item" key={`${a.link}-${i}`} href={a.link} target="_blank" rel="noreferrer">
                  <div className="a-title">
                    <span className="k mono">{a.tipo === "preco" ? "R$" : "%"}</span>
                    {a.titulo}
                  </div>
                  <div className="a-det">{a.detalhe}</div>
                  <div className="a-when">{tempoRelativo(a.criado_em)}</div>
                </a>
              ))}
            </div>
          )}
        </section>
      </div>

      <footer>
        <p>
          <strong>Como funciona:</strong> um robô no GitHub Actions roda a cada 3 horas, sem servidor,
          sem IA e sem custo: consulta o Google Flights em BRL, lê o RSS do Melhores Destinos e os
          canais públicos de Telegram, grava o histórico no repositório e este site é reconstruído
          automaticamente. Alertas podem ser roteados pro Telegram via n8n (webhook já embutido no coletor).
        </p>
        <p style={{ marginTop: 8 }}>
          Fontes: Google Flights (biblioteca fast-flights), melhoresdestinos.com.br,
          t.me/melhoresdestinos, t.me/canalpontospravoar, t.me/promopassagens. Preços de passagem são
          da última varredura e podem mudar; confirme sempre no site da companhia. Projeto pessoal,
          sem fins comerciais.
        </p>
      </footer>
    </main>
  );
}
