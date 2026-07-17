import Dashboard from "@/app/Dashboard";
import { loadAll, type Snapshot } from "@/lib/data";
import { horaSp } from "@/lib/format";

export const dynamic = "force-static";

export default function Home() {
  const { prices, history, promos, bonus, alerts, meta, awards, rotasCfg } = loadAll();

  const gruposMap = new Map<string, Snapshot[]>();
  for (const s of prices) {
    gruposMap.set(s.rota, [...(gruposMap.get(s.rota) ?? []), s]);
  }
  const grupos = [...gruposMap.values()];
  const fontes = (meta.fontes ?? {}) as Record<string, { ok?: boolean }>;

  return (
    <main>
      <div className="wrap">
        <div className="topbar">
          <div className="brand">
            <span className="brand-glyph">✈</span>
            <h1>
              Emerson <span>Flights</span>
            </h1>
          </div>
          <div className="status-line">
            <span className={`dot${fontes.precos?.ok ? "" : " off"}`}>Google Flights</span>
            <span className={`dot${fontes.rss?.ok ? "" : " off"}`}>Melhores Destinos</span>
            <span className={`dot${fontes.telegram?.ok ? "" : " off"}`}>Telegram</span>
            <span className="mono">última varredura {horaSp(meta.gerado_em)}</span>
          </div>
        </div>

        <div className="hero">
          <h2>
            O robô que vigia <em>passagem barata</em> por você.
          </h2>
          <p>
            A cada 3 horas, um robô consulta o Google Flights e anota o menor preço de passagem{" "}
            <strong>só ida, em classe econômica, para 1 adulto</strong>, saindo de São Paulo (GRU)
            para {grupos.length || 6} destinos. Ele também lê os maiores canais de promoção de
            passagens e milhas do Brasil. Quando encontra preço abaixo do considerado barato pra
            rota, acende um alerta. Você não precisa fazer nada: o site se atualiza sozinho.
          </p>
        </div>

        <details className="glossario">
          <summary>Novo por aqui? Entenda os termos em 1 minuto</summary>
          <dl>
            <dt>Preço bom, normal ou acima do normal</dt>
            <dd>
              Cada destino tem um valor de referência do que é "barato" (ex.: Lisboa abaixo de R$
              3.000). O selo "preço bom agora" significa que vale a pena olhar já.
            </dd>
            <dt>Milhas</dt>
            <dd>
              Pontos de programas de fidelidade (Smiles, TudoAzul, Latam Pass) que trocam por
              passagem. Emitir com milhas costuma ser o único jeito de voar de executiva sem pagar
              R$ 15 mil ou mais.
            </dd>
            <dt>Econômica x executiva</dt>
            <dd>
              Econômica é a classe comum. Executiva é a premium, com assento que vira cama. O radar
              de preços acompanha a econômica em dinheiro; a seção de milhas é onde executiva barata
              aparece.
            </dd>
            <dt>Bônus de transferência</dt>
            <dd>
              Promoção em que os pontos do banco ou cartão (Livelo, Esfera) rendem mais ao serem
              transferidos pra companhia aérea. Com 100% de bônus, 10 mil pontos viram 20 mil
              milhas, ou seja, sua passagem sai pela metade dos pontos.
            </dd>
            <dt>Varredura</dt>
            <dd>Cada rodada do robô, de 3 em 3 horas. O horário da última aparece no topo.</dd>
          </dl>
        </details>
      </div>

      <Dashboard
        grupos={grupos}
        history={history}
        promos={promos}
        bonus={bonus}
        alerts={alerts}
        awards={awards}
        rotasCfg={rotasCfg}
      />

      <div className="wrap">
        <footer>
          <p>
            <strong>Como funciona:</strong> um robô no GitHub Actions roda a cada 3 horas, sem
            servidor, sem IA e sem custo: consulta o Google Flights em BRL, lê o RSS do Melhores
            Destinos e os canais públicos de Telegram, grava o histórico no repositório e este site
            é reconstruído automaticamente. Alertas podem ser roteados pro Telegram via n8n (webhook
            já embutido no coletor).
          </p>
          <p style={{ marginTop: 8 }}>
            Fontes: Google Flights (biblioteca fast-flights), melhoresdestinos.com.br,
            t.me/melhoresdestinos, t.me/canalpontospravoar, t.me/promopassagens. Preços de passagem
            são da última varredura e podem mudar; confirme sempre no site da companhia. Projeto
            pessoal, sem fins comerciais.
          </p>
        </footer>
      </div>
    </main>
  );
}
