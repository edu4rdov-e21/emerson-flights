"""Emerson Flights - coletor.

Roda de forma deterministica (sem IA): consulta o Google Flights via
fast-flights, le o RSS do Melhores Destinos e os previews publicos de
canais de Telegram, detecta deals e bonus de transferencia, grava tudo
em data/*.json e (opcional) dispara um webhook pro n8n.

Uso: python collector/collect.py
Env opcional: N8N_WEBHOOK_URL (POST com os alertas da rodada)
"""

import html
import json
import os
import re
import sys
import time
import traceback
import urllib.request
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from statistics import median

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
CONFIG = json.loads((ROOT / "config" / "routes.json").read_text(encoding="utf-8"))

UA = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36"
}

HISTORY_CAP = 8000
PROMO_CAP = 120
BONUS_CAP = 60
ALERT_CAP = 200

PROGRAMAS_ORIGEM = [
    "Livelo", "Esfera", "Átomos", "Atomos", "Iupp", "Membership Rewards",
    "Curtaí", "Curtai", "Sicredi", "BB", "Genial", "BTG", "XP", "C6",
]
PROGRAMAS_DESTINO = [
    "Smiles", "LATAM Pass", "Latam Pass", "TudoAzul", "Azul Fidelidade",
    "AAdvantage", "Flying Blue", "Aeroplan", "Iberia Plus", "Avios",
    "Qatar", "Emirates", "Miles&Smiles", "MileagePlus", "TAP Miles&Go",
]


def now_utc() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def fetch(url: str, timeout: int = 30) -> str:
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read().decode("utf-8", "ignore")


def load_json(path: Path, default):
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (FileNotFoundError, json.JSONDecodeError):
        return default


def save_json(path: Path, obj) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(obj, ensure_ascii=False, indent=1) + "\n", encoding="utf-8"
    )


# ---------------------------------------------------------------- precos


def google_flights_link(de: str, para: str, dia: str) -> str:
    return (
        "https://www.google.com/travel/flights?hl=pt-BR&curr=BRL"
        f"&q=Flights%20from%20{de}%20to%20{para}%20on%20{dia}"
    )


def coletar_precos():
    """Menor preco por rota x horizonte via fast-flights (Google Flights)."""
    from fast_flights import FlightQuery, Passengers, create_query, get_flights

    rodada = now_utc()  # carimbo unico da varredura (agrupa o historico por rodada)
    snapshots, erros = [], []
    for rota in CONFIG["rotas"]:
        for horizonte in CONFIG["horizontes_dias"]:
            dia = (date.today() + timedelta(days=horizonte)).isoformat()
            try:
                q = create_query(
                    flights=[
                        FlightQuery(
                            date=dia, from_airport=rota["de"], to_airport=rota["para"]
                        )
                    ],
                    seat=CONFIG.get("cabine", "economy"),
                    trip="one-way",
                    passengers=Passengers(adults=1),
                    currency="BRL",
                    language="pt-BR",
                )
                resultados = [f for f in get_flights(q) if f.price]
                if not resultados:
                    raise ValueError("sem voos com preco")
                melhor = min(resultados, key=lambda f: f.price)
                paradas = max(len(melhor.flights) - 1, 0)
                duracao = sum(s.duration or 0 for s in melhor.flights)
                snapshots.append(
                    {
                        "rota": f"{rota['de']}-{rota['para']}",
                        "de": rota["de"],
                        "para": rota["para"],
                        "nome": rota["nome"],
                        "teto_brl": rota.get("teto_brl"),
                        "data_voo": dia,
                        "horizonte": horizonte,
                        "preco": melhor.price,
                        "cia": ", ".join(melhor.airlines),
                        "paradas": paradas,
                        "duracao_min": duracao,
                        "link": google_flights_link(rota["de"], rota["para"], dia),
                        "coletado_em": rodada,
                    }
                )
            except Exception as e:  # noqa: BLE001 - rota que falha nao derruba a coleta
                erros.append(f"{rota['de']}-{rota['para']} +{horizonte}d: {e}")
            time.sleep(1.5)
    return snapshots, erros


# ------------------------------------------------------- fontes editoriais


