"""POP de Elite — motor de documentos como Space Docker avulso, para quem quiser hospedar só o motor.

A API (GET /saude, POST /renderizar com o X-Pop-Token) está em motor/api.py. No radioterapia.ai
ela roda dentro do Space do 1.0 (space_v1/app.py), junto das telas do 1.0.
"""

from fastapi import FastAPI

from motor.api import VERSAO, rotas, saude

app = FastAPI(title="POP de Elite — motor", version=VERSAO, docs_url=None, redoc_url=None)
app.include_router(rotas)
app.get("/")(saude)
