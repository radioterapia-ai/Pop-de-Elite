---
title: POP de Elite — Motor
emoji: ☢️
colorFrom: indigo
colorTo: blue
sdk: docker
app_port: 7860
pinned: false
short_description: POP de Elite document engine (JSON → Word, Excel, PPT)
---

# POP de Elite — document engine

A headless API, called by the radioterapia.ai backend. It receives validated JSON documents
and returns Word, Excel and PowerPoint files. It keeps no document and talks to no AI: the
Gemini key stays with the site.

- `GET /saude`: service status and version.
- `POST /renderizar`: `{"word": {...}, "excel": {...}, "ppt": {...}, "cor": "#283264", "logo_b64": "...", "estilo": "cientifico"}`
  → `{"arquivos": [{"formato", "nome", "mime", "tamanho", "base64"}], "erros": {}}`

## Secret

In *Settings → Variables and secrets*, create the secret `POP_MOTOR_TOKEN` with a long random
value, and use the same value on the site. The engine requires the `X-Pop-Token` header, so only
the site can call it; without the secret, it refuses every `/renderizar`.

## Optional variables

- `POP_IMAGENS_SEGUNDOS` (default 45): maximum time per deck spent looking up freely licensed
  images on Wikimedia Commons and Openverse. When it runs out, slides get a local placeholder.
- `POP_SEM_IMAGENS=1`: no image lookup on the internet.
