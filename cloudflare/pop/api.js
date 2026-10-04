
// GUARDA: nada de conteúdo, e-mail ou chave vai para log: registrar() recebe só números e códigos.

import { anfitriaoAvulso } from "./anfitriao.js";
import { blocoLiteratura, carregarIndice, listaCapitulos, selecionarSecoes, textosSecoes } from "./corpus.js";
import { erro } from "./erros.js";
import { chaveDoUsuario, configGemini, gerar, gerarEmFluxo, pingar, tokensDe } from "./gemini.js";
import { gerarImagens, pedidosDeImagem } from "./imagens.js";
import { FUNCAO_GERAR, sistemaConversa } from "./prompts/conversa.js";
import { sistemaAuditoria } from "./prompts/auditoria.js";
import { sistemaExcel } from "./prompts/excel.js";
import { preencher } from "./prompts/montar.js";
import { sistemaPpt } from "./prompts/ppt.js";
import { AGENTES } from "./prompts/textos.js";
import { sistemaWord } from "./prompts/word.js";
import {
  NATUREZAS, NOMES_TIPO, TIPOS_DOCUMENTO, TIPOS_TEXTO, formatosDoTipo, normalizarExcel, normalizarPpt, normalizarWord,
  publicoDoTipo, validarExcel, validarPpt, validarWord,
} from "./regras.js";
import {
  ErroHttp, base64Limpo, bytesDoBase64, extrairJson, hojeMesAno, json, lerJson, limitar, respostaDeErro,
} from "./util.js";

const MAX_MENSAGENS = 60;

// GUARDA: anexos só na geração do Word (a triagem vê apenas o nome). Até 3, 5 MB cada, 12 MB no
// total, inline: o arquivo da Files API fica preso à chave que o enviou, e o site alterna chaves.
export const ANEXOS = { maximo: 3, porArquivo: 5 * 1024 * 1024, total: 12 * 1024 * 1024, texto: 60_000 };
const MIMES_ANEXO = new Set(["application/pdf", "image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"]);
const BASE64 = /^[A-Za-z0-9+/]*={0,2}$/;


export async function tratarPop(request, env = {}, ctx = {}, criarAnfitriao = anfitriaoAvulso) {
  const host = criarAnfitriao({ env, request, ctx });
  const cors = host.cors || {};
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  const rota = new URL(request.url).pathname.replace(/\/+$/, "").split("/").pop();
  const inicio = Date.now();
  try {
    const usuario = await host.usuario();
    if (!(await host.ativo())) throw erro("pop_desativado");
    await host.limitar(usuario, rota);
    const chaveUsuario = chaveDoUsuario(request);
    const contexto = { env, request, ctx, host, usuario, chaveUsuario };
    // GUARDA: toda interação acorda o motor em segundo plano. O Space gratuito dorme sem uso e leva
    // cerca de 1 minuto para subir, tempo que a triagem cobre; a saúde bate nele por conta própria.
    if (rota !== "saude" && rota !== "renderizar") acordarMotor(host, ctx);
    let resposta;
    if (rota === "saude" && request.method === "GET") resposta = await rotaSaude(contexto);
    else if (request.method !== "POST") throw erro("pop_metodo_invalido");
    else if (rota === "conversa") resposta = await rotaConversa(contexto);
    else if (rota === "gerar") resposta = await rotaGerar(contexto);
    else if (rota === "imagens") resposta = await rotaImagens(contexto);
    else if (rota === "renderizar") resposta = await rotaRenderizar(contexto);
    else if (rota === "chave") resposta = await rotaChave(contexto);
    else if (rota === "auditar") resposta = await rotaAuditar(contexto);
    else throw erro("pop_rota_inexistente");
    for (const [k, v] of Object.entries(cors)) resposta.headers.set(k, v);
    return resposta;
  } catch (e) {
    host.registrar({
      evt: "pop_erro", rota, ms: Date.now() - inicio,
      codigo: e instanceof ErroHttp ? e.codigo : "pop_erro_interno",
      ...(e instanceof ErroHttp ? {} : { tipo: (e && e.name) || "Error" }),
    });
    return respostaDeErro(e, cors);
  }
}

export function handlePop(c, criarAnfitriao) {
  if (typeof criarAnfitriao !== "function") {
    throw new Error("handlePop(c, anfitriao): passe o anfitrião do site (src/pop-anfitriao.js).");
  }
  let ctx = {};
  try { ctx = c.executionCtx || {}; } catch {   }
  return tratarPop(c.req.raw, c.env || {}, ctx, (args) => criarAnfitriao({ ...args, c }));
}

