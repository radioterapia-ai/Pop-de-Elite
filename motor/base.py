"""Utilidades comuns aos três renderizadores (Word, Excel, PPT).

Paleta de cores, leitura tolerante de JSON, coerção de texto, nomes de arquivo,
datas de vigência e normalização do bloco `metadata`.
"""

import json
import os
import re
import tempfile
import unicodedata
from datetime import date

from .i18n import CLASSIFICACOES, idioma_valido

DEFAULT_PRIMARY = "283264"

VALIDADE_ANOS = 2

TIPOS_TEXTO = ("CONS", "TERM", "CHK", "FORM", "INF", "NT", "COD")
TIPOS_DOCUMENTO = ("POP", "POL", "PROT", "DIR", "PLAN", "NOR", "PROG", "REG", "MAN", "FTI") + TIPOS_TEXTO



def hex_to_rgb(h):
    h = h.lstrip("#")
    return tuple(int(h[i:i+2], 16) for i in (0, 2, 4))

def rgb_to_hex(r, g, b):
    return f"{min(255,max(0,int(r))):02X}{min(255,max(0,int(g))):02X}{min(255,max(0,int(b))):02X}"

def lighten(hex_color, pct):
    """Clareia uma cor por pct% misturando com branco."""
    r, g, b = hex_to_rgb(hex_color)
    return rgb_to_hex(r + (255-r)*pct, g + (255-g)*pct, b + (255-b)*pct)

def darken(hex_color, pct):
    r, g, b = hex_to_rgb(hex_color)
    return rgb_to_hex(r*(1-pct), g*(1-pct), b*(1-pct))

def build_palette(primary_hex):
    """Gera paleta completa a partir de uma cor primária."""
    p = primary_hex.lstrip("#").upper()
    return {
        "primary": p,
        "primary_dark": darken(p, 0.15),
        "secondary": lighten(p, 0.45),
        "tertiary": lighten(p, 0.70),
        "quaternary": lighten(p, 0.85),
        "text_on_primary": "FFFFFF",
        "text_on_secondary": darken(p, 0.30),
        "text_body": "1A1A1A",
        "header_text": "000000",
        "border": darken(p, 0.0),
        "border_light": lighten(p, 0.20),
        "risk_red": "8B1A1A",
        "barrier_green": "1B5E20",
        "gray_border": "7F8C9A",
        "annex_border": "000000",
    }

def parse_color_input(val):
    """Aceita #RRGGBB, RRGGBB, #RGB ou rgb()/rgba() → hex de 6 caracteres."""
    if not val:
        return DEFAULT_PRIMARY
    val = str(val).strip()
    if val.startswith("rgb"):
        nums = re.findall(r'[\d]+\.?[\d]*', val)
        if len(nums) >= 3:
            r, g, b = (min(255, max(0, int(float(n)))) for n in nums[:3])
            return rgb_to_hex(r, g, b)
        return DEFAULT_PRIMARY
    c = ''.join(ch for ch in val.lstrip("#") if ch in '0123456789abcdefABCDEF')
    if len(c) >= 6:
        return c[:6].upper()
    if len(c) == 3:
        return (c[0]*2 + c[1]*2 + c[2]*2).upper()
    return DEFAULT_PRIMARY

def paleta(cor=None, overrides=None):
    """Paleta a partir da cor primária, com sobreposições opcionais por chave."""
    pal = build_palette(parse_color_input(cor))
    for k, v in (overrides or {}).items():
        if v and str(v).strip():
            pal[k] = parse_color_input(v)
    return pal



def carregar_json(dados):
    """Aceita dict, ou texto com cercas ``` e lixo antes/depois do objeto."""
    if isinstance(dados, dict):
        return dados
    s = str(dados or "").strip()
    inicio = s.find("{")
    if inicio == -1:
        raise ValueError("Nenhum objeto JSON encontrado.")
    obj, _ = json.JSONDecoder().raw_decode(s[inicio:])
    return obj

