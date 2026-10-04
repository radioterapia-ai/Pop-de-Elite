"""Testes dos diagramas (fluxograma BPMN estilo Bizagi, ciclo, hierarquia, pirâmide)."""

import itertools
import json
from pathlib import Path

import pytest
from PIL import Image

from motor import diagramas as dg
from motor.base import paleta

EXEMPLOS = Path(__file__).resolve().parent.parent / "exemplos"
PAL = paleta("#283264")


def fluxograma(nome):
    dados = json.loads((EXEMPLOS / nome).read_text(encoding="utf-8"))
    return next(a for a in dados["secoes"]["anexos"] if a["tipo"] == "fluxograma")


def ligacoes(f):
    return {(a.origem, a.destino, a.sentido) for a in f.arestas}


def test_formato_antigo_segue_a_heuristica_da_versao_1():
    antigo = [{"texto": "Manutenção concluída", "forma": "elipse"}, {"texto": "Constância dentro de 2%?", "forma": "losango"},
              {"texto": "Liberar", "forma": "retangulo"}, {"texto": "Manter bloqueio", "forma": "retangulo"},
              {"texto": "Reabrir agenda", "forma": "elipse"}, {"texto": "Acionar fabricante", "forma": "retangulo"}]
    f = dg.montar_fluxo(antigo)
    assert [n.tipo for n in f.nos[:6]] == ["inicio", "decisao", "tarefa", "tarefa", "fim", "tarefa"]
    assert {("n1", "n2", ""), ("n2", "n3", "sim"), ("n2", "n4", "nao"), ("n3", "n5", ""), ("n4", "n6", "")} <= ligacoes(f)
    assert any(n.tipo == "fim" and n.implicito for n in f.nos)


def test_formato_novo_com_ramos_e_retorno():
    a = fluxograma("exemplo_pop.json")
    f = dg.montar_fluxo(a["conteudo"], a["raias"])
    lig = ligacoes(f)
    assert ("d1", "t3", "sim") in lig and ("d1", "t6", "nao") in lig
    assert ("t5", "t3", "") in lig
    assert ("t4", "t5", "") not in lig
    assert f.raias == a["raias"]
    assert {n.raia for n in f.nos} <= set(a["raias"])
    L = dg.layout_fluxo(f, horizontal=False)
    assert any(x.retorno for x in f.arestas)


@pytest.mark.parametrize("horizontal", [True, False])
def test_layout_sem_sobreposicao(horizontal):
    for nome in ("exemplo_pop.json", "pop_linac_manutencao.json"):
        a = fluxograma(nome)
        f = dg.montar_fluxo(a["conteudo"], a.get("raias"))
        dg.layout_fluxo(f, horizontal=horizontal)
        caixas = []
        for n in f.nos:
            hm, hc = dg._forma(n, horizontal)
            caixas.append((n.id, n.m - hm, n.c - hc, n.m + hm, n.c + hc))
        for (ia, a0, b0, a1, b1), (ib, c0, d0, c1, d1) in itertools.combinations(caixas, 2):
            assert a1 <= c0 or c1 <= a0 or b1 <= d0 or d1 <= b0, f"{nome}: {ia} sobrepõe {ib}"
        for x in f.arestas:
            for (m0, c0), (m1, c1) in zip(x.pontos, x.pontos[1:]):
                assert abs(m0 - m1) < 0.01 or abs(c0 - c1) < 0.01


def test_fluxo_png_cabe_na_area(tmp_path):
    a = fluxograma("exemplo_pop.json")
    caminho, w, h = dg.fluxo_png(a["conteudo"], PAL, str(tmp_path), raias=a["raias"], titulo=a["titulo"],
                                 largura_cm=15.4, altura_cm=15.2)
    assert w <= 15.4 + 0.01 and h <= 15.2 + 0.01
    with Image.open(caminho) as img:
        assert img.format == "PNG" and img.width >= 800


@pytest.mark.parametrize("funcao, conteudo", [
    (dg.ciclo_png, ["Planejar", "Executar", "Checar", "Agir"]),
    (dg.piramide_png, ["Eliminação", "Engenharia", "Administrativo", "EPI"]),
    (dg.hierarquia_png, [{"titulo": "Direção", "subitens": ["Física Médica", "Enfermagem"]}, {"titulo": "Qualidade", "subitens": ["Riscos"]}]),
    (dg.hierarquia_png, ["Notificar", "Analisar", "Agir"]),
])
def test_outros_diagramas(tmp_path, funcao, conteudo):
    caminho, w, h = funcao(conteudo, PAL, str(tmp_path))
    with Image.open(caminho) as img:
        assert img.width > 500 and img.height > 200
    assert 0 < w <= 15.5 and 0 < h < 25


def test_ajuste_ao_quadro_do_slide():
    """No slide (12,33 × 4,95 pol), a largura das tarefas é escolhida para a letra ficar grande,
    com folga entre as colunas e sem tarefa quase quadrada."""
    dados = json.loads((EXEMPLOS / "ppt_linac_manutencao.json").read_text(encoding="utf-8"))
    s = next(x for x in dados["slides"] if x["tipo"] == "fluxograma")
    f = dg.montar_fluxo(s["etapas"], s["raias"])
    f.med = dict(dg.MED_SLIDE, cab_piscina=0)
    L = dg.ajustar_ao_quadro(f, 12.33, 4.95, vao_min=0.36)
    larg, alt = dg._medidas(L)
    k = min(12.33 / larg, 4.95 / alt)
    assert L.horizontal
    assert f.med["fonte_tarefa"] * k * 72 >= 14
    assert f.med["gap_m"] * k >= 0.35
    assert f.med["tarefa_w"] / f.med["tarefa_h"] >= 1.2
