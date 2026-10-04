#!/usr/bin/env python3
"""Monta e publica o Space Radioterapia-AI/POP: o app do 1.0 (Gradio) e a API do motor que o site chama.

    python scripts/montar_space_v1.py                              # cria _montagem/space_v1/
    python scripts/montar_space_v1.py --enviar Radioterapia-AI/POP # publica (HF_TOKEN com escrita)

Envia só o que é deste repositório (app.py, motor/, requirements.txt, packages.txt). O README do
Space (configuração do Gradio) e assets/ (logo da capa) continuam como estão lá.
"""

import argparse
import os
import shutil
import stat
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
ARQUIVOS = ["app.py", "requirements.txt", "packages.txt"]


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
        shutil.copy2(RAIZ / "space_v1" / nome, destino / nome)
    shutil.copytree(RAIZ / "motor", destino / "motor",
                    ignore=shutil.ignore_patterns("__pycache__", "*.pyc"))
    return sorted(str(p.relative_to(destino)) for p in destino.rglob("*") if p.is_file())


def enviar(destino, repo_id):
    try:
        from huggingface_hub import HfApi
    except ImportError:
        raise SystemExit("Instale o cliente:  pip install huggingface_hub")
    token = os.environ.get("HF_TOKEN")
    if not token:
        raise SystemExit("Defina HF_TOKEN (Hugging Face → Settings → Access Tokens, permissão de escrita).")
    api = HfApi(token=token)
    if os.environ.get("POP_MOTOR_TOKEN"):
        api.add_space_secret(repo_id, "POP_MOTOR_TOKEN", os.environ["POP_MOTOR_TOKEN"])
        print("Segredo POP_MOTOR_TOKEN atualizado no Space.")
    else:
        print("Atenção: sem POP_MOTOR_TOKEN, a API do motor recusa o /renderizar até o segredo ser cadastrado no Space.")
    # GUARDA: o Space já existe (é o 1.0 em produção): não cria, não apaga nada além do que enviamos
    api.upload_folder(repo_id=repo_id, repo_type="space", folder_path=str(destino),
                      commit_message="POP de Elite 1.0 e a API do motor 2.0")
    print(f"Publicado: https://huggingface.co/spaces/{repo_id}")


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--destino", default=str(RAIZ / "_montagem" / "space_v1"))
    ap.add_argument("--enviar", metavar="DONO/NOME", help="publica no Space indicado")
    args = ap.parse_args()
    destino = Path(args.destino)
    arquivos = montar(destino)
    print(f"{len(arquivos)} arquivos em {destino}")
    if args.enviar:
        enviar(destino, args.enviar)


if __name__ == "__main__":
    main()