// ─────────────────────────────────────────────────────────────
// GUARDA: teto diário conferido no início (triagem e Word); Excel, PowerPoint e imagens terminam o pacote
// começado, com folga até 2× o teto para que ninguém contorne o limite chamando só essas etapas.
// ─────────────────────────────────────────────────────────────
async function exigirSaldo(host, usuario, fator = 1) {
  const teto = Number(await host.tetoDiario()) || 0;
  if (teto <= 0) return;
  const usado = Number(await host.usoHoje(usuario)) || 0;
  if (usado >= teto * fator) throw erro("pop_teto_diario", { uso_dia: { usado, teto } });
}

async function contabilizar(host, usuario, usos) {
  const tokens = usos.reduce((soma, u) => soma + tokensDe(u), 0);
  const teto = Number(await host.tetoDiario()) || 0;
  let usado = tokens > 0 ? await host.registrarUso(usuario, tokens) : undefined;
  if (usado === undefined || usado === null) usado = await host.usoHoje(usuario);
  return { usado: Number(usado) || 0, teto };
}

function partesDaMensagem(m) {
  const linhas = [];
  if (m.texto) linhas.push(limitar(m.texto, 20000));
  for (const a of Array.isArray(m.anexos) ? m.anexos.slice(0, 6) : []) {
    if (a && a.nome) linhas.push(`[Anexo: ${limitar(a.nome, 120)} — lido só na geração do documento]`);
  }
  return linhas.length ? [{ text: linhas.join("\n") }] : [];
}

/** GUARDA: histórico do navegador → conteúdos do Gemini, alternando usuário e modelo e começando no usuário. */
export function conteudosDaConversa(historico) {
  const conteudos = [];
  for (const m of historico.slice(-MAX_MENSAGENS)) {
    const role = m && m.papel === "assistente" ? "model" : "user";
    const parts = partesDaMensagem(m || {});
    if (!parts.length) continue;
    const ultimo = conteudos[conteudos.length - 1];
    if (ultimo && ultimo.role === role) ultimo.parts.push(...parts);
    else conteudos.push({ role, parts });
  }
  while (conteudos.length && conteudos[0].role !== "user") conteudos.shift();
  return conteudos;
}

async function redigirConteudos(host, conteudos) {
  for (const c of conteudos) {
    if (c.role !== "user") continue;
    for (const p of c.parts) if (typeof p.text === "string") p.text = await host.redigirTexto(p.text);
  }
  return conteudos;
}

function lista(v, max, maxTexto = 200) {
  return (Array.isArray(v) ? v : v ? [v] : []).map((x) => limitar(String(x), maxTexto)).filter(Boolean).slice(0, max);
}

export function limparBrief(b = {}) {
  const tipo = TIPOS_DOCUMENTO.includes(b.tipo_documento) ? b.tipo_documento : "POP";
  const permitidos = formatosDoTipo(tipo);
  const pedidos = lista(b.formatos, 3).filter((f) => permitidos.includes(f));
  const formatos = pedidos.length ? permitidos.filter((f) => f === "word" || pedidos.includes(f)) : permitidos;
  const publico = publicoDoTipo(tipo, b.publico);
  const classificacoes = ["publico", "interno", "restrito", "confidencial"];
  return {
    tipo_documento: tipo,
    publico,
    natureza_processo: NATUREZAS.includes(b.natureza_processo) ? b.natureza_processo : "assistencial",
    titulo_processo: limitar(b.titulo_processo || "Documento da Qualidade", 200),
    setor: limitar(b.setor || "", 200),
    sigla_setor: limitar(String(b.sigla_setor || "").toUpperCase().replace(/[^A-Z0-9]/g, ""), 8),
    idioma: ["pt", "en", "es"].includes(b.idioma) ? b.idioma : "pt",
    instituicao: limitar(b.instituicao || "", 200),
    elaborado_por_nome: limitar(b.elaborado_por_nome || "", 120),
    elaborado_por_cargo: limitar(b.elaborado_por_cargo || "", 120),
    resumo_demanda: limitar(b.resumo_demanda || "", 12000),
    premissas: lista(b.premissas, 20, 400),
    formatos,
    capitulos: lista(b.capitulos, 6, 12),
    termos_busca: lista(b.termos_busca, 20, 60),
    publico_treinamento: limitar(b.publico_treinamento || "", 200),
    referenciais: lista(b.referenciais, 4, 80),
    classificacao: classificacoes.includes(b.classificacao) ? b.classificacao : publico === "paciente" ? "publico" : "interno",
  };
}

