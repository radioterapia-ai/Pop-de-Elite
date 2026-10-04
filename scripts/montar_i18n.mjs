#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FONTE = path.join(RAIZ, "i18n/widget.json");
const DESTINO = path.join(RAIZ, "site/pop-de-elite/pop-de-elite-i18n.js");
export const IDIOMAS = ["pt-BR", "en", "es", "fr", "de", "it", "zh-CN", "ja", "ko", "pl", "ar", "bn"];

const marcadores = (s) => [...String(s).matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(",");

export function conferir(textos) {
  const problemas = [];
  const base = textos["pt-BR"];
  for (const idioma of IDIOMAS) {
    if (!textos[idioma]) { problemas.push(`${idioma}: idioma ausente`); continue; }
    const andar = (ref, alvo, caminho) => {
      if (Array.isArray(ref)) {
        if (!Array.isArray(alvo) || alvo.length !== ref.length) { problemas.push(`${idioma}: ${caminho} deve ter ${ref.length} itens`); return; }
        ref.forEach((r, i) => andar(r, alvo[i], `${caminho}[${i}]`));
      } else if (ref && typeof ref === "object") {
        if (!alvo || typeof alvo !== "object") { problemas.push(`${idioma}: ${caminho} ausente`); return; }
        for (const k of Object.keys(ref)) andar(ref[k], alvo[k], caminho ? `${caminho}.${k}` : k);
        for (const k of Object.keys(alvo)) if (!(k in ref)) problemas.push(`${idioma}: ${caminho ? `${caminho}.` : ""}${k} sobrando`);
      } else if (typeof alvo !== "string" || !alvo.trim()) {
        problemas.push(`${idioma}: ${caminho} vazio`);
      } else if (marcadores(ref) !== marcadores(alvo)) {
        problemas.push(`${idioma}: ${caminho} com marcadores diferentes de {${marcadores(ref)}}`);
      }
    };
    andar(base, textos[idioma], "");
  }
  return problemas;
}

export function montar() {
  const textos = JSON.parse(readFileSync(FONTE, "utf8"));
  const ordenado = Object.fromEntries(IDIOMAS.filter((l) => textos[l]).map((l) => [l, textos[l]]));
  return [
    "/* GUARDA: GERADO por scripts/montar_i18n.mjs a partir de i18n/widget.json — não edite à mão.",
    " * Textos da interface do POP de Elite nos idiomas do radioterapia.ai (localStorage rtai_lang). */",
    `window.PopDeEliteTextos = ${JSON.stringify(ordenado, null, 1)};`,
    "",
  ].join("\n");
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const textos = JSON.parse(readFileSync(FONTE, "utf8"));
  const problemas = conferir(textos);
  const novo = montar();
  if (process.argv.includes("--verificar")) {
    let atual = "";
    try { atual = readFileSync(DESTINO, "utf8"); } catch {   }
    if (problemas.length) { console.error(problemas.join("\n")); process.exit(1); }
    if (atual !== novo) { console.error("pop-de-elite-i18n.js desatualizado: rode node scripts/montar_i18n.mjs"); process.exit(1); }
    console.log(`textos em dia: ${IDIOMAS.length} idiomas`);
  } else {
    writeFileSync(DESTINO, novo);
    console.log(`gravado ${path.relative(RAIZ, DESTINO)} (${novo.length} caracteres)`);
    if (problemas.length) console.log(`atenção:\n${problemas.join("\n")}`);
  }
}
