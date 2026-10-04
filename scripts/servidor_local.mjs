#!/usr/bin/env node

import http from "node:http";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { tratarPop } from "../cloudflare/pop/api.js";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SITE = path.join(RAIZ, "site");
const PORTA = Number(process.env.PORTA || 8788);
const TIPOS = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8", ".md": "text/markdown; charset=utf-8",
  ".svg": "image/svg+xml", ".png": "image/png", ".ico": "image/x-icon",
};

async function estatico(pathname) {
  let alvo = path.join(SITE, path.normalize(decodeURIComponent(pathname)));
  if (!alvo.startsWith(SITE)) return null;
  try {
    if ((await stat(alvo)).isDirectory()) alvo = path.join(alvo, "index.html");
    return { corpo: await readFile(alvo), tipo: TIPOS[path.extname(alvo)] || "application/octet-stream" };
  } catch {
    return null;
  }
}

// GUARDA: mesmo formato do Cloudflare Pages: env com as variáveis e ASSETS servindo os arquivos do site
const env = {
  ...process.env,
  POP_ORIGENS: process.env.POP_ORIGENS || `http://localhost:${PORTA},http://127.0.0.1:${PORTA}`,
  ASSETS: {
    async fetch(pedido) {
      const a = await estatico(new URL(pedido.url).pathname);
      return a ? new Response(a.corpo, { headers: { "content-type": a.tipo } }) : new Response("não encontrado", { status: 404 });
    },
  },
};

async function lerCorpo(req) {
  const partes = [];
  for await (const p of req) partes.push(p);
  return Buffer.concat(partes).toString("utf8");
}

// GUARDA: mesmo contrato da rota de áudio do site: JSON { mode, chunkIndex, durationSec, lang, audioData: { mimeType, data } }
async function transcrever(req) {
  const corpo = JSON.parse((await lerCorpo(req)) || "{}");
  const indice = Number(corpo.chunkIndex) || 0;
  if (process.env.POP_AUDIO_FALSO === "1") return [200, { text: `(transcrição de teste, bloco ${indice + 1})`, chunkIndex: indice, seconds: corpo.durationSec || 0 }];
  if (!process.env.GROQ_API_KEY) return [503, { error: "transcription_failed" }];
  const audio = corpo.audioData || {};
  const form = new FormData();
  form.append("file", new Blob([Buffer.from(String(audio.data || ""), "base64")], { type: audio.mimeType || "audio/wav" }), "bloco.wav");
  form.append("model", "whisper-large-v3");
  form.append("temperature", "0");
  form.append("language", String(corpo.lang || "pt").slice(0, 2));
  const r = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
    method: "POST", headers: { authorization: `Bearer ${process.env.GROQ_API_KEY}` }, body: form,
  });
  if (!r.ok) return [502, { error: "transcription_failed", upstream: `Groq ${r.status}` }];
  return [200, { text: (await r.json()).text || "", chunkIndex: indice, seconds: corpo.durationSec || 0 }];
}

const servidor = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || `localhost:${PORTA}`}`);
  try {
    if (url.pathname === "/api/audio/transcribe" && req.method === "POST") {
      const [status, dados] = await transcrever(req);
      res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
      res.end(JSON.stringify(dados));
      return;
    }
    if (url.pathname.startsWith("/api/pop/")) {
      const cabecalhos = Object.entries(req.headers).filter(([, v]) => typeof v === "string");
      const temCorpo = !["GET", "HEAD", "OPTIONS"].includes(req.method);
      const pedido = new Request(url, { method: req.method, headers: cabecalhos, body: temCorpo ? req : undefined, duplex: "half" });
      const resposta = await tratarPop(pedido, env, { waitUntil: (p) => Promise.resolve(p).catch(() => {}) });
      res.writeHead(resposta.status, Object.fromEntries(resposta.headers));
      if (resposta.body) for await (const pedaco of resposta.body) res.write(pedaco);
      res.end();
      return;
    }
    if (url.pathname === "/") {
      res.writeHead(302, { location: "/pop-de-elite/" });
      res.end();
      return;
    }
    if (url.pathname === "/favicon.ico") { // GUARDA: o site tem o dele; sem isto o navegador registra um 404 no console
      res.writeHead(204);
      res.end();
      return;
    }
    const a = await estatico(url.pathname);
    if (!a) { res.writeHead(404, { "content-type": "text/plain; charset=utf-8" }); res.end("não encontrado"); return; }
    res.writeHead(200, { "content-type": a.tipo, "cache-control": "no-store" });
    res.end(a.corpo);
  } catch (e) {
    console.error(e);
    if (!res.headersSent) res.writeHead(500, { "content-type": "text/plain; charset=utf-8" });
    res.end("erro interno");
  }
});

servidor.listen(PORTA, () => {
  console.log(`POP de Elite local: http://localhost:${PORTA}/pop-de-elite/`);
  if (!process.env.GEMINI_API_KEY) console.log("Atenção: defina GEMINI_API_KEY para a conversa funcionar.");
  if (!process.env.POP_MOTOR_URL) console.log("Atenção: defina POP_MOTOR_URL (Space do motor) para montar os arquivos.");
});
