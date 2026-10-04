
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { ANEXOS, conteudosDaConversa, handlePop, limparBrief, tratarPop } from "../cloudflare/pop/api.js";
import { anfitriaoAvulso } from "../cloudflare/pop/anfitriao.js";
import { carregarIndice, selecionarSecoes } from "../cloudflare/pop/corpus.js";
import { ERROS, erro } from "../cloudflare/pop/erros.js";
import { pedidosDeImagem } from "../cloudflare/pop/imagens.js";
import { TIPOS_DOCUMENTO, normalizarPpt, normalizarWord, validarPpt, validarWord } from "../cloudflare/pop/regras.js";
import { sistemaConversa } from "../cloudflare/pop/prompts/conversa.js";
import { sistemaExcel } from "../cloudflare/pop/prompts/excel.js";
import { preencher } from "../cloudflare/pop/prompts/montar.js";
import { sistemaPpt } from "../cloudflare/pop/prompts/ppt.js";
import { AGENTES, IDENTIDADE, LENTES } from "../cloudflare/pop/prompts/textos.js";
import { sistemaWord } from "../cloudflare/pop/prompts/word.js";
import { montar } from "../scripts/montar_prompts.mjs";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const lerJsonLocal = async (rel) => JSON.parse(await readFile(path.join(RAIZ, rel), "utf8"));
const CORPUS = path.join(RAIZ, "tests", "fixtures", "corpus");

const ENV = {
  GEMINI_API_KEY: "chave-teste",
  POP_GEMINI_BASE: "https://gemini.test",
  POP_CORPUS_URL: "https://site.test/pop-de-elite/corpus/",
  POP_MOTOR_URL: "https://motor.test",
  POP_ORIGENS: "https://radioterapia.ai",
  POP_SEM_LIMITE: "1",
  POP_SEM_LOG: "1",
};

let roteiroGemini = [];
const pedidosGemini = [];
const pedidosImagem = [];
const pedidosMotor = [];
const pedidosSaudeMotor = [];
const PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

function respostaGemini(item) {
  const parts = item.chamada ? [{ functionCall: item.chamada }] : [{ text: item.texto }];
  return { candidates: [{ content: { role: "model", parts }, finishReason: "STOP" }],
    usageMetadata: { promptTokenCount: 1000, candidatesTokenCount: 500, totalTokenCount: 1500 } };
}

const CHAVE_PROPRIA = `AIza${"A".repeat(35)}`;
const CHAVE_RECUSADA = `AIza${"R".repeat(35)}`;
const CHAVE_SEM_COTA = `AIza${"Q".repeat(35)}`;
const CHAVE_SEM_MODELO = `AIza${"M".repeat(35)}`;

globalThis.fetch = async (entrada, init = {}) => {
  const url = typeof entrada === "string" ? entrada : entrada.url;
  const chaveUsada = init.headers && init.headers["x-goog-api-key"];
  if (url.startsWith("https://gemini.test/") && chaveUsada === CHAVE_RECUSADA) {
    return new Response(JSON.stringify({ error: { code: 400, message: "API key not valid. Please pass a valid API key.", status: "INVALID_ARGUMENT" } }), { status: 400 });
  }
  if (url.startsWith("https://gemini.test/") && chaveUsada === CHAVE_SEM_MODELO) {
    return new Response(JSON.stringify({ error: { code: 429, status: "RESOURCE_EXHAUSTED",
      message: "You exceeded your current quota.\n* Quota exceeded for metric: generativelanguage.googleapis.com/generate_content_free_tier_requests, limit: 0, model: modelo-unico",
      details: [{ violations: [{ quotaId: "GenerateRequestsPerDayPerProjectPerModel-FreeTier", quotaValue: "0" }] }] } }), { status: 429 });
  }
  if (url.startsWith("https://gemini.test/") && chaveUsada === CHAVE_SEM_COTA) {
    return new Response(JSON.stringify({ error: { code: 429, status: "RESOURCE_EXHAUSTED" } }), { status: 429 });
  }
  if (url.startsWith("https://site.test/pop-de-elite/corpus/")) {
    const rel = decodeURIComponent(url.replace("https://site.test/pop-de-elite/corpus/", ""));
    try {
      return new Response(await readFile(path.join(CORPUS, rel), "utf8"));
    } catch {
      return new Response("não achei", { status: 404 });
    }
  }
  if (url.startsWith("https://gemini.test/v1beta/models/modelo-imagem:")) {
    const corpo = JSON.parse(init.body);
    pedidosImagem.push({ url, corpo, chave: init.headers["x-goog-api-key"] });
    if (corpo.contents[0].parts[0].text.includes("FALHA")) {
      return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: "não" }] }, finishReason: "SAFETY" }] }));
    }
    return new Response(JSON.stringify({
      candidates: [{ content: { parts: [{ inlineData: { mimeType: "image/png", data: PNG } }] }, finishReason: "STOP" }],
      usageMetadata: { promptTokenCount: 50, candidatesTokenCount: 1290, totalTokenCount: 1340 },
    }), { headers: { "content-type": "application/json" } });
  }
  if (url.startsWith("https://gemini.test/v1beta/models/")) {
    const corpo = JSON.parse(init.body);
    pedidosGemini.push({ url, corpo, chave: init.headers["x-goog-api-key"] });
    const item = roteiroGemini.shift();
    if (!item) return new Response(JSON.stringify({ error: { message: "sem roteiro" } }), { status: 400 });
    const dados = respostaGemini(item);
    if (url.includes(":streamGenerateContent")) {
      const texto = dados.candidates[0].content.parts[0].text || "";
      const pedacos = [texto.slice(0, 10), texto.slice(10, texto.length - 5), texto.slice(texto.length - 5)];
      const sse = pedacos.map((p, i) => `data: ${JSON.stringify({
        candidates: [{ content: { role: "model", parts: [{ text: p }] }, ...(i === 2 ? { finishReason: "STOP" } : {}) }],
        ...(i === 2 ? { usageMetadata: dados.usageMetadata } : {}),
      })}\r\n\r\n`).join("");
      return new Response(sse, { headers: { "content-type": "text/event-stream" } });
    }
    return new Response(JSON.stringify(dados), { headers: { "content-type": "application/json" } });
  }
  if (url === "https://motor.test/renderizar") {
    const corpo = JSON.parse(init.body);
    pedidosMotor.push({ corpo, cabecalhos: init.headers });
    return new Response(JSON.stringify({ arquivos: Object.keys(corpo).filter((k) => corpo[k] && ["word", "excel", "ppt"].includes(k))
      .map((k) => ({ formato: k, nome: `${k}.bin`, mime: "application/octet-stream", base64: "AAAA" })) }),
    { headers: { "content-type": "application/json" } });
  }
  if (url === "https://motor.test/saude") {
    pedidosSaudeMotor.push(init.headers || {});
    return new Response(JSON.stringify({ ok: true }), { headers: { "content-type": "application/json" } });
  }
  throw new Error(`fetch inesperado: ${url}`);
};

const pedido = (rota, corpo, cab = {}) => new Request(`https://radioterapia.ai/api/pop/${rota}`, {
  method: "POST",
  headers: { "content-type": "application/json", origin: "https://radioterapia.ai", ...cab },
  body: typeof corpo === "string" ? corpo : JSON.stringify(corpo),
});

async function lerSse(resp) {
  const texto = await resp.text();
  return texto.split("\n\n").filter((b) => b.startsWith("event:")).map((b) => {
    const [l1, l2] = b.split("\n");
    return { evento: l1.slice(7), dados: JSON.parse(l2.slice(6)) };
  });
}

