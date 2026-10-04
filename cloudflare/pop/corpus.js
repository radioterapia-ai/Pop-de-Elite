
import { semAcento } from "./util.js";

let cacheIndice = null;
const cacheSecoes = new Map();

export async function carregarIndice(host) {
  if (cacheIndice && Date.now() - cacheIndice.quando < 3_600_000) return cacheIndice.dados;
  const dados = JSON.parse(await host.lerCorpus("indice.json"));
  cacheIndice = { dados, quando: Date.now() };
  return dados;
}

/** GUARDA: o mesmo radical de scripts/fatiar_tratados.py (sem acento, sem 's' final, 6 letras): mudou lá, muda aqui. */
export function criarRadical(indice) {
  const cfg = indice.radical || { min_letras: 4, letras: 6, stop: [] };
  const stop = new Set(cfg.stop);
  return (texto) => {
    const saida = [];
    for (const tok of semAcento(texto).match(/[a-z0-9]+/g) || []) {
      if (tok.length < cfg.min_letras || stop.has(tok) || /^\d+$/.test(tok)) continue;
      saida.push(tok.replace(/s+$/, "").slice(0, cfg.letras));
    }
    return saida;
  };
}

export function listaCapitulos(indice) {
  return indice.capitulos
    .filter((c) => c.numero > 0)
    .map((c) => `${c.id} — ${c.titulo}`)
    .join("\n");
}

export function selecionarSecoes(indice, { capitulos = [], termos = [], titulo = "", orcamento = 12000 }) {
  const porId = new Map(indice.capitulos.map((c) => [c.id, c]));
  const radical = criarRadical(indice);
  const consulta = new Set(radical([...termos, titulo].join(" ")));
  const pontuar = (sid) => {
    const s = indice.secoes[sid];
    let p = 0;
    (s.termos || []).forEach((t, i, lista) => { if (consulta.has(t)) p += (lista.length - i) / lista.length; });
    for (const t of radical(s.titulo)) if (consulta.has(t)) p += 2;
    return p;
  };

  let caps = [...new Set(capitulos)].filter((id) => porId.has(id) && porId.get(id).numero > 0).slice(0, 6);
  if (!caps.length) {
    const notas = indice.capitulos.filter((c) => c.numero > 0).map((c) => {
      const pts = c.secoes.map(pontuar).sort((a, b) => b - a).slice(0, 3);
      return [c.id, pts.reduce((a, b) => a + b, 0)];
    }).sort((a, b) => b[1] - a[1]);
    caps = notas.slice(0, 4).filter(([, n]) => n > 0).map(([id]) => id);
  }
  const candidatas = caps.flatMap((id) => porId.get(id).secoes);

  const escolhidas = [];
  let palavras = 0;
  const incluir = (sid) => {
    escolhidas.push(sid);
    palavras += indice.secoes[sid].palavras;
  };
  for (const sid of candidatas) {
    const s = indice.secoes[sid];
    if ((s.tipo === "articulacao" || s.tipo === "evidencias") && palavras + s.palavras <= orcamento * 0.45) incluir(sid);
  }
  const ranking = candidatas
    .filter((sid) => indice.secoes[sid].tipo === "conteudo" && !escolhidas.includes(sid))
    .map((sid) => [sid, pontuar(sid)])
    .filter(([, p]) => p > 0)
    .sort((a, b) => b[1] - a[1]);
  for (const [sid] of ranking) {
    if (palavras + indice.secoes[sid].palavras <= orcamento) incluir(sid);
  }
  if (palavras < orcamento * 0.6) {
    const filas = caps.map((id) => porId.get(id).secoes
      .filter((sid) => indice.secoes[sid].tipo === "conteudo" && !escolhidas.includes(sid)));
    for (let entrou = true; entrou;) {
      entrou = false;
      for (const fila of filas) {
        while (fila.length) {
          const sid = fila.shift();
          if (palavras + indice.secoes[sid].palavras <= orcamento) { incluir(sid); entrou = true; break; }
        }
      }
    }
  }
  const ordem = new Map(Object.keys(indice.secoes).map((k, i) => [k, i]));
  escolhidas.sort((a, b) => ordem.get(a) - ordem.get(b));
  return { ids: escolhidas, palavras, capitulos: caps };
}

export async function textosSecoes(host, indice, ids) {
  const buscar = async (id) => {
    if (!cacheSecoes.has(id)) {
      const texto = await host.lerCorpus(`secoes/${encodeURIComponent(id)}.md`);
      if (cacheSecoes.size > 400) cacheSecoes.clear();
      cacheSecoes.set(id, texto);
    }
    return { id, titulo: indice.secoes[id].titulo, texto: cacheSecoes.get(id) };
  };
  const saida = [];
  for (let i = 0; i < ids.length; i += 8) {
    saida.push(...await Promise.all(ids.slice(i, i + 8).map(buscar)));
  }
  return saida;
}

export function blocoLiteratura(secoes, indice) {
  const capitulo = (id) => (indice.capitulos.find((c) => c.secoes.includes(id)) || {}).titulo || "";
  return secoes.map((s) => {
    const corpo = s.texto.replace(/^##\s.*\n+/, "").trim();
    return `### [${s.id}] ${s.titulo} (${capitulo(s.id)})\n${corpo}`;
  }).join("\n\n");
}