async function rotaConversa({ env, request, ctx, host, usuario, chaveUsuario }) {
  const corpo = await lerJson(request, 3_000_000);
  const historico = Array.isArray(corpo.historico) ? corpo.historico : [];
  const conteudos = conteudosDaConversa(historico);
  if (!conteudos.length) throw erro("pop_conversa_vazia");
  const escolhido = TIPOS_DOCUMENTO.includes(corpo.tipo_escolhido) ? corpo.tipo_escolhido : "";
  if (!chaveUsuario) await exigirSaldo(host, usuario);
  await redigirConteudos(host, conteudos);
  const cfg = configGemini(host, env, chaveUsuario);
  const indice = await carregarIndice(host);
  const inicio = Date.now();
  const r = await gerar(cfg, {
    modelo: cfg.modeloLeve,
    sistema: sistemaConversa({
      capitulos: listaCapitulos(indice), hoje: hojeMesAno(),
      tipoEscolhido: escolhido && `${NOMES_TIPO[escolhido]} (${escolhido})`,
      revisao: corpo.revisao === true,
    }),
    conteudos,
    ferramentas: [FUNCAO_GERAR],
    maxTokens: 16384, // GUARDA: o raciocínio conta no maxOutputTokens; teto curto corta a resposta
    pensamento: cfg.pensamento,
  });
  const usoDia = await contabilizar(host, usuario, chaveUsuario ? [] : [r.uso]);
  const u = r.uso || {};
  host.registrar({
    evt: "pop_conversa", ms: Date.now() - inicio,
    entrada: u.promptTokenCount || 0, cache: u.cachedContentTokenCount || 0,
    saida: (u.candidatesTokenCount || 0) + (u.thoughtsTokenCount || 0),
    ...(chaveUsuario ? { chave: "propria" } : {}),
  });
  const chamada = r.chamadas.find((c) => c.name === "gerar_documentos");
  if (chamada) {
    const args = { ...(chamada.args || {}), ...(escolhido ? { tipo_documento: escolhido } : {}) };
    return json({ acao: "gerar", brief: limparBrief(args), texto: r.texto, uso_dia: usoDia });
  }
  if (!r.texto) {
    const aviso = r.bloqueio || r.fim === "SAFETY" || r.fim === "PROHIBITED_CONTENT" ? "pop_ia_recusou" : "pop_ia_sem_resposta";
    return json({ acao: "responder", texto: "", aviso, uso_dia: usoDia });
  }
  return json({ acao: "responder", texto: r.texto, uso_dia: usoDia });
}

export function anexosDaGeracao(lista) {
  const itens = Array.isArray(lista) ? lista.filter((a) => a && typeof a === "object") : [];
  if (itens.length > ANEXOS.maximo) throw erro("pop_anexos_demais", { maximo: ANEXOS.maximo });
  const partes = [];
  const textos = [];
  const nomes = [];
  let total = 0;
  for (const a of itens) {
    const nome = limitar(String(a.nome || "anexo").replace(/[\r\n]+/g, " "), 120);
    if (a.tipo === "texto") {
      const texto = limitar(String(a.texto || ""), ANEXOS.texto);
      if (!texto.trim()) continue;
      textos.push({ nome, texto });
      nomes.push(nome);
      continue;
    }
    const mime = String(a.mime || "").toLowerCase();
    if (!MIMES_ANEXO.has(mime)) throw erro("file_type_unsupported");
    const dados = base64Limpo(a.dados);
    if (!dados || !BASE64.test(dados)) throw erro("pop_pedido_invalido", { campo: "anexos" });
    const bytes = bytesDoBase64(dados);
    if (bytes > ANEXOS.porArquivo) throw erro("file_too_large", { maximo_mb: ANEXOS.porArquivo / 1048576 });
    total += bytes;
    if (total > ANEXOS.total) throw erro("payload_too_large", { maximo_mb: ANEXOS.total / 1048576 });
    partes.push({ inlineData: { mimeType: mime, data: dados } });
    nomes.push(nome);
  }
  return { partes, textos, nomes };
}

