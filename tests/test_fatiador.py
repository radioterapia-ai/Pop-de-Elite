"""O fatiador: o corpus de exemplo dos testes do backend é exatamente o que ele gera do Tratado de exemplo."""

import json
import subprocess
import sys
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
EXEMPLO = RAIZ / "tests" / "fixtures"


def test_corpus_de_exemplo_em_dia_com_o_fatiador(tmp_path):
    guardado = json.loads((EXEMPLO / "corpus" / "indice.json").read_text(encoding="utf-8"))
    subprocess.run([sys.executable, str(RAIZ / "scripts" / "fatiar_tratados.py"),
                    "--origem", str(EXEMPLO / "tratado"), "--destino", str(tmp_path),
                    "--fonte", guardado["fonte"], "--versao", guardado["versao"]],
                   check=True, capture_output=True)
    assert json.loads((tmp_path / "indice.json").read_text(encoding="utf-8")) == guardado, \
        "rode o fatiador no Tratado de exemplo (o comando está no topo de scripts/fatiar_tratados.py)"
    gerados = {p.name: p.read_text(encoding="utf-8") for p in (tmp_path / "secoes").glob("*.md")}
    guardados = {p.name: p.read_text(encoding="utf-8") for p in (EXEMPLO / "corpus" / "secoes").glob("*.md")}
    assert gerados == guardados


def test_fatiador_reconhece_capitulos_secoes_e_tipos():
    indice = json.loads((EXEMPLO / "corpus" / "indice.json").read_text(encoding="utf-8"))
    assert [c["id"] for c in indice["capitulos"]] == ["V1-C00", "V1-C07", "V1-C17", "V1-C20", "V2-C05"]
    tipos = {sid: s["tipo"] for sid, s in indice["secoes"].items()}
    assert tipos["V1-17.3"] == "articulacao" and tipos["V1-20.3"] == "evidencias" and tipos["V1-20.1"] == "conteudo"
    assert all(s["termos"] and s["palavras"] > 0 for s in indice["secoes"].values())
    assert "pulsei" in indice["secoes"]["V1-17.1"]["termos"], "o radical tem 6 letras, sem acento"
