#!/usr/bin/env node
// Monta cloudflare/pop/prompts/textos.js a partir de prompts/**/*.md (a fonte única das instruções).
//   node scripts/montar_prompts.mjs              grava o arquivo
//   node scripts/montar_prompts.mjs --verificar  sai com erro se o arquivo estiver desatualizado
// GUARDA: o comentário <!-- ... --> do início de cada .md é documentação e não vai para a IA.
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DESTINO = path.join(RAIZ, "cloudflare/pop/prompts/textos.js");

const LENTES = Object.fromEntries(readdirSync(path.join(RAIZ, "prompts/agentes/tipos"))
  .filter((f) => f.endsWith(".md")).sort()
  .map((f) => [f.slice(0, -3), `prompts/agentes/tipos/${f}`]));

const ARQUIVOS = {
  IDENTIDADE: {
    conselheiro: "prompts/identidade/conselheiro.md",
    planilha: "prompts/identidade/conselheiro_planilha.md",
    ppt: "prompts/identidade/conselheiro_ppt.md",
  },
  AGENTES: {
    triagem: "prompts/agentes/triagem.md",
    tipo_escolhido: "prompts/agentes/tipo_escolhido.md",
    word: "prompts/agentes/word.md",
    word_texto: "prompts/agentes/word_texto.md",
    referencial: "prompts/agentes/referencial.md",
    planilha: "prompts/agentes/planilha.md",
    ppt: "prompts/agentes/ppt.md",
    reparo_json: "prompts/agentes/reparo_json.md",
    imagem: "prompts/agentes/imagem.md",
    auditor: "prompts/agentes/auditor.md",
    revisao: "prompts/agentes/revisao.md",
  },
  LENTES,
};

export function textoDoPrompt(conteudo) {
  return conteudo.replace(/^﻿?\s*<!--[\s\S]*?-->\s*/, "").trim();
}

export function montar() {
  const linhas = [
    "// GUARDA: GERADO por scripts/montar_prompts.mjs a partir de prompts/**/*.md — não edite à mão.",
    "// Para mudar uma instrução, edite o .md e rode: node scripts/montar_prompts.mjs",
    "",
  ];
  for (const [grupo, itens] of Object.entries(ARQUIVOS)) {
    linhas.push(`export const ${grupo} = {`);
    for (const [chave, rel] of Object.entries(itens)) {
      const texto = textoDoPrompt(readFileSync(path.join(RAIZ, rel), "utf8"));
      linhas.push(`  ${chave}: ${JSON.stringify(texto)},`);
    }
    linhas.push("};", "");
  }
  return linhas.join("\n");
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const novo = montar();
  if (process.argv.includes("--verificar")) {
    let atual = "";
    try { atual = readFileSync(DESTINO, "utf8"); } catch {   }
    if (atual !== novo) {
      console.error("cloudflare/pop/prompts/textos.js está desatualizado: rode node scripts/montar_prompts.mjs");
      process.exit(1);
    }
    console.log("textos.js em dia com prompts/*.md");
  } else {
    writeFileSync(DESTINO, novo);
    console.log(`gravado ${path.relative(RAIZ, DESTINO)} (${novo.length} caracteres)`);
  }
}