function anfitriaoDoSite(estado) {
  return ({ request }) => ({
    async usuario() {
      const token = request.headers.get("x-token");
      if (!token) throw erro("auth_required_expert");
      if (token === "sem-aceite") throw erro("expert_consent_required");
      return { chave: "ana@hospital.org", email: "ana@hospital.org", nome: "Ana Souza", especialidade: "Enfermagem Oncológica" };
    },
    ativo: () => estado.ativo !== false,
    async limitar() {},
    tetoDiario: () => estado.teto,
    usoHoje: async () => estado.usado,
    async registrarUso(_u, n) { estado.usado += n; estado.somas.push(n); return estado.usado; },
    async executarGemini(tentativa) { estado.chamadas += 1; return tentativa("chave-paga", undefined); },
    redigirTexto: (t) => String(t).replace(/\d{3}\.\d{3}\.\d{3}-\d{2}/g, "[CPF]"),
    lerCorpus: (rel) => readFile(path.join(CORPUS, decodeURIComponent(rel)), "utf8"),
    registrar: (ev) => estado.logs.push(ev),
    modelos: { texto: "modelo-unico", imagem: "modelo-imagem" },
    motor: { url: "https://motor.test", token: "token-motor", tokenHf: "" },
  });
}
const novoEstado = (extra = {}) => ({ teto: 400000, usado: 0, somas: [], chamadas: 0, logs: [], ...extra });
const ENV_SITE = { POP_GEMINI_BASE: "https://gemini.test" };
const comSessao = { "x-token": "v1_sessao" };

const BRIEF = limparBrief({
  tipo_documento: "POP", natureza_processo: "radiotecnico", titulo_processo: "Manutenção preventiva do acelerador",
  setor: "Radioterapia", sigla_setor: "rtx", idioma: "pt", resumo_demanda: "Manutenção mensal do linac.",
  formatos: ["word", "excel", "ppt"], capitulos: ["V1-C20", "V1-C07"], termos_busca: ["manutenção", "equipamento", "calibração"],
});

test("limparBrief aplica padrões e limites", () => {
  const b = limparBrief({ tipo_documento: "XYZ", sigla_setor: "ut-i!", formatos: ["pdf"] });
  assert.equal(b.tipo_documento, "POP");
  assert.equal(b.sigla_setor, "UTI");
  assert.deepEqual(b.formatos, ["word", "excel", "ppt"]);
  assert.equal(b.classificacao, "interno");
});

test("conversa começa no usuário, junta mensagens do mesmo papel e mostra anexo só pelo nome", () => {
  const c = conteudosDaConversa([
    { papel: "assistente", texto: "oi" },
    { papel: "usuario", texto: "a" }, { papel: "usuario", texto: "b", anexos: [{ tipo: "texto", nome: "pop.docx", texto: "conteúdo secreto" }] },
    { papel: "assistente", texto: "c" },
  ]);
  assert.deepEqual(c.map((x) => x.role), ["user", "model"]);
  assert.equal(c[0].parts.length, 2);
  const enviado = JSON.stringify(c);
  assert.ok(enviado.includes("[Anexo: pop.docx — lido só na geração do documento]"));
  assert.ok(!enviado.includes("conteúdo secreto"), "a triagem não lê anexos");
});

test("seleção de seções respeita capítulos e orçamento", async () => {
  const indice = await carregarIndice(anfitriaoAvulso({ env: ENV, request: new Request("https://radioterapia.ai/") }));
  const s = selecionarSecoes(indice, { capitulos: ["V1-C17"], termos: ["identificação", "pulseira"], orcamento: 2500 });
  assert.ok(s.ids.length > 0);
  assert.ok(s.palavras <= 2500);
  assert.ok(s.ids.every((id) => id.startsWith("V1-17.")));
  assert.ok(s.ids.some((id) => indice.secoes[id].tipo === "articulacao"));
});

test("seleção completa o orçamento com os capítulos escolhidos, mesmo sem termos em comum", async () => {
  const indice = await carregarIndice(anfitriaoAvulso({ env: ENV, request: new Request("https://radioterapia.ai/") }));
  const caps = indice.capitulos.filter((c) => c.numero > 0).slice(0, 2).map((c) => c.id);
  const s = selecionarSecoes(indice, { capitulos: caps, termos: ["xyzw"], orcamento: 800 });
  assert.ok(s.palavras >= 800 * 0.6 && s.palavras <= 800, `só ${s.palavras} palavras`);
  for (const cap of caps) {
    assert.ok(s.ids.some((id) => indice.secoes[id].cap === cap && indice.secoes[id].tipo === "conteudo"), `nada de ${cap}`);
  }
});

test("corpus: o index.html do site no lugar do arquivo (fallback de SPA) vira pop_corpus_indisponivel", async () => {
  const assets = { fetch: async () => new Response("<!doctype html>", { headers: { "content-type": "text/html" } }) };
  const host = anfitriaoAvulso({ env: { ASSETS: assets }, request: new Request("https://radioterapia.ai/api/pop/saude") });
  await assert.rejects(host.lerCorpus("indice.json"), (e) => e.codigo === "pop_corpus_indisponivel");
});

test("regras: POP radiotécnico do acelerador passa; com Meta 1 é barrado", async () => {
  const doc = normalizarWord(await lerJsonLocal("exemplos/pop_linac_manutencao.json"), BRIEF, new Date(Date.UTC(2026, 9, 1, 15)));
  assert.equal(doc.metadata.codigo, "POP-RTX-014");
  assert.equal(doc.metadata.data_elaboracao, "10/2026");
  assert.equal(doc.metadata.validade, "10/2028");
  assert.deepEqual(doc.metadata.revisado_por, { nome: "", cargo: "" });
  assert.deepEqual(validarWord(doc).erros, []);
  doc.secoes.procedimento.acoes_iniciais.push("Higienizar as mãos conforme a Meta 5.");
  assert.ok(validarWord(doc).erros.some((e) => /radiotecnico/.test(e)));
});

test("regras: a data do documento segue São Paulo (21h do dia 30 ainda é setembro)", () => {
  const doc = normalizarWord({ metadata: {}, secoes: {} }, BRIEF, new Date(Date.UTC(2026, 9, 1, 0, 30)));
  assert.equal(doc.metadata.data_elaboracao, "09/2026");
});

test("regras: POP assistencial sem Meta 1 e Meta 5 é barrado", async () => {
  const doc = normalizarWord(await lerJsonLocal("exemplos/exemplo_pop.json"), { ...BRIEF, natureza_processo: "assistencial" });
  assert.deepEqual(validarWord(doc).erros, []);
  const semMetas = JSON.parse(JSON.stringify(doc).replace(/Meta [15]/g, "meta institucional"));
  const { erros } = validarWord(semMetas);
  assert.ok(erros.some((e) => e.includes("Meta 1")) && erros.some((e) => e.includes("Meta 5")));
});

test("regras: fluxograma com destino inexistente ou decisão incompleta é barrado", async () => {
  const doc = normalizarWord(await lerJsonLocal("exemplos/exemplo_pop.json"), { ...BRIEF, natureza_processo: "assistencial" });
  assert.deepEqual(validarWord(doc).erros, []);
  const fluxo = doc.secoes.anexos.find((a) => a.tipo === "fluxograma");
  fluxo.conteudo.find((n) => n.id === "t5").proximo = "t99";
  delete fluxo.conteudo.find((n) => n.id === "d2").nao;
  const { erros } = validarWord(doc);
  assert.ok(erros.some((e) => /destinos inexistentes.*t99/.test(e)), erros.join("\n"));
  assert.ok(erros.some((e) => /"d2" precisa de "sim" e "nao"/.test(e)), erros.join("\n"));
});