async function rotaGerar({ env, request, ctx, host, usuario, chaveUsuario }) {
  const corpo = await lerJson(request, 18_000_000);
  const etapa = corpo.etapa;
  if (!["word", "excel", "ppt"].includes(etapa)) throw erro("pop_pedido_invalido", { campo: "etapa" });
  if (etapa !== "word" && !(corpo.word && typeof corpo.word === "object")) throw erro("pop_word_ausente");
  const brief = limparBrief(corpo.brief || {});
  if (!formatosDoTipo(brief.tipo_documento).includes(etapa)) throw erro("pop_formato_nao_se_aplica");
  if (!chaveUsuario) await exigirSaldo(host, usuario, etapa === "word" ? 1 : 2);
  const anexos = etapa === "word" ? anexosDaGeracao(corpo.anexos) : { partes: [], textos: [], nomes: [] };
  const cfg = configGemini(host, env, chaveUsuario);
  if (!brief.elaborado_por_nome && usuario.nome) {
    brief.elaborado_por_nome = limitar(usuario.nome, 120);
    if (!brief.elaborado_por_cargo && usuario.especialidade) brief.elaborado_por_cargo = limitar(usuario.especialidade, 120);
  }
  const historico = Array.isArray(corpo.historico) ? corpo.historico.slice(-MAX_MENSAGENS) : [];

  const { readable, writable } = new TransformStream();
  const escritor = writable.getWriter();
  const codificador = new TextEncoder();
  const enviar = (evento, dados) =>
    escritor.write(codificador.encode(`event: ${evento}\ndata: ${JSON.stringify(dados)}\n\n`)).catch(() => {});
  const pulso = setInterval(() => { escritor.write(codificador.encode(": pulso\n\n")).catch(() => {}); }, 10_000);
  let ultimoAviso = 0;
  const aoProgresso = async (dados) => {
    const agora = Date.now();
    if (dados.fase === "escrevendo" || dados.fase === "corrigindo" || dados.fase === "reparando") {
      if (dados.caracteres !== undefined && agora - ultimoAviso < 700) return;
      ultimoAviso = agora;
    }
    await enviar("progresso", { etapa, ...dados });
  };

  const uso = [];
  const tarefa = (async () => {
    const inicio = Date.now();
    let resultado = null;
    let falha = null;
    try {
      const args = { env, host, cfg, brief, historico, corpo, anexos, aoProgresso, uso };
      resultado = etapa === "word" ? await gerarWord(args)
        : etapa === "excel" ? await gerarExcel(args) : await gerarPpt(args);
    } catch (e) {
      falha = e;
    }
    let usoDia = null;
    try { usoDia = await contabilizar(host, usuario, chaveUsuario ? [] : uso); } catch {   }
    const total = somarUso(uso);
    host.registrar({
      evt: "pop_gerar", etapa, ms: Date.now() - inicio, ok: Boolean(resultado), chamadas: total.chamadas,
      entrada: total.entrada, saida: total.saida + total.pensamento,
      ...(chaveUsuario ? { chave: "propria" } : {}),
      ...(falha ? { codigo: falha instanceof ErroHttp ? falha.codigo : "pop_erro_interno" } : {}),
    });
    try {
      if (resultado) {
        await enviar("resultado", { ...resultado, uso: total, uso_dia: usoDia });
      } else {
        const conhecido = falha instanceof ErroHttp;
        await enviar("erro", {
          etapa, error: conhecido ? falha.codigo : "pop_erro_interno",
          ...(conhecido && falha.extra ? falha.extra : {}), uso_dia: usoDia,
        });
      }
    } finally {
      clearInterval(pulso);
      await escritor.close().catch(() => {});
    }
  })();
  if (ctx && typeof ctx.waitUntil === "function") ctx.waitUntil(tarefa);

  return new Response(readable, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      "x-accel-buffering": "no",
    },
  });
}

function interpretarJson(r) {
  if (r.bloqueio || r.fim === "SAFETY" || r.fim === "PROHIBITED_CONTENT") throw erro("pop_ia_recusou");
  if (r.fim === "MAX_TOKENS") throw erro("pop_resposta_cortada");
  return extrairJson(r.texto);
}

// GUARDA: reparo de formato: em processamentos longos o modelo às vezes devolve texto no lugar do código.
// Reenvia SÓ a resposta recebida, com instrução rígida, até 2 vezes; se ainda
// não vier JSON, a falha sai com o código pop_formato e o módulo oferece o POP de Elite 1.0.
const TENTATIVAS_REPARO = 2;
const NOME_DOCUMENTO = { word: "documento Word", excel: "planilha Excel", ppt: "apresentação PowerPoint" };

async function jsonOuReparo({ cfg, r, etapa, aoProgresso, maxTokens, uso }) {
  try {
    return interpretarJson(r);
  } catch (e) {
    // GUARDA: recusa de conteúdo e resposta cortada não são problema de formato: não adianta reenviar
    if (e instanceof ErroHttp) throw e;
  }
  const original = String(r.texto || "");
  if (!original.trim()) throw erro("pop_formato", { etapa });
  const sistema = preencher(AGENTES.reparo_json, { DOCUMENTO: NOME_DOCUMENTO[etapa] });
  for (let tentativa = 1; tentativa <= TENTATIVAS_REPARO; tentativa++) {
    await aoProgresso({ fase: "reparando", tentativa });
    try {
      const rr = await gerarEmFluxo(cfg, {
        modelo: cfg.modeloLeve, sistema, json: true, maxTokens, pensamento: cfg.pensamento,
        conteudos: [{ role: "user", parts: [{ text: `RESPOSTA A CONVERTER EM JSON:\n\n${original}` }] }],
      }, (n) => aoProgresso({ fase: "reparando", tentativa, caracteres: n }));
      uso.push(rr.uso);
      return interpretarJson(rr);
    } catch (e) {
      if (e instanceof ErroHttp && e.codigo === "pop_ia_recusou") throw e;
    }
  }
  throw erro("pop_formato", { etapa });
}

