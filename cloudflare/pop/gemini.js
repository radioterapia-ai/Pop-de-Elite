
import { erro } from "./erros.js";

const BASE_PADRAO = "https://generativelanguage.googleapis.com";

const FORMATO_CHAVE = /^AIza[0-9A-Za-z_-]{35}$/;
// GUARDA: a cota gratuita recusa o modelo que não está no plano dela com 429 e limite 0 para ele.
const SEM_MODELO = /limit:\s*0\b|"quotaValue":\s*"0"/;

/** GUARDA: chave do Google AI Studio que a própria pessoa colou no widget (cabeçalho X-Pop-Chave). Vale
 *  só para este pedido: nunca é gravada nem vai para log. Ausente → null; fora do formato → pop_chave_invalida. */
export function chaveDoUsuario(request) {
  const valor = (request.headers.get("x-pop-chave") || "").trim();
  if (!valor) return null;
  if (!FORMATO_CHAVE.test(valor)) throw erro("pop_chave_invalida");
  return valor;
}

async function comChaveDoUsuario(tentativa, chave, modelo) {
  let ultimo = 0;
  for (let i = 0; i < 2; i++) {
    if (i) await new Promise((r) => setTimeout(r, 1500));
    let resp;
    try {
      resp = await tentativa(chave, undefined);
    } catch {
      continue;
    }
    if (resp.ok) return resp;
    ultimo = resp.status;
    if (resp.status === 429) {
      const texto = await resp.text().catch(() => "");
      throw SEM_MODELO.test(texto) ? erro("pop_chave_sem_modelo", { modelo }) : erro("pop_chave_sem_cota");
    }
    if (resp.status === 404) throw erro("pop_chave_sem_modelo", { modelo });
    if (resp.status === 401 || resp.status === 403) throw erro("pop_chave_recusada");
    if (resp.status === 400) {
      const texto = await resp.text().catch(() => "");
      throw erro(/API_KEY|API key/i.test(texto) ? "pop_chave_recusada" : "pop_ia_indisponivel", { upstream: 400 });
    }
    if (resp.status < 500) break;
  }
  throw erro("pop_ia_indisponivel", { upstream: ultimo });
}

export function configGemini(host, env = {}, chaveUsuario = null) {
  const pensamento = env.POP_PENSAMENTO === undefined || env.POP_PENSAMENTO === "" ? null : Number(env.POP_PENSAMENTO);
  const modelo = host.modelos.texto;
  return {
    base: String(env.POP_GEMINI_BASE || BASE_PADRAO).replace(/\/$/, ""),
    modeloLeve: env.POP_MODELO_LEVE || modelo,
    modeloPesado: env.POP_MODELO_PESADO || modelo,
    modeloImagem: host.modelos.imagem,
    // GUARDA: sem thinkingConfig por padrão: thinkingBudget 0 volta 400 no gemini-3.8-flash.
    // Sem temperature: abaixo de 1,0 o gemini-3.8-flash repete texto e corrompe o JSON, e o Google
    // recomenda manter o padrão 1,0 na família Gemini 3.
    pensamento: Number.isFinite(pensamento) ? pensamento : null,
    executar: chaveUsuario ? (tentativa, modelo) => comChaveDoUsuario(tentativa, chaveUsuario, modelo)
      : (tentativa) => host.executarGemini(tentativa),
  };
}

function montarCorpo({ sistema, conteudos, ferramentas, json, temperatura, maxTokens, pensamento }) {
  const corpo = { contents: conteudos, generationConfig: {} };
  if (sistema) corpo.systemInstruction = { parts: [{ text: sistema }] };
  if (ferramentas && ferramentas.length) {
    corpo.tools = [{ functionDeclarations: ferramentas }];
    corpo.toolConfig = { functionCallingConfig: { mode: "AUTO" } };
  }
  if (json) corpo.generationConfig.responseMimeType = "application/json";
  if (temperatura !== undefined) corpo.generationConfig.temperature = temperatura;
  if (maxTokens) corpo.generationConfig.maxOutputTokens = maxTokens;
  if (pensamento !== null && pensamento !== undefined) {
    corpo.generationConfig.thinkingConfig = { thinkingBudget: pensamento };
  }
  return corpo;
}