test("PPT: referências e agradecimento sempre no fim", () => {
  const d = normalizarPpt({ slides: [{ tipo: "agradecimento" }, { tipo: "capa" }, { tipo: "texto_simples" }] },
    { metadata: { codigo: "POP-RTX-014" }, secoes: { referencias: ["A"] } });
  assert.deepEqual(d.slides.map((s) => s.tipo), ["capa", "texto_simples", "referencias", "agradecimento"]);
  assert.equal(d.metadata_ppt.codigo, "PPT-RTX-014");
});

test("PPT: slide de fluxograma sem etapas herda o anexo do Word; ligações quebradas viram aviso", async () => {
  const word = await lerJsonLocal("exemplos/pop_linac_manutencao.json");
  const anexo = word.secoes.anexos.find((a) => a.tipo === "fluxograma");
  const d = normalizarPpt({ slides: [{ tipo: "capa" }, { tipo: "fluxograma", titulo: "Fluxo" }] }, word);
  const slide = d.slides.find((s) => s.tipo === "fluxograma");
  assert.deepEqual(slide.etapas, anexo.conteudo);
  assert.deepEqual(slide.raias, anexo.raias);
  assert.ok(!validarPpt(d, 2).avisos.some((a) => /fluxograma/.test(a)));
  slide.etapas = [{ id: "a", tipo: "inicio", texto: "Início" }, { id: "b", tipo: "decisao", texto: "Ok?", sim: "z9" }];
  const { avisos } = validarPpt(d, 2);
  assert.ok(avisos.some((a) => /destinos inexistentes.*z9/.test(a)), avisos.join("\n"));
  assert.ok(avisos.some((a) => /decisões sem "sim" e "nao": b/.test(a)), avisos.join("\n"));
});

test("PPT: só os 3 primeiros slides de imagem pedem ilustração, na proporção do layout", async () => {
  const word = await lerJsonLocal("exemplos/pop_linac_manutencao.json");
  const ppt = normalizarPpt(await lerJsonLocal("exemplos/ppt_linac_manutencao.json"), word);
  const deImagem = ppt.slides.filter((s) => /^imagem_web_/.test(s.tipo));
  assert.ok(deImagem.length > 3);
  const pedidos = pedidosDeImagem(ppt);
  assert.deepEqual(pedidos.map((p) => p.numero), deImagem.slice(0, 3).map((s) => s.numero));
  assert.deepEqual(pedidos.map((p) => p.proporcao), deImagem.slice(0, 3).map((s) => (s.tipo === "imagem_web_panoramica" ? "21:9" : "3:2")));
  assert.ok(validarPpt(ppt, 30).avisos.some((a) => /só os 3 primeiros ganham ilustração/.test(a)));
});

test("instruções: textos.js em dia com prompts/*.md e identidade da Gema antes da tarefa", async () => {
  assert.equal(await readFile(path.join(RAIZ, "cloudflare/pop/prompts/textos.js"), "utf8"), montar(),
    "rode node scripts/montar_prompts.mjs");
  const conversa = sistemaConversa({ capitulos: "V1-C17 — Capítulo de teste", hoje: "outubro de 2026" });
  const word = sistemaWord();
  const excel = sistemaExcel();
  const ppt = sistemaPpt({ minimoSlides: 30 });
  assert.ok(conversa.startsWith(IDENTIDADE.conselheiro) && word.startsWith(IDENTIDADE.conselheiro));
  assert.ok(excel.startsWith(IDENTIDADE.planilha) && ppt.startsWith(IDENTIDADE.ppt));
  assert.ok(conversa.startsWith("<perfil_do_sistema>") && excel.startsWith("<perfil_do_sistema>"));
  assert.ok(ppt.startsWith("<protocolo_de_seguranca_cibernetica_e_vazamento>"));
  assert.ok(conversa.includes("Somos o Conselheiro da Qualidade, Mente por trás do Comitê"));
  assert.ok(conversa.includes("V1-C17 — Capítulo de teste") && conversa.includes("Data atual: outubro de 2026."));
  assert.ok(ppt.includes("no mínimo 30 slides") && ppt.includes("no máximo 3 slides de imagem"));
  const reparo = preencher(AGENTES.reparo_json, { DOCUMENTO: "documento Word" });
  const imagem = preencher(AGENTES.imagem, { CENA: "team in a control room" });
  assert.ok(imagem.includes("Scene: team in a control room") && /no text/i.test(imagem));
  for (const sistema of [conversa, word, excel, ppt, reparo, imagem]) {
    assert.doesNotMatch(sistema, /\{\{[A-Z_]+\}\}|<!--/);
  }
});

test("erros: todo código tem status HTTP e o erro sai no formato do site", async () => {
  for (const [codigo, status] of Object.entries(ERROS)) {
    assert.match(codigo, /^[a-z]+(_[a-z]+)*$/);
    assert.ok(status >= 400 && status < 600);
  }
  const r = await tratarPop(pedido("nada", {}), ENV);
  assert.equal(r.status, 404);
  assert.deepEqual(await r.json(), { error: "pop_rota_inexistente" });
});

test("/conversa responde texto ou dispara a geração", async () => {
  roteiroGemini = [{ texto: "# Triagem\n---\nPerguntas..." }];
  let r = await tratarPop(pedido("conversa", { historico: [{ papel: "usuario", texto: "Preciso de um POP" }] }), ENV);
  assert.equal(r.status, 200);
  const primeira = await r.json();
  assert.equal(primeira.acao, "responder");
  assert.equal(primeira.uso_dia.teto, 400000);
  const sistema = pedidosGemini.at(-1).corpo.systemInstruction.parts[0].text;
  assert.ok(sistema.includes("V1-C17"), "a lista de capítulos vai na instrução da conversa");
  assert.ok(!("thinkingConfig" in pedidosGemini.at(-1).corpo.generationConfig), "sem thinkingConfig por padrão");

  roteiroGemini = [{ chamada: { name: "gerar_documentos", args: { ...BRIEF, sigla_setor: "RTX" } } }];
  r = await tratarPop(pedido("conversa", { historico: [{ papel: "usuario", texto: "pode gerar" }] }), ENV);
  const dados = await r.json();
  assert.equal(dados.acao, "gerar");
  assert.equal(dados.brief.natureza_processo, "radiotecnico");
});

test("/gerar word valida, corrige e devolve o JSON pronto (SSE)", async () => {
  const bom = await lerJsonLocal("exemplos/pop_linac_manutencao.json");
  const ruim = structuredClone(bom);
  ruim.secoes.procedimento.acoes_iniciais.unshift("Confirmar a identificação do paciente (Meta 1).");
  roteiroGemini = [{ texto: JSON.stringify(ruim) }, { texto: "```json\n" + JSON.stringify(bom) + "\n```" }];
  const r = await tratarPop(pedido("gerar", { etapa: "word", brief: BRIEF, historico: [{ papel: "usuario", texto: "linac" }] }), ENV);
  assert.equal(r.headers.get("content-type").split(";")[0], "text/event-stream");
  const eventos = await lerSse(r);
  const fases = eventos.filter((e) => e.evento === "progresso").map((e) => e.dados.fase);
  assert.ok(fases.includes("literatura") && fases.includes("revisando"));
  const res = eventos.find((e) => e.evento === "resultado").dados;
  assert.equal(res.json.metadata.codigo, "POP-RTX-014");
  assert.deepEqual(res.avisos.filter((a) => a.startsWith("Pendente")), []);
  assert.ok(res.literatura.length > 0);
  assert.ok(res.literatura.every((l) => l.id && typeof l.titulo === "string"));
  assert.equal(res.uso.chamadas, 2);
  assert.ok(res.uso_dia.usado >= 3000);
  const entrada = pedidosGemini.at(-2).corpo.contents[0].parts[0].text;
  assert.ok(entrada.includes("LITERATURA DE REFERÊNCIA") && entrada.includes("### [V1-20."));
});

