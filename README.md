# Emerson Flights

Monitor pessoal de passagens aéreas baratas, promoções e condições especiais com milhas.
Projeto hobby, sem fins comerciais.

## Como funciona

```
GitHub Actions (cron a cada 3h, gratuito, sem servidor e sem IA)
  └─ collector/collect.py
       ├─ Google Flights via fast-flights (preços reais em BRL)
       ├─ RSS do Melhores Destinos
       ├─ previews públicos t.me/s (melhoresdestinos, canalpontospravoar, promopassagens)
       ├─ detecção de bônus de transferência (regex de % + programas)
       ├─ motor de alertas (teto por rota, queda vs mediana histórica, bônus alto)
       └─ grava data/*.json e commita → Vercel rebuilda o site
```

O site (Next.js na Vercel) é só a vitrine: lê os JSONs de `data/` no build.

## Configurar rotas e limiares

Tudo em [config/routes.json](config/routes.json): rotas vigiadas, teto de alerta por rota,
horizontes de busca (dias à frente), percentual mínimo de queda e bônus mínimo.

## Alertas no Telegram via n8n

O coletor já dispara um webhook com os alertas de cada rodada quando a env
`N8N_WEBHOOK_URL` existe (secret do repositório). No n8n: Webhook → Telegram.
Payload:

```json
{ "app": "emerson-flights", "alertas": [{ "tipo": "preco", "titulo": "...", "detalhe": "...", "link": "..." }] }
```

## Milhas (seats.aero)

A seção de milhas do site está em **modo demo** (dados de exemplo no formato da
Partner API do seats.aero). Ao assinar o seats.aero Pro, gerar a chave na aba API
e plugar um coletor `collector/awards.py` usando `GET https://seats.aero/partnerapi/search`
(header `Partner-Authorization`), limite de 1.000 calls/dia, uso pessoal.

## Rodar local

```bash
pip install -r collector/requirements.txt
python collector/collect.py   # coleta real, grava data/
npm install && npm run dev    # site em localhost:4210
```
