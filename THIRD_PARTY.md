# Third-party components

Nothing below is bundled in this repository: libraries come from PyPI at install
time, fonts come from the operating system or the container image, and services are
reached over the network when the project runs on radioterapia.ai.

## Libraries

| Component | Used for | Licence | Version | Source |
|---|---|---|---|---|
| python-docx | Word documents | MIT | `>=1.1,<2` | <https://github.com/python-openxml/python-docx> |
| python-pptx | PowerPoint decks | MIT | `>=1.0` | <https://github.com/scanny/python-pptx> |
| openpyxl | Excel sheets | MIT | `>=3.1` | <https://foss.heptapod.net/openpyxl/openpyxl> |
| Pillow | Diagrams, image handling, text measurement | MIT-CMU (HPND) | `>=10` | <https://github.com/python-pillow/Pillow> |
| FastAPI | The engine's HTTP API | MIT | `>=0.110` | <https://github.com/fastapi/fastapi> |
| Uvicorn | ASGI server for the API | BSD-3-Clause | `>=0.29` | <https://github.com/encode/uvicorn> |
| Gradio | The 1.0 app, provided by the Hugging Face Space runtime | Apache-2.0 | the Space's `sdk_version` | <https://github.com/gradio-app/gradio> |

Development only: pytest (MIT), Ruff (MIT), HTTPX (BSD-3-Clause).

## Fonts

| Font | Used for | Licence | Installed by |
|---|---|---|---|
| Carlito | Measuring and drawing text with the metrics of Calibri, the font of the documents | SIL OFL 1.1 | `fonts-crosextra-carlito` in the container image and in CI |
| DejaVu Sans | Placeholder illustrations | Bitstream Vera License; DejaVu changes in the public domain | `fonts-dejavu-core` |

On Windows, Calibri itself is used when Carlito is not installed.

## Services

| Service | Role | Where it is called |
|---|---|---|
| Google Gemini | Conversation, document content and training illustrations | the backend, `cloudflare/pop/gemini.js` |
| Groq (Whisper) | Speech-to-text for recorded audio | radioterapia.ai audio route |
| Hugging Face Spaces | Hosting of the document engine and of the 1.0 app | `space/`, `space_v1/` |
| Wikimedia Commons, Openverse | Freely licensed photo for a training slide whose illustration failed, searched by a few English keywords | `motor/ppt.py`; off with `POP_SEM_IMAGENS=1` |
| Cloudflare | Hosting of radioterapia.ai | the site |