function somarUso(lista) {
  const total = { entrada: 0, saida: 0, pensamento: 0, chamadas: 0 };
  for (const u of lista) {
    if (!u) continue;
    total.entrada += u.promptTokenCount || 0;
    total.saida += u.candidatesTokenCount || 0;
    total.pensamento += u.thoughtsTokenCount || 0;
    total.chamadas += 1;
  }
  return total;
}

function transcricao(historico, max = 40000) {
  const linhas = [];
  for (const m of historico) {
    const quem = m.papel === "assistente" ? "Conselheiro" : "Usuário";
    if (m.texto) linhas.push(`${quem}: ${limitar(m.texto, 8000)}`);
    for (const a of Array.isArray(m.anexos) ? m.anexos : []) {
      if (a && a.nome) linhas.push(`[Anexo: ${limitar(a.nome, 120)}]`);
    }
  }
  const texto = linhas.join("\n\n");
  return texto.length > max ? "…" + texto.slice(-max) : texto;
}

const pedidoDeCorrecao = (doc, erros) =>
  `Documento atual (JSON):\n${JSON.stringify(doc)}\n\nEle não cumpre estas regras:\n` +
  erros.map((e, i) => `${i + 1}. ${e}`).join("\n") +
  "\n\nCorrija apenas o necessário, mantenha todo o resto e devolva o JSON completo.";

async function corrigir({ cfg, modelo, sistema, doc, erros, normalizar, validar, aoProgresso, maxTokens, uso }) {
  await aoProgresso({ fase: "revisando", pendencias: erros.length });
  const r = await gerarEmFluxo(cfg, {
    modelo, sistema, json: true, maxTokens, pensamento: cfg.pensamento,
    conteudos: [{ role: "user", parts: [{ text: pedidoDeCorrecao(doc, erros) }] }],
  }, (n) => aoProgresso({ fase: "corrigindo", caracteres: n }));
  uso.push(r.uso);
  const novo = normalizar(interpretarJson(r));
  return { novo, validacao: validar(novo) };
}

async function comCorrecoes({ env, cfg, modelo, sistema, doc, normalizar, validar, aoProgresso, maxTokens, uso }) {
  let atual = doc;
  let { erros, avisos } = validar(atual);
  const rodadas = Math.max(0, Math.min(3, Number(env.POP_CORRECOES ?? 1)));
  for (let i = 0; erros.length && i < rodadas; i++) {
    try {
      const { novo, validacao } = await corrigir({ cfg, modelo, sistema, doc: atual, erros, normalizar, validar, aoProgresso, maxTokens, uso });
      if (validacao.erros.length <= erros.length) {
        atual = novo;
        ({ erros, avisos } = validacao);
      }
    } catch {
      avisos.push("A correção automática não terminou; o documento segue com as pendências abaixo.");
      break;
    }
  }
  return { doc: atual, avisos: [...avisos, ...erros.map((e) => `Pendente: ${e}`)] };
}