def carregar_json_multiplo(dados):
    """Funde vários blocos JSON concatenados (apresentações longas vêm em partes)."""
    if isinstance(dados, dict):
        return dados
    s = str(dados or "").strip()
    decoder = json.JSONDecoder()
    blocos, pos = [], 0
    while pos < len(s):
        prox = s.find("{", pos)
        if prox == -1:
            break
        try:
            obj, fim = decoder.raw_decode(s, idx=prox)
            if isinstance(obj, dict) and ("slides" in obj or "metadata" in obj or "metadata_ppt" in obj):
                blocos.append(obj)
            pos = fim
        except json.JSONDecodeError:
            pos = prox + 1
    if not blocos:
        return carregar_json(s)
    if len(blocos) == 1:
        return blocos[0]
    fundido = {"metadata": blocos[0].get("metadata", blocos[0].get("metadata_ppt", {})), "slides": []}
    for b in blocos:
        if isinstance(b.get("slides"), list):
            fundido["slides"].extend(b["slides"])
    return fundido

def texto_de(valor):
    """Ponto único por onde todo texto passa antes de ir para o documento.

    Um nó {"texto": ..., "forma": ...} entregue direto ao python-docx vira
    "textoforma" (ele itera as chaves do dicionário). Aqui dict, lista e número
    viram texto legível.
    """
    if valor is None:
        return ""
    if isinstance(valor, str):
        return valor
    if isinstance(valor, (int, float)):
        return str(valor)
    if isinstance(valor, dict):
        for chave in ("texto", "titulo", "label", "nome", "acao", "pergunta",
                      "descricao", "conteudo", "valor"):
            if valor.get(chave) not in (None, ""):
                return texto_de(valor[chave])
        return " — ".join(texto_de(v) for v in valor.values() if v not in (None, ""))
    if isinstance(valor, (list, tuple)):
        return ", ".join(texto_de(v) for v in valor)
    return str(valor)

def sem_acento(texto):
    return "".join(c for c in unicodedata.normalize("NFD", str(texto))
                   if unicodedata.category(c) != "Mn").lower()



def nome_arquivo_seguro(texto, padrao="documento"):
    """Só ASCII: com acentos, o download chega no navegador como "download"
    (sem nome e sem extensão). Também evita caracteres proibidos no Windows."""
    s = unicodedata.normalize("NFKD", str(texto)).encode("ascii", "ignore").decode()
    s = s.replace(" ", "_").replace("/", "-")
    s = re.sub(r"[^A-Za-z0-9._-]", "", s)
    return s[:120] or padrao

def nome_de_saida(codigo, descricao, extensao, padrao="documento"):
    """"POP-RTX-014" + "Manutenção do acelerador" → "POP-RTX-014_Manutencao_do_acelerador.docx"."""
    cod = nome_arquivo_seguro(re.sub(r"\.(docx|xlsx|pptx|json)$", "", texto_de(codigo or "").strip(), flags=re.I), "")
    desc = nome_arquivo_seguro(re.sub(r"\.(docx|xlsx|pptx|json)$", "", texto_de(descricao or "").strip(), flags=re.I), "")
    if cod and desc.upper().startswith(cod.upper()):
        desc = desc[len(cod):].lstrip("_-")
    base = "_".join(p for p in (cod, desc) if p) or padrao
    return f"{base[:150]}.{extensao}"

def pasta_saida(pasta=None):
    """Pasta onde os arquivos são gravados: argumento > $POP_SAIDA > temp do sistema."""
    p = pasta or os.environ.get("POP_SAIDA") or tempfile.gettempdir()
    os.makedirs(p, exist_ok=True)
    return p



def _ler_data(texto):
    """Lê 'MM/AAAA', 'DD/MM/AAAA', 'AAAA-MM-DD' ou 'MM-AAAA'. Devolve (date, formato)."""
    s = str(texto or "").strip()
    m = re.fullmatch(r"(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})", s)
    if m:
        d, mth, a = map(int, m.groups())
        try:
            return date(a, mth, d), "dma"
        except ValueError:
            return None, None
    m = re.fullmatch(r"(\d{4})-(\d{1,2})-(\d{1,2})", s)
    if m:
        a, mth, d = map(int, m.groups())
        try:
            return date(a, mth, d), "iso"
        except ValueError:
            return None, None
    m = re.fullmatch(r"(\d{1,2})[/.-](\d{4})", s)
    if m:
        mth, a = map(int, m.groups())
        if 1 <= mth <= 12:
            return date(a, mth, 1), "ma"
    return None, None

