
import { hojeMesAno, semAcento, somarAnosMesAno, textoDe } from "./util.js";

// GUARDA: documentos de apoio no layout "texto institucional" (motor/texto.py); a FTI segue o layout do POP.
export const TIPOS_TEXTO = ["CONS", "TERM", "CHK", "FORM", "INF", "NT", "COD"];
export const TIPOS_DOCUMENTO = ["POP", "POL", "PROT", "DIR", "PLAN", "NOR", "PROG", "REG", "MAN", "FTI", ...TIPOS_TEXTO];
export const NATUREZAS = ["assistencial", "tecnico", "radiotecnico", "gestao", "misto"];
export const VALIDADE_ANOS = 2;

export const NOMES_TIPO = {
  POP: "Procedimento Operacional Padrão", POL: "Política", PROT: "Protocolo", DIR: "Diretriz", PLAN: "Plano",
  NOR: "Norma", PROG: "Programa", REG: "Regimento", MAN: "Manual", FTI: "Ficha Técnica de Indicadores",
  CONS: "Termo de Consentimento Livre e Esclarecido", TERM: "Termo de Ciência", CHK: "Checklist",
  FORM: "Formulário", INF: "Informativo", NT: "Nota Técnica", COD: "Código de Conduta",
};

const TRES = ["word", "excel", "ppt"];
const FORMATOS_POR_TIPO = {
  FTI: ["word", "excel"], COD: ["word", "ppt"],
  CONS: ["word"], TERM: ["word"], CHK: ["word"], FORM: ["word"], INF: ["word"], NT: ["word"],
};
export const formatosDoTipo = (tipo) => FORMATOS_POR_TIPO[tipo] || TRES;

const PUBLICO_FIXO = { CONS: "paciente", TERM: "paciente", CHK: "interno", NT: "interno", COD: "interno" };
const PUBLICO_PADRAO = { FORM: "interno", INF: "paciente" };
export function publicoDoTipo(tipo, pedido) {
  if (PUBLICO_FIXO[tipo]) return PUBLICO_FIXO[tipo];
  return ["paciente", "interno"].includes(pedido) ? pedido : PUBLICO_PADRAO[tipo] || "interno";
}

const TIPOS_ANEXO = new Set(["checklist", "processo", "fluxograma", "ciclo", "hierarquia", "piramide",
  "escala", "tabela", "misto", "glossario", "texto"]);
const TIPOS_FLUXO = new Set(["processo", "fluxograma"]);

// GUARDA: barreira assistencial em ação é proibida em processo técnico ou de gestão. A palavra
// "paciente" sozinha é permitida: dano diferido à coorte tratada depois.
const PROIBIDOS_NAO_ASSISTENCIAL = [
  "higienizacao das maos", "higienizar as maos", "higiene das maos", "lavagem das maos",
  "pulseira", "identificacao do paciente", "identificacao segura do paciente",
  "identificacao correta do paciente", "consentimento", "jornada do paciente", "beira-leito",
  "beira leito", "hand hygiene", "patient identification", "wristband", "informed consent",
  "patient journey", "higiene de manos", "identificacion del paciente", "pulsera", "consentimiento",
];
const RE_META = /\b(?:meta|goal|ipsg)\s*([1-6])\b/g;

// GUARDA: POP aqui é sempre o Procedimento Operacional Padrão; a prática obrigatória do Qmentum é ROP.
const ROP_COMO_POP = /pr[aá]ticas?\s+organiza[cç]iona(?:l|is)\s+(?:obrigat[oó]rias?|requeridas?|exigidas?)\s*\(\s*POPs?\s*\)/i;
const ERRO_ROP = "A prática organizacional obrigatória do Qmentum se chama ROP, não POP: POP é o Procedimento Operacional Padrão.";

const LAYOUTS_PPT = new Set([
  "capa", "disclaimer_creditos", "agenda", "transicao_tema", "texto_simples", "texto_duas_colunas",
  "tres_colunas", "quatro_colunas", "imagem_externa", "imagem_web_direita", "imagem_web_esquerda",
  "imagem_web_panoramica", "jornada_caso_clinico", "tabela_avancada", "estatisticas_duplas",
  "infografico_resumo", "citacao_destaque", "alerta_seguranca", "take_home", "referencias",
  "agradecimento", "arvore_decisao_clinica", "piramide_3d", "funil_processos_3d", "lista_dupla_circular",
  "fluxograma",
]);

