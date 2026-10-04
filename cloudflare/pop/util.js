
export class ErroHttp extends Error {
  constructor(status, codigo, extra) {
    super(codigo);
    this.status = status;
    this.codigo = codigo;
    this.extra = extra || null;
  }
}

export function json(dados, status = 200, cabecalhos = {}) {
  return new Response(JSON.stringify(dados), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...cabecalhos },
  });
}

export function respostaDeErro(e, cabecalhos = {}) {
  const conhecido = e instanceof ErroHttp;
  const corpo = { error: conhecido ? e.codigo : "pop_erro_interno", ...(conhecido && e.extra ? e.extra : {}) };
  return json(corpo, conhecido ? e.status : 500, cabecalhos);
}

export async function lerJson(request, limiteBytes = 2_000_000) {
  const tamanho = Number(request.headers.get("content-length") || 0);
  if (tamanho > limiteBytes) throw new ErroHttp(413, "payload_too_large");
  const texto = await request.text();
  if (texto.length > limiteBytes) throw new ErroHttp(413, "payload_too_large");
  try {
    return JSON.parse(texto || "{}");
  } catch {
    throw new ErroHttp(400, "invalid_json");
  }
}

export function extrairJson(texto) {
  const s = String(texto || "").trim();
  try {
    return JSON.parse(s);
  } catch {   }
  const inicio = s.indexOf("{");
  if (inicio < 0) throw new Error("A resposta não contém um objeto JSON.");
  let profundidade = 0, emTexto = false, escape = false;
  for (let i = inicio; i < s.length; i++) {
    const c = s[i];
    if (emTexto) {
      if (escape) escape = false;
      else if (c === "\\") escape = true;
      else if (c === '"') emTexto = false;
      continue;
    }
    if (c === '"') emTexto = true;
    else if (c === "{") profundidade++;
    else if (c === "}") {
      profundidade--;
      if (profundidade === 0) return JSON.parse(s.slice(inicio, i + 1));
    }
  }
  throw new Error("JSON incompleto (a resposta foi cortada).");
}

export function textoDe(valor) {
  if (valor === null || valor === undefined) return "";
  if (typeof valor === "string") return valor;
  if (typeof valor === "number" || typeof valor === "boolean") return String(valor);
  if (Array.isArray(valor)) return valor.map(textoDe).join(", ");
  if (typeof valor === "object") {
    for (const k of ["texto", "titulo", "label", "nome", "acao", "pergunta", "descricao", "conteudo", "valor"]) {
      if (valor[k] !== undefined && valor[k] !== "") return textoDe(valor[k]);
    }
    return Object.values(valor).map(textoDe).filter(Boolean).join(" — ");
  }
  return String(valor);
}

export function semAcento(texto) {
  return String(texto || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

export function limitar(texto, max) {
  const s = String(texto || "");
  return s.length > max ? s.slice(0, max) + "…" : s;
}

// GUARDA: o "dia" do POP é o de Brasília: o contador diário vira à meia-noite de São Paulo.
const FORMATO_SP = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit",
});

export function diaSaoPaulo(data = new Date()) {
  return FORMATO_SP.format(data);
}

export function hojeMesAno(data = new Date()) {
  const [ano, mes] = diaSaoPaulo(data).split("-");
  return `${mes}/${ano}`;
}

export function somarAnosMesAno(mesAno, anos) {
  const m = /^(\d{1,2})\/(\d{4})$/.exec(String(mesAno || ""));
  if (!m) return "";
  return `${m[1].padStart(2, "0")}/${Number(m[2]) + anos}`;
}

export function bytesDoBase64(b64) {
  const s = String(b64 || "").replace(/^data:[^,]*,/, "").replace(/\s+/g, "");
  if (!s) return 0;
  const sobra = s.endsWith("==") ? 2 : s.endsWith("=") ? 1 : 0;
  return Math.floor((s.length * 3) / 4) - sobra;
}

export function base64Limpo(b64) {
  return String(b64 || "").replace(/^data:[^,]*,/, "").replace(/\s+/g, "");
}

export const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
