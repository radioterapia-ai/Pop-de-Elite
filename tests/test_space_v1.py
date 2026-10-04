"""App do 1.0 (Space Radioterapia-AI/POP): as mesmas telas, montando com o motor 2.0."""

import importlib.util
import json
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
EXEMPLOS = RAIZ / "exemplos"


def carregar_app():
    spec = importlib.util.spec_from_file_location("app_v1", RAIZ / "space_v1" / "app.py")
    modulo = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(modulo)
    return modulo


def texto(nome):
    return (EXEMPLOS / nome).read_text(encoding="utf-8")


def test_colar_codigo_das_gemas_gera_os_tres_arquivos(monkeypatch):
    monkeypatch.setenv("POP_SEM_IMAGENS", "1")
    app = carregar_app()
    colado = "Aqui está o código:\n```json\n" + texto("pop_linac_manutencao.json") + "\n```\nBom trabalho!"
    caminho, info, meta = app.processar(colado, "#1F6F5C", "", "", "", None)
    assert caminho and caminho.endswith(".docx") and Path(caminho).exists(), info
    assert meta.get("codigo") == "POP-RTX-014"
    caminho, info, _ = app.processar_excel(texto("planilha_linac_manutencao.json"), "", "", "", "", None)
    assert caminho and caminho.endswith(".xlsx"), info
    caminho, info, _ = app.processar_ppt(texto("ppt_linac_manutencao.json"), "#283264", "", "", "", None)
    assert caminho and caminho.endswith(".pptx"), info


def test_codigo_vazio_ou_invalido_mostra_aviso_sem_quebrar():
    app = carregar_app()
    assert app.processar("", "", "", "", "", None)[0] is None
    caminho, info, _ = app.processar_excel("isto não é JSON", "", "", "", "", None)
    assert caminho is None and info.startswith("❌")


def test_ppt_em_partes_e_fundido():
    app = carregar_app()
    dados = json.loads(texto("ppt_linac_manutencao.json"))
    metade = len(dados["slides"]) // 2
    parte1 = dict(dados, slides=dados["slides"][:metade])
    parte2 = {"slides": dados["slides"][metade:]}
    colado = json.dumps(parte1, ensure_ascii=False) + "\n\n" + json.dumps(parte2, ensure_ascii=False)
    caminho, info, _ = app.processar_ppt(colado, "", "", "", "", None)
    from pptx import Presentation
    assert len(Presentation(caminho).slides) == len(dados["slides"]), info


def test_colar_tcle_monta_o_texto_institucional(monkeypatch):
    monkeypatch.setenv("POP_SEM_IMAGENS", "1")
    app = carregar_app()
    colado = "```json\n" + texto("cons_tcle_endoscopia.json") + "\n```"
    caminho, info, meta = app.processar(colado, "#283264", "", "", "", None)
    assert caminho and caminho.endswith(".docx") and Path(caminho).exists(), info
    assert Path(caminho).name.startswith("CONS-END-001_")