def _formatar_data(d, formato):
    if formato == "dma":
        return d.strftime("%d/%m/%Y")
    if formato == "iso":
        return d.isoformat()
    return d.strftime("%m/%Y")

def somar_anos(texto_data, anos):
    """Mesma data N anos depois, no mesmo formato. 29/02 vira 28/02."""
    d, fmt_ = _ler_data(texto_data)
    if not d:
        return ""
    try:
        nova = d.replace(year=d.year + anos)
    except ValueError:
        nova = d.replace(year=d.year + anos, day=28)
    return _formatar_data(nova, fmt_)

def data_valida(texto):
    return _ler_data(texto)[0] is not None

def hoje_mes_ano(hoje=None):
    return (hoje or date.today()).strftime("%m/%Y")



def tipo_documento(meta):
    """Tipo declarado ou deduzido do prefixo do código (POL-..., PROT-...)."""
    declarado = str(meta.get("tipo_documento", "")).strip().upper()
    if declarado in TIPOS_DOCUMENTO:
        return declarado
    prefixo = str(meta.get("codigo", "")).split("-")[0].strip().upper()
    return prefixo if prefixo in TIPOS_DOCUMENTO else "POP"

def _pessoa(valor):
    if isinstance(valor, dict):
        return {"nome": texto_de(valor.get("nome", "")), "cargo": texto_de(valor.get("cargo", ""))}
    if isinstance(valor, str) and valor.strip():
        return {"nome": valor.strip(), "cargo": ""}
    return {"nome": "", "cargo": ""}

def _classificacao(valor):
    v = sem_acento(valor or "")
    for chave in CLASSIFICACOES:
        if chave in v:
            return chave
    if "public" in v:
        return "publico"
    if "intern" in v:
        return "interno"
    if "restri" in v:
        return "restrito"
    if "confiden" in v:
        return "confidencial"
    return "interno"

def _publico(valor):
    return "paciente" if "pacien" in sem_acento(valor or "") else "interno"

def normalizar_metadata(meta, hoje=None):
    """Aplica em código as regras que não dependem da IA.

    - validade = elaboração + 2 anos (ou `validade_anos`), sempre recalculada;
    - "Revisado por" substitui "Validado por" (JSON antigo continua aceito);
    - tipo documental, idioma, público e classificação de acesso com padrões seguros
      (sem classificação declarada, documento para paciente é de uso público).
    """
    m = dict(meta or {})
    m["tipo_documento"] = tipo_documento(m)
    m["idioma"] = idioma_valido(m.get("idioma"))
    m["publico"] = _publico(m.get("publico"))
    if str(m.get("classificacao") or "").strip():
        m["classificacao"] = _classificacao(m["classificacao"])
    else:
        m["classificacao"] = "publico" if m["publico"] == "paciente" else "interno"
    if not str(m.get("titulo_processo") or "").strip() and m.get("titulo"):
        m["titulo_processo"] = texto_de(m["titulo"])
    m["versao"] = texto_de(m.get("versao") or "01")
    if not str(m.get("codigo", "")).strip():
        m["codigo"] = f"{m['tipo_documento']}-XXX-001"

    if not data_valida(m.get("data_elaboracao")):
        m["data_elaboracao"] = hoje_mes_ano(hoje)
    try:
        anos = int(m.get("validade_anos") or VALIDADE_ANOS)
    except (TypeError, ValueError):
        anos = VALIDADE_ANOS
    anos = min(5, max(1, anos))
    m["validade"] = somar_anos(m["data_elaboracao"], anos)

    m["elaborado_por"] = _pessoa(m.get("elaborado_por"))
    m["revisado_por"] = _pessoa(m.get("revisado_por") or m.get("validado_por"))
    m["aprovado_por"] = _pessoa(m.get("aprovado_por"))
    m.pop("validado_por", None)
    return m
