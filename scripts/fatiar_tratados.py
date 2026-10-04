#!/usr/bin/env python3
"""Fatia os Tratados em seções e gera o índice que o agente consulta.

    python scripts/fatiar_tratados.py            # lê tratados/*.md, grava site/pop-de-elite/corpus/
    python scripts/fatiar_tratados.py --origem tests/fixtures/tratado --destino tests/fixtures/corpus \
        --fonte "Tratado de exemplo (fictício, só para os testes)" --versao 2026-10-04
                                                 # o corpus de exemplo dos testes

Saída (arquivos estáticos, publicados junto com a página no site):
    corpus/indice.json          capítulos, seções, nº de palavras e termos-chave
    corpus/secoes/<ID>.md       texto de cada seção (ex.: V1-17.3.md)

O agente nunca recebe os livros inteiros: na conversa ele vê só a lista de
capítulos; na hora de gerar, o backend busca as seções mais relevantes dos
capítulos escolhidos, dentro de um orçamento de palavras.
"""

import argparse
import json
import math
import re
import sys
import unicodedata
from collections import Counter
from datetime import date
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent

STOP = set("""
a o e de da do das dos em no na nos nas um uma uns umas para por pelo pela pelos pelas com sem
sob sobre entre ate apos ante como que qual quais quando onde se ao aos as os ou mas nem ja nao
sim seu sua seus suas este esta estes estas esse essa esses essas isto isso aquele aquela deve
devem pode podem ser sao sera foi forem estar esta estao ter tem tendo sendo cada todo toda todos
todas mais menos muito muita tambem bem assim ainda porem pois portanto tanto quanto outro outra
outros outras mesmo mesma mediante conforme segundo atraves partir desde contra durante fim meio
tipo forma modo caso casos parte partes nivel niveis ambito sistema sistemas processo processos
institucional institucionais instituicao pessoa atendida atendidas pessoas documento documentos
elaboracao articulacao objetiva objetivas evidencia evidencias auditoria marco conceitual
""".split())


def normalizar(texto):
    t = unicodedata.normalize("NFD", texto.lower())
    return "".join(c for c in t if unicodedata.category(c) != "Mn")


def termos(texto):
    """Tokens normalizados com um radical simples (sem 's' final, 6 letras)."""
    saida = []
    for tok in re.findall(r"[a-z0-9]+", normalizar(texto)):
        if len(tok) < 4 or tok in STOP or tok.isdigit():
            continue
        saida.append(tok.rstrip("s")[:6])
    return saida


def ler_volume(caminho, vol):
    """Lista de capítulos: {numero, titulo, secoes: [{numero, titulo, texto}]}."""
    linhas = caminho.read_text(encoding="utf-8").splitlines()
    capitulos = [{"numero": 0, "titulo": "Apresentação do volume", "secoes": []}]
    atual_sec = None

    def nova_secao(numero, titulo):
        nonlocal atual_sec
        atual_sec = {"numero": numero, "titulo": titulo, "linhas": []}
        capitulos[-1]["secoes"].append(atual_sec)

    for linha in linhas:
        m_cap = re.match(r"^# CAP[ÍI]TULO\s+(\d+)\s*[—–-]\s*(.+?)\s*$", linha)
        m_sec = re.match(r"^## (\d+)\.(\d+)\s+(.+?)\s*$", linha)
        if m_cap:
            capitulos.append({"numero": int(m_cap.group(1)),
                              "titulo": titulo_bonito(m_cap.group(2).strip()), "secoes": []})
            atual_sec = None
            continue
        if m_sec:
            nova_secao(f"{m_sec.group(1)}.{m_sec.group(2)}", m_sec.group(3).strip())
            atual_sec["linhas"].append(linha)
            continue
        if linha.startswith("## ") and capitulos[-1]["numero"] == 0:
            n = len(capitulos[0]["secoes"]) + 1
            nova_secao(f"0.{n}", titulo_bonito(linha[3:].strip()))
            atual_sec["linhas"].append(linha)
            continue
        if atual_sec is not None:
            atual_sec["linhas"].append(linha)
    for cap in capitulos:
        for s in cap["secoes"]:
            s["texto"] = "\n".join(s.pop("linhas")).strip()
    return [c for c in capitulos if c["secoes"]]