function chamar(cfg, modelo, acao, corpo) {
  const nome = String(modelo).replace(/^models\//, "");
  const url = `${cfg.base}/v1beta/models/${nome}:${acao}`;
  const texto = JSON.stringify(corpo);
  return cfg.executar((apiKey, signal) => fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", "x-goog-api-key": apiKey },
    body: texto,
    signal,
  }), nome);
}

export async function pingar(cfg) {
  const resp = await chamar(cfg, cfg.modeloPesado, "generateContent", {
    contents: [{ role: "user", parts: [{ text: "ping" }] }],
    generationConfig: { maxOutputTokens: 16 },
  });
  await resp.json().catch(() => null);
  return String(cfg.modeloPesado).replace(/^models\//, "");
}

function interpretar(resposta) {
  const candidato = (resposta.candidates || [])[0] || {};
  const partes = (candidato.content && candidato.content.parts) || [];
  return {
    texto: partes.filter((p) => typeof p.text === "string" && !p.thought).map((p) => p.text).join(""),
    chamadas: partes.filter((p) => p.functionCall).map((p) => p.functionCall),
    fim: candidato.finishReason || "",
    uso: resposta.usageMetadata || null,
    bloqueio: resposta.promptFeedback && resposta.promptFeedback.blockReason,
  };
}

export async function gerar(cfg, opcoes) {
  const resp = await chamar(cfg, opcoes.modelo, "generateContent", montarCorpo(opcoes));
  return interpretar(await resp.json());
}

export async function gerarEmFluxo(cfg, opcoes, aoProgresso) {
  const resp = await chamar(cfg, opcoes.modelo, "streamGenerateContent?alt=sse", montarCorpo(opcoes));
  const leitor = resp.body.getReader();
  const decodificador = new TextDecoder();
  let buffer = "";
  const total = { texto: "", chamadas: [], fim: "", uso: null, bloqueio: undefined };

  const processar = async (bloco) => {
    for (const linha of bloco.split("\n")) {
      if (!linha.startsWith("data:")) continue;
      const dados = linha.slice(5).trim();
      if (!dados || dados === "[DONE]") continue;
      const r = interpretar(JSON.parse(dados));
      total.texto += r.texto;
      total.chamadas.push(...r.chamadas);
      if (r.fim) total.fim = r.fim;
      if (r.uso) total.uso = r.uso;
      if (r.bloqueio) total.bloqueio = r.bloqueio;
      if (aoProgresso) await aoProgresso(total.texto.length);
    }
  };

  for (;;) {
    const { value, done } = await leitor.read();
    if (done) break;
    buffer += decodificador.decode(value, { stream: true }).replace(/\r\n/g, "\n");
    let i;
    while ((i = buffer.indexOf("\n\n")) >= 0) {
      const bloco = buffer.slice(0, i);
      buffer = buffer.slice(i + 2);
      await processar(bloco);
    }
  }
  if (buffer.trim()) await processar(buffer);
  return total;
}

export async function gerarImagem(cfg, { prompt, proporcao = "16:9" }) {
  const resp = await chamar(cfg, cfg.modeloImagem, "generateContent", {
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: { responseModalities: ["IMAGE"], imageConfig: { aspectRatio: proporcao } },
  });
  const dados = await resp.json();
  const candidato = (dados.candidates || [])[0] || {};
  const partes = (candidato.content && candidato.content.parts) || [];
  const img = partes.find((p) => p.inlineData && /^image\//.test(p.inlineData.mimeType || "") && p.inlineData.data);
  if (!img) throw erro("pop_imagem_falhou", { motivo: candidato.finishReason || "sem_imagem" });
  return { mime: img.inlineData.mimeType, base64: img.inlineData.data, uso: dados.usageMetadata || null };
}

/** GUARDA: no teto diário contam todos os tokens da chamada: entrada, saída e raciocínio. */
export function tokensDe(uso) {
  if (!uso) return 0;
  if (uso.totalTokenCount) return uso.totalTokenCount;
  return (uso.promptTokenCount || 0) + (uso.candidatesTokenCount || 0) + (uso.thoughtsTokenCount || 0);
}