async function gerarWord({ env, host, cfg, brief, historico, corpo, anexos, aoProgresso, uso }) {
  const indice = await carregarIndice(host);
  const selecao = selecionarSecoes(indice, {
    capitulos: brief.capitulos,
    termos: brief.termos_busca,
    titulo: `${brief.titulo_processo} ${brief.setor}`,
    orcamento: Number(env.POP_ORCAMENTO_PALAVRAS || 12000),
  });
  await aoProgresso({ fase: "literatura", secoes: selecao.ids.length, palavras: selecao.palavras, capitulos: selecao.capitulos });
  const secoes = await textosSecoes(host, indice, selecao.ids);

  const conversa = await host.redigirTexto(transcricao(historico) || "(sem transcrição)");
  const blocosDeAnexo = [];
  if (anexos.nomes.length) {
    blocosDeAnexo.push(`# ANEXOS DO USUÁRIO\n${anexos.nomes.map((n) => `- ${n}`).join("\n")}\n` +
      "(PDFs e imagens seguem junto a esta mensagem, na mesma ordem; o texto dos arquivos do Office vem abaixo)");
  }
  for (const a of anexos.textos) blocosDeAnexo.push(`[Anexo de texto: ${a.nome}]\n${await host.redigirTexto(a.texto)}`);

  const entrada = [
    "# DEMANDA (levantada na conversa)",
    JSON.stringify(brief, null, 1),
    "# CONVERSA COM O USUÁRIO",
    conversa,
    ...blocosDeAnexo,
    `# DATA ATUAL: ${hojeMesAno()}`,
    "# LITERATURA DE REFERÊNCIA — Tratado Integrado da Qualidade (\"Lei Maior\")",
    blocoLiteratura(secoes, indice) || "(nenhuma seção selecionada)",
    `# TAREFA\nEscreva agora o JSON completo do documento: tipo ${brief.tipo_documento} (${NOMES_TIPO[brief.tipo_documento]}), ` +
      (TIPOS_TEXTO.includes(brief.tipo_documento) ? `layout texto institucional, público ${brief.publico}, `
        : `natureza ${brief.natureza_processo}, `) +
      `idioma "${brief.idioma}", código ${brief.tipo_documento}-${brief.sigla_setor || "SIGLA"}-001.`,
  ].join("\n\n");

  const maxTokens = Number(env.POP_MAX_TOKENS_WORD || 32768);
  const sistema = sistemaWord(brief.tipo_documento, brief.referenciais, corpo.revisao === true);
  const modelo = cfg.modeloPesado;
  const r = await gerarEmFluxo(cfg, {
    modelo, sistema, json: true, maxTokens, pensamento: cfg.pensamento,
    conteudos: [{ role: "user", parts: [{ text: entrada }, ...anexos.partes] }],
  }, (n) => aoProgresso({ fase: "escrevendo", caracteres: n }));
  uso.push(r.uso);
  const normalizar = (d) => normalizarWord(d, brief);
  const bruto = await jsonOuReparo({ cfg, r, etapa: "word", aoProgresso, maxTokens, uso });
  const { doc, avisos } = await comCorrecoes({
    env, cfg, modelo, sistema, doc: normalizar(bruto), normalizar, validar: validarWord, aoProgresso, maxTokens, uso,
  });
  const literatura = selecao.ids.map((id) => ({ id, titulo: (indice.secoes[id] || {}).titulo || "" }));
  return { etapa: "word", json: doc, avisos, literatura };
}

async function gerarExcel({ env, cfg, brief, corpo, aoProgresso, uso }) {
  const word = corpo.word;
  await aoProgresso({ fase: "preparando" });
  const entrada = `# DOCUMENTO BASE (JSON)\n${JSON.stringify(word)}\n\n# DEMANDA\n${JSON.stringify({
    titulo_processo: brief.titulo_processo, setor: brief.setor, natureza_processo: brief.natureza_processo,
    premissas: brief.premissas, idioma: brief.idioma, referenciais: brief.referenciais })}\n\n# TAREFA\n` +
    "Gere o JSON da planilha com as 6 abas. Em foco_auditoria, os referenciais pedidos; sem eles, \"Auditoria interna\".";
  const maxTokens = Number(env.POP_MAX_TOKENS_EXCEL || 16384);
  const sistema = sistemaExcel();
  const modelo = cfg.modeloLeve;
  const r = await gerarEmFluxo(cfg, {
    modelo, sistema, json: true, maxTokens, pensamento: cfg.pensamento,
    conteudos: [{ role: "user", parts: [{ text: entrada }] }],
  }, (n) => aoProgresso({ fase: "escrevendo", caracteres: n }));
  uso.push(r.uso);
  const normalizar = (d) => normalizarExcel(d, word);
  const bruto = await jsonOuReparo({ cfg, r, etapa: "excel", aoProgresso, maxTokens, uso });
  const { doc, avisos } = await comCorrecoes({
    env, cfg, modelo, sistema, doc: normalizar(bruto), normalizar, validar: validarExcel, aoProgresso, maxTokens, uso,
  });
  return { etapa: "excel", json: doc, avisos };
}

function resumoPlanilha(excel) {
  if (!excel || !Array.isArray(excel.planilhas)) return null;
  return excel.planilhas
    .filter((p) => /indicador|risco|risk|riesgo|tracer|rastre/i.test(`${p.nome_aba} ${p.titulo}`))
    .map((p) => ({ aba: p.nome_aba, colunas: p.colunas, linhas: (p.linhas || []).slice(0, 12) }));
}

