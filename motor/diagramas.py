"""Diagramas do POP de Elite, sem Graphviz.

- Fluxograma BPMN no estilo do Bizagi Modeler: piscina com raias por responsável (nome na
  vertical), evento de início verde, tarefas arredondadas com degradê e sombra, decisão em
  losango com "X", evento de fim vermelho, conectores em ângulo reto e saídas "Sim"/"Não".
- Ciclo, hierarquia e pirâmide no mesmo acabamento.

O layout do fluxograma é calculado uma vez, em unidades abstratas, e desenhado em PNG
(Word, com Pillow) ou em formas nativas do PowerPoint (ppt.py usa `layout_fluxo`), para
os dois saírem iguais.

Formato do fluxograma (o antigo, lista de nós com "forma", continua aceito):

    {"tipo": "fluxograma", "titulo": "...", "raias": ["Recepção", "Enfermagem"],
     "conteudo": [
        {"id": "i", "tipo": "inicio", "texto": "Paciente chega", "raia": "Recepção"},
        {"id": "t1", "tipo": "tarefa", "texto": "Conferir dois identificadores", "raia": "Enfermagem"},
        {"id": "d1", "tipo": "decisao", "texto": "Identificação confere?", "sim": "t2", "nao": "t3"},
        {"id": "t2", "tipo": "tarefa", "texto": "Realizar o time-out", "proximo": "f1"},
        {"id": "t3", "tipo": "tarefa", "texto": "Interromper e notificar", "critico": true},
        {"id": "f1", "tipo": "fim", "texto": "Tratamento liberado"}]}

Cada nó liga-se ao item seguinte da lista, a menos que tenha "proximo" (id ou lista de ids),
seja uma decisão ("sim"/"nao") ou seja um "fim".
"""

import functools
import math
import os
import re
import uuid
from dataclasses import dataclass, field

from PIL import Image, ImageDraw, ImageFilter, ImageFont

from .base import hex_to_rgb, lighten, darken, sem_acento, texto_de

# ─────────────────────────────────────────────────────────────
# Fontes (Carlito = métricas da Calibri, a mesma dos documentos)
# ─────────────────────────────────────────────────────────────
# GUARDA: pelo nome do arquivo, nunca por caminho. O Pillow procura nas pastas de fonte do sistema
# (Linux, Windows e macOS); caminho fixo de um sistema faz o outro medir com a fonte padrão.
_FONTES = {
    "regular": ["Carlito-Regular.ttf", "calibri.ttf", "LiberationSans-Regular.ttf", "DejaVuSans.ttf"],
    "negrito": ["Carlito-Bold.ttf", "calibrib.ttf", "LiberationSans-Bold.ttf", "DejaVuSans-Bold.ttf"],
}
_METRICA_CALIBRI = ("Carlito-Regular.ttf", "calibri.ttf")


@functools.lru_cache(maxsize=None)
def _arquivo_fonte(peso):
    """(nome, caminho) da primeira fonte da lista que existe no sistema, ou None."""
    for nome in _FONTES[peso]:
        try:
            return nome, ImageFont.truetype(nome, 10).path
        except OSError:
            continue
    return None


def metrica_calibri():
    """A medida de texto usa as métricas da Calibri (Carlito ou a própria Calibri)?"""
    achada = _arquivo_fonte("regular")
    return bool(achada) and achada[0] in _METRICA_CALIBRI


@functools.lru_cache(maxsize=256)
def fonte(peso, tamanho_px):
    achada = _arquivo_fonte("negrito" if peso == "negrito" else "regular")
    if achada:
        return ImageFont.truetype(achada[1], max(6, int(round(tamanho_px))))
    return ImageFont.load_default()


def quebrar(texto, fnt, largura, max_linhas=None):
    """Quebra o texto em linhas que cabem na largura (px). Palavra maior que a linha é cortada."""
    palavras = str(texto or "").replace("\n", " \n ").split(" ")
    linhas, atual = [], ""
    for p in palavras:
        if p == "\n":
            linhas.append(atual.strip()); atual = ""; continue
        if not p:
            continue
        teste = f"{atual} {p}".strip()
        if fnt.getlength(teste) <= largura or not atual:
            atual = teste
        else:
            linhas.append(atual); atual = p
    if atual:
        linhas.append(atual)
    linhas = [ln for ln in linhas if ln] or [""]
    if max_linhas and len(linhas) > max_linhas:
        linhas = linhas[:max_linhas]
        while linhas[-1] and fnt.getlength(linhas[-1] + "…") > largura:
            linhas[-1] = linhas[-1][:-1]
        linhas[-1] = linhas[-1].rstrip() + "…"
    return linhas


