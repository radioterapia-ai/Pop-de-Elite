// GUARDA: o anfitrião é tudo o que depende de ONDE o módulo roda. Quem leva o módulo para outro lugar
// escreve um anfitrião com este mesmo contrato. Este é o AVULSO: testes, servidor local
// (scripts/servidor_local.mjs) e Worker próprio (cloudflare/worker.js).
//
// criarAnfitriao({ env, request, ctx }) devolve:
//   usuario()                  → { chave, email, nome, especialidade }; lança 401/403 com o código do site
//   ativo()                    → false desliga o módulo (pop_desativado)
//   limitar(usuario, rota)     → lança rate_limited (429) se passou do limite
//   tetoDiario()               → tokens por usuário por dia (0 = sem teto)
//   usoHoje(usuario)           → tokens já usados hoje (dia de São Paulo)
//   registrarUso(usuario, n)   → soma n tokens ao dia e devolve o total do dia
//   executarGemini(tentativa)  → Response ok; tentativa(apiKey, signal) faz o fetch REST. Lança
//                                pop_ia_indisponivel se nenhuma chave respondeu.
//   redigirTexto(texto)        → texto com identificadores pessoais reduzidos (CPF, prontuário…)
//   lerCorpus(rel)             → texto de pop-de-elite/corpus/<rel>; lança pop_corpus_indisponivel
//   registrar(evento)          → log só com números e códigos, nunca conteúdo
//   modelos                    → { texto, imagem }
//   motor                      → { url, token, tokenHf }
//   cors                       → cabeçalhos CORS (só o avulso precisa; no site é mesma origem)

import { erro } from "./erros.js";
import { diaSaoPaulo, esperar } from "./util.js";

export const MODELO_TEXTO = "gemini-3.8-flash";
export const MODELO_IMAGEM = "gemini-3.1-flash-lite-image";
export const TETO_DIARIO = 400_000;

const usoPorDia = new Map();
const janela = new Map();
const LIMITES = { conversa: 40, gerar: 12, imagens: 6, renderizar: 12, chave: 12, auditar: 12 };

function origensPermitidas(env) {
  return new Set(String(env.POP_ORIGENS || "https://radioterapia.ai,https://www.radioterapia.ai")
    .split(",").map((s) => s.trim()).filter(Boolean));
}

function cabecalhosCors(request, env) {
  const origem = request.headers.get("origin");
  if (!origem || !origensPermitidas(env).has(origem)) return {};
  return {
    "access-control-allow-origin": origem,
    "access-control-allow-methods": "GET, POST, OPTIONS",
    "access-control-allow-headers": "content-type, x-token, x-pop-chave",
    "access-control-max-age": "86400",
    vary: "origin",
  };
}

// GUARDA: fora do site não há login: a origem do navegador é a única barreira (POST sem Origin é robô).
function verificarOrigem(request, env) {
  const origem = request.headers.get("origin");
  if (!origem) {
    if (request.method === "POST" && env.POP_PERMITIR_SEM_ORIGEM !== "1") throw erro("pop_origem_recusada");
    return;
  }
  if (origem === new URL(request.url).origin || origensPermitidas(env).has(origem)) return;
  throw erro("pop_origem_recusada");
}

export function anfitriaoAvulso({ env = {}, request }) {
  const ip = request.headers.get("cf-connecting-ip") || "local";
  return {
    async usuario() {
      verificarOrigem(request, env);
      if (env.POP_TOKEN_TESTE) {
        if (request.headers.get("x-token") !== env.POP_TOKEN_TESTE) throw erro("auth_required_expert");
        return { chave: "teste@local", email: "teste@local", nome: env.POP_USUARIO_NOME || "", especialidade: env.POP_USUARIO_ESPECIALIDADE || "" };
      }
      return { chave: `ip:${ip}`, email: "", nome: "", especialidade: "" };
    },

    ativo: () => env.POP_DESATIVADO !== "1",

    async limitar(_usuario, rota) {
      const limite = LIMITES[rota];
      if (!limite || env.POP_SEM_LIMITE === "1") return;
      const agora = Date.now();
      const chave = `${ip}:${rota}`;
      const registros = (janela.get(chave) || []).filter((t) => agora - t < 600_000);
      if (registros.length >= limite) throw erro("rate_limited");
      registros.push(agora);
      janela.set(chave, registros);
      if (janela.size > 5000) janela.clear();
    },

    tetoDiario: () => (env.POP_TETO_DIARIO === undefined ? TETO_DIARIO : Number(env.POP_TETO_DIARIO)),

    async usoHoje(usuario) {
      return usoPorDia.get(`${usuario.chave}|${diaSaoPaulo()}`) || 0;
    },

    async registrarUso(usuario, tokens) {
      const chave = `${usuario.chave}|${diaSaoPaulo()}`;
      const total = (usoPorDia.get(chave) || 0) + Math.max(0, Number(tokens) || 0);
      usoPorDia.set(chave, total);
      if (usoPorDia.size > 10_000) usoPorDia.clear();
      return total;
    },

    async executarGemini(tentativa) {
      const chave = env.GEMINI_API_KEY || env.GOOGLE_API_KEY || env.GEMINI_KEY;
      if (!chave) throw erro("pop_ia_indisponivel", { motivo: "sem_chave" });
      let ultimo = 0;
      for (let i = 0; i < 3; i++) {
        let resp;
        try {
          resp = await tentativa(chave, undefined);
        } catch {
          ultimo = 0;
          await esperar(1500 * (i + 1) ** 2);
          continue;
        }
        if (resp.ok) return resp;
        ultimo = resp.status;
        // GUARDA: 429 (cota) e 5xx (sobrecarga) costumam passar numa segunda tentativa
        if (resp.status !== 429 && resp.status < 500) break;
        await esperar(1500 * (i + 1) ** 2);
      }
      throw erro("pop_ia_indisponivel", { upstream: ultimo });
    },

    redigirTexto: (texto) => texto,

    async lerCorpus(rel) {
      const base = env.POP_CORPUS_URL || new URL("/pop-de-elite/corpus/", env.POP_SITE_URL || request.url).href;
      const url = new URL(rel, base.endsWith("/") ? base : `${base}/`).href;
      const usarAssets = env.ASSETS && !env.POP_CORPUS_URL;
      let resp;
      try {
        resp = usarAssets ? await env.ASSETS.fetch(new Request(url)) : await fetch(url);
      } catch {
        throw erro("pop_corpus_indisponivel");
      }
      // GUARDA: arquivo que falta pode voltar 200 com o index.html do site (fallback de SPA)
      if (!resp.ok || (resp.headers.get("content-type") || "").includes("text/html")) throw erro("pop_corpus_indisponivel");
      return resp.text();
    },

    registrar(evento) {
      if (env.POP_SEM_LOG !== "1") console.log(JSON.stringify(evento));
    },

    modelos: {
      texto: env.POP_MODELO || MODELO_TEXTO,
      imagem: env.POP_MODELO_IMAGEM || MODELO_IMAGEM,
    },

    motor: {
      url: env.POP_MOTOR_URL || "",
      token: env.POP_MOTOR_TOKEN || "",
      tokenHf: env.POP_MOTOR_HF_TOKEN || "",
    },

    cors: cabecalhosCors(request, env),
  };
}