test("/gerar: resposta em texto passa pelo reparo de formato (só a resposta, temperatura padrão do modelo)", async () => {
  const bom = await lerJsonLocal("exemplos/pop_linac_manutencao.json");
  const emTexto = "Claro! Segue o documento solicitado, organizado por seções: objetivo, campo de aplicação…";
  roteiroGemini = [{ texto: emTexto }, { texto: JSON.stringify(bom) }];
  pedidosGemini.length = 0;
  const env = { ...ENV, POP_MODELO_PESADO: "modelo-pesado", POP_MODELO_LEVE: "modelo-leve" };
  const r = await tratarPop(pedido("gerar", { etapa: "word", brief: BRIEF, historico: [{ papel: "usuario", texto: "linac" }] }), env);
  const eventos = await lerSse(r);
  assert.ok(eventos.some((e) => e.evento === "progresso" && e.dados.fase === "reparando"));
  const res = eventos.find((e) => e.evento === "resultado");
  assert.ok(res, JSON.stringify(eventos.filter((e) => e.evento === "erro")));
  assert.equal(res.dados.json.metadata.codigo, "POP-RTX-014");
  const [geracao, reparo] = pedidosGemini;
  assert.match(geracao.url, /models\/modelo-pesado:/, "o Word usa o modelo pesado");
  assert.match(reparo.url, /models\/modelo-leve:/, "o reparo usa o modelo leve");
  assert.equal(reparo.corpo.generationConfig.temperature, undefined, "no Gemini 3, temperatura abaixo de 1,0 corrompe o JSON");
  assert.ok(reparo.corpo.systemInstruction.parts[0].text.includes("conversor de formato"));
  const enviado = JSON.stringify(reparo.corpo.contents);
  assert.ok(enviado.includes("Segue o documento solicitado"), "reenvia a resposta recebida");
  assert.ok(!enviado.includes("LITERATURA DE REFERÊNCIA"), "não reenvia o contexto inteiro");
});

test("/gerar: duas tentativas de reparo sem JSON viram falha pop_formato", async () => {
  roteiroGemini = [{ texto: "Aqui está o resumo em tópicos…" }, { texto: "Desculpe, segue em texto." }, { texto: "Ainda em texto." }];
  pedidosGemini.length = 0;
  const r = await tratarPop(pedido("gerar", { etapa: "word", brief: BRIEF, historico: [{ papel: "usuario", texto: "linac" }] }), ENV);
  const eventos = await lerSse(r);
  const falha = eventos.find((e) => e.evento === "erro");
  assert.ok(falha, "a geração falha");
  assert.equal(falha.dados.error, "pop_formato");
  assert.equal(falha.dados.etapa, "word");
  assert.equal(pedidosGemini.length, 3, "1 geração + 2 tentativas de reparo");
});

test("/gerar excel e ppt exigem o Word e normalizam a saída", async () => {
  const word = normalizarWord(await lerJsonLocal("exemplos/pop_linac_manutencao.json"), BRIEF);
  let r = await tratarPop(pedido("gerar", { etapa: "excel", brief: BRIEF }), ENV);
  assert.equal(r.status, 400);
  assert.equal((await r.json()).error, "pop_word_ausente");

  roteiroGemini = [{ texto: JSON.stringify(await lerJsonLocal("exemplos/planilha_linac_manutencao.json")) }];
  r = await tratarPop(pedido("gerar", { etapa: "excel", brief: BRIEF, word }), ENV);
  const excel = (await lerSse(r)).find((e) => e.evento === "resultado").dados.json;
  assert.equal(excel.metadata_excel.codigo, "PLAN-RTX-014");
  assert.ok(excel.planilhas[0].linhas.length >= 10);

  const slides = Array.from({ length: 30 }, (_, i) => ({ tipo: i === 0 ? "capa" : "texto_simples", titulo: `S${i}` }));
  slides.push({ tipo: "alerta_seguranca", titulo: "⚠", bullet_points: ["x"] });
  roteiroGemini = [{ texto: JSON.stringify({ metadata_ppt: {}, slides }) }];
  r = await tratarPop(pedido("gerar", { etapa: "ppt", brief: BRIEF, word, excel }), ENV);
  const ppt = (await lerSse(r)).find((e) => e.evento === "resultado").dados.json;
  assert.equal(ppt.slides.at(-1).tipo, "agradecimento");
  assert.equal(ppt.slides.at(-2).tipo, "referencias");
});

test("/renderizar repassa ao motor (com as ilustrações) e outra origem é recusada", async () => {
  pedidosMotor.length = 0;
  const imagens = { 6: PNG, 12: `data:image/png;base64,${PNG}`, abc: PNG, 8: "não é base64!" };
  const r = await tratarPop(pedido("renderizar", { word: { a: 1 }, ppt: { b: 2 }, imagens }), ENV);
  const dados = await r.json();
  assert.deepEqual(dados.arquivos.map((a) => a.formato), ["word", "ppt"]);
  assert.deepEqual(pedidosMotor[0].corpo.imagens, { 6: PNG, 12: PNG }, "só números de slide e base64 válido");
  const fora = await tratarPop(pedido("renderizar", { word: {} }, { origin: "https://outro.site" }), ENV);
  assert.equal(fora.status, 403);
  assert.equal((await fora.json()).error, "pop_origem_recusada");
});

test("site: sem sessão 401, sem aceite dos termos 403, módulo desligado 503", async () => {
  const estado = novoEstado();
  let r = await tratarPop(pedido("conversa", { historico: [] }), ENV_SITE, {}, anfitriaoDoSite(estado));
  assert.equal(r.status, 401);
  assert.deepEqual(await r.json(), { error: "auth_required_expert" });
  r = await tratarPop(pedido("conversa", { historico: [] }, { "x-token": "sem-aceite" }), ENV_SITE, {}, anfitriaoDoSite(estado));
  assert.equal(r.status, 403);
  assert.equal((await r.json()).error, "expert_consent_required");
  r = await tratarPop(pedido("conversa", { historico: [] }, comSessao), ENV_SITE, {}, anfitriaoDoSite({ ...estado, ativo: false }));
  assert.equal(r.status, 503);
  assert.equal(estado.chamadas, 0, "nada chega ao Gemini");
});

test("site: triagem com a chave do anfitrião, CPF reduzido e log só com números", async () => {
  const estado = novoEstado();
  roteiroGemini = [{ texto: "Entendi. Qual o setor?" }];
  pedidosGemini.length = 0;
  const historico = [{ papel: "usuario", texto: "Paciente CPF 123.456.789-00 caiu do leito", anexos: [{ nome: "foto.jpg" }] }];
  const r = await tratarPop(pedido("conversa", { historico }, comSessao), ENV_SITE, {}, anfitriaoDoSite(estado));
  const dados = await r.json();
  assert.equal(dados.acao, "responder");
  const enviado = JSON.stringify(pedidosGemini[0].corpo.contents);
  assert.equal(pedidosGemini[0].chave, "chave-paga");
  assert.match(pedidosGemini[0].url, /models\/modelo-unico:generateContent/);
  assert.ok(enviado.includes("[CPF]") && !enviado.includes("123.456.789-00"), "identificador reduzido antes do Gemini");
  assert.deepEqual(estado.somas, [1500]);
  assert.deepEqual(dados.uso_dia, { usado: 1500, teto: 400000 });
  const log = JSON.stringify(estado.logs);
  assert.ok(!/leito|Paciente|foto/.test(log), "o log não leva conteúdo");
  assert.ok(estado.logs.some((l) => l.evt === "pop_conversa" && l.entrada === 1000));
});