function textoCompleto(valor) {
  if (valor === null || valor === undefined) return "";
  if (typeof valor === "string") return valor;
  if (Array.isArray(valor)) return valor.map(textoCompleto).join(" \n ");
  if (typeof valor === "object") return Object.values(valor).map(textoCompleto).join(" \n ");
  return String(valor);
}

function pessoa(valor) {
  if (valor && typeof valor === "object") return { nome: textoDe(valor.nome), cargo: textoDe(valor.cargo) };
  if (typeof valor === "string") return { nome: valor, cargo: "" };
  return { nome: "", cargo: "" };
}

const semBarra = (s) => String(s || "").split("/")[0].trim();

export function normalizarWord(doc, brief = {}, hoje = new Date()) {
  const d = doc && typeof doc === "object" ? doc : {};
  const m = (d.metadata = d.metadata && typeof d.metadata === "object" ? d.metadata : {});

  const tipo = TIPOS_DOCUMENTO.includes(brief.tipo_documento) ? brief.tipo_documento
    : TIPOS_DOCUMENTO.includes(String(m.tipo_documento || "").toUpperCase()) ? String(m.tipo_documento).toUpperCase() : "POP";
  m.tipo_documento = tipo;
  if (TIPOS_TEXTO.includes(tipo) && !d.secoes) return normalizarTexto(d, brief, hoje);
  const s = (d.secoes = d.secoes && typeof d.secoes === "object" ? d.secoes : {});

  m.natureza_processo = NATUREZAS.includes(brief.natureza_processo) ? brief.natureza_processo
    : NATUREZAS.includes(m.natureza_processo) ? m.natureza_processo : "assistencial";
  m.idioma = brief.idioma || m.idioma || "pt";
  m.classificacao = brief.classificacao || m.classificacao || "interno";
  m.titulo_processo = textoDe(m.titulo_processo || brief.titulo_processo);
  m.setor = textoDe(m.setor || brief.setor);
  metadadosComuns(m, brief, hoje);

  if (!Array.isArray(s.historico_revisoes) || !s.historico_revisoes.length) {
    s.historico_revisoes = [{ versao: m.versao, data: m.data_elaboracao,
      descricao: m.idioma === "en" ? "Initial version" : m.idioma === "es" ? "Elaboración inicial" : "Elaboração inicial",
      responsavel: m.elaborado_por.nome }];
  }
  return d;
}

function metadadosComuns(m, brief, hoje) {
  const tipo = m.tipo_documento;
  const siglaDoCodigo = (String(m.codigo || "").split("-")[1] || "");
  const sigla = (String(brief.sigla_setor || siglaDoCodigo || "GER").toUpperCase().replace(/[^A-Z0-9]/g, "") || "GER").slice(0, 8);
  const numero = ((/-(\d{1,4})$/.exec(String(m.codigo || "")) || [])[1] || "1").padStart(3, "0").slice(-3);
  m.codigo = `${tipo}-${sigla}-${numero}`;
  m.versao = textoDe(m.versao) || "01";

  // GUARDA: datas: elaboração = mês atual; validade = +2 anos (o motor recalcula do mesmo jeito)
  m.data_elaboracao = hojeMesAno(hoje);
  m.data_revisao = "";
  m.validade = somarAnosMesAno(m.data_elaboracao, VALIDADE_ANOS);

  // GUARDA: assinaturas: elaborador informado ou máscara "Especialista em [Área]"; revisor e aprovador em branco
  const elab = pessoa(m.elaborado_por);
  if (brief.elaborado_por_nome) elab.nome = brief.elaborado_por_nome;
  if (brief.elaborado_por_cargo) elab.cargo = brief.elaborado_por_cargo;
  elab.nome = semBarra(elab.nome) || `Especialista em ${m.setor || "Qualidade"}`;
  elab.cargo = semBarra(elab.cargo);
  m.elaborado_por = elab;
  m.revisado_por = { nome: "", cargo: "" };
  m.aprovado_por = { nome: "", cargo: "" };
  delete m.validado_por;
  delete m.validade_anos;
}

const BLOCOS_TEXTO = new Set(["titulo", "paragrafo", "lista", "tabela", "caixas", "campos"]);
const COM_ASSINATURA = new Set(["CONS", "TERM"]);