def coletar_rss():
    """Posts do feed RSS (Melhores Destinos)."""
    itens, erros = [], []
    for feed in CONFIG.get("rss", []):
        try:
            xml = fetch(feed)
            blocos = re.findall(r"<item>(.*?)</item>", xml, re.S)
            for b in blocos:
                titulo = re.search(r"<title>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?</title>", b, re.S)
                link = re.search(r"<link>(.*?)</link>", b, re.S)
                pub = re.search(r"<pubDate>(.*?)</pubDate>", b, re.S)
                cats = re.findall(r"<category>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?</category>", b, re.S)
                if not (titulo and link):
                    continue
                itens.append(
                    {
                        "fonte": "melhoresdestinos.com.br",
                        "tipo": "rss",
                        "titulo": html.unescape(titulo.group(1).strip()),
                        "link": link.group(1).strip(),
                        "publicado_em": pub.group(1).strip() if pub else None,
                        "categorias": [html.unescape(c) for c in cats][:4],
                    }
                )
        except Exception as e:  # noqa: BLE001
            erros.append(f"rss {feed}: {e}")
    return itens, erros


TG_MSG_RE = re.compile(
    r'data-post="([^"]+)".*?tgme_widget_message_text[^>]*>(.*?)</div>.*?'
    r'<time datetime="([^"]+)"',
    re.S,
)


def limpar_html(trecho: str) -> str:
    trecho = re.sub(r"<br\s*/?>", "\n", trecho)
    trecho = re.sub(r"<[^>]+>", "", trecho)
    return html.unescape(trecho).strip()


def coletar_telegram():
    """Mensagens recentes dos previews publicos t.me/s/<canal>."""
    msgs, erros = [], []
    for canal in CONFIG.get("canais_telegram", []):
        try:
            pagina = fetch(f"https://t.me/s/{canal}")
            for post, corpo, quando in TG_MSG_RE.findall(pagina):
                texto = limpar_html(corpo)
                if len(texto) < 15:
                    continue
                msgs.append(
                    {
                        "fonte": f"t.me/{canal}",
                        "tipo": "telegram",
                        "canal": canal,
                        "titulo": texto[:280],
                        "link": f"https://t.me/{post}",
                        "publicado_em": quando,
                    }
                )
        except Exception as e:  # noqa: BLE001
            erros.append(f"telegram {canal}: {e}")
    return msgs, erros


BONUS_RE = re.compile(r"(\d{2,3})\s?%", re.U)


def detectar_bonus(mensagens):
    """Bonus de transferencia: mensagem com %, programa de origem e destino."""
    achados, vistos = [], set()
    for m in mensagens:
        texto = m["titulo"]
        if not re.search(r"b[oô]nus|transfer[eê]ncia|pontos", texto, re.I):
            continue
        pcts = [int(p) for p in BONUS_RE.findall(texto) if 20 <= int(p) <= 400]
        if not pcts:
            continue
        origem = next((p for p in PROGRAMAS_ORIGEM if p.lower() in texto.lower()), None)
        destino = next((p for p in PROGRAMAS_DESTINO if p.lower() in texto.lower()), None)
        if not (origem or destino):
            continue
        chave = (max(pcts), origem, destino)
        if chave in vistos:
            continue
        vistos.add(chave)
        achados.append(
            {
                "pct": max(pcts),
                "de": origem,
                "para": destino,
                "texto": texto[:220],
                "fonte": m["fonte"],
                "link": m["link"],
                "publicado_em": m.get("publicado_em"),
                "detectado_em": now_utc(),
            }
        )
    return achados


# ------------------------------------------------------------------ regras


def montar_alertas(snapshots, historico, bonus_novos):
    """Diff + regras: teto fixo, queda vs mediana historica, bonus alto.

    Anti-spam: um (rota, data_voo) so alerta de novo se o preco cair
    pelo menos 5% abaixo do ultimo preco ja alertado.
    """
    cfg = CONFIG["alerta"]
    alertas = []

    hoje = date.today().isoformat()
    estado = {
        k: v
        for k, v in load_json(DATA / "alert-state.json", {}).items()
        if k.split("|")[-1] >= hoje
    }

    por_rota = {}
    for h in historico:
        por_rota.setdefault(h["rota"], []).append(h["preco"])

    for s in snapshots:
        motivo = None
        serie = por_rota.get(s["rota"], [])
        if s["teto_brl"] and s["preco"] <= s["teto_brl"]:
            motivo = f"abaixo do teto de R$ {s['teto_brl']}"
        elif len(serie) >= cfg["minimo_pontos_historico"]:
            base = median(serie)
            queda = (1 - s["preco"] / base) * 100
            if queda >= cfg["queda_percentual_minima"]:
                motivo = f"{queda:.0f}% abaixo da mediana historica (R$ {base:.0f})"
        if not motivo:
            continue
        chave = f"{s['rota']}|{s['data_voo']}"
        ja_alertado = estado.get(chave)
        if ja_alertado is not None and s["preco"] > ja_alertado * 0.95:
            continue
        estado[chave] = s["preco"]
        alertas.append(
            {
                "tipo": "preco",
                "titulo": f"{s['nome']} ({s['rota']}) por R$ {s['preco']}",
                "detalhe": f"{s['cia']}, {s['paradas']} parada(s), voo {s['data_voo']}. Motivo: {motivo}.",
                "link": s["link"],
                "criado_em": now_utc(),
            }
        )
    save_json(DATA / "alert-state.json", estado)

    for b in bonus_novos:
        if b["pct"] >= cfg["bonus_minimo_pct"]:
            rotulo = " -> ".join(x for x in [b["de"], b["para"]] if x)
            alertas.append(
                {
                    "tipo": "bonus",
                    "titulo": f"Bonus de {b['pct']}%" + (f" ({rotulo})" if rotulo else ""),
                    "detalhe": b["texto"],
                    "link": b["link"],
                    "criado_em": now_utc(),
                }
            )
    return alertas