test("site: teto diário barra a triagem e o Word; Excel termina o pacote até 2× o teto", async () => {
  const estado = novoEstado({ teto: 10000, usado: 10000 });
  let r = await tratarPop(pedido("conversa", { historico: [{ papel: "usuario", texto: "oi" }] }, comSessao), ENV_SITE, {}, anfitriaoDoSite(estado));
  assert.equal(r.status, 429);
  assert.deepEqual(await r.json(), { error: "pop_teto_diario", uso_dia: { usado: 10000, teto: 10000 } });
  r = await tratarPop(pedido("gerar", { etapa: "word", brief: BRIEF }, comSessao), ENV_SITE, {}, anfitriaoDoSite(estado));
  assert.equal(r.status, 429);

  const word = normalizarWord(await lerJsonLocal("exemplos/pop_linac_manutencao.json"), BRIEF);
  roteiroGemini = [{ texto: JSON.stringify(await lerJsonLocal("exemplos/planilha_linac_manutencao.json")) }];
  r = await tratarPop(pedido("gerar", { etapa: "excel", brief: BRIEF, word }, comSessao), ENV_SITE, {}, anfitriaoDoSite(estado));
  const res = (await lerSse(r)).find((e) => e.evento === "resultado");
  assert.ok(res, "o pacote começado termina");
  assert.equal(res.dados.uso_dia.usado, 11500);

  estado.usado = 20000;
  r = await tratarPop(pedido("gerar", { etapa: "excel", brief: BRIEF, word }, comSessao), ENV_SITE, {}, anfitriaoDoSite(estado));
  assert.equal(r.status, 429, "acima de 2× o teto nem o pacote começado continua");
});

test("site: Word com anexos inline (PDF e foto), texto do Office no pedido e o usuário como elaborador", async () => {
  const estado = novoEstado();
  const bom = await lerJsonLocal("exemplos/pop_linac_manutencao.json");
  roteiroGemini = [{ texto: JSON.stringify(bom) }];
  pedidosGemini.length = 0;
  const anexos = [
    { nome: "POP antigo.pdf", mime: "application/pdf", dados: Buffer.from("%PDF-1.4 teste").toString("base64") },
    { nome: "checklist.jpg", mime: "image/jpeg", dados: PNG },
    { nome: "manual.docx", tipo: "texto", texto: "Passo 1: conferir o CPF 111.222.333-44 no sistema." },
  ];
  const historico = [{ papel: "usuario", texto: "segue o material", anexos: anexos.map((a) => ({ nome: a.nome })) }];
  const r = await tratarPop(pedido("gerar", { etapa: "word", brief: BRIEF, historico, anexos }, comSessao), ENV_SITE, {}, anfitriaoDoSite(estado));
  const eventos = await lerSse(r);
  const res = eventos.find((e) => e.evento === "resultado");
  assert.ok(res, JSON.stringify(eventos.filter((e) => e.evento === "erro")));
  const partes = pedidosGemini[0].corpo.contents[0].parts;
  assert.deepEqual(partes.slice(1).map((p) => p.inlineData.mimeType), ["application/pdf", "image/jpeg"]);
  assert.ok(!JSON.stringify(pedidosGemini[0].corpo).includes("fileData"), "sem Files API");
  const entrada = partes[0].text;
  assert.ok(entrada.includes("# ANEXOS DO USUÁRIO") && entrada.includes("[Anexo de texto: manual.docx]"));
  assert.ok(entrada.includes("[CPF]") && !entrada.includes("111.222.333-44"));
  assert.ok(entrada.includes('"elaborado_por_nome": "Ana Souza"'));
  assert.equal(res.dados.json.metadata.elaborado_por.nome, "Ana Souza");
  assert.equal(res.dados.json.metadata.elaborado_por.cargo, "Enfermagem Oncológica");
});

test("site: anexos acima do limite são recusados antes de chamar a IA", async () => {
  const estado = novoEstado();
  const pdf = { nome: "a.pdf", mime: "application/pdf", dados: Buffer.from("%PDF").toString("base64") };
  let r = await tratarPop(pedido("gerar", { etapa: "word", brief: BRIEF, anexos: [pdf, pdf, pdf, pdf] }, comSessao), ENV_SITE, {}, anfitriaoDoSite(estado));
  assert.equal(r.status, 400);
  assert.deepEqual(await r.json(), { error: "pop_anexos_demais", maximo: ANEXOS.maximo });
  const grande = { nome: "b.pdf", mime: "application/pdf", dados: Buffer.alloc(ANEXOS.porArquivo + 10).toString("base64") };
  r = await tratarPop(pedido("gerar", { etapa: "word", brief: BRIEF, anexos: [grande] }, comSessao), ENV_SITE, {}, anfitriaoDoSite(estado));
  assert.equal(r.status, 400);
  assert.equal((await r.json()).error, "file_too_large");
  const audio = { nome: "c.mp3", mime: "audio/mpeg", dados: "AAAA" };
  r = await tratarPop(pedido("gerar", { etapa: "word", brief: BRIEF, anexos: [audio] }, comSessao), ENV_SITE, {}, anfitriaoDoSite(estado));
  assert.equal((await r.json()).error, "file_type_unsupported");
  assert.equal(estado.chamadas, 0);
});

test("site: ilustrações do PPT pelo modelo de imagem (no máximo 3), uma falha não derruba as outras", async () => {
  const estado = novoEstado();
  pedidosImagem.length = 0;
  const word = await lerJsonLocal("exemplos/pop_linac_manutencao.json");
  const ppt = normalizarPpt(await lerJsonLocal("exemplos/ppt_linac_manutencao.json"), word);
  const deImagem = ppt.slides.filter((s) => /^imagem_web_/.test(s.tipo));
  deImagem[0].imagem_prompt = "radiotherapy team reviewing a plan in a control room";
  deImagem[1].imagem_prompt = "FALHA";
  const r = await tratarPop(pedido("imagens", { ppt }, comSessao), ENV_SITE, {}, anfitriaoDoSite(estado));
  const dados = await r.json();
  assert.equal(pedidosImagem.length, 3);
  assert.ok(pedidosImagem.every((p) => p.chave === "chave-paga"));
  assert.deepEqual(pedidosImagem[0].corpo.generationConfig.responseModalities, ["IMAGE"]);
  assert.ok(pedidosImagem[0].corpo.contents[0].parts[0].text.includes("Scene: radiotherapy team reviewing"));
  assert.deepEqual(dados.imagens.map((i) => i.numero), [deImagem[0].numero, deImagem[2].numero]);
  assert.deepEqual(dados.falhas, [{ numero: deImagem[1].numero, error: "pop_imagem_falhou" }]);
  assert.equal(dados.imagens[0].base64, PNG);
  assert.deepEqual(estado.somas, [2680], "o uso das imagens entra no teto");
});