function normalizarTexto(d, brief, hoje) {
  const m = d.metadata;
  m.idioma = brief.idioma || m.idioma || "pt";
  m.publico = publicoDoTipo(m.tipo_documento, brief.publico || m.publico);
  m.classificacao = brief.classificacao || m.classificacao || (m.publico === "paciente" ? "publico" : "interno");
  m.titulo_processo = textoDe(m.titulo_processo || m.titulo || brief.titulo_processo);
  m.titulo = m.titulo_processo;
  m.setor = textoDe(m.setor || brief.setor);
  metadadosComuns(m, brief, hoje);
  delete m.natureza_processo;
  d.corpo = Array.isArray(d.corpo) ? d.corpo.filter((b) => b !== null && b !== undefined && b !== "") : [];
  d.assinaturas = (Array.isArray(d.assinaturas) ? d.assinaturas : [])
    .map((a) => (a && typeof a === "object" ? { papel: textoDe(a.papel), detalhe: textoDe(a.detalhe) } : { papel: textoDe(a), detalhe: "" }))
    .filter((a) => a.papel)
    .map((a) => (a.detalhe ? a : { papel: a.papel }));
  return d;
}

// GUARDA: dado de paciente preenchido num modelo: nome depois do rótulo, CPF, número de prontuário, data de nascimento.
const DADO_DE_PACIENTE = [
  /(?:nome\s+d[oa](?:\(a\))?\s+paciente|paciente)\s*:\s*[A-ZÀ-Ý][a-zà-ÿ]+\s+(?:d[aeo]s?\s+)?[A-ZÀ-Ý][a-zà-ÿ]+/,
  /\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/,
  /prontu[aá]rio\s*(?:n[º°o.]*)?\s*[:#]?\s*\d{4,}/i,
  /nascimento\s*:\s*\d{1,2}\/\d{1,2}\/\d{2,4}/i,
];

function validarTexto(doc) {
  const erros = [];
  const avisos = [];
  const m = doc.metadata || {};
  if (doc.secoes || !Array.isArray(doc.corpo)) {
    erros.push(`Documento ${m.tipo_documento}: use o layout texto institucional ("corpo" com blocos e "assinaturas"), não "secoes".`);
    return { erros, avisos };
  }
  if (!doc.corpo.length) erros.push('"corpo" está vazio: escreva o documento em blocos (titulo, paragrafo, lista, tabela, caixas, campos).');
  doc.corpo.forEach((b, i) => {
    if (b && typeof b === "object" && !BLOCOS_TEXTO.has(String(b.tipo || "").toLowerCase())) {
      avisos.push(`Bloco ${i + 1}: tipo "${b.tipo}" desconhecido; sai como parágrafo.`);
    }
  });
  const preenchidos = doc.corpo.flatMap((b) => (b && b.tipo === "campos" && Array.isArray(b.itens) ? b.itens : []))
    .filter((c) => c && typeof c === "object" && textoDe(c.valor).trim());
  const texto = textoCompleto(doc.corpo);
  if (preenchidos.length || DADO_DE_PACIENTE.some((re) => re.test(texto))) {
    erros.push("O modelo traz dado de paciente preenchido (nome, CPF, prontuário ou nascimento): deixe só o rótulo, num bloco \"campos\" em branco.");
  }
  if (COM_ASSINATURA.has(m.tipo_documento) && !(doc.assinaturas || []).length) {
    erros.push(`${NOMES_TIPO[m.tipo_documento]}: inclua "assinaturas" (no mínimo o paciente ou o responsável legal e o profissional).`);
  }
  if (ROP_COMO_POP.test(texto)) erros.push(ERRO_ROP);
  return { erros, avisos };
}

function passosDo(proc) {
  return ["acoes_iniciais", "execucao_tecnica", "acoes_finais"].flatMap((k) => (Array.isArray(proc[k]) ? proc[k] : []));
}

function ehDiagrama(item) {
  return item && typeof item === "object" && (item.diagrama || (item.tipo && item.conteudo));
}

function problemasDoFluxo(nos) {
  const ligado = nos.some((n) => n.id || "sim" in n || "nao" in n || "proximo" in n);
  const ids = new Set(nos.map((n) => String(n.id || "")).filter(Boolean));
  const existe = (x) => ids.has(String(x)) || (/^\d+$/.test(String(x)) && Number(x) >= 1 && Number(x) <= nos.length);
  const quebrados = [];
  const decisoesSemRamo = [];
  for (const n of nos) {
    for (const k of ["sim", "nao", "proximo"]) {
      for (const alvo of [].concat(n[k] ?? [])) if (alvo !== "" && !existe(alvo)) quebrados.push(`${n.id || "?"}.${k} → "${alvo}"`);
    }
    if (/decis|losango|gateway/.test(semAcento(String(n.tipo || n.forma || ""))) && (!n.sim || !n.nao)) {
      decisoesSemRamo.push(n.id || n.texto);
    }
  }
  return { ligado, quebrados, decisoesSemRamo };
}

export function validarWord(doc) {
  const m = doc.metadata || {};
  if (TIPOS_TEXTO.includes(m.tipo_documento)) return validarTexto(doc);
  const erros = [];
  const avisos = [];
  const s = doc.secoes || {};
  const natureza = m.natureza_processo;
  const tipo = m.tipo_documento;

  for (const chave of ["objetivo", "campo_aplicacao", "conceitos", "responsabilidades", "recursos",
    "procedimento", "riscos", "registros", "indicadores", "referencias", "anexos"]) {
    if (s[chave] === undefined || s[chave] === null || s[chave] === "") erros.push(`A seção "${chave}" está ausente.`);
  }
  const proc = s.procedimento && typeof s.procedimento === "object" ? s.procedimento : {};
  for (const k of ["acoes_iniciais", "execucao_tecnica", "acoes_finais"]) {
    if (!Array.isArray(proc[k]) || !proc[k].length) erros.push(`procedimento.${k} deve ser uma lista não vazia.`);
  }

  const recursos = Array.isArray(s.recursos) ? s.recursos : [];
  if (recursos.length < 8) erros.push(`"recursos" tem ${recursos.length} itens; o mínimo é 8.`);

  const riscos = (s.riscos && Array.isArray(s.riscos.assistenciais)) ? s.riscos.assistenciais : [];
  if (riscos.length < 4) erros.push(`"riscos.assistenciais" tem ${riscos.length} itens; o mínimo é 4 (com barreira).`);
  if (riscos.some((r) => !r || typeof r !== "object" || !r.risco || !r.barreira)) {
    erros.push('Cada item de "riscos.assistenciais" precisa de "risco" e "barreira".');
  }
  if (riscos.some((r) => r && typeof r === "object" && !/^\s*\[(risco|risk|riesgo)/i.test(semAcento(r.risco)))) {
    erros.push('Todo "risco" deve começar pela severidade entre colchetes, ex.: "[Risco Crítico] ...".');
  }
  const cont = s.riscos && s.riscos.contingencia;
  if (!Array.isArray(cont) || !cont.length) erros.push('"riscos.contingencia" deve ser uma lista de strings "**Falha**: ação → ação".');

  const indicadores = Array.isArray(s.indicadores) ? s.indicadores : [];
  if (indicadores.length < 2) erros.push(`"indicadores" tem ${indicadores.length}; o mínimo é 2.`);
  if (indicadores.some((i) => !i || typeof i !== "object" || !/\[(fonte|source|fuente)/i.test(textoDe(i.nome)))) {
    erros.push('Cada indicador precisa de "nome" com a fonte do dado, ex.: "... [Fonte: BI Qualidade]", além de "meta" e "periodicidade".');
  }

  const referencias = Array.isArray(s.referencias) ? s.referencias : [];
  if (referencias.length < 8) erros.push(`"referencias" tem ${referencias.length}; o mínimo é 8 fontes reais.`);

  const execucao = Array.isArray(proc.execucao_tecnica) ? proc.execucao_tecnica : [];
  const criticos = passosDo(proc).filter((p) => p && typeof p === "object" && /crit/i.test(semAcento(p.prioridade))).length;
  if (criticos < 2) erros.push(`Há ${criticos} passo(s) crítico(s); use {"texto": "...", "prioridade": "critica"} em no mínimo 2 passos.`);
  for (const k of ["acoes_iniciais", "execucao_tecnica", "acoes_finais"]) {
    const lista = Array.isArray(proc[k]) ? proc[k] : [];
    const diagramas = lista.filter(ehDiagrama).length;
    if (diagramas > 2) erros.push(`procedimento.${k} tem ${diagramas} diagramas inline; o máximo é 2.`);
    if (lista.some((p, i) => i > 0 && ehDiagrama(p) && ehDiagrama(lista[i - 1]))) {
      erros.push(`procedimento.${k} tem dois diagramas seguidos; intercale com texto.`);
    }
  }

  const anexos = Array.isArray(s.anexos) ? s.anexos.filter((a) => a && typeof a === "object") : [];
  const tipos = anexos.map((a) => String(a.tipo || "texto").toLowerCase());
  if (anexos.length < 3) erros.push(`Há ${anexos.length} anexo(s); o mínimo é 3 com conteúdo real.`);
  if (new Set(tipos).size < 2) erros.push("Os anexos precisam de pelo menos 2 tipos visuais distintos.");
  tipos.forEach((t, i) => {
    if (!TIPOS_ANEXO.has(t)) erros.push(`Anexo ${i + 1}: tipo "${t}" não existe (use: ${[...TIPOS_ANEXO].join(", ")}).`);
    if (i > 0 && t === tipos[i - 1]) erros.push(`Anexos ${i} e ${i + 1} são do mesmo tipo ("${t}"); alterne os tipos.`);
  });
  anexos.forEach((a, i) => {
    if (String(a.tipo || "").toLowerCase() !== "fluxograma" || !Array.isArray(a.conteudo)) return;
    const nos = a.conteudo.filter((n) => n && typeof n === "object");
    const p = problemasDoFluxo(nos);
    if (!p.ligado) {
      avisos.push(`Anexo ${i + 1} (fluxograma): use "id", "sim"/"nao", "proximo" e "raia" para o desenho com responsáveis.`);
      return;
    }
    for (const d of p.decisoesSemRamo) erros.push(`Anexo ${i + 1} (fluxograma): a decisão "${d}" precisa de "sim" e "nao".`);
    if (p.quebrados.length) erros.push(`Anexo ${i + 1} (fluxograma): destinos inexistentes: ${p.quebrados.slice(0, 5).join("; ")}.`);
    if (nos.length < 5) avisos.push(`Anexo ${i + 1} (fluxograma) tem só ${nos.length} nós.`);
    if (!Array.isArray(a.raias) || a.raias.length < 2) avisos.push(`Anexo ${i + 1} (fluxograma): indique 2 a 4 "raias" (responsáveis).`);
  });
  if (tipo === "POP") {
    const temTabela = anexos.some((a) => a.tipo === "tabela" || a.tipo === "escala" ||
      (a.tipo === "misto" && Array.isArray(a.conteudo) && a.conteudo.some((b) => b && b.tipo === "tabela")));
    const temFluxo = tipos.some((t) => TIPOS_FLUXO.has(t)) || passosDo(proc).some(ehDiagrama);
    if (!temTabela) erros.push("O POP precisa de ao menos 1 tabela de dados reais (anexo tabela/escala ou misto com tabela).");
    if (!temFluxo) erros.push("O POP precisa de ao menos 1 fluxo (diagrama inline no procedimento ou anexo processo/fluxograma).");
    if (!tipos.includes("glossario")) avisos.push("O POP não tem o anexo Glossário Visual.");
  }

  // GUARDA: natureza do processo: barreira assistencial só onde há paciente. Em gestão ela pode ser o próprio tema
  // (ficha de adesão à higiene das mãos, política de consentimento): vira aviso, não erro.
  const textoProc = semAcento(textoCompleto(proc));
  const textoTudo = semAcento(textoCompleto(s));
  if (["tecnico", "radiotecnico", "gestao"].includes(natureza)) {
    const achados = PROIBIDOS_NAO_ASSISTENCIAL.filter((t) => textoTudo.includes(t));
    const metas = [...textoTudo.matchAll(RE_META)].map((x) => `Meta ${x[1]}`);
    const lista = [...new Set([...metas, ...achados])].join(", ");
    if (lista && natureza === "gestao") {
      avisos.push(`Documento de gestão cita barreira assistencial (${lista}): confira se é o tema do documento, e não um passo de quem executa a gestão.`);
    } else if (lista) {
      erros.push(`Processo ${natureza}: retire barreiras assistenciais (${lista}) ` +
        "e escreva no lugar o análogo técnico (identificação do equipamento, LOTO, liberação formal, norma técnica).");
    }
  } else if (natureza === "assistencial" || natureza === "misto") {
    const metas = new Set([...textoProc.matchAll(RE_META)].map((x) => x[1]));
    for (const n of ["1", "5"]) {
      if (!metas.has(n)) erros.push(`Processo ${natureza}: cite "Meta ${n}" explicitamente no procedimento.`);
    }
  }
  if (ROP_COMO_POP.test(textoCompleto(s))) erros.push(ERRO_ROP);
  return { erros, avisos };
}

export function normalizarExcel(doc, word = {}) {
  const d = doc && typeof doc === "object" ? doc : {};
  const mw = (word && word.metadata) || {};
  const m = (d.metadata_excel = d.metadata_excel && typeof d.metadata_excel === "object" ? d.metadata_excel : {});
  const sigla = String(mw.codigo || "").split("-")[1] || "GER";
  const numero = String(mw.codigo || "").split("-")[2] || "001";
  m.codigo = `PLAN-${sigla}-${numero}`;
  m.setor = textoDe(m.setor || mw.setor);
  const prefixoPlan = { en: "Management", es: "Gestion" }[mw.idioma] || "Gestao";
  if (mw.titulo_processo) m.arquivo = `${prefixoPlan} ${textoDe(mw.titulo_processo)}`;
  const planilhas = Array.isArray(d.planilhas) ? d.planilhas.filter((p) => p && typeof p === "object") : [];
  planilhas.forEach((p, i) => {
    p.colunas = (Array.isArray(p.colunas) ? p.colunas : []).map(textoDe);
    const n = p.colunas.length;
    p.linhas = (Array.isArray(p.linhas) ? p.linhas : []).map((l) => {
      const valores = (Array.isArray(l) ? l : l && typeof l === "object" ? Object.values(l) : [l]).map(textoDe);
      return n ? [...valores, ...Array(n).fill("")].slice(0, n) : valores;
    });
    // GUARDA: a 1ª aba é de chão de fábrica: no mínimo 10 linhas em branco para preencher à mão
    if (i === 0 && n) {
      const brancas = p.linhas.filter((l) => l.every((v) => !v)).length;
      for (let k = brancas; k < 10; k++) p.linhas.push(Array(n).fill(""));
    }
  });
  d.planilhas = planilhas;
  return d;
}

export function validarExcel(doc) {
  const erros = [];
  const avisos = [];
  const planilhas = Array.isArray(doc.planilhas) ? doc.planilhas : [];
  if (planilhas.length < 4) erros.push(`A planilha tem ${planilhas.length} abas; gere as 6 abas do modelo.`);
  planilhas.forEach((p, i) => {
    if (!p.nome_aba) erros.push(`Aba ${i + 1} sem "nome_aba".`);
    if (!Array.isArray(p.colunas) || p.colunas.length < 2) erros.push(`Aba ${i + 1} precisa de "colunas" (≥ 2).`);
    if (i > 0 && !(p.linhas || []).some((l) => l.some((v) => v))) avisos.push(`Aba "${p.nome_aba}" sem dados preenchidos.`);
  });
  return { erros, avisos };
}

export function normalizarPpt(doc, word = {}) {
  const d = doc && typeof doc === "object" ? doc : {};
  const mw = (word && word.metadata) || {};
  const m = (d.metadata_ppt = d.metadata_ppt || d.metadata || {});
  delete d.metadata;
  const sigla = String(mw.codigo || "").split("-")[1] || "GER";
  const numero = String(mw.codigo || "").split("-")[2] || "001";
  m.codigo = `PPT-${sigla}-${numero}`;
  m.idioma = m.idioma || mw.idioma || "pt";
  const prefixoPpt = { en: "Training", es: "Capacitacion" }[m.idioma] || "Treinamento";
  m.apresentacao = mw.titulo_processo ? `${prefixoPpt} ${textoDe(mw.titulo_processo)}` : m.codigo;
  if (!["cientifico", "minimalista"].includes(m.estilo_visual)) m.estilo_visual = "cientifico";

  let slides = (Array.isArray(d.slides) ? d.slides : []).filter((x) => x && typeof x === "object" && x.tipo);
  const anexoFluxo = ((word.secoes && Array.isArray(word.secoes.anexos)) ? word.secoes.anexos : [])
    .find((a) => a && String(a.tipo || "").toLowerCase() === "fluxograma" && Array.isArray(a.conteudo) && a.conteudo.length);
  for (const x of slides) {
    if (x.tipo !== "fluxograma" || !anexoFluxo) continue;
    if (!Array.isArray(x.etapas) || !x.etapas.length) {
      x.etapas = anexoFluxo.conteudo;
      if (!x.raias) x.raias = anexoFluxo.raias;
    } else if (!x.raias && Array.isArray(anexoFluxo.raias)) {
      const usadas = new Set(x.etapas.map((n) => n && n.raia).filter(Boolean));
      if ([...usadas].every((r) => anexoFluxo.raias.includes(r))) x.raias = anexoFluxo.raias.filter((r) => usadas.has(r));
    }
    if (!x.processo && anexoFluxo.titulo) x.processo = anexoFluxo.titulo;
  }
  // GUARDA: referências e agradecimento sempre no fim, nessa ordem
  const refs = slides.filter((x) => x.tipo === "referencias");
  const fim = slides.filter((x) => x.tipo === "agradecimento");
  slides = slides.filter((x) => x.tipo !== "referencias" && x.tipo !== "agradecimento");
  const refsWord = Array.isArray(word.secoes && word.secoes.referencias) ? word.secoes.referencias.map(textoDe) : [];
  slides.push(refs[0] || { tipo: "referencias", titulo: m.idioma === "en" ? "References" : m.idioma === "es" ? "Referencias" : "Referências", referencias_completas: refsWord });
  slides.push(fim[0] || { tipo: "agradecimento", titulo: m.idioma === "en" ? "Thank you" : m.idioma === "es" ? "Gracias" : "Obrigado" });
  slides.forEach((x, i) => { x.numero = i + 1; });
  d.slides = slides;
  return d;
}

export function validarPpt(doc, minimo = 30) {
  const erros = [];
  const avisos = [];
  const slides = Array.isArray(doc.slides) ? doc.slides : [];
  if (slides.length < Math.min(12, minimo)) erros.push(`A apresentação tem ${slides.length} slides; gere no mínimo ${minimo}.`);
  else if (slides.length < minimo) avisos.push(`A apresentação tem ${slides.length} slides (mínimo pedido: ${minimo}).`);
  if (slides[0] && slides[0].tipo !== "capa") avisos.push("O primeiro slide não é a capa.");
  const desconhecidos = [...new Set(slides.map((x) => x.tipo).filter((t) => !LAYOUTS_PPT.has(t)))];
  if (desconhecidos.length) avisos.push(`Layouts desconhecidos viram texto simples: ${desconhecidos.join(", ")}.`);
  if (!slides.some((x) => x.tipo === "alerta_seguranca")) avisos.push("Nenhum slide de alerta de segurança.");
  const deImagem = slides.filter((x) => /^imagem_web_/.test(x.tipo)).length;
  if (deImagem > 3) {
    avisos.push(`${deImagem} slides de imagem: só os 3 primeiros ganham ilustração gerada; os demais usam foto da web.`);
  }
  slides.forEach((x, i) => {
    if (x.tipo !== "fluxograma") return;
    const nos = (Array.isArray(x.etapas) ? x.etapas : []).filter((n) => n && typeof n === "object");
    if (!nos.length) { avisos.push(`Slide ${i + 1} (fluxograma) sem etapas.`); return; }
    const p = problemasDoFluxo(nos);
    if (p.quebrados.length) avisos.push(`Slide ${i + 1} (fluxograma): destinos inexistentes: ${p.quebrados.slice(0, 5).join("; ")}.`);
    if (p.decisoesSemRamo.length) avisos.push(`Slide ${i + 1} (fluxograma): decisões sem "sim" e "nao": ${p.decisoesSemRamo.join(", ")}.`);
    if (nos.length > 10) avisos.push(`Slide ${i + 1} (fluxograma) tem ${nos.length} etapas; acima de 10 a letra fica pequena.`);
  });
  const contagem = {};
  for (const x of slides) contagem[x.tipo] = (contagem[x.tipo] || 0) + 1;
  const repetidos = Object.entries(contagem).filter(([t, n]) => n > 2 &&
    !["transicao_tema", "imagem_web_direita", "imagem_web_esquerda", "imagem_web_panoramica", "texto_simples"].includes(t));
  if (repetidos.length) avisos.push(`Layouts usados mais de 2 vezes: ${repetidos.map(([t, n]) => `${t} (${n})`).join(", ")}.`);
  return { erros, avisos };
}
