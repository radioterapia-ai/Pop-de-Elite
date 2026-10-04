"""API do motor de documentos: recebe os JSONs já validados pelo backend do site e devolve os arquivos
prontos (Word, Excel, PowerPoint) em base64. Não guarda nada e não conversa com IA nenhuma.

    GET  /saude         {"ok": true, "diagramas": "bpmn"}
    POST /renderizar    {"word": {...}, "excel": {...}, "ppt": {...}, "cor": "#283264",
                         "logo_b64": "...", "estilo": "cientifico",
                         "imagens": {"<número do slide>": "<base64>"}}   (ilustrações geradas no site)
                     →  {"arquivos": [{"formato", "nome", "mime", "tamanho", "base64"}], "erros": {}}

O /renderizar exige o cabeçalho "X-Pop-Token: <token>" igual ao segredo POP_MOTOR_TOKEN do Space
(ou "Authorization: Bearer <token>"; num Space privado o Authorization é do Hugging Face).
Sem o segredo, recusa com 403.

As mesmas rotas servem o Space do 1.0 (space_v1/app.py, junto das telas do 1.0) e o Space Docker
avulso (space/app.py).
"""

import base64
import binascii
import io
import os
import secrets
import shutil
import tempfile
from typing import Dict, Optional

from fastapi import APIRouter, Header, HTTPException
from PIL import Image
from pydantic import BaseModel

from motor import gerar_excel, gerar_ppt, gerar_word

VERSAO = "2.1"
LIMITE_LOGO = 2 * 1024 * 1024
LIMITE_IMAGEM = 3 * 1024 * 1024
MAX_IMAGENS = 6
MIMES = {
    "word": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "excel": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "ppt": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
}

rotas = APIRouter()


class Pedido(BaseModel):
    word: Optional[dict] = None
    excel: Optional[dict] = None
    ppt: Optional[dict] = None
    cor: Optional[str] = None
    logo_b64: Optional[str] = None
    estilo: Optional[str] = None
    imagens: Optional[Dict[str, str]] = None


def _autorizar(x_pop_token, authorization):
    # GUARDA: sem o segredo, recusa. O Space é público, e aberto qualquer um usaria o /renderizar.
    # 403 e não 503: o site trata 403 como token errado na hora, e 503 como motor acordando.
    token = os.environ.get("POP_MOTOR_TOKEN", "")
    if not token:
        raise HTTPException(status_code=403, detail="Motor sem POP_MOTOR_TOKEN configurado.")
    enviado = x_pop_token or (authorization or "").removeprefix("Bearer ").strip()
    if not secrets.compare_digest(enviado.encode(), token.encode()):
        raise HTTPException(status_code=401, detail="Token inválido.")


def _logo(logo_b64):
    """Logo em base64 (PNG, JPEG, WEBP, GIF...) → PNG de até 800 px, que Word, Excel e PPT aceitam."""
    if not logo_b64:
        return None
    try:
        dados = base64.b64decode(logo_b64.split(",")[-1], validate=True)
    except (binascii.Error, ValueError):
        raise HTTPException(status_code=400, detail="Logo inválido (base64).")
    if len(dados) > LIMITE_LOGO:
        raise HTTPException(status_code=413, detail="Logo maior que 2 MB.")
    try:
        with Image.open(io.BytesIO(dados)) as img:
            img.load()
            img = img.convert("RGBA")
            img.thumbnail((800, 800))
            saida = io.BytesIO()
            img.save(saida, "PNG", optimize=True)
            return saida.getvalue()
    except Exception:
        raise HTTPException(status_code=400, detail="Logo inválido: envie PNG ou JPEG.")


def _imagens(imagens):
    """{"6": "<base64>"} → {"6": bytes}. Imagem inválida ou grande demais é ignorada: o slide busca foto na web."""
    saida = {}
    for numero, b64 in list((imagens or {}).items())[:MAX_IMAGENS]:
        if not str(numero).isdigit() or not isinstance(b64, str):
            continue
        try:
            dados = base64.b64decode(b64.split(",")[-1], validate=True)
        except (binascii.Error, ValueError):
            continue
        if 0 < len(dados) <= LIMITE_IMAGEM:
            saida[str(numero)] = dados
    return saida


@rotas.get("/saude")
def saude():
    return {"ok": True, "servico": "POP de Elite — motor", "versao": VERSAO, "diagramas": "bpmn"}


@rotas.post("/renderizar")
def renderizar(pedido: Pedido, x_pop_token: Optional[str] = Header(default=None),
               authorization: Optional[str] = Header(default=None)):
    _autorizar(x_pop_token, authorization)
    logo = _logo(pedido.logo_b64)
    pasta = tempfile.mkdtemp(prefix="pop_")
    try:
        arquivos, erros = [], {}
        tarefas = [("word", gerar_word, pedido.word, {}),
                   ("excel", gerar_excel, pedido.excel, {}),
                   ("ppt", gerar_ppt, pedido.ppt, {"estilo": pedido.estilo, "imagens": _imagens(pedido.imagens)})]
        for formato, gerar, dados, extra in tarefas:
            if not dados:
                continue
            try:
                caminho = gerar(dados, pasta=pasta, cor=pedido.cor, logo=logo, **extra)
                with open(caminho, "rb") as f:
                    conteudo = f.read()
                arquivos.append({"formato": formato, "nome": os.path.basename(caminho), "mime": MIMES[formato],
                                 "tamanho": len(conteudo), "base64": base64.b64encode(conteudo).decode()})
            except Exception as e:
                erros[formato] = str(e)[:300]
        if not arquivos:
            raise HTTPException(status_code=422, detail="; ".join(f"{k}: {v}" for k, v in erros.items()) or "Nada para gerar.")
        return {"arquivos": arquivos, "erros": erros}
    finally:
        shutil.rmtree(pasta, ignore_errors=True)