test("site: chave própria do usuário: Gemini com a chave dela, sem teto e sem somar no uso do dia", async () => {
  const estado = novoEstado({ usado: 999999 });
  roteiroGemini = [{ texto: "Entendi. Qual o setor?" }];
  pedidosGemini.length = 0;
  const historico = [{ papel: "usuario", texto: "POP de troca de turno" }];
  const r = await tratarPop(pedido("conversa", { historico }, { ...comSessao, "x-pop-chave": CHAVE_PROPRIA }), ENV_SITE, {}, anfitriaoDoSite(estado));
  const dados = await r.json();
  assert.equal(r.status, 200, "com a chave dela, o teto do site não vale");
  assert.equal(pedidosGemini[0].chave, CHAVE_PROPRIA);
  assert.equal(estado.chamadas, 0, "o pool do site não é usado");
  assert.deepEqual(estado.somas, [], "nada entra no uso do dia");
  assert.deepEqual(dados.uso_dia, { usado: 999999, teto: 400000 });
  assert.ok(estado.logs.some((l) => l.evt === "pop_conversa" && l.chave === "propria"));
  assert.ok(!JSON.stringify(estado.logs).includes(CHAVE_PROPRIA), "a chave nunca vai para o log");
});

test("site: ilustrações com a chave própria também saem da conta dela", async () => {
  const estado = novoEstado({ usado: 999999 });
  pedidosImagem.length = 0;
  const word = await lerJsonLocal("exemplos/pop_linac_manutencao.json");
  const ppt = normalizarPpt(await lerJsonLocal("exemplos/ppt_linac_manutencao.json"), word);
  for (const s of ppt.slides.filter((x) => /^imagem_web_/.test(x.tipo))) s.imagem_prompt = "linear accelerator room";
  const r = await tratarPop(pedido("imagens", { ppt }, { ...comSessao, "x-pop-chave": CHAVE_PROPRIA }), ENV_SITE, {}, anfitriaoDoSite(estado));
  assert.equal(r.status, 200);
  assert.ok(pedidosImagem.length > 0 && pedidosImagem.every((p) => p.chave === CHAVE_PROPRIA));
  assert.deepEqual(estado.somas, []);
});

test("site: chave própria fora do formato, recusada pelo Google ou sem cota têm códigos próprios", async () => {
  const historico = [{ papel: "usuario", texto: "POP de troca de turno" }];
  const tentar = async (chave) => {
    roteiroGemini = [{ texto: "ok" }];
    const r = await tratarPop(pedido("conversa", { historico }, { ...comSessao, "x-pop-chave": chave }), ENV_SITE, {}, anfitriaoDoSite(novoEstado()));
    return [r.status, (await r.json()).error];
  };
  pedidosGemini.length = 0;
  assert.deepEqual(await tentar("minha-chave"), [400, "pop_chave_invalida"]);
  assert.equal(pedidosGemini.length, 0, "chave fora do formato não chega ao Google");
  assert.deepEqual(await tentar(CHAVE_RECUSADA), [403, "pop_chave_recusada"]);
  assert.deepEqual(await tentar(CHAVE_SEM_COTA), [429, "pop_chave_sem_cota"]);
  assert.deepEqual(await tentar(CHAVE_SEM_MODELO), [403, "pop_chave_sem_modelo"]);
});

test("site: ping da chave própria no modelo de texto que o anfitrião dita, sem pool, teto nem soma", async () => {
  const estado = novoEstado({ usado: 999999 });
  roteiroGemini = [{ texto: "pong" }];
  pedidosGemini.length = 0;
  const r = await tratarPop(pedido("chave", {}, { ...comSessao, "x-pop-chave": CHAVE_PROPRIA }), ENV_SITE, {}, anfitriaoDoSite(estado));
  assert.equal(r.status, 200, "o teto do site não barra o ping");
  assert.deepEqual(await r.json(), { ok: true, modelo: "modelo-unico" });
  assert.equal(pedidosGemini.length, 1);
  assert.match(pedidosGemini[0].url, /\/models\/modelo-unico:generateContent$/);
  assert.equal(pedidosGemini[0].chave, CHAVE_PROPRIA);
  assert.ok(pedidosGemini[0].corpo.generationConfig.maxOutputTokens <= 16, "o ping é mínimo");
  assert.equal(estado.chamadas, 0, "o pool do site não é usado");
  assert.deepEqual(estado.somas, [], "o ping não entra no uso do dia");
  assert.deepEqual(estado.logs.filter((l) => l.evt === "pop_chave").map((l) => Object.keys(l).sort()), [["evt", "ms", "ok"]]);
  assert.ok(!JSON.stringify(estado.logs).includes(CHAVE_PROPRIA), "a chave nunca vai para o log");
});

test("site: o ping recusa a chave sem o modelo, recusada, sem cota ou ausente, antes de o widget aceitá-la", async () => {
  const estado = novoEstado();
  const tentar = async (cab) => {
    const r = await tratarPop(pedido("chave", {}, { ...comSessao, ...cab }), ENV_SITE, {}, anfitriaoDoSite(estado));
    return [r.status, await r.json()];
  };
  assert.deepEqual(await tentar({}), [400, { error: "pop_chave_invalida" }]);
  assert.deepEqual(await tentar({ "x-pop-chave": "minha-chave" }), [400, { error: "pop_chave_invalida" }]);
  assert.deepEqual(await tentar({ "x-pop-chave": CHAVE_RECUSADA }), [403, { error: "pop_chave_recusada", upstream: 400 }]);
  assert.deepEqual(await tentar({ "x-pop-chave": CHAVE_SEM_MODELO }), [403, { error: "pop_chave_sem_modelo", modelo: "modelo-unico" }],
    "a mensagem cita o modelo que o site usa");
  assert.deepEqual(await tentar({ "x-pop-chave": CHAVE_SEM_COTA }), [429, { error: "pop_chave_sem_cota" }]);
  const erros = estado.logs.filter((l) => l.evt === "pop_erro");
  assert.ok(erros.length === 5 && erros.every((l) => l.rota === "chave"));
  assert.ok(![CHAVE_RECUSADA, CHAVE_SEM_MODELO, CHAVE_SEM_COTA].some((k) => JSON.stringify(estado.logs).includes(k)));
  assert.deepEqual(estado.somas, []);
});