def disparar_webhook(alertas):
    """POST pro n8n (ou qualquer webhook) quando configurado."""
    url = os.environ.get("N8N_WEBHOOK_URL")
    if not url or not alertas:
        return "desligado" if not url else "sem alertas"
    corpo = json.dumps({"app": "emerson-flights", "alertas": alertas}).encode()
    req = urllib.request.Request(
        url, data=corpo, headers={"Content-Type": "application/json"}, method="POST"
    )
    with urllib.request.urlopen(req, timeout=30) as r:
        return f"enviado ({r.status})"


# -------------------------------------------------------------------- main


def dedup(itens, chave):
    vistos, unicos = set(), []
    for i in itens:
        k = chave(i)
        if k not in vistos:
            vistos.add(k)
            unicos.append(i)
    return unicos


def main() -> int:
    inicio = time.time()
    status = {}

    snapshots, erros_precos = coletar_precos()
    status["precos"] = {"ok": bool(snapshots), "itens": len(snapshots), "erros": erros_precos}

    rss, erros_rss = coletar_rss()
    tg, erros_tg = coletar_telegram()
    status["rss"] = {"ok": bool(rss), "itens": len(rss), "erros": erros_rss}
    status["telegram"] = {"ok": bool(tg), "itens": len(tg), "erros": erros_tg}

    # precos: snapshot atual + historico acumulado (base das medianas/sparklines)
    if snapshots:
        save_json(DATA / "prices.json", snapshots)
        historico = load_json(DATA / "history.json", [])
        historico += [
            {"ts": s["coletado_em"], "rota": s["rota"], "data_voo": s["data_voo"], "preco": s["preco"]}
            for s in snapshots
        ]
        save_json(DATA / "history.json", historico[-HISTORY_CAP:])
    else:
        historico = load_json(DATA / "history.json", [])

    # promos: merge com as ja conhecidas, mais novas primeiro
    promos_antigas = load_json(DATA / "promos.json", [])
    promos = dedup(rss + tg + promos_antigas, lambda p: p["link"])[:PROMO_CAP]
    save_json(DATA / "promos.json", promos)

    # bonus: so os detectados agora que ainda nao existiam (mesmo pct/programas
    # visto nos ultimos 14 dias, em qualquer fonte, conta como repetido)
    bonus_antigos = load_json(DATA / "bonus.json", [])
    corte = (datetime.now(timezone.utc) - timedelta(days=14)).isoformat()
    recentes = {
        (b["pct"], b.get("de"), b.get("para"))
        for b in bonus_antigos
        if b.get("detectado_em", "") >= corte
    }
    bonus_novos = [
        b
        for b in detectar_bonus(rss + tg)
        if (b["pct"], b["de"], b["para"]) not in recentes
    ]
    save_json(DATA / "bonus.json", (bonus_novos + bonus_antigos)[:BONUS_CAP])
    status["bonus"] = {"ok": True, "itens": len(bonus_novos)}

    # alertas + webhook opcional (n8n)
    alertas = montar_alertas(snapshots, historico, bonus_novos)
    alertas_antigos = load_json(DATA / "alerts.json", [])
    save_json(DATA / "alerts.json", (alertas + alertas_antigos)[:ALERT_CAP])
    try:
        status["webhook"] = disparar_webhook(alertas)
    except Exception as e:  # noqa: BLE001
        status["webhook"] = f"erro: {e}"

    save_json(
        DATA / "meta.json",
        {
            "gerado_em": now_utc(),
            "duracao_s": round(time.time() - inicio, 1),
            "alertas_na_rodada": len(alertas),
            "fontes": status,
        },
    )
    print(json.dumps(status, ensure_ascii=False, indent=2))
    # fracasso total de precos = job vermelho no Actions; parcial passa
    return 0 if snapshots else 1


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception:
        traceback.print_exc()
        sys.exit(1)
