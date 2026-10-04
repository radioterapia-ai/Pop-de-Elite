#!/usr/bin/env python3
"""Gera os modelos de demonstração (modelos/) a partir dos JSONs de exemplos/.

    python scripts/gerar_modelos.py            # com imagens da web nos slides (precisa de internet)
    POP_SEM_IMAGENS=1 python scripts/gerar_modelos.py   # slides com imagens ilustrativas locais
"""

import json
import sys
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(RAIZ))

from motor import gerar_excel, gerar_ppt, gerar_word  # noqa: E402

MODELOS = [
    ("exemplo_pop.json", gerar_word, {}),
    ("pop_linac_manutencao.json", gerar_word, {}),
    ("planilha_linac_manutencao.json", gerar_excel, {}),
    ("ppt_linac_manutencao.json", gerar_ppt, {"estilo": "cientifico"}),
]


def main():
    destino = RAIZ / "modelos"
    destino.mkdir(exist_ok=True)
    for nome, gerar, extra in MODELOS:
        dados = json.loads((RAIZ / "exemplos" / nome).read_text(encoding="utf-8"))
        caminho = Path(gerar(dados, pasta=str(destino), cor="#283264", **extra))
        print(f"{nome:34} → modelos/{caminho.name} ({caminho.stat().st_size // 1024} KB)")


if __name__ == "__main__":
    main()