test("site: /auditar manda o documento inline à tarefa do auditor e devolve a auditoria em texto", async () => {
  const estado = novoEstado();
  roteiroGemini = [{ texto: "# Auditoria: POP antigo\n---\nVisão geral do documento." }];
  pedidosGemini.length = 0;
  const historico = [
    { papel: "assistente", texto: "Anexe o documento que você já tem." },
    { papel: "usuario", texto: "Quero melhorar este POP", anexos: [{ nome: "pop.docx" }, { nome: "manual.pdf" }] },
  ];
  const anexos = [
    { tipo: "texto", nome: "pop.docx", texto: "Objetivo do POP antigo. Responsável com CPF 123.456.789-00." },
    { nome: "manual.pdf", mime: "application/pdf", dados: Buffer.from("%PDF-1.4 teste").toString("base64") },
  ];
  const r = await tratarPop(pedido("auditar", { historico, anexos }, comSessao), ENV_SITE, {}, anfitriaoDoSite(estado));
  assert.equal(r.status, 200);
  const dados = await r.json();
  assert.match(dados.texto, /^# Auditoria: POP antigo/);
  assert.deepEqual(dados.uso_dia, { usado: estado.usado, teto: 400000 });
  const chamada = pedidosGemini.find((q) => q.url.includes(":generateContent"));
  assert.match(chamada.url, /\/models\/modelo-unico:generateContent$/);
  const sistema = chamada.corpo.systemInstruction.parts[0].text;
  assert.ok(sistema.startsWith(IDENTIDADE.conselheiro.slice(0, 60)), "a identidade vem primeiro");
  assert.ok(sistema.includes("<tarefa_auditoria>") && sistema.includes("<como_auditar>"));
  const partes = chamada.corpo.contents[0].parts;
  assert.ok(partes[0].text.includes("[Anexo de texto: pop.docx]") && partes[0].text.includes("Quero melhorar este POP"));
  assert.ok(partes[0].text.includes("[CPF]") && !partes[0].text.includes("123.456.789-00"), "o texto do anexo passa pela redução");
  assert.deepEqual(partes.slice(1).map((q) => q.inlineData.mimeType), ["application/pdf"]);
  assert.equal(estado.somas.length, 1, "a auditoria conta no uso do dia");
  const log = estado.logs.find((l) => l.evt === "pop_auditar");
  assert.deepEqual(Object.keys(log).sort(), ["anexos", "entrada", "evt", "ms", "saida"]);
  assert.equal(log.anexos, 2);
  assert.ok(!JSON.stringify(estado.logs).includes("POP antigo"), "nada de conteúdo no log");
});

test("site: /auditar sem anexo é recusado sem chamar o Gemini", async () => {
  pedidosGemini.length = 0;
  const historico = [{ papel: "usuario", texto: "Quero melhorar um POP" }];
  const r = await tratarPop(pedido("auditar", { historico, anexos: [] }, comSessao), ENV_SITE, {}, anfitriaoDoSite(novoEstado()));
  assert.equal(r.status, 400);
  assert.deepEqual(await r.json(), { error: "pop_auditoria_sem_anexo" });
  assert.equal(pedidosGemini.length, 0);
});

test("revisão: depois da auditoria, a triagem e a geração do Word levam o bloco do documento existente", async () => {
  const historico = [{ papel: "usuario", texto: "Quero melhorar este POP", anexos: [{ nome: "pop.docx" }] }];
  const sistemaDaConversa = async (corpo) => {
    roteiroGemini = [{ texto: "Entendi." }];
    await tratarPop(pedido("conversa", corpo, comSessao), ENV_SITE, {}, anfitriaoDoSite(novoEstado()));
    return pedidosGemini.at(-1).corpo.systemInstruction.parts[0].text;
  };
  assert.ok(!(await sistemaDaConversa({ historico })).includes("<revisao_de_documento_existente>"));
  assert.ok((await sistemaDaConversa({ historico, revisao: true })).includes("<revisao_de_documento_existente>"));
  assert.ok(sistemaWord("POP", [], true).includes("<revisao_de_documento_existente>"));
  assert.ok(!sistemaWord("POP").includes("<revisao_de_documento_existente>"));
  assert.ok(sistemaWord("CHK", [], true).includes("<revisao_de_documento_existente>"), "vale também no texto institucional");
});

test("site: saúde devolve o uso do dia e acorda o motor com o token", async () => {
  const estado = novoEstado({ usado: 320000 });
  pedidosSaudeMotor.length = 0;
  const r = await tratarPop(new Request("https://radioterapia.ai/api/pop/saude", { headers: comSessao }), ENV_SITE, {}, anfitriaoDoSite(estado));
  const dados = await r.json();
  assert.equal(dados.ok, true);
  assert.equal(pedidosSaudeMotor.length, 1, "abrir o módulo cutuca o motor (e o acorda)");
  assert.equal(pedidosSaudeMotor[0]["x-pop-token"], "token-motor", "com o token do motor");
  assert.deepEqual(dados.motor, { ok: true });
  assert.deepEqual(dados.uso_dia, { usado: 320000, teto: 400000 });
  assert.deepEqual(dados.modelos, { texto: "modelo-unico", imagem: "modelo-imagem" });
  assert.ok(dados.corpus.secoes > 0);
  assert.deepEqual(dados.formatos_por_tipo.CONS, ["word"]);
  assert.deepEqual(dados.formatos_por_tipo.FTI, ["word", "excel"]);
  assert.equal(Object.keys(dados.formatos_por_tipo).length, TIPOS_DOCUMENTO.length);
});

test("handlePop exige o anfitrião e atende pelo contexto do Hono", async () => {
  const estado = novoEstado();
  const c = {
    req: { raw: new Request("https://radioterapia.ai/api/pop/saude", { headers: comSessao }) },
    env: ENV_SITE,
    get executionCtx() { throw new Error("This context has no ExecutionContext"); },
  };
  assert.throws(() => handlePop(c), /anfitrião do site/);
  let recebeu = null;
  const r = await handlePop(c, (args) => { recebeu = args; return anfitriaoDoSite(estado)(args); });
  assert.equal(r.status, 200);
  assert.equal(recebeu.c, c, "o anfitrião recebe o contexto do Hono");
});

const APOIO = ["cons_tcle_endoscopia", "term_normas_acompanhante", "chk_carro_emergencia", "form_notificacao_incidente",
  "inf_preparo_sedacao", "nt_ia_documentos", "cod_conduta"];

test("tipos: os 7 de apoio são aceitos; formatos seguem a matriz do tipo; público tem padrão por tipo", () => {
  for (const t of ["CONS", "TERM", "CHK", "FORM", "INF", "NT", "COD"]) assert.equal(limparBrief({ tipo_documento: t }).tipo_documento, t);
  assert.deepEqual(limparBrief({ tipo_documento: "CONS", formatos: ["word", "excel", "ppt"] }).formatos, ["word"]);
  assert.deepEqual(limparBrief({ tipo_documento: "FTI" }).formatos, ["word", "excel"]);
  assert.deepEqual(limparBrief({ tipo_documento: "COD" }).formatos, ["word", "ppt"]);
  assert.deepEqual(limparBrief({ tipo_documento: "POP", formatos: ["ppt"] }).formatos, ["word", "ppt"]);
  assert.equal(limparBrief({ tipo_documento: "CONS", publico: "interno" }).publico, "paciente");
  assert.equal(limparBrief({ tipo_documento: "CHK", publico: "paciente" }).publico, "interno");
  assert.equal(limparBrief({ tipo_documento: "FORM" }).publico, "interno");
  assert.equal(limparBrief({ tipo_documento: "FORM", publico: "paciente" }).publico, "paciente");
  assert.equal(limparBrief({ tipo_documento: "INF" }).publico, "paciente");
  assert.equal(limparBrief({ tipo_documento: "CONS" }).classificacao, "publico");
  assert.equal(limparBrief({ tipo_documento: "CONS", classificacao: "restrito" }).classificacao, "restrito");
});

test("lentes: a instrução do Word leva só a lente do tipo pedido", () => {
  for (const t of TIPOS_DOCUMENTO) assert.ok(LENTES[t], `falta a lente de ${t}`);
  const pop = sistemaWord("POP");
  const reg = sistemaWord("REG");
  const cons = sistemaWord("CONS");
  assert.ok(pop.startsWith(IDENTIDADE.conselheiro) && cons.startsWith(IDENTIDADE.conselheiro));
  assert.ok(pop.includes(AGENTES.word) && pop.includes(LENTES.POP));
  assert.ok(!pop.includes(LENTES.REG) && !pop.includes(LENTES.CONS));
  assert.ok(reg.includes(LENTES.REG) && !reg.includes(LENTES.POP));
  assert.ok(cons.includes(AGENTES.word_texto) && cons.includes(LENTES.CONS) && !cons.includes(AGENTES.word));
  assert.ok(cons.includes("Resolução CFM nº 2.454/2026"));
  assert.equal(sistemaWord(), pop, "sem tipo, vale o POP");
  for (const s of [pop, reg, cons]) assert.doesNotMatch(s, /\{\{[A-Z_]+\}\}|<!--/);
});

test("regras: documento de gestão pode tratar de higiene das mãos e consentimento (aviso, não erro)", async () => {
  const doc = normalizarWord(await lerJsonLocal("exemplos/exemplo_pop.json"), { ...BRIEF, natureza_processo: "gestao" });
  const { erros, avisos } = validarWord(doc);
  assert.deepEqual(erros, [], erros.join("\n"));
  assert.ok(avisos.some((a) => /gestão/.test(a)), avisos.join("\n"));
  assert.ok(!avisos.some((a) => /LOTO/.test(a)), "LOTO não é análogo de documento de gestão");
});

test("regras: texto institucional — os exemplos passam; dado de paciente, falta de assinatura e corpo vazio barram", async () => {
  for (const nome of APOIO) {
    const bruto = await lerJsonLocal(`exemplos/${nome}.json`);
    const brief = limparBrief({ ...BRIEF, tipo_documento: bruto.metadata.tipo_documento, publico: bruto.metadata.publico });
    const doc = normalizarWord(bruto, brief);
    assert.deepEqual(validarWord(doc).erros, [], `${nome}: ${validarWord(doc).erros.join("; ")}`);
    assert.ok(Array.isArray(doc.corpo) && !doc.secoes, `${nome} continua no layout texto institucional`);
    assert.equal(doc.metadata.tipo_documento, bruto.metadata.tipo_documento);
  }
  const brief = limparBrief({ ...BRIEF, tipo_documento: "CONS", classificacao: undefined });
  const tcle = normalizarWord(await lerJsonLocal("exemplos/cons_tcle_endoscopia.json"), brief);
  assert.equal(tcle.metadata.codigo, "CONS-RTX-001");
  assert.equal(tcle.metadata.publico, "paciente");
  assert.equal(tcle.metadata.classificacao, "publico");
  assert.equal(tcle.metadata.titulo_processo, "Endoscopia digestiva alta com sedação");

  const comNome = structuredClone(tcle);
  comNome.corpo.unshift({ tipo: "paragrafo", texto: "Nome do(a) paciente: Maria Aparecida da Silva" });
  assert.ok(validarWord(comNome).erros.some((e) => /dado de paciente/.test(e)));
  const comCpf = structuredClone(tcle);
  comCpf.corpo.push({ tipo: "campos", itens: [{ rotulo: "CPF", linhas: 1, valor: "123.456.789-09" }] });
  assert.ok(validarWord(comCpf).erros.some((e) => /dado de paciente/.test(e)));
  const semAssinatura = structuredClone(tcle);
  semAssinatura.assinaturas = [];
  assert.ok(validarWord(semAssinatura).erros.some((e) => /assinatura/.test(e)));
  const vazio = structuredClone(tcle);
  vazio.corpo = [];
  assert.ok(validarWord(vazio).erros.some((e) => /"corpo"/.test(e)));
  const noLayoutErrado = normalizarWord(await lerJsonLocal("exemplos/exemplo_pop.json"), brief);
  assert.ok(validarWord(noLayoutErrado).erros.some((e) => /texto institucional/.test(e)));
});

test("/conversa: o tipo escolhido na tela inicial entra na triagem e manda no resumo", async () => {
  roteiroGemini = [{ chamada: { name: "gerar_documentos", args: { ...BRIEF, tipo_documento: "POP" } } }];
  const r = await tratarPop(pedido("conversa", { tipo_escolhido: "PROT", historico: [{ papel: "usuario", texto: "pode gerar" }] }), ENV);
  const dados = await r.json();
  assert.equal(dados.acao, "gerar");
  assert.equal(dados.brief.tipo_documento, "PROT");
  const sistema = pedidosGemini.at(-1).corpo.systemInstruction.parts[0].text;
  assert.ok(sistema.includes("Protocolo (PROT)"), "a triagem sabe o tipo escolhido");
  roteiroGemini = [{ texto: "# Triagem\n---" }];
  await tratarPop(pedido("conversa", { tipo_escolhido: "XYZ", historico: [{ papel: "usuario", texto: "oi" }] }), ENV);
  assert.ok(!pedidosGemini.at(-1).corpo.systemInstruction.parts[0].text.includes("escolhido pelo usuário"));
});

test("/gerar: Excel e PowerPoint fora da matriz do tipo são recusados antes de chamar a IA", async () => {
  const word = await lerJsonLocal("exemplos/cons_tcle_endoscopia.json");
  const antes = pedidosGemini.length;
  for (const etapa of ["excel", "ppt"]) {
    const r = await tratarPop(pedido("gerar", { etapa, brief: limparBrief({ ...BRIEF, tipo_documento: "CONS" }), word }), ENV);
    assert.equal(r.status, 400);
    assert.deepEqual(await r.json(), { error: "pop_formato_nao_se_aplica" });
  }
  const r = await tratarPop(pedido("gerar", { etapa: "excel", brief: limparBrief({ ...BRIEF, tipo_documento: "COD" }), word }), ENV);
  assert.equal(r.status, 400);
  assert.equal(pedidosGemini.length, antes);
});

test("regras: o POP misto de braquiterapia (etapas com paciente e com equipamento) passa sem pendência", async () => {
  const doc = normalizarWord(await lerJsonLocal("exemplos/pop_braquiterapia_hdr.json"),
    limparBrief({ ...BRIEF, natureza_processo: "misto", sigla_setor: "RTB" }));
  assert.deepEqual(validarWord(doc), { erros: [], avisos: [] });
  const semMeta5 = JSON.parse(JSON.stringify(doc).replace(/\(Meta 5\)/g, ""));
  assert.ok(validarWord(semMeta5).erros.some((e) => /Processo misto: cite "Meta 5"/.test(e)));
});

test("instruções genéricas: nenhuma identidade ou tarefa cita certificadora ou material dela", () => {
  const CERTIFICADORA = /\b(ONA|JCI|Qmentum|OPSS)\b|Elemento Mensur|acreditação corporativa|Joint Commission/i;
  const textos = { ...IDENTIDADE, ...AGENTES, ...LENTES };
  delete textos.referencial;
  for (const [nome, texto] of Object.entries(textos)) assert.doesNotMatch(texto, CERTIFICADORA, nome);
});

test("referencial pedido: só entra na instrução quando o usuário pediu, com as regras de citação segura", () => {
  assert.deepEqual(limparBrief({}).referenciais, []);
  const b = limparBrief({ referenciais: ["Qmentum International", "ISO 15189", "", "x".repeat(300)] });
  assert.deepEqual(b.referenciais.slice(0, 2), ["Qmentum International", "ISO 15189"]);
  assert.ok(b.referenciais[2].endsWith("…") && b.referenciais[2].length <= 81, "nome longo é cortado");
  const sem = sistemaWord("POP");
  const com = sistemaWord("POP", b.referenciais);
  assert.ok(!sem.includes("Regras de citação segura") && com.includes("Regras de citação segura"));
  assert.ok(com.includes("Qmentum International") && com.includes("ROP") && com.includes("IPSG.05"));
  assert.ok(sistemaWord("CONS", ["ONA"]).includes("Regras de citação segura"));
});

test("regras: prática organizacional obrigatória (ROP) nunca é chamada de POP", async () => {
  const doc = normalizarWord(await lerJsonLocal("exemplos/exemplo_pop.json"), { ...BRIEF, natureza_processo: "assistencial" });
  doc.secoes.objetivo += " Atende à Prática Organizacional Obrigatória (POP) de identificação.";
  assert.ok(validarWord(doc).erros.some((e) => /ROP/.test(e)));
});

test("lente do Plano: contingência é um dos casos; plano de segurança do paciente tem plano de ação", () => {
  assert.match(LENTES.PLAN, /plano de segurança do paciente/i);
  assert.match(LENTES.PLAN, /contingência/i);
  assert.match(LENTES.PLAN, /"tabela"/);
});
