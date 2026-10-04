#!/usr/bin/env python3
"""Monta a pasta do Space do Hugging Face (motor de documentos) e, se pedido, publica.

    python scripts/montar_space.py                       # cria _montagem/space/
    python scripts/montar_space.py --enviar Radioterapia-AI/pop-de-elite-motor
                                                         # publica (precisa de HF_TOKEN com escrita)

A pasta _montagem/space/ também pode ser arrastada para "Files → Add file → Upload files"
de um Space novo (SDK Docker) no site do Hugging Face.
"""

import argparse
import os
import shutil
import stat
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
ARQUIVOS = ["app.py", "Dockerfile", "README.md", "requirements.txt"]


def apagar(pasta):
    """No Windows, o copytree copia a marca de somente leitura das pastas, e o rmtree não as apaga."""
    for p in (pasta, *pasta.rglob("*")):
        os.chmod(p, os.stat(p).st_mode | stat.S_IWRITE)
    shutil.rmtree(pasta)


def montar(destino):
    if destino.exists():
        apagar(destino)
    destino.mkdir(parents=True)
    for nome in ARQUIVOS:
        shutil.copy2(RAIZ / "space" / nome, destino / nome)
    shutil.copytree(RAIZ / "motor", destino / "motor",
                    ignore=shutil.ignore_patterns("__pycache__", "*.pyc"))
    (destino / ".dockerignore").write_text("__pycache__/\n*.pyc\n", encoding="utf-8")
    return sorted(str(p.relative_to(destino)) for p in destino.rglob("*") if p.is_file())


def enviar(destino, repo_id, privado):
    try:
        from huggingface_hub import HfApi
    except ImportError:
        raise SystemExit("Instale o cliente:  pip install huggingface_hub")
    token = os.environ.get("HF_TOKEN")
    if not token:
        raise SystemExit("Defina HF_TOKEN (Hugging Face → Settings → Access Tokens, permissão de escrita).")
    api = HfApi(token=token)
    api.create_repo(repo_id, repo_type="space", space_sdk="docker", private=privado, exist_ok=True)
    api.upload_folder(repo_id=repo_id, repo_type="space", folder_path=str(destino),
                      commit_message="POP de Elite 2.0 — motor de documentos")
    if os.environ.get("POP_MOTOR_TOKEN"):
        api.add_space_secret(repo_id, "POP_MOTOR_TOKEN", os.environ["POP_MOTOR_TOKEN"])
        print("Segredo POP_MOTOR_TOKEN atualizado no Space.")
    else:
        print("Atenção: sem POP_MOTOR_TOKEN, o motor recusa o /renderizar até o segredo ser cadastrado no Space.")
    print(f"Publicado: https://huggingface.co/spaces/{repo_id}")
    dono, nome = repo_id.split("/", 1)
    print(f"URL da API (POP_MOTOR_URL): https://{dono.lower()}-{nome.lower().replace('_', '-')}.hf.space")


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--destino", default=str(RAIZ / "_montagem" / "space"))
    ap.add_argument("--enviar", metavar="DONO/NOME", help="publica no Space indicado (cria se não existir)")
    ap.add_argument("--privado", action="store_true",
                    help="Space privado (aí o Cloudflare precisa de POP_MOTOR_HF_TOKEN para chamá-lo)")
    args = ap.parse_args()
    destino = Path(args.destino)
    arquivos = montar(destino)
    print(f"{len(arquivos)} arquivos em {destino}")
    if args.enviar:
        enviar(destino, args.enviar, args.privado)


if __name__ == "__main__":
    main()
