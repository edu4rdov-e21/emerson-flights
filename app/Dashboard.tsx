"use client";

import { useEffect, useMemo, useState } from "react";
import type {
  Alerta,
  AwardDemo,
  Bonus,
  HistoryPoint,
  Promo,
  RotaCfg,
  Snapshot,
} from "@/lib/data";
import { brl, dataVooCurta, norm, numero, tempoRelativo } from "@/lib/format";

const STORAGE_KEY = "ef-destinos-monitorados";

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
      <path d={d} fill="none" stroke="#5d2a1a" strokeWidth="1.6" strokeLinecap="round" />
      <circle cx={last[0]} cy={last[1]} r="2.6" fill="#5d2a1a" />
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
  // veredito em linguagem simples, ancorado no teto configurado da rota
  const teto = ref.teto_brl;
  const veredito =
    teto == null
      ? null
      : melhor.preco <= teto
        ? { classe: "ok", rotulo: "preço bom agora" }
        : melhor.preco <= teto * 1.25
          ? { classe: "mid", rotulo: "preço normal" }
          : { classe: "high", rotulo: "acima do normal" };
  return (
    <article className="route-card">
      <div className="route-top">
        <div>
          <div className="dest">
            {ref.nome}
            {veredito && <span className={`badge ${veredito.classe}`}>{veredito.rotulo}</span>}
          </div>
          <div className="code mono">
            {ref.de} → {ref.para}
          </div>
        </div>
        <div className="best-price">
          <div className="num mono">{brl(melhor.preco)}</div>
          <div className="cap">indo em {dataVooCurta(melhor.data_voo)}</div>
        </div>
      </div>
      <div className="horizons">
        {grupo
          .slice()
          .sort((a, b) => a.horizonte - b.horizonte)
          .map((s) => (
            <a key={s.horizonte} className="hrow" href={s.link} target="_blank" rel="noreferrer">
              <span className="when mono">{dataVooCurta(s.data_voo)}</span>
              <span className="meta">
                {s.cia} · {s.paradas === 0 ? "voo direto" : `${s.paradas} parada${s.paradas > 1 ? "s" : ""}`}
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
          {teto ? (
            <>
              abaixo de <span className="mono">{brl(teto)}</span> = barato pra essa rota
            </>
          ) : (
            "sem referência de preço definida"
          )}
        </span>
        <a href={melhor.link} target="_blank" rel="noreferrer">
          conferir no Google Flights →
        </a>
      </div>
    </article>
  );
}

function SecHead({ tag, titulo, hint }: { tag: string; titulo: string; hint: string }) {
  return (
    <div className="sec-head">
      <div>
        <div className="sec-tag">{tag}</div>
        <h3>{titulo}</h3>
      </div>
      <span className="hint">{hint}</span>
    </div>
  );
}

export default function Dashboard({
  grupos,
  history,
  promos,
  bonus,
  alerts,
  awards,
  rotasCfg,
}: {
  grupos: Snapshot[][];
  history: HistoryPoint[];
  promos: Promo[];
  bonus: Bonus[];
  alerts: Alerta[];
  awards: AwardDemo;
  rotasCfg: RotaCfg[];
}) {
  const [sel, setSel] = useState<string[]>([]);
  const [hidratado, setHidratado] = useState(false);

  useEffect(() => {
    try {
      const salvo = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
      if (Array.isArray(salvo)) {
        setSel(salvo.filter((r) => rotasCfg.some((c) => c.rota === r)));
      }
    } catch {
      /* primeiro acesso */
    }
    setHidratado(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (hidratado) localStorage.setItem(STORAGE_KEY, JSON.stringify(sel));
  }, [sel, hidratado]);

  const ativo = sel.length > 0;
  const selSet = useMemo(() => new Set(sel), [sel]);

  const toggle = (rota: string) =>
    setSel((s) => (s.includes(rota) ? s.filter((r) => r !== rota) : [...s, rota]));

  const gruposVis = ativo ? grupos.filter((g) => selSet.has(g[0].rota)) : grupos;

  const keywords = useMemo(
    () =>
      rotasCfg
        .filter((r) => selSet.has(r.rota))
        .flatMap((r) => [...r.keywords, r.nome])
        .map(norm),
    [rotasCfg, selSet],
  );

  const promosVis = ativo
    ? promos.filter((p) => {
        const t = norm(p.titulo);
        return keywords.some((k) => t.includes(k));
      })
    : promos;

  // avisos de preco filtram por rota; avisos de bonus valem pra todo destino
  const alertsVis = ativo
    ? alerts.filter((a) => a.tipo !== "preco" || sel.some((r) => a.titulo.includes(r)))
    : alerts;

  const awardsVis = ativo
    ? awards.disponibilidades.filter((a) => {
        const paraSel = new Set(sel.map((r) => r.split("-")[1]));
        return paraSel.has(a.rota.split("-")[1]) || keywords.some((k) => norm(a.nome).includes(k));
      })
    : awards.disponibilidades;

  const flat = gruposVis.flat();
  const menorTarifa = flat.length ? flat.reduce((a, b) => (a.preco <= b.preco ? a : b)) : null;
  const maiorBonus = bonus.length ? Math.max(...bonus.map((b) => b.pct)) : null;

  return (
    <>
      <div className="wrap">
        <div className="filtro" role="group" aria-label="filtro de destinos">
          <span className="flabel">Monitorar destinos:</span>
          <button type="button" className={`chip${ativo ? "" : " on"}`} onClick={() => setSel([])} aria-pressed={!ativo}>
            Todos
          </button>
          {rotasCfg.map((r) => (
            <button
              type="button"
              key={r.rota}
              className={`chip${selSet.has(r.rota) ? " on" : ""}`}
              onClick={() => toggle(r.rota)}
              aria-pressed={selSet.has(r.rota)}
            >
              {r.nome}
            </button>
          ))}
          <span className="fhint">
            {ativo
              ? `mostrando só ${sel.length} destino${sel.length > 1 ? "s" : ""}; preços, promoções e avisos filtrados. Sua escolha fica salva neste navegador.`
              : "escolha um ou mais destinos pra filtrar tudo (preços, promoções e avisos); sua escolha fica salva neste navegador."}
          </span>
        </div>

        <div className="kpis">
          <div className="kpi">
            <div className="label">Passagem mais barata agora</div>
            <div className="value mono">
              {menorTarifa ? brl(menorTarifa.preco) : "..."}{" "}
              {menorTarifa && <small>pra {menorTarifa.nome}</small>}
            </div>
          </div>
          <div className="kpi">
            <div className="label">Destinos vigiados</div>
            <div className="value mono">
              {ativo ? `${sel.length} de ${grupos.length}` : grupos.length}{" "}
              <small>{ativo ? "no filtro" : "em 3 datas cada"}</small>
            </div>
          </div>
          <div className="kpi">
            <div className="label">Avisos do robô</div>
            <div className="value mono">{alertsVis.length}</div>
          </div>
          <div className="kpi">
            <div className="label">Maior bônus de pontos</div>
            <div className="value mono">{maiorBonus ? `${maiorBonus}%` : "nenhum"}</div>
          </div>
        </div>

        <section className="last">
          <SecHead
            tag="01 · Radar"
            titulo="Radar de preços"
            hint="econômica · só ida · 1 adulto · saindo de GRU"
          />
          <p className="sec-desc">
            O menor preço encontrado pra cada destino em três datas de viagem diferentes. O selo
            "preço bom agora" significa que está barato pro padrão da rota, vale abrir o link e
            conferir. Clique em qualquer linha pra ver o voo no Google Flights.
          </p>
          {gruposVis.length === 0 ? (
            <div className="empty">nenhum destino selecionado no filtro</div>
          ) : (
            <div className="routes">
              {gruposVis.map((g) => (
                <RouteCard key={g[0].rota} grupo={g} historico={history} />
              ))}
            </div>
          )}
        </section>
      </div>

      <div className="band">
        <div className="wrap">
          <section>
            <SecHead
              tag="02 · Milhas"
              titulo="Passagens com milhas"
              hint="é aqui que a executiva barata aparece"
            />
            <p className="sec-desc">
              Em vez de pagar em dinheiro, dá pra emitir passagem usando milhas. Esta seção mostra
              onde há assento disponível pagando com milhas, inclusive em classe executiva, que em
              dinheiro custaria R$ 15 mil ou mais. Exemplo de leitura: o card de Lisboa quer dizer
              "existem 2 assentos de executiva na TAP saindo por 110 mil milhas mais R$ 480 de
              taxas".
            </p>
            <div className="demo-banner">
              <span className="badge demo">modo demo</span>
              <span>
                Os cards abaixo são exemplos fictícios, só pra você visualizar a interface. Ao
                assinar o seats.aero Pro (US$ 9,99/mês), esta seção passa a mostrar disponibilidade
                real em Smiles, TudoAzul, Flying Blue, Aeroplan e mais 20 programas.
              </span>
            </div>
            {awardsVis.length === 0 ? (
              <div className="empty">sem exemplos pros destinos filtrados</div>
            ) : (
              <div className="awards">
                {awardsVis.map((a) => (
                  <article className="award-card" key={`${a.rota}-${a.programa}`}>
                    <div className="prog">{a.programa} · exemplo</div>
                    <div className="rt">
                      {a.nome} <span className="code-sm mono">{a.rota}</span>
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
            )}
          </section>
        </div>
      </div>

      <div className="wrap">
        <section className="last">
          <SecHead
            tag="03 · Bônus"
            titulo="Bônus de pontos"
            hint="vale pra qualquer destino, por isso não é filtrado"
          />
          <p className="sec-desc">
            Se você tem pontos no banco ou cartão (Livelo, Esfera), estas promoções fazem eles
            renderem mais na hora de virar milhas de companhia aérea. Regra de bolso: bônus de 80%
            pra cima costuma valer a pena; abaixo disso, melhor esperar a próxima.
          </p>
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
      </div>

      <div className="band">
        <div className="wrap">
          <div className="two-col">
            <section>
              <SecHead
                tag="04 · Promos"
                titulo="Promoções publicadas"
                hint="Melhores Destinos + Telegram"
              />
              <p className="sec-desc">
                O que os maiores sites e canais de promoção do Brasil publicaram nas últimas horas
                {ativo ? ", filtrado pelos destinos que você escolheu" : ", tudo num lugar só"}.
                Clique pra abrir a promoção original.
              </p>
              {promosVis.length === 0 ? (
                <div className="empty">
                  nada publicado recentemente sobre os destinos filtrados; o robô segue varrendo a
                  cada 3 horas
                </div>
              ) : (
                <div className="feed">
                  {promosVis.slice(0, 14).map((p) => (
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
              )}
            </section>

            <section>
              <SecHead tag="05 · Avisos" titulo="Avisos do robô" hint="o resumo do que importa" />
              <p className="sec-desc">
                Quando um preço fura o valor de referência ou aparece um bônus alto, o aviso entra
                aqui (e futuramente chega no Telegram). Preço de passagem muda rápido: confira no
                link antes de comemorar.
              </p>
              {alertsVis.length === 0 ? (
                <div className="empty">nenhum aviso pros destinos filtrados, o robô segue de olho</div>
              ) : (
                <div className="feed">
                  {alertsVis.slice(0, 10).map((a, i) => (
                    <a
                      className="alert-item"
                      key={`${a.link}-${i}`}
                      href={a.link}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <div className="a-title">
                        <span className="k">{a.tipo === "preco" ? "preço" : "bônus"}</span>
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
        </div>
      </div>
    </>
  );
}
