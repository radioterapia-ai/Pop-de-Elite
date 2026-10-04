# Instructions for the language model

This folder is the single source of everything Google Gemini reads in POP de Elite. The backend keeps
no instruction text anywhere else: `node scripts/montar_prompts.mjs` compiles these files into
`cloudflare/pop/prompts/textos.js`, and `node scripts/montar_prompts.mjs --verificar` fails when the
two drift apart.

The instructions are written in Portuguese. The documents come out in Portuguese, English or Spanish.

```
prompts/
├── identidade/                  WHO answers: the Quality Advisor, shared with the 1.0 Gems
│   ├── conselheiro.md           the conversation and the Word document
│   ├── conselheiro_planilha.md  the Excel management sheet
│   └── conselheiro_ppt.md       the PowerPoint training deck
└── agentes/                     WHAT the task is
    ├── triagem.md               the conversation: interview, classification, summary of the request
    ├── tipo_escolhido.md        added when the person picked a document type on the welcome screen
    ├── word.md                  the Word document (procedures, policies, protocols and the other normative types)
    ├── word_texto.md            the Word document of the supporting types (the "institutional text" layout)
    ├── tipos/<TYPE>.md          one lens per document type; only the requested one is sent
    ├── referencial.md           safe-citation rules, only when the person asks for a framework
    ├── planilha.md              the Excel sheet, built from the Word document
    ├── ppt.md                   the PowerPoint deck, built from the Word document
    ├── imagem.md                one training illustration (image model)
    ├── reparo_json.md           turns a reply that came back as text into valid JSON
    ├── auditor.md               audits a document the person already has (text in the chat)
    └── revisao.md               after an audit, added to the conversation and the Word document: the audited document is the main source
```

## How each call is built

The system instruction always puts the identity first and the task after it.

| Call | Identity | Task | Placeholders filled by the backend |
|---|---|---|---|
| Conversation (every message) | `conselheiro.md` | `triagem.md`, plus `tipo_escolhido.md` and `revisao.md` | `{{CAPITULOS}}` (chapters of the knowledge base), `{{HOJE}}` (month and year), `{{TIPO}}` |
| Word | `conselheiro.md` | `word.md` or `word_texto.md`, then `tipos/<TYPE>.md`, plus `referencial.md` and `revisao.md` | `{{REFERENCIAIS}}` |
| Excel | `conselheiro_planilha.md` | `planilha.md` | — |
| PowerPoint | `conselheiro_ppt.md` | `ppt.md` | `{{MINIMO_SLIDES}}` |
| Format repair | none: a mechanical task | `reparo_json.md` | `{{DOCUMENTO}}` |
| Audit of an existing document | `conselheiro.md` | `auditor.md` | `{{HOJE}}` |
| Illustration (up to 3) | none: sent as the request text | `imagem.md` | `{{CENA}}` |

The `<!-- ... -->` comment at the top of each file is documentation and is not sent to the model.

## Changing an instruction

1. Edit the `.md` file.
2. Run `node scripts/montar_prompts.mjs`. The backend tests fail if you forget.
3. The rules every document must pass are also checked in code, in `cloudflare/pop/regras.js`. An
   instruction that contradicts them produces documents that go back to the model for correction.

## What is not here

The knowledge base the model consults on radioterapia.ai, a quality-management treatise written for
this project, is not published. `{{CAPITULOS}}` and the reference sections sent with the Word document
come from it. The tests use a short fictitious one, in `tests/fixtures/`.