MINUSCULAS = {"a", "o", "e", "de", "da", "do", "das", "dos", "em", "na", "no", "nas", "nos",
              "ao", "aos", "à", "às", "para", "com", "por", "pela", "pelo", "entre", "sobre"}


def titulo_bonito(texto):
    """'METAS INTERNACIONAIS DE SEGURANÇA' → 'Metas Internacionais de Segurança'."""
    palavras = texto.lower().split()
    return " ".join(p if (i and p in MINUSCULAS) else p[:1].upper() + p[1:]
                    for i, p in enumerate(palavras))


def tipo_secao(titulo):
    t = normalizar(titulo)
    if "articulacao com a elaboracao de documentos" in t:
        return "articulacao"
    if "evidencias objetivas" in t:
        return "evidencias"
    if "indice" in t:
        return "indice"
    return "conteudo"


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--origem", default=str(RAIZ / "tratados"))
    ap.add_argument("--destino", default=str(RAIZ / "site" / "pop-de-elite" / "corpus"))
    ap.add_argument("--termos", type=int, default=25, help="termos-chave por seção")
    ap.add_argument("--fonte", default="Tratado Integrado da Qualidade — Volumes 1 e 2")
    ap.add_argument("--versao", default=date.today().isoformat(), help="data no índice (AAAA-MM-DD)")
    args = ap.parse_args()
    sys.stdout.reconfigure(encoding="utf-8")

    origem, destino = Path(args.origem), Path(args.destino)
    pasta_secoes = destino / "secoes"
    pasta_secoes.mkdir(parents=True, exist_ok=True)
    for antigo in pasta_secoes.glob("*.md"):
        antigo.unlink()

    volumes = sorted(origem.glob("*VOLUME*.md"))
    if not volumes:
        raise SystemExit(f"Nenhum tratado em {origem}")

    indice = {"versao": args.versao,
              "fonte": args.fonte,
              # GUARDA: o backend (cloudflare/pop/corpus.js) usa a mesma lista e o mesmo radical para pontuar as seções
              "radical": {"min_letras": 4, "letras": 6, "stop": sorted(STOP)},
              "capitulos": [], "secoes": {}}
    docs = {}
    for vol_n, caminho in enumerate(volumes, 1):
        for cap in ler_volume(caminho, vol_n):
            cap_id = f"V{vol_n}-C{cap['numero']:02d}"
            ids = []
            for s in cap["secoes"]:
                sid = f"V{vol_n}-{s['numero']}"
                # GUARDA: sempre LF; no Windows o padrão é CRLF, e o backend corta o título da seção por \n
                (pasta_secoes / f"{sid}.md").write_text(s["texto"] + "\n", encoding="utf-8", newline="\n")
                palavras = len(s["texto"].split())
                indice["secoes"][sid] = {"cap": cap_id, "titulo": f"{s['numero']} {s['titulo']}",
                                         "palavras": palavras, "tipo": tipo_secao(s["titulo"])}
                docs[sid] = termos(s["titulo"] + " " + s["titulo"] + " " + s["texto"])
                ids.append(sid)
            indice["capitulos"].append({
                "id": cap_id, "volume": vol_n, "numero": cap["numero"], "titulo": cap["titulo"],
                "palavras": sum(indice["secoes"][i]["palavras"] for i in ids), "secoes": ids})

    n_docs = len(docs)
    df = Counter()
    for toks in docs.values():
        df.update(set(toks))
    for sid, toks in docs.items():
        tf = Counter(toks)
        pesos = {t: (c / len(toks)) * math.log(n_docs / (1 + df[t])) for t, c in tf.items()}
        indice["secoes"][sid]["termos"] = [t for t, _ in sorted(pesos.items(), key=lambda kv: -kv[1])[:args.termos]]

    (destino / "indice.json").write_text(json.dumps(indice, ensure_ascii=False, separators=(",", ":")),
                                         encoding="utf-8", newline="\n")
    total = sum(s["palavras"] for s in indice["secoes"].values())
    print(f"{len(indice['capitulos'])} capítulos, {len(indice['secoes'])} seções, {total} palavras → {destino}")


if __name__ == "__main__":
    main()