async function gerarPpt({ env, cfg, brief, corpo, aoProgresso, uso }) {
  const word = corpo.word;
  const minimo = Math.max(10, Math.min(60, Number(env.POP_PPT_MIN_SLIDES || 30)));
  await aoProgresso({ fase: "preparando" });
  const entrada = [
    `# DOCUMENTO BASE (JSON)\n${JSON.stringify(word)}`,
    corpo.excel ? `# MATRIZES DA PLANILHA (resumo)\n${JSON.stringify(resumoPlanilha(corpo.excel))}` : "",
    `# PÚBLICO-ALVO\n${brief.publico_treinamento || "Equipe multiprofissional"}`,
    `# TAREFA\nGere o JSON da apresentação de treinamento com no mínimo ${minimo} slides.`,
  ].filter(Boolean).join("\n\n");
  const maxTokens = Number(env.POP_MAX_TOKENS_PPT || 32768);
  const sistema = sistemaPpt({ minimoSlides: minimo });
  const modelo = cfg.modeloLeve;
  const r = await gerarEmFluxo(cfg, {
    modelo, sistema, json: true, maxTokens, pensamento: cfg.pensamento,
    conteudos: [{ role: "user", parts: [{ text: entrada }] }],
  }, (n) => aoProgresso({ fase: "escrevendo", caracteres: n }));
  uso.push(r.uso);
  const normalizar = (d) => normalizarPpt(d, word);
  const bruto = await jsonOuReparo({ cfg, r, etapa: "ppt", aoProgresso, maxTokens, uso });
  const { doc, avisos } = await comCorrecoes({
    env, cfg, modelo, sistema, doc: normalizar(bruto), normalizar,
    validar: (d) => validarPpt(d, minimo), aoProgresso, maxTokens, uso,
  });
  return { etapa: "ppt", json: doc, avisos };
}

async function rotaImagens({ env, request, host, usuario, chaveUsuario }) {
  const corpo = await lerJson(request, 4_000_000);
  const pedidos = pedidosDeImagem(corpo.ppt);
  if (!pedidos.length) return json({ imagens: [], falhas: [], uso_dia: await contabilizar(host, usuario, []) });
  if (!chaveUsuario) await exigirSaldo(host, usuario, 2);
  const inicio = Date.now();
  const { imagens, falhas, usos } = await gerarImagens(configGemini(host, env, chaveUsuario), pedidos);
  const usoDia = await contabilizar(host, usuario, chaveUsuario ? [] : usos);
  host.registrar({
    evt: "pop_imagens", ms: Date.now() - inicio, pedidas: pedidos.length, geradas: imagens.length,
    saida: usos.reduce((s, u) => s + tokensDe(u), 0),
    ...(chaveUsuario ? { chave: "propria" } : {}),
  });
  return json({ imagens, falhas, uso_dia: usoDia });
}

async function rotaAuditar({ env, request, ctx, host, usuario, chaveUsuario }) {
  const corpo = await lerJson(request, 18_000_000);
  const historico = Array.isArray(corpo.historico) ? corpo.historico.slice(-MAX_MENSAGENS) : [];
  const anexos = anexosDaGeracao(corpo.anexos);
  if (!anexos.nomes.length) throw erro("pop_auditoria_sem_anexo");
  if (!chaveUsuario) await exigirSaldo(host, usuario);
  const cfg = configGemini(host, env, chaveUsuario);
  const blocos = [
    "# CONVERSA COM O USUÁRIO",
    await host.redigirTexto(transcricao(historico) || "(sem texto)"),
    `# DOCUMENTO PARA AUDITAR\n${anexos.nomes.map((n) => `- ${n}`).join("\n")}\n` +
      "(PDFs e imagens seguem junto a esta mensagem, na mesma ordem; o texto dos arquivos do Office vem abaixo)",
  ];
  for (const a of anexos.textos) blocos.push(`[Anexo de texto: ${a.nome}]\n${await host.redigirTexto(a.texto)}`);
  const inicio = Date.now();
  const r = await gerar(cfg, {
    modelo: cfg.modeloPesado,
    sistema: sistemaAuditoria({ hoje: hojeMesAno() }),
    conteudos: [{ role: "user", parts: [{ text: blocos.join("\n\n") }, ...anexos.partes] }],
    maxTokens: 16384, // GUARDA: o raciocínio conta no maxOutputTokens; teto curto corta a resposta
    pensamento: cfg.pensamento,
  });
  const usoDia = await contabilizar(host, usuario, chaveUsuario ? [] : [r.uso]);
  const u = r.uso || {};
  host.registrar({
    evt: "pop_auditar", ms: Date.now() - inicio, anexos: anexos.nomes.length,
    entrada: u.promptTokenCount || 0, saida: (u.candidatesTokenCount || 0) + (u.thoughtsTokenCount || 0),
    ...(chaveUsuario ? { chave: "propria" } : {}),
  });
  if (!r.texto) {
    const aviso = r.bloqueio || r.fim === "SAFETY" || r.fim === "PROHIBITED_CONTENT" ? "pop_ia_recusou" : "pop_ia_sem_resposta";
    return json({ texto: "", aviso, uso_dia: usoDia });
  }
  return json({ texto: r.texto, uso_dia: usoDia });
}

