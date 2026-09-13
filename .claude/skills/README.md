# Skills instaladas

Skills de terceiros copiadas para este repositório. Ficam disponíveis para
qualquer sessão do Claude Code aberta na raiz do projeto — sem `npx`, sem
marketplace, sem passo de instalação.

## O que está instalado

| Skill | Invocação | Origem |
|---|---|---|
| `find-skills` | automática | [vercel-labs/skills](https://github.com/vercel-labs/skills/tree/main/skills/find-skills) |
| `git-guardrails-claude-code` | automática | [mattpocock/skills](https://github.com/mattpocock/skills/tree/main/skills/misc/git-guardrails-claude-code) |
| `grill-me` | `/grill-me` | [mattpocock/skills](https://github.com/mattpocock/skills/tree/main/skills/productivity/grill-me) |
| `grilling` | automática | [mattpocock/skills](https://github.com/mattpocock/skills/tree/main/skills/productivity/grilling) |
| `superpowers` (14 skills) | `superpowers:<skill>` | [obra/superpowers](https://github.com/obra/superpowers) |

`grilling` não foi pedida explicitamente, mas `grill-me` é só um atalho cujo
corpo é *"Call the Skill tool with 'grilling'"* — sem ela a skill não faz nada.

## Duas formas de instalação, e por quê

**Skills soltas** (`find-skills`, `git-guardrails-claude-code`, `grill-me`,
`grilling`) — cada uma é um diretório com `SKILL.md`, que o Claude Code carrega
como skill de projeto. Nome de invocação = nome do diretório.

**`superpowers/` é um plugin**, não uma skill solta. Ele traz um manifesto em
`.claude-plugin/plugin.json`, então o Claude Code o carrega como
`superpowers@skills-dir` e nomeia suas skills `superpowers:brainstorming`,
`superpowers:test-driven-development`, etc. Esse namespace importa: as skills do
superpowers se referenciam mutuamente por esses nomes. Copiá-las soltas em
`.claude/skills/` quebraria todas as referências cruzadas.

O plugin também registra um hook `SessionStart` que injeta a skill
`using-superpowers` no início de cada sessão — é assim que o superpowers se
auto-ativa.

> Plugin de escopo de projeto carrega só depois que você aceita o diálogo de
> confiança do workspace, e só quando a sessão é aberta na raiz do repositório
> (não caminha até a raiz a partir de um subdiretório, como as skills soltas fazem).

## `git-guardrails-claude-code` está instalada, mas inativa

Essa skill *configura* um hook `PreToolUse` que bloqueia `git push`,
`git reset --hard`, `git clean -f`, `git branch -D`, `git checkout .` e
`git restore .`.

O hook **não** foi ativado — nenhum `.claude/settings.json` foi criado. Só os
arquivos da skill estão aqui. Para ativar, rode `/git-guardrails-claude-code` e
escolha o escopo; ela copia o script e edita o settings.

Vale saber antes de ativar: com o hook ligado, o Claude não consegue mais dar
`git push` neste projeto — nem quando você pedir. O push passa a ser manual.

## Origem exata

Copiado byte a byte destes commits:

| Repositório | Commit | Data | Licença |
|---|---|---|---|
| `vercel-labs/skills` | `d667282815248da03a08a18272b5d2eef9caf77c` | 2026-09-11 | MIT — Vercel, Inc. |
| `mattpocock/skills` | `3cca18b368ae95cdbdebbff572ccafa662551015` | 2026-09-04 | MIT — Matt Pocock |
| `obra/superpowers` | `b36e0829c6d0140e93cfef2ca599b1b07d4a7797` (v6.3.0) | 2026-08-12 | MIT — Jesse Vincent |

Os textos das licenças estão em `LICENSES/`, e o do superpowers em
`superpowers/LICENSE`.

Dois arquivos do upstream do superpowers foram deixados de fora por não terem
função numa instalação Claude Code: `hooks/hooks-cursor.json` (variante do hook
para o Cursor) e `.claude-plugin/marketplace.json` (marketplace de
desenvolvimento do próprio repositório dele).

## Atualizar

Não há atualização automática — estas são cópias fixadas. Para atualizar uma
skill, copie de novo do upstream e atualize o commit na tabela acima:

```bash
git clone --depth 1 https://github.com/obra/superpowers /tmp/superpowers
rm -rf .claude/skills/superpowers/skills .claude/skills/superpowers/hooks
cp -r /tmp/superpowers/skills /tmp/superpowers/hooks .claude/skills/superpowers/
cp /tmp/superpowers/.claude-plugin/plugin.json .claude/skills/superpowers/.claude-plugin/
rm -f .claude/skills/superpowers/hooks/hooks-cursor.json
```

Se preferir que o superpowers se atualize sozinho, use o marketplace em vez da
cópia — `/plugin install superpowers@claude-plugins-official` — e apague
`.claude/skills/superpowers/`. Instalar dos dois jeitos deixa cada skill
duplicada.

Para as skills do Matt Pocock e da Vercel, o equivalente é
`npx skills add mattpocock/skills` e `npx skills add vercel-labs/skills`.