def caber(texto, largura, altura, peso, maximo, minimo, entrelinha=1.18, max_linhas=6):
    """(fonte, linhas) com o maior tamanho em que o texto cabe na caixa, sem cortar palavras."""
    tam = maximo
    while True:
        fnt = fonte(peso, tam)
        palavras = str(texto or "").split()
        maior_ok = all(fnt.getlength(p) <= largura for p in palavras)
        linhas = quebrar(texto, fnt, largura)
        if (maior_ok and len(linhas) * tam * entrelinha <= altura and len(linhas) <= max_linhas) or tam <= minimo:
            limite = max(1, int(altura // (tam * entrelinha)))
            return fnt, quebrar(texto, fnt, largura, max_linhas=min(max_linhas, limite))
        tam -= 1


def cores_bpmn(pal):
    p = pal.get("primary", "283264")
    return {
        "piscina_borda": darken(p, 0.25), "piscina_cab": lighten(p, 0.82), "piscina_txt": darken(p, 0.35),
        "raia_cab": lighten(p, 0.90), "raia_txt": darken(p, 0.25), "raia_fundo": "FFFFFF",
        "raia_fundo_alt": lighten(p, 0.965), "raia_linha": lighten(p, 0.55),
        "tarefa_topo": "FFFFFF", "tarefa_base": lighten(p, 0.80), "tarefa_borda": darken(p, 0.05),
        "tarefa_txt": darken(p, 0.45), "critico": "C0392B",
        "inicio_fundo": "E4F4DA", "inicio_borda": "4C9A2A",
        "fim_fundo": "FBE1E1", "fim_borda": "B71C1C",
        "inter_fundo": "FFF1DC", "inter_borda": "D9822B",
        "gate_topo": "FFFCEB", "gate_base": "FBE7A1", "gate_borda": "B8900F", "gate_x": "5C4700",
        "fluxo": "3A4150", "rotulo": "4A5160", "sim": "2E7D32", "nao": "B71C1C",
    }


def _rgb(hexa, alfa=None):
    r, g, b = hex_to_rgb(hexa)
    return (r, g, b) if alfa is None else (r, g, b, alfa)


def _mistura(c1, c2, t):
    a, b = hex_to_rgb(c1), hex_to_rgb(c2)
    return "".join(f"{int(round(x + (y - x) * t)):02X}" for x, y in zip(a, b))


def _compor(img, camada, x, y):
    """alpha_composite que aceita destino parcialmente fora da imagem."""
    x, y = int(x), int(y)
    cx0, cy0 = max(0, -x), max(0, -y)
    cx1, cy1 = min(camada.width, img.width - x), min(camada.height, img.height - y)
    if cx1 <= cx0 or cy1 <= cy0:
        return
    img.alpha_composite(camada.crop((cx0, cy0, cx1, cy1)), (x + cx0, y + cy0))


@dataclass
class No:
    id: str
    tipo: str
    texto: str
    raia: str = ""
    critico: bool = False
    implicito: bool = False
    rank: int = 0
    trilha: int = 0
    m: float = 0.0
    c: float = 0.0


@dataclass
class Aresta:
    origem: str
    destino: str
    rotulo: str = ""
    sentido: str = ""
    retorno: bool = False
    pontos: list = field(default_factory=list)


@dataclass
class Fluxo:
    nos: list
    arestas: list
    raias: list
    titulo: str = ""
    med: dict = None

    def no(self, nid):
        return self._mapa[nid]

    def __post_init__(self):
        self._mapa = {n.id: n for n in self.nos}
        if self.med is None:
            self.med = MED


_TIPOS = {
    "inicio": "inicio", "comeco": "inicio", "start": "inicio", "evento_inicio": "inicio", "evento_de_inicio": "inicio",
    "fim": "fim", "end": "fim", "termino": "fim", "evento_fim": "fim", "evento_de_fim": "fim", "final": "fim",
    "decisao": "decisao", "gateway": "decisao", "losango": "decisao", "diamond": "decisao", "pergunta": "decisao",
    "condicao": "decisao",
    "tarefa": "tarefa", "atividade": "tarefa", "retangulo": "tarefa", "box": "tarefa", "task": "tarefa",
    "acao": "tarefa", "etapa": "tarefa", "processo": "tarefa", "subprocesso": "tarefa",
    "intermediario": "intermediario", "espera": "intermediario", "evento": "intermediario",
    "timer": "intermediario", "evento_intermediario": "intermediario",
    "elipse": "elipse", "ellipse": "elipse", "oval": "elipse", "circulo": "elipse",
}
_CHAVES_RAIA = ("raia", "responsavel", "responsável", "lane", "ator", "papel", "setor")


def _tipo_bruto(item):
    if isinstance(item, dict):
        bruto = sem_acento(item.get("tipo") or item.get("forma") or "").strip().replace(" ", "_")
        if bruto in _TIPOS:
            return _TIPOS[bruto]
        if bool(item.get("prioridade") == "critica"):
            return "tarefa"
    texto = texto_de(item)
    return "decisao" if texto.strip().endswith("?") else "tarefa"


def _lista(v):
    if v is None or v == "":
        return []
    return v if isinstance(v, list) else [v]


def montar_fluxo(conteudo, raias=None, rotulos=None, titulo=""):
    """Normaliza o JSON do fluxograma (novo ou antigo) num grafo com início e fim garantidos."""
    R = {"sim": "Sim", "nao": "Não", "inicio": "Início", "fim": "Fim"}
    R.update({k: v for k, v in (rotulos or {}).items() if k in R and v})
    itens = [x for x in (conteudo if isinstance(conteudo, list) else [conteudo]) if x not in (None, "")][:30]
    nos, refs = [], []
    for i, it in enumerate(itens):
        d = it if isinstance(it, dict) else {"texto": texto_de(it)}
        nid = str(d.get("id") or f"n{i + 1}")
        raia = ""
        for k in _CHAVES_RAIA:
            if d.get(k):
                raia = texto_de(d[k]).strip(); break
        nos.append(No(id=nid, tipo=_tipo_bruto(it), texto=texto_de(d.get("texto") or d.get("label") or d.get("titulo")
                                                                 or d.get("nome") or d.get("pergunta") or d.get("acao") or ""),
                      raia=raia, critico=str(d.get("prioridade", "")).lower() == "critica" or bool(d.get("critico"))))
        refs.append(d)
    if not nos:
        return Fluxo([], [], [], titulo)
    ids = {n.id for n in nos}
    if len(ids) < len(nos):
        for i, n in enumerate(nos):
            n.id = f"n{i + 1}"
        ids = {n.id for n in nos}

    def alvo(ref):
        if ref is None or ref == "":
            return None
        s = str(ref).strip()
        if s in ids:
            return s
        if s.isdigit() and 1 <= int(s) <= len(nos):
            return nos[int(s) - 1].id
        alvo_txt = sem_acento(s)
        for n in nos:
            if sem_acento(n.texto) == alvo_txt:
                return n.id
        return None

    explicito = any(isinstance(d, dict) and any(k in d for k in ("sim", "nao", "não", "proximo", "próximo", "next"))
                    for d in refs)
    for i, n in enumerate(nos):
        if n.tipo == "elipse":
            n.tipo = "inicio" if i == 0 else "fim"

    arestas = []

    def ligar(a, b, rotulo="", sentido=""):
        if a and b and a != b and not any(x.origem == a and x.destino == b for x in arestas):
            arestas.append(Aresta(a, b, rotulo, sentido))

    if explicito:
        pos = {n.id: i for i, n in enumerate(nos)}
        cabecas = set()
        for i, (n, d) in enumerate(zip(nos, refs)):
            if n.tipo == "decisao":
                for k in ("sim", "nao", "não"):
                    t = alvo(d.get(k))
                    if t and pos[t] != i + 1:
                        cabecas.add(t)
        for i, (n, d) in enumerate(zip(nos, refs)):
            proximos = [alvo(x) for x in _lista(d.get("proximo", d.get("próximo", d.get("next"))))]
            proximos = [x for x in proximos if x]
            if n.tipo == "decisao":
                sim, nao = alvo(d.get("sim")), alvo(d.get("nao", d.get("não")))
                if not sim and not nao:
                    sim = nos[i + 1].id if i + 1 < len(nos) else None
                    nao = nos[i + 2].id if i + 2 < len(nos) else None
                ligar(n.id, sim, R["sim"], "sim")
                ligar(n.id, nao, R["nao"], "nao")
                for p in proximos:
                    ligar(n.id, p)
            elif n.tipo != "fim":
                if proximos:
                    for p in proximos:
                        ligar(n.id, p)
                else:
                    j = i + 1
                    while j < len(nos) and nos[j].id in cabecas:
                        j += 1
                    if j < len(nos):
                        ligar(n.id, nos[j].id)
    else:
        decisoes = [i for i, n in enumerate(nos) if n.tipo == "decisao"]
        if not decisoes:
            for i in range(len(nos) - 1):
                ligar(nos[i].id, nos[i + 1].id)
        else:
            d1 = decisoes[0]
            for i in range(d1):
                ligar(nos[i].id, nos[i + 1].id)
            esq = d1 + 1 if d1 + 1 < len(nos) else None
            dir_ = d1 + 2 if d1 + 2 < len(nos) else None
            if esq is not None:
                ligar(nos[d1].id, nos[esq].id, R["sim"], "sim")
            if dir_ is not None:
                ligar(nos[d1].id, nos[dir_].id, R["nao"], "nao")
            restantes = [i for i in range(len(nos)) if i > d1 + 2]
            if esq is not None and restantes:
                ligar(nos[esq].id, nos[restantes[0]].id)
                restantes = restantes[1:]
            anterior = dir_
            k = 0
            while k < len(restantes) and anterior is not None:
                ri = restantes[k]
                ligar(nos[anterior].id, nos[ri].id)
                if nos[ri].tipo == "decisao" and k + 2 < len(restantes):
                    a, b = restantes[k + 1], restantes[k + 2]
                    ligar(nos[ri].id, nos[a].id, R["sim"], "sim")
                    ligar(nos[ri].id, nos[b].id, R["nao"], "nao")
                    break
                anterior = ri
                k += 1

    saem = {a.origem for a in arestas}
    for n in nos:
        if n.tipo == "fim" and n.id in saem:
            n.tipo = "intermediario"
        if n.tipo == "decisao" and n.id not in saem:
            n.tipo = "tarefa"

    lista_raias = [texto_de(r).strip() for r in _lista(raias) if texto_de(r).strip()]
    for n in nos:
        if n.raia and n.raia not in lista_raias:
            lista_raias.append(n.raia)
    if lista_raias:
        pred = {}
        for a in arestas:
            pred.setdefault(a.destino, a.origem)
        mapa = {n.id: n for n in nos}
        for _ in range(len(nos)):
            for n in nos:
                if not n.raia and n.id in pred and mapa[pred[n.id]].raia:
                    n.raia = mapa[pred[n.id]].raia
        for n in nos:
            if not n.raia:
                n.raia = lista_raias[0]

    entram = {a.destino for a in arestas}
    if not any(n.tipo == "inicio" for n in nos):
        primeiro = next((n for n in nos if n.id not in entram), nos[0])
        ini = No(id="__inicio", tipo="inicio", texto=R["inicio"], raia=primeiro.raia, implicito=True)
        nos.insert(0, ini)
        arestas.insert(0, Aresta(ini.id, primeiro.id))
    saem = {a.origem for a in arestas}
    for n in list(nos):
        if n.id not in saem and n.tipo not in ("fim",):
            fim = No(id=f"__fim_{n.id}", tipo="fim", texto="", raia=n.raia, implicito=True)
            nos.append(fim)
            arestas.append(Aresta(n.id, fim.id))
    return Fluxo(nos, arestas, lista_raias or [""], titulo)


MED = {
    "tarefa_w": 168, "tarefa_h": 84, "evento_d": 38, "gate_d": 56,
    "gap_m": 54, "gap_c": 26, "pad_c": 18, "pad_m": 22,
    "cab_piscina": 40, "cab_raia": 38,
    "fonte_tarefa": 20, "fonte_rotulo": 16, "fonte_cab": 18, "fonte_seta": 15,
    "rotulo_evento_w": 132, "rotulo_gate_w": 160, "corredor": 14,
}


_MED_PADRAO = MED
MED_SLIDE = dict(MED, **{
    "tarefa_w": 150, "tarefa_h": 78, "gap_m": 40, "gap_c": 22, "pad_c": 14, "pad_m": 16,
    "fonte_tarefa": 21, "fonte_rotulo": 19, "fonte_cab": 20, "fonte_seta": 18,
    "rotulo_evento_w": 120, "rotulo_gate_w": 150, "cab_piscina": 36, "cab_raia": 36,
})


@dataclass
class Layout:
    fluxo: Fluxo
    horizontal: bool
    raias: list
    m0: float
    m1: float
    cab: float
    cab_piscina: float
    cab_raia: float
    rotulos: dict

    @property
    def largura(self):
        return (self.m1 if self.horizontal else self.raias[-1][2])

    @property
    def altura(self):
        return (self.raias[-1][2] if self.horizontal else self.m1)


def _forma(n, H, MED=None):
    """(meia-medida no eixo principal, meia-medida no eixo cruzado) da forma, sem rótulo."""
    MED = MED or _MED_PADRAO
    if n.tipo == "tarefa":
        return (MED["tarefa_w"] / 2, MED["tarefa_h"] / 2) if H else (MED["tarefa_h"] / 2, MED["tarefa_w"] / 2)
    if n.tipo == "decisao":
        return MED["gate_d"] / 2, MED["gate_d"] / 2
    return MED["evento_d"] / 2, MED["evento_d"] / 2


def _rotulo_ext(n, H, acima_gate=True, MED=None):
    """Extensões (m_neg, m_pos, c_neg, c_pos) do nó incluindo o rótulo externo, e o retângulo do rótulo
    relativo ao centro (dm0, dc0, dm1, dc1) + linhas + tamanho da fonte."""
    MED = MED or _MED_PADRAO
    hm, hc = _forma(n, H, MED)
    ext = [hm, hm, hc, hc]
    rot = None
    if n.tipo in ("inicio", "fim", "intermediario") and n.texto.strip():
        fnt = fonte("regular", MED["fonte_rotulo"])
        linhas = quebrar(n.texto, fnt, MED["rotulo_evento_w"], max_linhas=3)
        lh = MED["fonte_rotulo"] * 1.18 * len(linhas)
        larg = max(fnt.getlength(ln) for ln in linhas)
        if H:
            rot = (-larg / 2, hc + 6, larg / 2, hc + 6 + lh)
        elif n.tipo == "inicio":
            rot = (-hm - 6 - lh, -larg / 2, -hm - 6, larg / 2)
        elif n.tipo == "fim":
            rot = (hm + 6, -larg / 2, hm + 6 + lh, larg / 2)
        else:
            rot = (-lh / 2, hc + 8, lh / 2, hc + 8 + larg)
        rot = rot + (linhas, MED["fonte_rotulo"], "centro")
    elif n.tipo == "decisao" and n.texto.strip():
        fnt = fonte("regular", MED["fonte_rotulo"])
        linhas = quebrar(n.texto, fnt, MED["rotulo_gate_w"], max_linhas=3)
        lh = MED["fonte_rotulo"] * 1.18 * len(linhas)
        larg = max(fnt.getlength(ln) for ln in linhas)
        if H:
            rot = (-larg / 2, -hc - 6 - lh, larg / 2, -hc - 6) if acima_gate else (-larg / 2, hc + 6, larg / 2, hc + 6 + lh)
            alinh = "centro"
        else:
            rot = (-hm - 4 - lh, 8, -hm - 4, 8 + larg)
            alinh = "esquerda"
        rot = rot + (linhas, MED["fonte_rotulo"], alinh)
    if rot:
        dm0, dc0, dm1, dc1 = rot[:4]
        ext = [max(ext[0], -dm0), max(ext[1], dm1), max(ext[2], -dc0), max(ext[3], dc1)]
    return ext, rot


def layout_fluxo(f, horizontal=True, com_piscina=True):
    H = horizontal
    MED = f.med or _MED_PADRAO
    nos = f.nos
    mapa = {n.id: n for n in nos}
    saidas = {n.id: [] for n in nos}
    for a in f.arestas:
        saidas[a.origem].append(a)

    estado = {}

    def dfs(u):
        estado[u] = 1
        for a in saidas[u]:
            if estado.get(a.destino) == 1:
                a.retorno = True
            elif a.destino not in estado:
                dfs(a.destino)
        estado[u] = 2

    for n in nos:
        if n.tipo == "inicio" and n.id not in estado:
            dfs(n.id)
    for n in nos:
        if n.id not in estado:
            dfs(n.id)

    entrada = {n.id: 0 for n in nos}
    for a in f.arestas:
        if not a.retorno:
            entrada[a.destino] += 1
    fila = [n.id for n in nos if entrada[n.id] == 0]
    ordem = []
    while fila:
        u = fila.pop(0)
        ordem.append(u)
        for a in saidas[u]:
            if a.retorno:
                continue
            v = mapa[a.destino]
            v.rank = max(v.rank, mapa[u].rank + 1)
            entrada[v.id] -= 1
            if entrada[v.id] == 0:
                fila.append(v.id)
    nranks = max(n.rank for n in nos) + 1

    raias = f.raias
    idx_raia = {r: i for i, r in enumerate(raias)}
    ocup = {}
    pref = {}
    for u in ordem:
        n = mapa[u]
        r = idx_raia.get(n.raia, 0)
        t = pref.get(u, 0)
        while ocup.get((r, t, n.rank)):
            t += 1
        n.trilha = t
        ocup[(r, t, n.rank)] = u
        for a in saidas[u]:
            if a.retorno or a.destino in pref:
                continue
            v = mapa[a.destino]
            mesma = idx_raia.get(v.raia, 0) == r
            if not mesma:
                pref[a.destino] = 0
            elif a.sentido == "nao" and any(x.sentido == "sim" and idx_raia.get(mapa[x.destino].raia, 0) == r
                                            for x in saidas[u]):
                pref[a.destino] = t + 1
            else:
                pref[a.destino] = t

    acima = {}
    for n in nos:
        if n.tipo == "decisao":
            r = idx_raia.get(n.raia, 0)
            sobe = any(idx_raia.get(mapa[a.destino].raia, 0) < r for a in saidas[n.id])
            acima[n.id] = not sobe
    ext, rots = {}, {}
    for n in nos:
        ext[n.id], rots[n.id] = _rotulo_ext(n, H, acima.get(n.id, True), MED)
    m_neg = [0.0] * nranks
    m_pos = [0.0] * nranks
    for n in nos:
        m_neg[n.rank] = max(m_neg[n.rank], ext[n.id][0])
        m_pos[n.rank] = max(m_pos[n.rank], ext[n.id][1])
    cab_p = MED["cab_piscina"] if com_piscina else 0
    tem_nome_raia = any(raias) and com_piscina
    cab_r = _espessura_cab_raia(raias, MED) if tem_nome_raia else 0
    cab = cab_p + cab_r
    pos_rank = []
    m = cab + MED["pad_m"]
    for r in range(nranks):
        m += m_neg[r]
        pos_rank.append(m)
        m += m_pos[r] + MED["gap_m"]
    m1 = m - MED["gap_m"] + MED["pad_m"]

    corredores = {}
    for a in f.arestas:
        if a.retorno:
            r = idx_raia.get(mapa[a.origem].raia, 0)
            corredores[r] = corredores.get(r, 0) + 1

    raias_geo = []
    c = 0
    trilha_c = {}
    for ri, nome in enumerate(raias):
        c0 = c
        c += MED["pad_c"]
        ntr = max([n.trilha for n in nos if idx_raia.get(n.raia, 0) == ri] + [0]) + 1
        for t in range(ntr):
            membros = [n for n in nos if idx_raia.get(n.raia, 0) == ri and n.trilha == t]
            c_neg = max([ext[n.id][2] for n in membros] + [MED["tarefa_h"] / 2 if H else MED["tarefa_w"] / 2])
            c_pos = max([ext[n.id][3] for n in membros] + [MED["tarefa_h"] / 2 if H else MED["tarefa_w"] / 2])
            c += c_neg
            trilha_c[(ri, t)] = c
            c += c_pos + (MED["gap_c"] if t < ntr - 1 else 0)
        c += MED["pad_c"] + corredores.get(ri, 0) * MED["corredor"]
        raias_geo.append((nome, c0, c))
    for n in nos:
        n.m = pos_rank[n.rank]
        n.c = trilha_c[(idx_raia.get(n.raia, 0), n.trilha)]

    ocupados = [(n, *_forma(n, H, MED)) for n in nos]

    def bloqueado(m_a, m_b, c_linha, ignorar):
        lo, hi = min(m_a, m_b), max(m_a, m_b)
        for n, hm, hc in ocupados:
            if n.id in ignorar:
                continue
            if lo < n.m + hm + 4 and n.m - hm - 4 < hi and abs(n.c - c_linha) < hc + 6:
                return True
        return False

    def bloqueado_c(m_linha, c_a, c_b, ignorar):
        lo, hi = min(c_a, c_b), max(c_a, c_b)
        for n, hm, hc in ocupados:
            if n.id in ignorar:
                continue
            if abs(n.m - m_linha) < hm + 4 and lo < n.c + hc + 4 and n.c - hc - 4 < hi:
                return True
        return False

    contador_corr = {}
    for a in f.arestas:
        u, v = mapa[a.origem], mapa[a.destino]
        hmu, hcu = _forma(u, H, MED)
        hmv, hcv = _forma(v, H, MED)
        ign = {u.id, v.id}
        if a.retorno:
            ri = idx_raia.get(u.raia, 0)
            k = contador_corr.get(ri, 0)
            contador_corr[ri] = k + 1
            c_corr = raias_geo[ri][2] - MED["pad_c"] / 2 - k * MED["corredor"] - 4
            a.pontos = [(u.m, u.c + hcu), (u.m, c_corr), (v.m, c_corr), (v.m, v.c + hcv)]
            continue
        if abs(u.c - v.c) < 1:
            if not bloqueado(u.m + hmu, v.m - hmv, u.c, ign):
                a.pontos = [(u.m + hmu, u.c), (v.m - hmv, v.c)]
                continue
        if u.tipo == "decisao" and a.sentido in ("sim", "nao") and abs(u.c - v.c) >= 1:
            sinal = 1 if v.c > u.c else -1
            if not bloqueado(u.m, v.m - hmv, v.c, ign) and not bloqueado_c(u.m, u.c + sinal * hcu, v.c, ign):
                a.pontos = [(u.m, u.c + sinal * hcu), (u.m, v.c), (v.m - hmv, v.c)]
                continue
        meio_depois = pos_rank[u.rank] + m_pos[u.rank] + MED["gap_m"] / 2
        meio_antes = pos_rank[v.rank] - m_neg[v.rank] - MED["gap_m"] / 2
        feito = False
        for meio in (meio_depois, meio_antes):
            if meio <= u.m + hmu or meio >= v.m - hmv:
                continue
            if not bloqueado(u.m + hmu, meio, u.c, ign) and not bloqueado(meio, v.m - hmv, v.c, ign):
                a.pontos = [(u.m + hmu, u.c), (meio, u.c), (meio, v.c), (v.m - hmv, v.c)]
                feito = True
                break
        if feito:
            continue
        ri = idx_raia.get(u.raia, 0)
        k = contador_corr.get(ri, 0)
        contador_corr[ri] = k + 1
        if k >= corredores.get(ri, 0):
            corredores[ri] = k + 1
        c_corr = raias_geo[ri][2] - MED["pad_c"] / 2 - k * MED["corredor"] - 4
        a.pontos = [(u.m + hmu, u.c), (meio_depois, u.c), (meio_depois, c_corr),
                    (meio_antes, c_corr), (meio_antes, v.c), (v.m - hmv, v.c)]

    rotulos = {}
    for n in nos:
        r = rots[n.id]
        if r:
            dm0, dc0, dm1, dc1, linhas, tam, alinh = r
            rotulos[n.id] = (n.m + dm0, n.c + dc0, n.m + dm1, n.c + dc1, linhas, tam, alinh)
    return Layout(f, H, raias_geo, 0, m1, cab, cab_p, cab_r, rotulos)


def _espessura_cab_raia(raias, MED=None):
    MED = MED or _MED_PADRAO
    fnt = fonte("negrito", MED["fonte_cab"])
    maior = max((fnt.getlength(r) for r in raias if r), default=0)
    return MED["cab_raia"] + (MED["fonte_cab"] * 1.15 if maior > 190 else 0)


class _Tela:
    def __init__(self, largura, altura, escala):
        self.k = escala
        self.img = Image.new("RGBA", (max(1, int(largura * escala)), max(1, int(altura * escala))), (255, 255, 255, 255))
        self.d = ImageDraw.Draw(self.img)

    def p(self, v):
        return v * self.k

    def caixa(self, x0, y0, x1, y1, raio, topo, base, borda, larg=2.0, sombra=True):
        k = self.k
        X0, Y0, X1, Y1 = int(x0 * k), int(y0 * k), int(x1 * k), int(y1 * k)
        w, h = max(1, X1 - X0), max(1, Y1 - Y0)
        r = int(raio * k)
        if sombra:
            margem = int(10 * k)
            sb = Image.new("RGBA", (w + 2 * margem, h + 2 * margem), (0, 0, 0, 0))
            ImageDraw.Draw(sb).rounded_rectangle([margem, margem, margem + w, margem + h], radius=r, fill=(20, 28, 60, 60))
            sb = sb.filter(ImageFilter.GaussianBlur(4 * k))
            _compor(self.img, sb, X0 - margem + int(2 * k), Y0 - margem + int(3 * k))
        grad = Image.new("RGB", (1, 2))
        grad.putpixel((0, 0), _rgb(topo))
        grad.putpixel((0, 1), _rgb(base))
        grad = grad.resize((w, h), Image.BILINEAR).convert("RGBA")
        mask = Image.new("L", (w, h), 0)
        ImageDraw.Draw(mask).rounded_rectangle([0, 0, w - 1, h - 1], radius=r, fill=255)
        self.img.paste(grad, (X0, Y0), mask)
        self.d.rounded_rectangle([X0, Y0, X1, Y1], radius=r, outline=_rgb(borda), width=max(1, int(larg * k)))

    def circulo(self, cx, cy, raio, fundo, borda, larg):
        k = self.k
        self.d.ellipse([(cx - raio) * k, (cy - raio) * k, (cx + raio) * k, (cy + raio) * k],
                       fill=_rgb(fundo), outline=_rgb(borda), width=max(1, int(larg * k)))

    def losango(self, cx, cy, meia, topo, base, borda, larg):
        k = self.k
        X0, Y0 = int((cx - meia) * k), int((cy - meia) * k)
        w = h = max(2, int(2 * meia * k))
        grad = Image.new("RGB", (1, 2))
        grad.putpixel((0, 0), _rgb(topo))
        grad.putpixel((0, 1), _rgb(base))
        grad = grad.resize((w, h), Image.BILINEAR).convert("RGBA")
        mask = Image.new("L", (w, h), 0)
        ImageDraw.Draw(mask).polygon([(w / 2, 0), (w - 1, h / 2), (w / 2, h - 1), (0, h / 2)], fill=255)
        sb = mask.filter(ImageFilter.GaussianBlur(3 * k))
        sombra = Image.new("RGBA", (w, h), (20, 28, 60, 0))
        sombra.putalpha(sb.point(lambda a: int(a * 0.25)))
        _compor(self.img, sombra, X0 + int(2 * k), Y0 + int(3 * k))
        self.img.paste(grad, (X0, Y0), mask)
        pts = [(cx * k, (cy - meia) * k), ((cx + meia) * k, cy * k), (cx * k, (cy + meia) * k), ((cx - meia) * k, cy * k)]
        self.d.polygon(pts, outline=_rgb(borda), width=max(1, int(larg * k)))

    def linha(self, pontos, cor, larg, seta=True):
        k = self.k
        pts = [(x * k, y * k) for x, y in pontos]
        self.d.line(pts, fill=_rgb(cor), width=max(1, int(larg * k)), joint="curve")
        if seta and len(pts) >= 2:
            (x0, y0), (x1, y1) = pts[-2], pts[-1]
            ang = math.atan2(y1 - y0, x1 - x0)
            comp, abert = 11 * k, 5.5 * k
            base = (x1 - comp * math.cos(ang), y1 - comp * math.sin(ang))
            esq = (base[0] + abert * math.sin(ang), base[1] - abert * math.cos(ang))
            dir_ = (base[0] - abert * math.sin(ang), base[1] + abert * math.cos(ang))
            self.d.polygon([(x1, y1), esq, dir_], fill=_rgb(cor))

    def texto(self, x0, y0, x1, y1, linhas, tam, cor, peso="regular", alinh="centro", vertical="meio"):
        k = self.k
        fnt = fonte(peso, tam * k)
        lh = tam * 1.18 * k
        total = lh * len(linhas)
        if vertical == "meio":
            y = (y0 * k + y1 * k - total) / 2
        elif vertical == "topo":
            y = y0 * k
        else:
            y = y1 * k - total
        for ln in linhas:
            larg = fnt.getlength(ln)
            if alinh == "centro":
                x = (x0 * k + x1 * k - larg) / 2
            elif alinh == "direita":
                x = x1 * k - larg
            else:
                x = x0 * k
            self.d.text((x, y + (lh - tam * k) / 2), ln, font=fnt, fill=_rgb(cor))
            y += lh

    def texto_girado(self, x0, y0, x1, y1, texto, tam, cor, peso="negrito"):
        """Texto na vertical (de baixo para cima), centralizado na faixa."""
        k = self.k
        w, h = int((y1 - y0) * k), int((x1 - x0) * k)
        if w < 4 or h < 4:
            return
        camada = Image.new("RGBA", (w, h), (0, 0, 0, 0))
        dd = ImageDraw.Draw(camada)
        fnt, linhas = caber(texto, w - 12 * k, h - 4 * k, peso, tam * k, 9 * k, max_linhas=2)
        lh = fnt.size * 1.15
        y = (h - lh * len(linhas)) / 2
        for ln in linhas:
            dd.text(((w - fnt.getlength(ln)) / 2, y + (lh - fnt.size) / 2), ln, font=fnt, fill=_rgb(cor))
            y += lh
        camada = camada.rotate(90, expand=True)
        _compor(self.img, camada, x0 * k, y0 * k)

    def salvar(self, caminho, largura_px=None):
        img = self.img.convert("RGB")
        if largura_px and img.width > largura_px:
            alt = int(img.height * largura_px / img.width)
            img = img.resize((largura_px, alt), Image.LANCZOS)
        img.save(caminho, "PNG", optimize=True)
        return caminho


def desenhar_fluxo_png(L, pal, caminho, largura_px=1800, nome_piscina=""):
    MED = L.fluxo.med or _MED_PADRAO
    cor = cores_bpmn(pal)
    H = L.horizontal
    margem = 6
    larg = (L.m1 if H else L.raias[-1][2]) + 2 * margem
    alt = (L.raias[-1][2] if H else L.m1) + 2 * margem
    escala = max(1.0, min(4.0, (largura_px * 2) / larg))
    T = _Tela(larg, alt, escala)

    def XY(m, c):
        return (m + margem, c + margem) if H else (c + margem, m + margem)

    if L.cab_piscina or L.cab_raia:
        for i, (nome, c0, c1) in enumerate(L.raias):
            fundo = cor["raia_fundo"] if i % 2 == 0 else cor["raia_fundo_alt"]
            if H:
                x0, y0 = XY(L.cab, c0); x1, y1 = XY(L.m1, c1)
            else:
                x0, y0 = XY(L.cab, c0); x1, y1 = XY(L.m1, c1)
            T.d.rectangle([x0 * T.k, y0 * T.k, x1 * T.k, y1 * T.k], fill=_rgb(fundo))
        if L.cab_piscina:
            a0 = XY(0, L.raias[0][1]); a1 = XY(L.cab_piscina, L.raias[-1][2])
            x0, y0, x1, y1 = min(a0[0], a1[0]), min(a0[1], a1[1]), max(a0[0], a1[0]), max(a0[1], a1[1])
            T.d.rectangle([x0 * T.k, y0 * T.k, x1 * T.k, y1 * T.k], fill=_rgb(cor["piscina_cab"]))
            if H:
                T.texto_girado(x0, y0, x1, y1, nome_piscina or L.fluxo.titulo, MED["fonte_cab"] + 1, cor["piscina_txt"])
            else:
                fnt, linhas = caber(nome_piscina or L.fluxo.titulo, (x1 - x0) - 20, (y1 - y0) - 6, "negrito",
                                    MED["fonte_cab"] + 1, 11, max_linhas=2)
                T.texto(x0 + 10, y0, x1 - 10, y1, linhas, fnt.size, cor["piscina_txt"], "negrito")
        if L.cab_raia:
            for nome, c0, c1 in L.raias:
                a0 = XY(L.cab_piscina, c0); a1 = XY(L.cab, c1)
                x0, y0, x1, y1 = min(a0[0], a1[0]), min(a0[1], a1[1]), max(a0[0], a1[0]), max(a0[1], a1[1])
                T.d.rectangle([x0 * T.k, y0 * T.k, x1 * T.k, y1 * T.k], fill=_rgb(cor["raia_cab"]))
                if H:
                    T.texto_girado(x0, y0, x1, y1, nome, MED["fonte_cab"], cor["raia_txt"])
                else:
                    fnt, linhas = caber(nome, (x1 - x0) - 16, (y1 - y0) - 4, "negrito", MED["fonte_cab"], 10, max_linhas=2)
                    T.texto(x0 + 8, y0, x1 - 8, y1, linhas, fnt.size, cor["raia_txt"], "negrito")
        lw = max(1, int(1.2 * T.k))
        for i, (nome, c0, c1) in enumerate(L.raias):
            if i:
                a = XY(L.cab_piscina, c0); b = XY(L.m1, c0)
                T.d.line([a[0] * T.k, a[1] * T.k, b[0] * T.k, b[1] * T.k], fill=_rgb(cor["raia_linha"]), width=lw)
        for mm in ([L.cab_piscina] if L.cab_piscina and L.cab_raia else []) + ([L.cab] if L.cab else []):
            a = XY(mm, L.raias[0][1]); b = XY(mm, L.raias[-1][2])
            T.d.line([a[0] * T.k, a[1] * T.k, b[0] * T.k, b[1] * T.k], fill=_rgb(cor["raia_linha"]), width=lw)
        a = XY(0, L.raias[0][1]); b = XY(L.m1, L.raias[-1][2])
        T.d.rectangle([min(a[0], b[0]) * T.k, min(a[1], b[1]) * T.k, max(a[0], b[0]) * T.k, max(a[1], b[1]) * T.k],
                      outline=_rgb(cor["piscina_borda"]), width=max(1, int(1.6 * T.k)))

    f = L.fluxo
    mapa = {n.id: n for n in f.nos}
    for a in f.arestas:
        pts = [XY(m, c) for m, c in a.pontos]
        T.linha(pts, cor["fluxo"], 1.7)
    for n in f.nos:
        cx, cy = XY(n.m, n.c)
        hm, hc = _forma(n, H, MED)
        hw, hh = (hm, hc) if H else (hc, hm)
        if n.tipo == "tarefa":
            borda = cor["critico"] if n.critico else cor["tarefa_borda"]
            T.caixa(cx - hw, cy - hh, cx + hw, cy + hh, 12, cor["tarefa_topo"], cor["tarefa_base"], borda,
                    2.6 if n.critico else 1.8)
            fnt, linhas = caber(n.texto, 2 * hw - 22, 2 * hh - 14, "regular", MED["fonte_tarefa"], 12, max_linhas=4)
            T.texto(cx - hw + 11, cy - hh + 5, cx + hw - 11, cy + hh - 5, linhas, fnt.size, cor["tarefa_txt"])
            if n.critico:
                T.circulo(cx + hw - 3, cy - hh + 3, 9, "FFFFFF", cor["critico"], 2)
                T.texto(cx + hw - 12, cy - hh - 6, cx + hw + 6, cy - hh + 12, ["!"], 13, cor["critico"], "negrito")
        elif n.tipo == "decisao":
            T.losango(cx, cy, MED["gate_d"] / 2, cor["gate_topo"], cor["gate_base"], cor["gate_borda"], 1.8)
            s = MED["gate_d"] * 0.16
            larg_x = max(1, int(3.2 * T.k))
            T.d.line([(cx - s) * T.k, (cy - s) * T.k, (cx + s) * T.k, (cy + s) * T.k], fill=_rgb(cor["gate_x"]), width=larg_x)
            T.d.line([(cx - s) * T.k, (cy + s) * T.k, (cx + s) * T.k, (cy - s) * T.k], fill=_rgb(cor["gate_x"]), width=larg_x)
        elif n.tipo == "inicio":
            T.circulo(cx, cy, MED["evento_d"] / 2, cor["inicio_fundo"], cor["inicio_borda"], 2.2)
        elif n.tipo == "fim":
            T.circulo(cx, cy, MED["evento_d"] / 2, cor["fim_fundo"], cor["fim_borda"], 4.4)
        else:
            T.circulo(cx, cy, MED["evento_d"] / 2, cor["inter_fundo"], cor["inter_borda"], 1.8)
            T.circulo(cx, cy, MED["evento_d"] / 2 - 5, cor["inter_fundo"], cor["inter_borda"], 1.4)
    for nid, (m0, c0, m1, c1, linhas, tam, alinh) in L.rotulos.items():
        x0, y0 = XY(m0, c0)
        x1, y1 = XY(m1, c1)
        x0, x1 = min(x0, x1), max(x0, x1)
        y0, y1 = min(y0, y1), max(y0, y1)
        T.texto(x0, y0, x1, y1, linhas, tam, cor["rotulo"], "regular", alinh)
    for a in f.arestas:
        if a.sentido not in ("sim", "nao") or len(a.pontos) < 2:
            continue
        (m0, c0), (m1, c1) = a.pontos[0], a.pontos[1]
        x0, y0 = XY(m0, c0)
        x1, y1 = XY(m1, c1)
        fnt = fonte("negrito", MED["fonte_seta"])
        larg = fnt.getlength(a.rotulo)
        cor_r = cor["sim"] if a.sentido == "sim" else cor["nao"]
        if abs(y1 - y0) < 1:
            sx = 1 if x1 > x0 else -1
            tx = x0 + sx * 8 if sx > 0 else x0 - 8 - larg
            T.texto(tx, y0 - 22, tx + larg, y0 - 3, [a.rotulo], MED["fonte_seta"], cor_r, "negrito", "esquerda")
        else:
            sy = 1 if y1 > y0 else -1
            ty = y0 + 4 if sy > 0 else y0 - 22
            T.texto(x0 + 7, ty, x0 + 7 + larg, ty + 18, [a.rotulo], MED["fonte_seta"], cor_r, "negrito", "esquerda")
    return T.salvar(caminho, largura_px)


def escolher_orientacao(f, largura_max, altura_max, com_piscina=True):
    """Calcula os dois layouts e fica com o que deixa o texto maior na área disponível
    (horizontal, o clássico do Bizagi, ganha empates de até 15%)."""
    candidatos = []
    for H in (True, False):
        for n in f.nos:
            n.rank = 0; n.trilha = 0
        L = layout_fluxo(f, horizontal=H, com_piscina=com_piscina)
        larg = L.m1 if H else L.raias[-1][2]
        alt = L.raias[-1][2] if H else L.m1
        escala = min(largura_max / larg, altura_max / alt)
        candidatos.append((escala * (1.15 if H else 1.0), H))
    melhor = max(candidatos)[1]
    for n in f.nos:
        n.rank = 0; n.trilha = 0
    return layout_fluxo(f, horizontal=melhor, com_piscina=com_piscina)


def _medidas(L):
    larg = L.m1 if L.horizontal else L.raias[-1][2]
    alt = L.raias[-1][2] if L.horizontal else L.m1
    return larg, alt


def ajustar_ao_quadro(f, largura, altura, vao_min=0.0, entrelinha=1.24, proporcao_min=1.2):
    """Para slides: testa larguras de tarefa (a altura vem das linhas que o texto pede) e fica com a
    que deixa a letra maior no quadro largura × altura, sem tarefa quase quadrada e com pelo menos
    `vao_min` (na unidade do quadro) entre as colunas, para as setas respirarem. Ajusta f.med e
    devolve o Layout."""
    base = dict(f.med or MED_SLIDE)
    F = base["fonte_tarefa"]
    fnt = fonte("regular", F)
    tarefas = [n.texto for n in f.nos if n.tipo == "tarefa"] or [""]
    margem = 9
    candidatos = []
    for W in range(100, 211, 10):
        util = (W - 2 * margem) * 0.94          # GUARDA: folga, o PowerPoint quebra antes do Pillow
        if any(fnt.getlength(p) > util for t in tarefas for p in t.split()):
            continue
        nl = max(len(quebrar(t, fnt, util)) for t in tarefas)
        med = dict(base, tarefa_w=W, tarefa_h=max(base["tarefa_h"] * 0.7, nl * F * entrelinha + 2 * 7),
                   rotulo_evento_w=max(96, W * 0.85), rotulo_gate_w=max(110, W))
        if W / med["tarefa_h"] < proporcao_min:
            continue
        for _ in range(4):
            f.med = med
            L = escolher_orientacao(f, largura, altura)
            lu, au = _medidas(L)
            k = min(largura / lu, altura / au)
            if not vao_min or med["gap_m"] * k >= vao_min * 0.98:
                break
            med = dict(med, gap_m=vao_min / k)
        candidatos.append((F * k, W, med))
    if not candidatos:
        f.med = base
        return escolher_orientacao(f, largura, altura)
    melhor = max(c[0] for c in candidatos)
    _, _, med = max((c for c in candidatos if c[0] >= melhor * 0.97), key=lambda c: c[1])
    f.med = med
    return escolher_orientacao(f, largura, altura)


def fluxo_png(conteudo, pal, pasta, raias=None, titulo="", rotulos=None, largura_cm=15.5, altura_cm=18.0,
              com_piscina=True, orientacao=None):
    """Fluxograma BPMN (estilo Bizagi) em PNG. Devolve (caminho, largura_cm, altura_cm)."""
    f = montar_fluxo(conteudo, raias if com_piscina else None, rotulos, titulo)
    if not f.nos:
        return None
    if not com_piscina:
        for n in f.nos:
            n.raia = ""
        f.raias = [""]
    if orientacao in ("horizontal", "vertical"):
        L = layout_fluxo(f, horizontal=orientacao == "horizontal", com_piscina=com_piscina)
    else:
        L = escolher_orientacao(f, largura_cm, altura_cm, com_piscina)
    larg_u = L.m1 if L.horizontal else L.raias[-1][2]
    alt_u = L.raias[-1][2] if L.horizontal else L.m1
    fator = min(largura_cm / larg_u, altura_cm / alt_u)
    w_cm, h_cm = larg_u * fator, alt_u * fator
    largura_px = int(w_cm / 2.54 * 220)
    caminho = os.path.join(pasta, f"fluxo_{uuid.uuid4().hex}.png")
    desenhar_fluxo_png(L, pal, caminho, largura_px=largura_px, nome_piscina=titulo)
    return caminho, w_cm, h_cm


def _itens(conteudo):
    return [x for x in (conteudo if isinstance(conteudo, list) else [conteudo]) if x not in (None, "")]


def ciclo_png(conteudo, pal, pasta, largura_cm=14.0):
    """Etapas em volta de um anel, com setas no sentido horário (PDCA e afins)."""
    itens = [texto_de(x) for x in _itens(conteudo)][:8] or ["—"]
    n = len(itens)
    p = pal.get("primary", "283264")
    W, Hh = 900, 620 if n <= 4 else 700
    T = _Tela(W, Hh, 2.4)
    cx, cy = W / 2, Hh / 2
    rx, ry = W * 0.33, Hh * 0.33
    T.d.ellipse([(cx - rx) * T.k, (cy - ry) * T.k, (cx + rx) * T.k, (cy + ry) * T.k],
                outline=_rgb(lighten(p, 0.72)), width=int(16 * T.k))
    for i in range(n):
        a = -math.pi / 2 + (i + 0.5) * 2 * math.pi / n
        x, y = cx + rx * math.cos(a), cy + ry * math.sin(a)
        tang = math.atan2(ry * math.cos(a), -rx * math.sin(a))
        dx, dy = math.cos(tang), math.sin(tang)
        frente, tras, abert, entalhe = 17, 15, 12, 6
        ponta = (x + frente * dx, y + frente * dy)
        b1 = (x - tras * dx + abert * dy, y - tras * dy - abert * dx)
        meio = (x - (tras - entalhe) * dx, y - (tras - entalhe) * dy)
        b2 = (x - tras * dx - abert * dy, y - tras * dy + abert * dx)
        T.d.polygon([(px * T.k, py * T.k) for px, py in (ponta, b1, meio, b2)], fill=_rgb(darken(p, 0.05)))
    cw, ch = (240, 112) if n <= 4 else (205, 98)
    for i, txt in enumerate(itens):
        a = -math.pi / 2 + i * 2 * math.pi / n
        x, y = cx + rx * math.cos(a), cy + ry * math.sin(a)
        topo, base = ("FFFFFF", lighten(p, 0.80)) if i % 2 else (lighten(p, 0.15), p)
        cor_txt = darken(p, 0.45) if i % 2 else "FFFFFF"
        T.caixa(x - cw / 2, y - ch / 2, x + cw / 2, y + ch / 2, 18, topo, base, darken(p, 0.1), 1.6)
        T.circulo(x - cw / 2 + 4, y - ch / 2 + 4, 17, "FFFFFF", darken(p, 0.1), 2)
        T.texto(x - cw / 2 - 13, y - ch / 2 - 13, x - cw / 2 + 21, y - ch / 2 + 21, [str(i + 1)], 18, darken(p, 0.2), "negrito")
        fnt, linhas = caber(txt, cw - 34, ch - 20, "negrito" if i % 2 == 0 else "regular", 21, 12, max_linhas=4)
        T.texto(x - cw / 2 + 17, y - ch / 2 + 8, x + cw / 2 - 17, y + ch / 2 - 8, linhas, fnt.size, cor_txt,
                "negrito" if i % 2 == 0 else "regular")
    caminho = os.path.join(pasta, f"ciclo_{uuid.uuid4().hex}.png")
    T.salvar(caminho, int(largura_cm / 2.54 * 220))
    return caminho, largura_cm, largura_cm * Hh / W


def piramide_png(conteudo, pal, pasta, largura_cm=14.0):
    """Níveis empilhados: o primeiro item é o topo (prioridade máxima)."""
    itens = [texto_de(x) for x in _itens(conteudo)][:7] or ["—"]
    n = len(itens)
    p = pal.get("primary", "283264")
    W = 900
    alt_nivel = 92 if n <= 4 else 74
    Hh = alt_nivel * n + 40
    T = _Tela(W, Hh, 2.4)
    topo_w, base_w = W * 0.22, W * 0.96
    for i, txt in enumerate(itens):
        y0 = 20 + i * alt_nivel
        y1 = y0 + alt_nivel - 8
        w0 = topo_w + (base_w - topo_w) * i / n
        w1 = topo_w + (base_w - topo_w) * (i + 1) / n
        pts = [((W - w0) / 2, y0), ((W + w0) / 2, y0), ((W + w1) / 2, y1), ((W - w1) / 2, y1)]
        cor_n = _mistura(darken(p, 0.2), lighten(p, 0.62), i / max(1, n - 1))
        mask_pts = [(x * T.k, y * T.k) for x, y in pts]
        x_min, y_min = min(x for x, _ in mask_pts), min(y for _, y in mask_pts)
        m = int(14 * T.k)
        camada = Image.new("RGBA", (int(max(x for x, _ in mask_pts) - x_min) + 2 * m,
                                    int(max(y for _, y in mask_pts) - y_min) + 2 * m), (0, 0, 0, 0))
        ImageDraw.Draw(camada).polygon([(x - x_min + m, y - y_min + m) for x, y in mask_pts], fill=(20, 28, 60, 55))
        _compor(T.img, camada.filter(ImageFilter.GaussianBlur(4 * T.k)), x_min - m + 3 * T.k, y_min - m + 4 * T.k)
        T.d.polygon(mask_pts, fill=_rgb(cor_n), outline=_rgb(darken(p, 0.3)), width=int(1.4 * T.k))
        claro = sum(hex_to_rgb(cor_n)) / 3 > 165
        larg_util = min(w0, w1) - 60
        fnt, linhas = caber(txt, larg_util, alt_nivel - 22, "negrito", 22, 11, max_linhas=2)
        T.texto((W - larg_util) / 2, y0 + 4, (W + larg_util) / 2, y1 - 4, linhas, fnt.size,
                darken(p, 0.5) if claro else "FFFFFF", "negrito")
    caminho = os.path.join(pasta, f"piramide_{uuid.uuid4().hex}.png")
    T.salvar(caminho, int(largura_cm / 2.54 * 220))
    return caminho, largura_cm, largura_cm * Hh / W


def hierarquia_png(conteudo, pal, pasta, largura_cm=15.0):
    """Organograma: grupos {titulo, subitens} lado a lado; lista de textos vira cadeia de cima para baixo."""
    itens = _itens(conteudo)[:6]
    p = pal.get("primary", "283264")
    grupos = []
    for it in itens:
        if isinstance(it, dict) and (it.get("subitens") or it.get("itens")):
            grupos.append((texto_de(it.get("titulo") or it.get("nome") or ""),
                           [texto_de(s) for s in _lista(it.get("subitens") or it.get("itens"))][:6]))
        else:
            grupos.append((texto_de(it), []))
    if all(not subs for _, subs in grupos):
        n = len(grupos)
        W, bh, gap = 620, 70, 34
        Hh = n * bh + (n - 1) * gap + 30
        T = _Tela(W, Hh, 2.4)
        for i, (tit, _) in enumerate(grupos):
            y0 = 15 + i * (bh + gap)
            topo, base = (lighten(p, 0.15), p) if i == 0 else ("FFFFFF", lighten(p, 0.80))
            T.caixa(80, y0, W - 80, y0 + bh, 14, topo, base, darken(p, 0.1), 1.6)
            fnt, linhas = caber(tit, W - 200, bh - 14, "negrito", 22, 12, max_linhas=2)
            T.texto(90, y0, W - 90, y0 + bh, linhas, fnt.size, "FFFFFF" if i == 0 else darken(p, 0.45), "negrito")
            if i < n - 1:
                T.linha([(W / 2, y0 + bh), (W / 2, y0 + bh + gap)], darken(p, 0.1), 2.2)
        largura_cm = min(largura_cm, 11.0)
    else:
        n = len(grupos)
        col_w, gap = 230, 26
        W = n * col_w + (n - 1) * gap + 40
        maior = max(len(s) for _, s in grupos)
        bh, sh, sgap = 78, 60, 16
        Hh = 30 + bh + 34 + maior * (sh + sgap) + 10
        T = _Tela(W, Hh, 2.4)
        for i, (tit, subs) in enumerate(grupos):
            x0 = 20 + i * (col_w + gap)
            T.caixa(x0, 15, x0 + col_w, 15 + bh, 14, lighten(p, 0.15), p, darken(p, 0.15), 1.6)
            fnt, linhas = caber(tit, col_w - 24, bh - 12, "negrito", 21, 11, max_linhas=3)
            T.texto(x0 + 12, 15, x0 + col_w - 12, 15 + bh, linhas, fnt.size, "FFFFFF", "negrito")
            if subs:
                eixo = x0 + 22
                y_fim = 15 + bh + 34 + (len(subs) - 1) * (sh + sgap) + sh / 2
                T.linha([(eixo, 15 + bh), (eixo, y_fim)], lighten(p, 0.35), 2.2, seta=False)
                for j, s in enumerate(subs):
                    y0 = 15 + bh + 34 + j * (sh + sgap)
                    T.linha([(eixo, y0 + sh / 2), (x0 + 44, y0 + sh / 2)], lighten(p, 0.35), 2.2)
                    T.caixa(x0 + 44, y0, x0 + col_w, y0 + sh, 10, "FFFFFF", lighten(p, 0.84), lighten(p, 0.1), 1.4)
                    fnt, linhas = caber(s, col_w - 64, sh - 10, "regular", 18, 10, max_linhas=3)
                    T.texto(x0 + 54, y0, x0 + col_w - 10, y0 + sh, linhas, fnt.size, darken(p, 0.45))
    caminho = os.path.join(pasta, f"hierarquia_{uuid.uuid4().hex}.png")
    T.salvar(caminho, int(largura_cm / 2.54 * 220))
    return caminho, largura_cm, largura_cm * T.img.height / T.img.width