async function rotaChave({ env, host, chaveUsuario }) {
  if (!chaveUsuario) throw erro("pop_chave_invalida");
  const inicio = Date.now();
  const modelo = await pingar(configGemini(host, env, chaveUsuario));
  host.registrar({ evt: "pop_chave", ms: Date.now() - inicio, ok: true });
  return json({ ok: true, modelo });
}

function urlMotor(host, caminho) {
  if (!host.motor || !host.motor.url) throw erro("pop_motor_indisponivel", { motivo: "sem_url" });
  return String(host.motor.url).replace(/\/+$/, "") + caminho;
}

function cabecalhosMotor(host) {
  const h = { "content-type": "application/json" };
  if (host.motor.token) h["x-pop-token"] = host.motor.token;
  // GUARDA: Space privado: o Hugging Face exige o token da conta no Authorization
  if (host.motor.tokenHf) h.authorization = `Bearer ${host.motor.tokenHf}`;
  return h;
}

function acordarMotor(host, ctx) {
  if (!host.motor || !host.motor.url || !ctx || typeof ctx.waitUntil !== "function") return;
  ctx.waitUntil(fetch(urlMotor(host, "/saude"), { headers: cabecalhosMotor(host) }).catch(() => {}));
}

function imagensParaMotor(valor) {
  if (!valor || typeof valor !== "object" || Array.isArray(valor)) return null;
  const saida = {};
  for (const [numero, b64] of Object.entries(valor).slice(0, 6)) {
    if (!/^\d{1,3}$/.test(numero)) continue;
    const dados = base64Limpo(b64);
    if (!dados || !BASE64.test(dados) || bytesDoBase64(dados) > 3 * 1024 * 1024) continue;
    saida[numero] = dados;
  }
  return Object.keys(saida).length ? saida : null;
}

async function rotaRenderizar({ request, host }) {
  const corpo = await lerJson(request, 12_000_000);
  if (!corpo.word && !corpo.excel && !corpo.ppt) throw erro("pop_pedido_invalido", { campo: "documentos" });
  const carga = JSON.stringify({
    word: corpo.word || null, excel: corpo.excel || null, ppt: corpo.ppt || null,
    cor: corpo.cor || null, logo_b64: corpo.logo_b64 || null, estilo: corpo.estilo || null,
    imagens: imagensParaMotor(corpo.imagens),
  });
  const inicio = Date.now();
  // GUARDA: Space gratuito dorme sem uso; na primeira chamada pode levar ~1 min para acordar
  let ultima = 0;
  for (let tentativa = 0; tentativa < 8; tentativa++) {
    let resp;
    try {
      resp = await fetch(urlMotor(host, "/renderizar"), { method: "POST", headers: cabecalhosMotor(host), body: carga });
    } catch (e) {
      if (e instanceof ErroHttp) throw e;
      ultima = 0;
      await new Promise((r) => setTimeout(r, 8000));
      continue;
    }
    if (resp.ok && (resp.headers.get("content-type") || "").includes("json")) {
      host.registrar({ evt: "pop_renderizar", ms: Date.now() - inicio, tentativas: tentativa + 1, ok: true });
      return new Response(resp.body, { headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
    }
    ultima = resp.status;
    if (resp.status === 401 || resp.status === 403) throw erro("pop_motor_token");
    if (resp.status === 422 || resp.status === 400) throw erro("pop_motor_falhou");
    await new Promise((r) => setTimeout(r, 8000));
  }
  throw erro("pop_motor_indisponivel", { upstream: ultima });
}

async function rotaSaude({ env, host, usuario }) {
  const cfg = configGemini(host, env);
  const estado = {
    ok: true, modelos: { texto: cfg.modeloPesado, imagem: cfg.modeloImagem },
    formatos_por_tipo: Object.fromEntries(TIPOS_DOCUMENTO.map((t) => [t, formatosDoTipo(t)])),
  };
  try {
    const indice = await carregarIndice(host);
    estado.corpus = { capitulos: indice.capitulos.length, secoes: Object.keys(indice.secoes).length };
  } catch (e) {
    estado.ok = false;
    estado.corpus = { error: e instanceof ErroHttp ? e.codigo : "pop_corpus_indisponivel" };
  }
  if (host.motor && host.motor.url) {
    try {
      const r = await fetch(urlMotor(host, "/saude"), { headers: cabecalhosMotor(host), signal: AbortSignal.timeout(8000) });
      estado.motor = r.ok ? await r.json() : { status: r.status };
    } catch {
      estado.motor = { acordando: true };
    }
  } else {
    estado.ok = false;
    estado.motor = { error: "pop_motor_indisponivel" };
  }
  estado.uso_dia = { usado: Number(await host.usoHoje(usuario)) || 0, teto: Number(await host.tetoDiario()) || 0 };
  return json(estado);
}
