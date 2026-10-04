/* POP de Elite 2.0 — widget de conversa do radioterapia.ai
 *
 * GUARDA: a página (index.html) carrega, nesta ordem:
 *   config-site.js          configuração do anfitrião (é do SITE; não vem nas atualizações do módulo)
 *   pop-de-elite-i18n.js    textos da interface nos 12 idiomas do site
 *   pop-de-elite.js         este arquivo
 *
 * Dentro do radioterapia.ai o widget roda num iframe de mesma origem, na área logada (/expert):
 *   - sessão do site: manda localStorage[rtai_token] no cabeçalho X-Token; sem sessão, pede login à página;
 *   - idioma do site: localStorage[rtai_lang] (12 códigos), sem seletor próprio; acompanha o evento storage;
 *   - ponte com a página por postMessage: pop:pronto, pop:sessao, pop:espelho (abre o POP de Elite 1.0);
 *   - conversa e anexos só neste navegador; somem no logout ou se outra pessoa entrar;
 *   - chave própria do Google AI Studio (opcional): só na memória desta página, nunca no armazenamento
 *     do navegador; conferida antes por um ping no modelo do site (rota chave), vai no cabeçalho
 *     X-Pop-Chave para conversa, gerar e imagens, e some no logout.
 * Nenhuma chave fica aqui: a página só conversa com /api/pop/* e com a rota de áudio do site.
 */
(function () {
  "use strict";

  const VERSAO = "2.1.0";
  const EMBUTIDO = (() => { try { return window.parent && window.parent !== window; } catch { return true; } })();
  const CFG = Object.assign({
    api: "/api/pop",
    audio: "/api/audio/transcribe",
    modoAudio: "expert",
    chaveToken: "rtai_token",
    chaveUsuario: "rtai_user",
    chaveIdioma: "rtai_lang",
    exigeSessao: EMBUTIDO,
    espelhoUrl: "https://radioterapia-ai-pop.hf.space",
    tema: "auto",
  }, window.POP_DE_ELITE_CONFIG || {});

  const TEXTOS = window.PopDeEliteTextos || {};
  const CHAVE = "pde:v2:";
  const ESPERADO = { word: 55000, excel: 22000, ppt: 60000 };
  const FORMATOS = ["word", "excel", "ppt"];
  const SIGLAS = { word: "W", excel: "X", ppt: "P" };
  // GUARDA: tipos da tela inicial, em dois grupos. FLUXO não é tipo: abre o aviso do MiyAgi Diagram.
  const TIPOS = {
    normativos: ["DIR", "POL", "PLAN", "NOR", "PROG", "REG", "POP", "PROT", "MAN"],
    apoio: ["COD", "CHK", "FTI", "FLUXO", "FORM", "INF", "NT", "TERM", "CONS"],
  };
  const CORES = ["#283264", "#0F766E", "#1D4ED8", "#7C3AED", "#9F1239", "#B45309", "#15803D", "#374151"];
  const ANEXOS = { maximo: 3, porArquivoMb: 5, totalMb: 12, texto: 60000, paginasPdf: 30 };
  const FOTO = { lado: 1600, qualidade: 0.85 };
  const AUDIO = { blocos: [10, 30, 60], maximoS: 300, minimoS: 0.8, silencio: 0.006, taxa: 16000, arquivoMb: 25 };
  const MIME_POR_EXT = {
    pdf: "application/pdf", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp",
    heic: "image/heic", heif: "image/heif", wav: "audio/wav", mp3: "audio/mpeg", m4a: "audio/mp4",
    aac: "audio/aac", ogg: "audio/ogg", oga: "audio/ogg", opus: "audio/ogg", flac: "audio/flac", webm: "audio/webm",
  };
  const EXT_TEXTO = new Set(["txt", "md", "csv"]);
  const EXT_OFFICE = new Set(["docx", "pptx", "xlsx"]);
  const ACEITAR = ".pdf,.docx,.pptx,.xlsx,.txt,.md,.csv,.png,.jpg,.jpeg,.webp,.heic,.heif,.wav,.mp3,.m4a,.aac,.ogg,.oga,.opus,.flac,.webm";

  function fmt(texto, valores = {}) {
    return String(texto == null ? "" : texto).replace(/\{(\w+)\}/g, (m, k) => (k in valores ? String(valores[k]) : m));
  }

  function mesclar(base, sobre) {
    if (!sobre || typeof sobre !== "object" || Array.isArray(sobre)) return sobre === undefined ? base : sobre;
    const saida = Object.assign({}, base);
    for (const [k, v] of Object.entries(sobre)) {
      saida[k] = base && typeof base[k] === "object" && !Array.isArray(base[k]) ? mesclar(base[k], v) : v;
    }
    return saida;
  }

  function normalizarIdioma(codigo) {
    const s = String(codigo || "").trim();
    if (!s) return null;
    if (TEXTOS[s]) return s;
    const base = s.slice(0, 2).toLowerCase();
    if (base === "pt") return TEXTOS["pt-BR"] ? "pt-BR" : null;
    if (base === "zh") return TEXTOS["zh-CN"] ? "zh-CN" : null;
    return TEXTOS[base] ? base : null;
  }

  function idiomaDoSite(preferido) {
    const candidatos = [preferido && preferido !== "auto" ? preferido : "", lerLocal(CFG.chaveIdioma),
      document.documentElement.lang, ...(navigator.languages || [navigator.language])];
    for (const c of candidatos) {
      const l = normalizarIdioma(c);
      if (l) return l;
    }
    return TEXTOS["pt-BR"] ? "pt-BR" : Object.keys(TEXTOS)[0];
  }

  const textosDe = (idioma) => mesclar(TEXTOS["pt-BR"] || {}, TEXTOS[idioma] || {});

  const ICONES = {
    clipe: '<path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/>',
    microfone: '<rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10v1a7 7 0 0 0 14 0v-1M12 18v4M8 22h8"/>',
    enviar: '<path d="M12 19V5M5 12l7-7 7 7"/>',
    engrenagem: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>',
    novo: '<path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z"/>',
    escudo: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="M12 8v4M12 16h.01"/>',
    baixar: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/>',
    x: '<path d="M18 6L6 18M6 6l12 12"/>',
    check: '<path d="M20 6L9 17l-5-5"/>',
    alerta: '<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0zM12 9v4M12 17h.01"/>',
    faisca: '<path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z"/><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z"/>',
    recarregar: '<path d="M21 12a9 9 0 1 1-2.64-6.36L21 8M21 3v5h-5"/>',
    porta: '<path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4M10 17l5-5-5-5M15 12H3"/>',
    imagem: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/>',
    chave: '<circle cx="7.5" cy="15.5" r="5.5"/><path d="M11.4 11.6L21 2M16 7l3 3M18.5 4.5L21 7"/>',
    ajuda: '<circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3M12 17h.01"/>',
    auditar: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 14l2 2 4-4"/>',
  };

  function icone(nome, tamanho) {
    const tpl = document.createElement("template");
    tpl.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${ICONES[nome]}</svg>`;
    const svg = tpl.content.firstChild;
    if (tamanho) { svg.style.width = `${tamanho}px`; svg.style.height = `${tamanho}px`; svg.style.flexShrink = "0"; }
    return svg;
  }

  function h(tag, props, ...filhos) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(props || {})) {
      if (v === null || v === undefined || v === false) continue;
      if (k === "class") el.className = v;
      else if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2), v);
      else if (v === true) el.setAttribute(k, "");
      else el.setAttribute(k, String(v));
    }
    for (const f of filhos.flat(Infinity)) {
      if (f === null || f === undefined || f === false) continue;
      el.append(f instanceof Node ? f : String(f));
    }
    return el;
  }

  const ESCAPES = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
  const escapar = (s) => String(s).replace(/[&<>"']/g, (c) => ESCAPES[c]);

  /** GUARDA: Markdown mínimo e seguro (o texto é escapado antes de qualquer marcação). */
  function markdown(md) {
    const inline = (t) => escapar(t)
      .replace(/`([^`\n]+)`/g, "<code>$1</code>")
      .replace(/\*\*([^*\n][^*]*?)\*\*/g, "<strong>$1</strong>")
      .replace(/__([^_\n][^_]*?)__/g, "<strong>$1</strong>")
      .replace(/(^|[^*\w])\*([^*\s][^*\n]*?)\*(?!\*)/g, "$1<em>$2</em>")
      .replace(/(^|[\s(])_([^_\s][^_\n]*?)_(?=[\s).,;:!?]|$)/g, "$1<em>$2</em>")
      .replace(/\[([^\]\n]+)\]\((https?:\/\/[^\s)"<>]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');

    const saida = [];
    let paragrafo = [];
    let lista = null;
    let tabela = null;
    let citacao = [];
    const fecharParagrafo = () => {
      if (paragrafo.length) saida.push(`<p>${paragrafo.map(inline).join("<br>")}</p>`);
      paragrafo = [];
    };
    const fecharLista = () => {
      if (!lista) return;
      const inicio = lista.tipo === "ol" && lista.inicio !== 1 ? ` start="${lista.inicio}"` : "";
      saida.push(`<${lista.tipo}${inicio}>${lista.itens.map((i) => `<li>${inline(i)}</li>`).join("")}</${lista.tipo}>`);
      lista = null;
    };
    const fecharTabela = () => {
      if (!tabela) return;
      const [cab, ...linhas] = tabela;
      const celulas = (l, tag) => l.map((c) => `<${tag}>${inline(c)}</${tag}>`).join("");
      saida.push(`<table><thead><tr>${celulas(cab, "th")}</tr></thead><tbody>${linhas.map((l) => `<tr>${celulas(l, "td")}</tr>`).join("")}</tbody></table>`);
      tabela = null;
    };
    const fecharCitacao = () => {
      if (citacao.length) saida.push(`<blockquote>${citacao.map(inline).join("<br>")}</blockquote>`);
      citacao = [];
    };
    const fecharTudo = () => { fecharParagrafo(); fecharLista(); fecharTabela(); fecharCitacao(); };

    for (const bruta of String(md || "").replace(/\r\n?/g, "\n").split("\n")) {
      const linha = bruta.trimEnd();
      let m;
      if (!linha.trim()) { fecharTudo(); continue; }
      if ((m = linha.match(/^\s{0,3}(#{1,6})\s+(.+?)\s*#*\s*$/))) {
        fecharTudo();
        const n = Math.min(m[1].length + 2, 6);
        saida.push(`<h${n}>${inline(m[2])}</h${n}>`);
        continue;
      }
      if (/^\s{0,3}([-*_])(\s*\1){2,}\s*$/.test(linha)) { fecharTudo(); saida.push("<hr>"); continue; }
      if (/^\s*\|.*\|\s*$/.test(linha)) {
        fecharParagrafo(); fecharLista(); fecharCitacao();
        if (/^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(linha)) continue;
        const celulas = linha.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
        (tabela = tabela || []).push(celulas);
        continue;
      }
      if ((m = linha.match(/^\s{0,3}>\s?(.*)$/))) { fecharParagrafo(); fecharLista(); fecharTabela(); citacao.push(m[1]); continue; }
      if ((m = linha.match(/^\s*[-*•+]\s+(.*)$/))) {
        fecharParagrafo(); fecharTabela(); fecharCitacao();
        if (!lista || lista.tipo !== "ul") { fecharLista(); lista = { tipo: "ul", itens: [] }; }
        lista.itens.push(m[1]);
        continue;
      }
      if ((m = linha.match(/^\s*(\d{1,3})[.)]\s+(.*)$/))) {
        fecharParagrafo(); fecharTabela(); fecharCitacao();
        if (!lista || lista.tipo !== "ol") { fecharLista(); lista = { tipo: "ol", itens: [], inicio: Number(m[1]) }; }
        lista.itens.push(m[2]);
        continue;
      }
      if (lista && /^\s{2,}\S/.test(bruta)) { lista.itens[lista.itens.length - 1] += " " + linha.trim(); continue; }
      fecharLista(); fecharTabela(); fecharCitacao();
      paragrafo.push(linha.trim());
    }
    fecharTudo();
    return saida.join("");
  }

  function lerLocal(chave) {
    try { return localStorage.getItem(chave); } catch { return null; }
  }

  const armazenamento = {
    ler(chave, padrao) {
      try { const v = localStorage.getItem(CHAVE + chave); return v ? JSON.parse(v) : padrao; } catch { return padrao; }
    },
    gravar(chave, valor) {
      try { localStorage.setItem(CHAVE + chave, JSON.stringify(valor)); return true; } catch { return false; }
    },
    apagar(chave) {
      try { localStorage.removeItem(CHAVE + chave); } catch {   }
    },
  };

  const banco = {
    memoria: new Map(),
    abrir() {
      if (!this.promessa) {
        this.promessa = new Promise((ok) => {
          try {
            const r = indexedDB.open("pop-de-elite", 1);
            r.onupgradeneeded = () => r.result.createObjectStore("arquivos");
            r.onsuccess = () => ok(r.result);
            r.onerror = () => ok(null);
          } catch { ok(null); }
        });
      }
      return this.promessa;
    },
    async operar(modo, fazer) {
      const db = await this.abrir();
      if (!db) return undefined;
      return new Promise((ok) => {
        try {
          const tx = db.transaction("arquivos", modo);
          const r = fazer(tx.objectStore("arquivos"));
          tx.oncomplete = () => ok(r && "result" in r ? r.result : undefined);
          tx.onerror = () => ok(undefined);
          tx.onabort = () => ok(undefined);
        } catch { ok(undefined); }
      });
    },
    async gravar(chave, valor) {
      this.memoria.set(chave, valor);
      await this.operar("readwrite", (s) => s.put(valor, chave));
    },
    async ler(chave) {
      if (this.memoria.has(chave)) return this.memoria.get(chave);
      const v = await this.operar("readonly", (s) => s.get(chave));
      if (v !== undefined) this.memoria.set(chave, v);
      return v;
    },
    async apagarTudo() {
      this.memoria.clear();
      await this.operar("readwrite", (s) => s.clear());
    },
  };

  function tamanhoLegivel(bytes) {
    if (!bytes && bytes !== 0) return "";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1).replace(".0", "")} MB`;
  }

  function relogio(segundos) {
    const s = Math.max(0, Math.round(segundos));
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  }

  function duracaoLonga(segundos) {
    const s = Math.max(0, Math.round(segundos));
    const p = (n) => String(n).padStart(2, "0");
    return `${p(Math.floor(s / 3600))}:${p(Math.floor((s % 3600) / 60))}:${p(s % 60)}`;
  }

  function base64ParaBlob(b64, mime) {
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new Blob([bytes], { type: mime || "application/octet-stream" });
  }

  function blobParaBase64(blob) {
    return new Promise((ok, falha) => {
      const leitor = new FileReader();
      leitor.onload = () => ok(String(leitor.result).replace(/^data:[^,]*,/, ""));
      leitor.onerror = () => falha(leitor.error);
      leitor.readAsDataURL(blob);
    });
  }

  async function sha256(texto) {
    try {
      const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(String(texto).trim().toLowerCase()));
      return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 32);
    } catch { return ""; }
  }

  const extensao = (nome) => (String(nome || "").match(/\.([a-z0-9]+)$/i) || [, ""])[1].toLowerCase();
  const novoId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

  function tokenDoSite() { return lerLocal(CFG.chaveToken) || ""; }

  function usuarioDoSite() {
    try { return JSON.parse(lerLocal(CFG.chaveUsuario) || "null"); } catch { return null; }
  }

  function avisarPagina(type, payload) {
    if (!EMBUTIDO) return false;
    try {
      window.parent.postMessage({ type, payload: payload || {} }, window.location.origin);
      return true;
    } catch {
      return false;
    }
  }

  async function abrirZip(buffer) {
    const dv = new DataView(buffer);
    let eocd = -1;
    for (let i = buffer.byteLength - 22; i >= Math.max(0, buffer.byteLength - 65557); i--) {
      if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
    }
    if (eocd < 0) throw new Error("zip");
    const total = dv.getUint16(eocd + 10, true);
    let p = dv.getUint32(eocd + 16, true);
    const entradas = new Map();
    const dec = new TextDecoder();
    for (let n = 0; n < total && p + 46 <= buffer.byteLength; n++) {
      if (dv.getUint32(p, true) !== 0x02014b50) break;
      const metodo = dv.getUint16(p + 10, true);
      const comprimido = dv.getUint32(p + 20, true);
      const lenNome = dv.getUint16(p + 28, true);
      const lenExtra = dv.getUint16(p + 30, true);
      const lenComentario = dv.getUint16(p + 32, true);
      const local = dv.getUint32(p + 42, true);
      entradas.set(dec.decode(new Uint8Array(buffer, p + 46, lenNome)), { metodo, comprimido, local });
      p += 46 + lenNome + lenExtra + lenComentario;
    }
    return {
      nomes: [...entradas.keys()],
      async texto(nome) {
        const e = entradas.get(nome);
        if (!e) return null;
        const ini = e.local + 30 + dv.getUint16(e.local + 26, true) + dv.getUint16(e.local + 28, true);
        const dados = new Uint8Array(buffer, ini, e.comprimido);
        if (e.metodo === 0) return dec.decode(dados);
        if (e.metodo !== 8) throw new Error("compressao");
        const fluxo = new Blob([dados]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
        return new Response(fluxo).text();
      },
    };
  }

  function textoDosParagrafos(xml, ns, tagParagrafo) {
    const doc = new DOMParser().parseFromString(xml, "application/xml");
    const linhas = [];
    for (const p of doc.getElementsByTagNameNS(ns, tagParagrafo)) {
      let t = "";
      for (const n of p.getElementsByTagNameNS(ns, "*")) {
        if (n.localName === "t") t += n.textContent;
        else if (n.localName === "tab") t += "\t";
        else if (n.localName === "br" || n.localName === "cr") t += "\n";
      }
      linhas.push(t);
    }
    return linhas.join("\n");
  }

  async function textoDoOffice(arquivo) {
    if (typeof DecompressionStream === "undefined") throw new Error("navegador");
    const ext = extensao(arquivo.name);
    const zip = await abrirZip(await arquivo.arrayBuffer());
    let texto = "";
    if (ext === "docx") {
      const xml = await zip.texto("word/document.xml");
      texto = xml ? textoDosParagrafos(xml, "http://schemas.openxmlformats.org/wordprocessingml/2006/main", "p") : "";
    } else if (ext === "pptx") {
      const slides = zip.nomes.filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n))
        .sort((a, b) => Number(a.match(/\d+/)[0]) - Number(b.match(/\d+/)[0]));
      const partes = [];
      for (const [i, nome] of slides.entries()) {
        const t = textoDosParagrafos(await zip.texto(nome), "http://schemas.openxmlformats.org/drawingml/2006/main", "p");
        partes.push(`--- Slide ${i + 1} ---\n${t}`);
      }
      texto = partes.join("\n\n");
    } else if (ext === "xlsx") {
      const xml = await zip.texto("xl/sharedStrings.xml");
      if (xml) {
        const doc = new DOMParser().parseFromString(xml, "application/xml");
        const ns = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
        texto = [...doc.getElementsByTagNameNS(ns, "si")].map((si) => si.textContent.trim()).filter(Boolean).join("\n");
      }
    }
    return texto.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  }

  async function paginasDoPdf(blob) {
    try {
      const texto = new TextDecoder("latin1").decode(await blob.arrayBuffer());
      return (texto.match(/\/Type\s*\/Page(?![s\w])/g) || []).length;
    } catch { return 0; }
  }

  async function carregarImagem(blob) {
    const url = URL.createObjectURL(blob);
    try {
      return await new Promise((ok, falha) => {
        const img = new Image();
        img.onload = () => ok(img);
        img.onerror = falha;
        img.src = url;
      });
    } finally {
      setTimeout(() => URL.revokeObjectURL(url), 0);
    }
  }

  async function reduzirImagem(blob, lado = FOTO.lado, qualidade = FOTO.qualidade) {
    const img = await carregarImagem(blob);
    const w0 = img.naturalWidth || img.width, h0 = img.naturalHeight || img.height;
    if (!w0 || !h0) throw new Error("imagem");
    const escala = Math.min(1, lado / Math.max(w0, h0));
    const w = Math.max(1, Math.round(w0 * escala)), alt = Math.max(1, Math.round(h0 * escala));
    const tela = document.createElement("canvas");
    tela.width = w; tela.height = alt;
    const ctx = tela.getContext("2d");
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, w, alt);
    ctx.drawImage(img, 0, 0, w, alt);
    const reduzida = await new Promise((ok) => tela.toBlob(ok, "image/jpeg", qualidade));
    if (!reduzida) throw new Error("imagem");
    const m = Math.min(1, 160 / Math.max(w, alt));
    const mini = document.createElement("canvas");
    mini.width = Math.max(1, Math.round(w * m)); mini.height = Math.max(1, Math.round(alt * m));
    mini.getContext("2d").drawImage(tela, 0, 0, mini.width, mini.height);
    return { blob: reduzida, miniatura: mini.toDataURL("image/jpeg", 0.7) };
  }

  async function logoParaPng(arquivo) {
    const img = await carregarImagem(arquivo);
    let w = img.naturalWidth || 600, alt = img.naturalHeight || 300;
    const escala = Math.min(1, 600 / Math.max(w, alt));
    w = Math.max(1, Math.round(w * escala)); alt = Math.max(1, Math.round(alt * escala));
    const tela = document.createElement("canvas");
    tela.width = w; tela.height = alt;
    tela.getContext("2d").drawImage(img, 0, 0, w, alt);
    return tela.toDataURL("image/png");
  }

  function reamostrar(pcm, taxaOrigem, taxa = AUDIO.taxa) {
    if (taxaOrigem === taxa) return pcm;
    const razao = taxaOrigem / taxa;
    const n = Math.max(1, Math.floor(pcm.length / razao));
    const saida = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const x = i * razao;
      const a = Math.floor(x);
      const b = Math.min(a + 1, pcm.length - 1);
      saida[i] = pcm[a] + (pcm[b] - pcm[a]) * (x - a);
    }
    return saida;
  }

  function picoRms(pcm, taxa = AUDIO.taxa) {
    const janela = Math.max(1, Math.round(taxa * 0.05));
    let pico = 0;
    for (let i = 0; i < pcm.length; i += janela) {
      let soma = 0;
      const fim = Math.min(pcm.length, i + janela);
      for (let j = i; j < fim; j++) soma += pcm[j] * pcm[j];
      pico = Math.max(pico, Math.sqrt(soma / Math.max(1, fim - i)));
    }
    return pico;
  }

  function wavDe(pcm, taxa = AUDIO.taxa) {
    const buffer = new ArrayBuffer(44 + pcm.length * 2);
    const dv = new DataView(buffer);
    const escrever = (o, s) => { for (let i = 0; i < s.length; i++) dv.setUint8(o + i, s.charCodeAt(i)); };
    escrever(0, "RIFF"); dv.setUint32(4, 36 + pcm.length * 2, true); escrever(8, "WAVE");
    escrever(12, "fmt "); dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, 1, true);
    dv.setUint32(24, taxa, true); dv.setUint32(28, taxa * 2, true); dv.setUint16(32, 2, true); dv.setUint16(34, 16, true);
    escrever(36, "data"); dv.setUint32(40, pcm.length * 2, true);
    for (let i = 0; i < pcm.length; i++) {
      const v = Math.max(-1, Math.min(1, pcm[i]));
      dv.setInt16(44 + i * 2, v < 0 ? v * 0x8000 : v * 0x7fff, true);
    }
    return new Blob([buffer], { type: "audio/wav" });
  }

  async function pcmDoArquivo(blob) {
    const Contexto = window.AudioContext || window.webkitAudioContext;
    const ctx = new Contexto();
    let audio;
    try { audio = await ctx.decodeAudioData(await blob.arrayBuffer()); } finally { if (ctx.close) ctx.close(); }
    const quadros = Math.max(1, Math.ceil(audio.duration * AUDIO.taxa));
    const offline = new OfflineAudioContext(1, quadros, AUDIO.taxa);
    const fonte = offline.createBufferSource();
    fonte.buffer = audio;
    fonte.connect(offline.destination);
    fonte.start();
    return (await offline.startRendering()).getChannelData(0);
  }

  class GravadorEmBlocos {
    constructor(aoBloco) {
      this.aoBloco = aoBloco;
      this.indice = 0;
      this.total = 0;
    }

    async iniciar() {
      this.fluxo = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true } });
      const Contexto = window.AudioContext || window.webkitAudioContext;
      this.ctx = new Contexto();
      if (this.ctx.state === "suspended") await this.ctx.resume();
      this.fonte = this.ctx.createMediaStreamSource(this.fluxo);
      this.proc = this.ctx.createScriptProcessor(4096, 1, 1);
      this.pedacos = [];
      this.amostras = 0;
      this.oculto = document.hidden;
      this.proc.onaudioprocess = (e) => {
        const dados = e.inputBuffer.getChannelData(0);
        this.pedacos.push(new Float32Array(dados));
        this.amostras += dados.length;
        this.total += dados.length;
        if (document.hidden) this.oculto = true;
        if (this.amostras / this.ctx.sampleRate >= AUDIO.blocos[Math.min(this.indice, AUDIO.blocos.length - 1)]) this.fecharBloco();
      };
      this.fonte.connect(this.proc);
      this.proc.connect(this.ctx.destination);
      try { this.trava = navigator.wakeLock ? await navigator.wakeLock.request("screen") : null; } catch { this.trava = null; }
    }

    get segundos() { return this.ctx ? this.total / this.ctx.sampleRate : 0; }

    fecharBloco() {
      if (!this.pedacos.length) return;
      const bruto = new Float32Array(this.amostras);
      let o = 0;
      for (const p of this.pedacos) { bruto.set(p, o); o += p.length; }
      const taxaOrigem = this.ctx.sampleRate;
      const segundos = bruto.length / taxaOrigem;
      const oculto = this.oculto;
      this.pedacos = [];
      this.amostras = 0;
      this.oculto = document.hidden;
      if (segundos < AUDIO.minimoS) return;
      const pcm = reamostrar(bruto, taxaOrigem);
      this.aoBloco({ indice: this.indice++, segundos, wav: wavDe(pcm), mudo: picoRms(pcm) < AUDIO.silencio, oculto });
    }

    encerrar() {
      try { this.proc && this.proc.disconnect(); this.fonte && this.fonte.disconnect(); } catch {   }
      if (this.fluxo) this.fluxo.getTracks().forEach((t) => t.stop());
      if (this.ctx && this.ctx.close) this.ctx.close().catch(() => {});
      if (this.trava) this.trava.release().catch(() => {});
      this.trava = null;
    }

    parar() {
      if (this.proc) this.proc.onaudioprocess = null;
      this.fecharBloco();
      this.encerrar();
    }

    cancelar() {
      if (this.proc) this.proc.onaudioprocess = null;
      this.pedacos = [];
      this.encerrar();
    }
  }

  class ErroApi extends Error {
    constructor(status, codigo, extra) {
      super(codigo || "");
      this.status = status;
      this.codigo = codigo || (status === 0 ? "rede" : "pop_erro_interno");
      this.extra = extra || {};
    }
  }

  const ROTAS_COM_CHAVE = new Set(["conversa", "gerar", "imagens", "chave", "auditar"]);
  const FORMATO_CHAVE = /AIza[0-9A-Za-z_-]{35}(?![0-9A-Za-z_-])/;

  class Api {
    constructor(base) {
      this.base = String(base || "/api/pop").replace(/\/+$/, "");
      this.chave = ""; // GUARDA: chave própria só na memória; nada de localStorage, sessionStorage ou IndexedDB
    }

    cabecalhos(extra = {}, rota = "", chave = this.chave) {
      const c = Object.assign({}, extra);
      const token = tokenDoSite();
      if (token) c["x-token"] = token;
      if (chave && ROTAS_COM_CHAVE.has(rota)) c["x-pop-chave"] = chave;
      return c;
    }

    async json(rota, corpo, chave) {
      let resp;
      try {
        resp = await fetch(`${this.base}/${rota}`, corpo === undefined
          ? { method: "GET", headers: this.cabecalhos({}, rota, chave) }
          : { method: "POST", headers: this.cabecalhos({ "content-type": "application/json" }, rota, chave), body: JSON.stringify(corpo) });
      } catch { throw new ErroApi(0); }
      const dados = await resp.json().catch(() => null);
      if (!resp.ok) throw new ErroApi(resp.status, dados && dados.error, dados);
      if (!dados) throw new ErroApi(502);
      return dados;
    }

    async fluxo(rota, corpo, aoEvento) {
      let resp;
      try {
        resp = await fetch(`${this.base}/${rota}`, {
          method: "POST",
          headers: this.cabecalhos({ "content-type": "application/json", accept: "text/event-stream" }, rota),
          body: JSON.stringify(corpo),
        });
      } catch { throw new ErroApi(0); }
      if (!resp.ok || !(resp.headers.get("content-type") || "").includes("event-stream")) {
        const dados = await resp.json().catch(() => null);
        throw new ErroApi(resp.ok ? 502 : resp.status, dados && dados.error, dados);
      }
      const leitor = resp.body.getReader();
      const dec = new TextDecoder();
      let resto = "";
      const processar = (bloco) => {
        let evento = "message";
        const dados = [];
        for (const linha of bloco.split("\n")) {
          if (!linha || linha.startsWith(":")) continue;
          if (linha.startsWith("event:")) evento = linha.slice(6).trim();
          else if (linha.startsWith("data:")) dados.push(linha.slice(5).replace(/^ /, ""));
        }
        if (dados.length) {
          let valor;
          try { valor = JSON.parse(dados.join("\n")); } catch { return; }
          aoEvento(evento, valor);
        }
      };
      try {
        for (;;) {
          const { value, done } = await leitor.read();
          if (done) break;
          resto += dec.decode(value, { stream: true }).replace(/\r\n?/g, "\n");
          let i;
          while ((i = resto.indexOf("\n\n")) >= 0) {
            processar(resto.slice(0, i));
            resto = resto.slice(i + 2);
          }
        }
      } catch { throw new ErroApi(0); }
      if (resto.trim()) processar(resto);
    }

    async transcrever(bloco, idioma) {
      let resp;
      try {
        resp = await fetch(CFG.audio, {
          method: "POST",
          headers: this.cabecalhos({ "content-type": "application/json" }),
          body: JSON.stringify({
            mode: CFG.modoAudio, chunkIndex: bloco.indice, durationSec: Math.round(bloco.segundos), lang: idioma,
            audioData: { mimeType: "audio/wav", data: await blobParaBase64(bloco.wav) },
          }),
        });
      } catch { throw new ErroApi(0); }
      const dados = await resp.json().catch(() => null);
      if (!resp.ok) throw new ErroApi(resp.status, (dados && dados.error) || "transcription_failed", dados);
      return String((dados && dados.text) || "").trim();
    }
  }

  class CartaoGeracao {
    constructor(app, g) {
      this.app = app;
      this.g = g;
      const t = app.t;
      this.titulo = h("h3", { class: "pde-geracao-titulo" });
      this.resumo = h("p", { class: "pde-geracao-resumo" });
      this.etiquetas = h("div", { class: "pde-etiquetas" });
      this.linhas = {};
      const lista = h("ul", { class: "pde-etapas" });
      for (const f of FORMATOS) {
        if (!g.formatos.includes(f)) continue;
        const linha = { estado: h("div", { class: "pde-etapa-estado" }), acao: h("div", { class: "pde-etapa-acao" }), barra: h("span") };
        linha.barraEl = h("div", { class: "pde-barra", role: "presentation" }, linha.barra);
        linha.el = h("li", { class: "pde-etapa", "data-formato": f },
          h("div", { class: "pde-etapa-icone", "aria-hidden": "true" }, SIGLAS[f]),
          h("div", { class: "pde-etapa-corpo" }, h("div", { class: "pde-etapa-nome" }, t.etapas[f]), linha.estado),
          linha.acao, linha.barraEl);
        this.linhas[f] = linha;
        lista.append(linha.el);
      }
      this.rodape = h("div", { class: "pde-geracao-rodape" });
      this.el = h("section", { class: "pde-geracao", "aria-live": "off" },
        h("div", { class: "pde-geracao-topo" }, this.titulo, this.resumo, this.etiquetas), lista, this.rodape);
      this.atualizar();
    }

    atualizar() {
      const { g, app } = this;
      const t = app.t;
      const b = g.brief || {};
      const emAndamento = FORMATOS.some((f) => g.formatos.includes(f) && ["aguardando", "trabalhando", "montando"].includes(g.etapas[f].estado));
      const falhou = !emAndamento && g.formatos.some((f) => g.etapas[f].estado === "erro");
      this.titulo.textContent = emAndamento ? t.gerandoTitulo : falhou ? t.falhouTitulo : t.geradoTitulo;
      const decorrido = ((g.fim || Date.now()) - g.inicio) / 1000;
      this.resumo.textContent = emAndamento ? `${t.duracao} · ${relogio(decorrido)}` : (b.titulo_processo || "");
      const etiquetas = [b.tipo_documento, b.codigo, b.setor, b.idioma && b.idioma.toUpperCase()].filter(Boolean);
      if (this.etiquetasAtuais !== etiquetas.join("|")) {
        this.etiquetasAtuais = etiquetas.join("|");
        this.etiquetas.replaceChildren(...etiquetas.map((x) => h("span", { class: "pde-etiqueta" }, x)));
      }
      for (const f of Object.keys(this.linhas)) this.atualizarLinha(f);
      this.atualizarRodape(emAndamento);
    }

    atualizarLinha(f) {
      const { g, app } = this;
      const t = app.t;
      const e = g.etapas[f];
      const linha = this.linhas[f];
      if (!linha) return;
      linha.el.dataset.estado = e.estado;
      let texto = t.fases[e.estado] || "";
      let progresso = null;
      if (e.estado === "aguardando" && f !== "word" && !g.etapas.word.json && g.formatos.includes("word")) texto = t.fases.esperandoWord;
      if (e.estado === "trabalhando") {
        texto = t.fases[e.fase] || t.fases.preparando;
        if (e.fase === "literatura" && e.secoes) texto += ` (${fmt(t.trechos, { n: e.secoes })})`;
        if (e.fase === "escrevendo" && e.caracteres) {
          texto += ` ${fmt(t.milCaracteres, { n: Math.max(1, Math.round(e.caracteres / 1000)) })}`;
          progresso = Math.min(95, Math.round((e.caracteres / ESPERADO[f]) * 100));
        }
        if (e.fase === "revisando" && e.pendencias) texto += ` (${e.pendencias === 1 ? t.ajuste : fmt(t.ajustes, { n: e.pendencias })})`;
      }
      if (e.estado === "montando" && e.desde && Date.now() - e.desde > 8000) texto = t.fases.acordando;
      if (e.estado === "pronto" && e.arquivo) texto = `${t.fases.pronto} · ${tamanhoLegivel(e.arquivo.tamanho)}`;
      if (e.estado === "erro" && e.erro) texto = `${t.fases.erro}: ${e.erro}`;
      const girando = e.estado === "trabalhando" || e.estado === "montando";
      linha.estado.replaceChildren(girando ? h("span", { class: "pde-giro", "aria-hidden": "true" }) : "",
        e.estado === "pronto" ? icone("check", 16) : "", h("span", null, texto));
      linha.barraEl.classList.toggle("pde-barra--indeterminada", girando && progresso === null);
      linha.barra.style.width = progresso === null ? "" : `${progresso}%`;

      let acao = null;
      if (e.estado === "pronto" && e.arquivo) {
        acao = h("a", { class: "pde-botao pde-botao--destaque pde-botao--pequeno", href: e.arquivo.url, download: e.arquivo.nome },
          icone("baixar"), t.baixar);
      } else if (e.estado === "salvo") {
        acao = h("button", { class: "pde-botao pde-botao--destaque pde-botao--pequeno", type: "button",
          onclick: () => app.montarEBaixar(g, f) }, icone("baixar"), t.baixar);
      } else if (e.estado === "erro") {
        acao = h("button", { class: "pde-botao pde-botao--secundario pde-botao--pequeno", type: "button",
          onclick: () => app.continuarGeracao(g) }, icone("recarregar"), t.tentarDeNovo);
      }
      const chave = e.estado + (e.arquivo ? e.arquivo.url : "");
      if (linha.acaoAtual !== chave) {
        linha.acao.replaceChildren(acao || "");
        linha.acaoAtual = chave;
      }
    }

    atualizarRodape(emAndamento) {
      const { g, app } = this;
      const t = app.t;
      if (emAndamento) { this.rodape.replaceChildren(); this.rodapeAtual = null; return; }
      const chave = FORMATOS.map((f) => (g.etapas[f] ? g.etapas[f].estado : "")).join("|");
      if (this.rodapeAtual === chave) return;
      this.rodapeAtual = chave;
      const avisos = [];
      for (const f of g.formatos) for (const a of g.etapas[f].avisos || []) avisos.push(`${t.etapas[f]}: ${a}`);
      const uso = { entrada: 0, saida: 0, pensamento: 0, chamadas: 0 };
      for (const f of g.formatos) {
        const u = g.etapas[f].uso;
        if (u) for (const k of Object.keys(uso)) uso[k] += u[k] || 0;
      }
      const literatura = (g.etapas.word && g.etapas.word.literatura) || [];
      const temJson = g.formatos.some((f) => g.etapas[f].json);
      const falhou = g.formatos.some((f) => g.etapas[f].estado === "erro");
      const filhos = [];
      if (g.formatos.some((f) => g.etapas[f].estado === "pronto" || g.etapas[f].estado === "salvo")) {
        filhos.push(h("p", { class: "pde-nota" }, t.revisaoHumana));
      }
      if (falhou) filhos.push(app.painelEspelho(g));
      if (avisos.length) {
        filhos.push(h("details", { class: "pde-detalhes" }, h("summary", null, fmt(t.pontosRevisar, { n: avisos.length })),
          h("ul", null, avisos.slice(0, 40).map((a) => h("li", null, a)))));
      }
      if (uso.chamadas || literatura.length) {
        const numeros = Object.fromEntries(Object.entries(uso).map(([k, v]) => [k, v.toLocaleString(app.idioma)]));
        filhos.push(h("details", { class: "pde-detalhes" }, h("summary", null, t.detalhesTecnicos),
          h("ul", null,
            uso.chamadas ? h("li", null, fmt(t.tokens, numeros)) : null,
            literatura.length ? h("li", null, `${t.literatura}:`, h("ul", null, literatura.map((l) => {
              const id = typeof l === "string" ? l : l.id;
              const vol = (String(id).match(/^V(\d+)/) || [])[1];
              return h("li", null, `${vol ? `Vol. ${vol} · ` : ""}${(typeof l === "object" && l.titulo) || id}`);
            }))) : null)));
      }
      if (temJson) {
        filhos.push(h("p", { class: "pde-nota" }, h("button", { class: "pde-link", type: "button",
          onclick: () => app.montarDeNovo(g) }, t.montarDeNovo)));
      }
      this.rodape.replaceChildren(...filhos);
    }
  }

  class PopDeElite {
    constructor(raiz, opcoes = {}) {
      const dados = raiz.dataset || {};
      this.raiz = raiz;
      this.opcoes = opcoes;
      this.idiomaPedido = opcoes.idioma || dados.idioma || "auto";
      this.idioma = idiomaDoSite(this.idiomaPedido);
      this.t = textosDe(this.idioma);
      this.api = new Api(opcoes.api || dados.api || CFG.api);
      this.config = Object.assign({ cor: CORES[0], logo: null, estilo: "cientifico", excel: true, ppt: true },
        armazenamento.ler("config", {}));
      this.historico = [];
      this.geracao = null;
      this.tipo = "";
      this.formatosPorTipo = {};
      this.pendentes = [];
      this.ocupado = false;
      this.gerando = false;
      this.semSessao = CFG.exigeSessao && !tokenDoSite();
      this.cartoes = new Map();

      raiz.classList.add("pde");
      const tema = opcoes.tema || dados.tema || CFG.tema;
      raiz.dataset.tema = tema === "auto" && EMBUTIDO ? "site" : tema;
      if (raiz.dataset.tema === "site") document.documentElement.dataset.pdeTema = "site";
      if (opcoes.altura || dados.altura) raiz.style.setProperty("--pde-altura", opcoes.altura || dados.altura);
      if (raiz !== document.body && raiz.parentElement !== document.body) raiz.dataset.incorporado = "";
      this.aplicarIdioma();
      this.montarEstrutura();
      this.renderizarConversa();
      this.iniciar();
    }

    async iniciar() {
      await this.conferirDono();
      const salvo = armazenamento.ler("conversa", {});
      this.historico = Array.isArray(salvo.historico) ? salvo.historico : [];
      this.tipo = typeof salvo.tipo === "string" ? salvo.tipo : "";
      this.modo = salvo.modo === "auditoria" ? "auditoria" : "";
      this.auditado = salvo.auditado === true;
      this.geracao = salvo.geracao && salvo.geracao.id ? this.restaurarGeracao(salvo.geracao) : null;
      if (this.geracao) {
        const entrada = this.historico.find((m) => m.tipo === "geracao" && m.geracaoId === this.geracao.id);
        if (entrada) entrada.texto = this.notaDaGeracao(this.geracao);
      }
      this.semSessao = CFG.exigeSessao && !tokenDoSite();
      this.renderizarConversa();
      this.atualizarCompositor();
      if (this.semSessao) avisarPagina("pop:sessao", { motivo: "sem_sessao" });
      else this.verificarServico();
      avisarPagina("pop:pronto", { versao: VERSAO });

      window.addEventListener("storage", (e) => {
        if (e.key === CFG.chaveIdioma) this.trocarIdioma(idiomaDoSite(this.idiomaPedido));
        if (e.key === CFG.chaveToken && !e.newValue && CFG.exigeSessao) this.sessaoEncerrada();
        if (e.key === CFG.chaveToken && e.newValue && this.semSessao) this.sessaoRetomada();
        if (e.key === CFG.chaveUsuario) this.conferirDono().then((trocou) => { if (trocou) this.recomecar(); });
      });
      window.addEventListener("beforeunload", (e) => {
        if (this.gerando) { e.preventDefault(); e.returnValue = this.t.sairDurante; }
      });
      this.raiz.addEventListener("dragover", (e) => {
        if (e.dataTransfer && Array.from(e.dataTransfer.types || []).includes("Files")) e.preventDefault();
      });
      this.raiz.addEventListener("drop", (e) => {
        if (!e.dataTransfer || !e.dataTransfer.files.length) return;
        e.preventDefault();
        if (!this.gerando && !this.semSessao) this.adicionarArquivos([...e.dataTransfer.files]);
      });
    }

    /** GUARDA: a conversa pertence a quem está logado: outra pessoa, ou ninguém, apaga a conversa local. */
    async conferirDono() {
      if (!CFG.exigeSessao) return false;
      if (!tokenDoSite()) { await this.apagarDadosLocais(); return false; }
      const u = usuarioDoSite();
      const dono = u && u.email ? await sha256(u.email) : "";
      if (!dono) return false;
      const anterior = armazenamento.ler("dono", "");
      const trocou = Boolean(anterior) && anterior !== dono;
      if (trocou) await this.apagarDadosLocais();
      armazenamento.gravar("dono", dono);
      return trocou;
    }

    async apagarDadosLocais() {
      this.api.chave = "";
      this.atualizarChave();
      armazenamento.apagar("conversa");
      armazenamento.apagar("dono");
      armazenamento.apagar("uso80");
      await banco.apagarTudo();
    }

    recomecar() {
      this.fecharConfirmacao(false);
      this.substituirGeracao(null);
      this.historico = [];
      this.tipo = "";
      this.modo = "";
      this.auditado = false;
      this.pendentes = [];
      this.cartoes.clear();
      this.renderizarPendentes();
      this.renderizarConversa();
      this.atualizarCompositor();
    }

    async sessaoEncerrada() {
      this.semSessao = true;
      if (this.gravador) this.cancelarGravacao();
      await this.apagarDadosLocais();
      this.recomecar();
    }

    async sessaoRetomada() {
      this.semSessao = false;
      await this.conferirDono();
      this.renderizarConversa();
      this.atualizarCompositor();
      this.verificarServico();
    }

    aplicarIdioma() {
      this.raiz.setAttribute("lang", this.idioma);
      document.documentElement.lang = this.idioma;
    }

    trocarIdioma(idioma) {
      if (!idioma || idioma === this.idioma || !TEXTOS[idioma]) return;
      this.idioma = idioma;
      this.t = textosDe(idioma);
      this.aplicarIdioma();
      if (this.gerando || this.ocupado || this.gravador) { this.idiomaPendente = true; return; }
      this.redesenhar();
    }

    redesenhar() {
      this.idiomaPendente = false;
      const texto = this.entrada ? this.entrada.value : "";
      this.cartoes.clear();
      this.montarEstrutura();
      this.renderizarConversa();
      this.renderizarPendentes();
      this.atualizarCompositor();
      this.entrada.value = texto;
      this.ajustarAltura();
    }

    montarEstrutura() {
      const t = this.t;
      const topo = h("header", { class: "pde-topo" },
        h("div", { class: "pde-marca" },
          h("div", { class: "pde-marca-icone", "aria-hidden": "true" }, "◈"),
          h("div", { class: "pde-marca-texto" }, h("p", { class: "pde-marca-nome" }, t.nome), h("p", { class: "pde-marca-sub" }, t.sub))),
        h("div", { class: "pde-topo-acoes" },
          h("button", { class: "pde-acao", type: "button", onclick: () => this.abrirConfiguracoes() },
            icone("engrenagem"), h("span", null, t.personalizar)),
          this.botaoNova = h("button", { class: "pde-acao", type: "button", onclick: () => this.novaConversa() },
            icone("novo"), h("span", null, t.novoDocumento))));

      this.confirmacao = h("div", { class: "pde-confirmacao pde-oculto", role: "alertdialog", "aria-label": t.novoDocumento,
        onkeydown: (e) => { if (e.key === "Escape") this.fecharConfirmacao(); } });
      this.aviso = h("div", { class: "pde-faixa pde-oculto", role: "status" });
      this.lista = h("div", { class: "pde-conversa", role: "log", "aria-live": "polite", "aria-relevant": "additions" });
      this.rolagem = h("main", { class: "pde-rolagem" }, this.lista);
      this.anuncio = h("div", { class: "pde-so-leitor", "aria-live": "assertive" });

      this.entrada = h("textarea", { class: "pde-entrada", rows: "1", dir: "auto", placeholder: t.placeholder, "aria-label": t.placeholder,
        oninput: () => this.ajustarAltura(), onkeydown: (e) => this.teclado(e), onpaste: (e) => this.colar(e) });
      this.seletor = h("input", { type: "file", accept: ACEITAR, multiple: true, class: "pde-oculto",
        onchange: () => { this.adicionarArquivos([...this.seletor.files]); this.seletor.value = ""; } });
      this.botaoAnexar = h("button", { class: "pde-icone", type: "button", title: t.anexar, "aria-label": t.anexar,
        onclick: () => this.seletor.click() }, icone("clipe"));
      this.botaoGravar = h("button", { class: "pde-icone", type: "button", title: t.gravar, "aria-label": t.gravar,
        onclick: () => this.iniciarGravacao() }, icone("microfone"));
      this.botaoEnviar = h("button", { class: "pde-icone pde-enviar", type: "button", title: t.enviar, "aria-label": t.enviar,
        onclick: () => this.enviar() }, icone("enviar"));
      this.tempoGravacao = h("span", { class: "pde-tempo" }, "0:00");
      this.painelGravacao = h("div", { class: "pde-gravando pde-oculto" },
        h("span", { class: "pde-gravando-ponto", "aria-hidden": "true" }), h("span", null, t.gravando), this.tempoGravacao);
      this.botaoCancelarGravacao = h("button", { class: "pde-icone pde-oculto", type: "button", title: t.cancelarGravacao,
        "aria-label": t.cancelarGravacao, onclick: () => this.cancelarGravacao() }, icone("x"));
      this.botaoEnviarAudio = h("button", { class: "pde-icone pde-enviar pde-oculto", type: "button", title: t.pararEnviar,
        "aria-label": t.pararEnviar, onclick: () => this.concluirGravacao() }, icone("check"));
      this.pendentesEl = h("div", { class: "pde-pendentes" });
      this.botaoGerar = h("button", { class: "pde-botao pde-botao--destaque", type: "button",
        onclick: () => this.enviar(this.t.podeGerar) }, icone("faisca"), t.gerarDocumentos);
      this.etiquetaEl = h("div", { class: "pde-tipo-etiqueta-linha" });
      this.botaoChave = h("button", { class: "pde-chave", type: "button", onclick: () => this.abrirChave() });
      this.botaoAjudaChave = h("button", { class: "pde-chave-ajuda", type: "button", title: t.chaveAjuda, "aria-label": t.chaveAjuda,
        onclick: () => this.abrirAjudaChave() }, icone("ajuda", 18));
      const compositor = h("footer", { class: "pde-compositor" },
        h("div", { class: "pde-compositor-interno" },
          this.pendentesEl,
          this.etiquetaEl,
          h("div", { class: "pde-linha-entrada" }, this.botaoAnexar, this.botaoGravar, this.entrada, this.painelGravacao,
            this.botaoCancelarGravacao, this.botaoEnviarAudio, this.botaoEnviar),
          h("div", { class: "pde-compositor-rodape" },
            h("div", { class: "pde-chave-grupo" }, this.botaoChave, this.botaoAjudaChave),
            h("p", { class: "pde-dica" }, t.dica), this.botaoGerar)),
        this.seletor);

      this.raiz.replaceChildren(topo, this.confirmacao, this.aviso, this.rolagem, compositor, this.anuncio);
      this.montarDialogos();
      this.atualizarChave();
      this.mostrarUsoSeAlto();
    }

    montarDialogos() {
      const t = this.t;
      this.coresEl = h("div", { class: "pde-cores", role: "group", "aria-label": t.cfgCor });
      this.corLivre = h("input", { type: "color", class: "pde-cor-livre", title: t.cfgCorLivre, "aria-label": t.cfgCorLivre,
        oninput: () => this.definirCor(this.corLivre.value) });
      this.logoPrevia = h("div", { class: "pde-logo-previa" });
      this.seletorLogo = h("input", { type: "file", accept: "image/png,image/jpeg,image/webp", class: "pde-oculto",
        onchange: () => this.escolherLogo() });
      this.botaoRemoverLogo = h("button", { class: "pde-botao pde-botao--secundario pde-botao--pequeno", type: "button",
        onclick: () => { this.config.logo = null; this.salvarConfig(); this.atualizarConfiguracoes(); } }, t.cfgLogoRemover);
      const opcaoEstilo = (valor) => h("label", { class: "pde-opcao" },
        h("input", { type: "radio", name: "pde-estilo", value: valor,
          onchange: () => { this.config.estilo = valor; this.salvarConfig(); } }), t.cfgEstilos[valor]);
      const opcaoFormato = (f, fixo) => h("label", { class: "pde-opcao", "data-fixo": fixo || null },
        h("input", { type: "checkbox", name: `pde-${f}`, disabled: fixo || null, checked: fixo || null,
          onchange: (e) => { this.config[f] = e.target.checked; this.salvarConfig(); } }), t.etapas[f]);
      this.dialogoConfig = h("dialog", { class: "pde-dialogo", "aria-labelledby": "pde-cfg-titulo" },
        h("form", { method: "dialog", class: "pde-dialogo-form" },
          h("div", { class: "pde-dialogo-topo" }, h("h2", { id: "pde-cfg-titulo" }, t.personalizar),
            h("button", { class: "pde-icone", value: "fechar", "aria-label": t.fechar }, icone("x"))),
          h("div", { class: "pde-dialogo-corpo" },
            h("fieldset", { class: "pde-grupo" }, h("legend", null, t.cfgCor), h("p", { class: "pde-ajuda" }, t.cfgCorAjuda),
              h("div", { class: "pde-cores" }, this.coresEl, this.corLivre)),
            h("div", { class: "pde-grupo" }, h("div", { class: "pde-grupo-titulo" }, t.cfgLogo), h("p", { class: "pde-ajuda" }, t.cfgLogoAjuda),
              h("div", { class: "pde-logo-linha" }, this.logoPrevia,
                h("button", { class: "pde-botao pde-botao--secundario pde-botao--pequeno", type: "button",
                  onclick: () => this.seletorLogo.click() }, t.cfgLogoEscolher), this.botaoRemoverLogo, this.seletorLogo)),
            h("fieldset", { class: "pde-grupo" }, h("legend", null, t.cfgEstilo),
              h("div", { class: "pde-opcoes" }, opcaoEstilo("cientifico"), opcaoEstilo("minimalista"))),
            h("fieldset", { class: "pde-grupo" }, h("legend", null, t.cfgFormatos), h("p", { class: "pde-ajuda" }, t.cfgFormatosAjuda),
              h("div", { class: "pde-opcoes" }, opcaoFormato("word", true), opcaoFormato("excel"), opcaoFormato("ppt")),
              this.notaFormatos = h("p", { class: "pde-ajuda pde-oculto" }))),
          h("div", { class: "pde-dialogo-rodape" }, h("button", { class: "pde-botao pde-botao--primario", value: "ok" }, t.cfgPronto))));
      this.raiz.append(this.dialogoConfig);

      this.miyagiSemPonte = h("p", { class: "pde-ajuda pde-oculto" }, t.miyagiSemPonte);
      this.dialogoMiyagi = h("dialog", { class: "pde-dialogo", "aria-labelledby": "pde-miyagi-titulo" },
        h("form", { method: "dialog", class: "pde-dialogo-form" },
          h("div", { class: "pde-dialogo-topo" }, h("h2", { id: "pde-miyagi-titulo" }, t.miyagiTitulo),
            h("button", { class: "pde-icone", value: "fechar", "aria-label": t.fechar }, icone("x"))),
          h("div", { class: "pde-dialogo-corpo" }, t.miyagiTexto.map((p) => h("p", null, p)), this.miyagiSemPonte),
          h("div", { class: "pde-dialogo-rodape" },
            h("button", { class: "pde-botao pde-botao--secundario", value: "fechar" }, t.fechar),
            h("button", { class: "pde-botao pde-botao--primario", type: "button", onclick: () => this.abrirMiyagiNoSite() },
              t.miyagiAbrir))));
      this.raiz.append(this.dialogoMiyagi);

      this.campoChave = h("input", { class: "pde-campo", type: "password", autocomplete: "off", spellcheck: "false",
        autocapitalize: "off", placeholder: t.chaveCampo, "aria-label": t.chaveCampo });
      this.erroChave = h("p", { class: "pde-ajuda pde-erro-campo pde-oculto", role: "alert" }, t.chaveFormato);
      this.botaoUsarChave = h("button", { class: "pde-botao pde-botao--primario", type: "submit" }, t.chaveUsar);
      this.botaoRemoverChave = h("button", { class: "pde-botao pde-botao--secundario", type: "button",
        onclick: () => { this.removerChave(); this.dialogoChave.close(); } }, t.chaveRemover);
      this.dialogoChave = h("dialog", { class: "pde-dialogo pde-dialogo--estreito", "aria-labelledby": "pde-chave-titulo" },
        h("form", { method: "dialog", class: "pde-dialogo-form", onsubmit: (e) => { e.preventDefault(); this.usarChave(); } },
          h("div", { class: "pde-dialogo-topo" }, h("h2", { id: "pde-chave-titulo" }, t.chaveTitulo),
            h("button", { class: "pde-icone", type: "button", "aria-label": t.fechar, onclick: () => this.dialogoChave.close() }, icone("x"))),
          h("div", { class: "pde-dialogo-corpo" }, t.chaveTexto.map((p) => h("p", null, p)), this.campoChave, this.erroChave,
            h("p", null, h("button", { class: "pde-link", type: "button", onclick: () => this.abrirAjudaChave() }, t.chaveComoConseguir))),
          h("div", { class: "pde-dialogo-rodape" }, this.botaoRemoverChave, this.botaoUsarChave)));
      this.dialogoAjudaChave = h("dialog", { class: "pde-dialogo pde-dialogo--estreito", "aria-labelledby": "pde-ajuda-chave-titulo" },
        h("form", { method: "dialog", class: "pde-dialogo-form" },
          h("div", { class: "pde-dialogo-topo" }, h("h2", { id: "pde-ajuda-chave-titulo" }, t.ajudaChaveTitulo),
            h("button", { class: "pde-icone", value: "fechar", "aria-label": t.fechar }, icone("x"))),
          h("div", { class: "pde-dialogo-corpo" },
            h("ol", { class: "pde-passos-chave" }, t.ajudaChavePassos.map((p) => h("li", null, p))),
            h("p", { class: "pde-ajuda" }, t.ajudaChaveNota),
            h("p", null, h("a", { class: "pde-link", href: "https://aistudio.google.com/apikey", target: "_blank", rel: "noopener noreferrer" },
              t.ajudaChaveAbrir))),
          h("div", { class: "pde-dialogo-rodape" }, h("button", { class: "pde-botao pde-botao--secundario", value: "fechar" }, t.fechar))));
      this.dialogoChave.addEventListener("close", () => { this.depoisDaChave = null; });
      this.raiz.append(this.dialogoChave, this.dialogoAjudaChave);
    }

    abrirChave(depois) {
      this.depoisDaChave = typeof depois === "function" ? depois : null;
      this.campoChave.value = "";
      this.erroChave.textContent = this.t.chaveFormato;
      this.erroChave.classList.add("pde-oculto");
      this.botaoRemoverChave.classList.toggle("pde-oculto", !this.api.chave);
      if (this.dialogoAjudaChave.open) this.dialogoAjudaChave.close();
      this.dialogoChave.showModal();
      this.campoChave.focus();
    }

    abrirAjudaChave() {
      this.dialogoAjudaChave.showModal();
    }

    mostrarErroChave(texto) {
      this.erroChave.textContent = texto;
      this.erroChave.classList.remove("pde-oculto");
      this.campoChave.focus();
    }

    async usarChave() {
      if (this.conferindoChave) return;
      const achada = (this.campoChave.value || "").match(FORMATO_CHAVE);
      this.campoChave.value = "";
      if (!achada) { this.mostrarErroChave(this.t.chaveFormato); return; }
      this.conferindoChave = true;
      this.erroChave.classList.add("pde-oculto");
      this.botaoUsarChave.disabled = true;
      this.botaoUsarChave.textContent = this.t.chaveConferindo;
      let r;
      try {
        r = await this.api.json("chave", {}, achada[0]);
      } catch (e) {
        if (e instanceof ErroApi && (e.codigo === "auth_required_expert" || e.status === 401)) {
          this.dialogoChave.close();
          this.tratarErroEspecial(e);
        } else {
          this.mostrarErroChave(this.mensagemDeErro(e));
        }
        return;
      } finally {
        this.conferindoChave = false;
        this.botaoUsarChave.disabled = false;
        this.botaoUsarChave.textContent = this.t.chaveUsar;
      }
      if (!this.dialogoChave.open) return;
      const depois = this.depoisDaChave;
      this.api.chave = achada[0];
      this.dialogoChave.close();
      this.atualizarChave();
      this.anuncio.textContent = this.t.chaveAceita;
      this.lista.append(h("div", { class: "pde-alerta pde-alerta--aviso pde-aviso-chave", role: "status" }, icone("chave", 20),
        h("span", { class: "pde-alerta-texto" }, fmt(this.t.chaveAvisoGratis, { modelo: r.modelo || "" }))));
      this.rolarParaFim(true);
      if (depois && !this.ocupado && !this.gerando) depois();
    }

    removerChave(silencioso) {
      this.api.chave = "";
      this.atualizarChave();
      if (!silencioso) this.anuncio.textContent = this.t.chaveRemovida;
    }

    atualizarChave() {
      if (!this.botaoChave) return;
      const ativa = Boolean(this.api.chave);
      this.botaoChave.classList.toggle("pde-chave--ativa", ativa);
      this.botaoChave.title = ativa ? this.t.chaveAtivaDica : this.t.chaveBotaoDica;
      this.botaoChave.replaceChildren(icone(ativa ? "check" : "chave", 16), h("span", null, ativa ? this.t.chaveAtiva : this.t.chaveBotao));
    }

    abrirMiyagi() {
      this.miyagiSemPonte.classList.add("pde-oculto");
      this.dialogoMiyagi.showModal();
    }

    abrirMiyagiNoSite() {
      if (avisarPagina("pop:motor", { motor: "miyagi" })) this.dialogoMiyagi.close();
      else this.miyagiSemPonte.classList.remove("pde-oculto");
    }

    boasVindas() {
      const t = this.t;
      const botaoTipo = (codigo) => (codigo === "FLUXO"
        ? h("button", { class: "pde-tipo", type: "button", onclick: () => this.abrirMiyagi() }, t.tipos.FLUXO)
        : h("button", { class: "pde-tipo", type: "button", "data-tipo": codigo, "aria-pressed": String(this.tipo === codigo),
          onclick: () => this.escolherTipo(this.tipo === codigo ? "" : codigo) }, t.tipos[codigo]));
      const grupo = (titulo, codigos) => h("div", { class: "pde-tipos-grupo" },
        h("p", { class: "pde-tipos-titulo", dir: "auto" }, titulo), h("div", { class: "pde-tipos" }, codigos.map(botaoTipo)));
      return h("section", { class: "pde-boasvindas" },
        h("h2", { dir: "auto" }, t.bvTitulo),
        h("p", { class: "pde-bv-texto", dir: "auto" }, t.bvTexto),
        h("ol", { class: "pde-passos" }, t.passos.map(([titulo, texto], i) =>
          h("li", { class: "pde-passo", dir: "auto" }, h("span", { class: "pde-passo-num", "aria-hidden": "true" }, String(i + 1)),
            h("div", { class: "pde-passo-texto" }, h("strong", null, titulo), h("span", null, texto))))),
        h("p", { class: "pde-secao-titulo", dir: "auto" }, t.tiposTitulo),
        grupo(t.tiposNormativos, TIPOS.normativos),
        grupo(t.tiposApoio, TIPOS.apoio),
        h("p", { class: "pde-rotulo", dir: "auto" }, t.exemplosTitulo),
        h("div", { class: "pde-exemplos" },
          h("button", { class: "pde-chip pde-chip--acao", type: "button", onclick: () => this.iniciarAuditoria() },
            icone("auditar", 18), h("span", null, t.auditoriaAcao)),
          t.exemplos.map((ex) => h("button", { class: "pde-chip", type: "button", onclick: () => this.enviar(ex) }, ex))),
        h("div", { class: "pde-avisos" },
          h("p", { class: "pde-privacidade", dir: "auto" }, icone("escudo"), h("span", null, t.privacidade)),
          h("p", { class: "pde-alternativa", dir: "auto" }, `${t.chaveConvite} `,
            h("button", { class: "pde-link", type: "button", onclick: () => this.abrirChave() }, t.chaveUsarMinha))));
    }

    iniciarAuditoria() {
      if (this.ocupado || this.gerando || this.semSessao) return;
      this.modo = "auditoria";
      this.auditado = false;
      this.adicionar({ papel: "assistente", tipo: "pedido_auditoria", texto: this.t.auditoriaPedido, hora: Date.now() });
      this.atualizarCompositor();
    }

    escolherTipo(codigo) {
      if (this.gerando) return;
      this.tipo = codigo || "";
      this.salvarConversa();
      for (const b of this.lista.querySelectorAll(".pde-tipo[data-tipo]")) b.setAttribute("aria-pressed", String(b.dataset.tipo === this.tipo));
      this.atualizarCompositor();
      if (this.tipo && !this.semSessao) this.entrada.focus();
    }

    cartaoSessao() {
      const t = this.t;
      return h("section", { class: "pde-boasvindas pde-sessao" },
        h("h2", null, t.sessaoTitulo),
        h("p", null, t.sessaoTexto),
        h("p", null, h("button", { class: "pde-botao pde-botao--destaque", type: "button", onclick: () => this.pedirLogin() },
          icone("porta"), t.sessaoEntrar)));
    }

    pedirLogin() {
      if (!avisarPagina("pop:sessao", { motivo: "entrar" })) window.location.href = "/expert";
    }

    renderizarConversa() {
      this.lista.replaceChildren();
      if (this.semSessao) {
        this.lista.append(this.cartaoSessao());
        return;
      }
      if (!this.historico.length) {
        this.lista.append(this.boasVindas());
        this.rolagem.scrollTop = 0;
        return;
      }
      for (const m of this.historico) this.lista.append(this.elementoDaMensagem(m));
      this.rolarParaFim(true);
    }

    elementoDaMensagem(m) {
      if (m.tipo === "geracao") {
        if (this.geracao && m.geracaoId === this.geracao.id) {
          if (!this.cartoes.has(m.geracaoId)) this.cartoes.set(m.geracaoId, new CartaoGeracao(this, this.geracao));
          return h("div", { class: "pde-msg pde-msg--assistente" }, this.cartoes.get(m.geracaoId).el);
        }
        const b = h("div", { class: "pde-balao pde-md", dir: "auto" });
        b.innerHTML = markdown(m.texto);
        return h("div", { class: "pde-msg pde-msg--assistente" }, b);
      }
      const el = h("div", { class: `pde-msg pde-msg--${m.papel === "usuario" ? "usuario" : "assistente"}` });
      if (m.texto) {
        const b = h("div", { class: "pde-balao", dir: "auto" });
        if (m.papel === "usuario") b.textContent = m.texto;
        else { b.classList.add("pde-md"); b.innerHTML = markdown(m.texto); }
        el.append(b);
      }
      if (m.anexos && m.anexos.length) {
        el.append(h("div", { class: "pde-msg-anexos" }, m.anexos.map((a) => this.cartaoDoAnexo(a))));
      }
      return el;
    }

    cartaoDoAnexo(a) {
      const t = this.t;
      const lido = this.modo === "auditoria" ? t.anexoNaAuditoria : t.anexoNaGeracao;
      return h("span", { class: "pde-anexo pde-anexo--cartao", title: lido },
        a.miniatura ? h("img", { class: "pde-anexo-mini", src: a.miniatura, alt: "" }) : icone(a.mime && a.mime.startsWith("image/") ? "imagem" : "clipe"),
        h("span", { class: "pde-anexo-info" },
          h("span", { class: "pde-anexo-nome" }, a.nome),
          h("span", { class: "pde-anexo-sub" }, [tamanhoLegivel(a.tamanho), lido].filter(Boolean).join(" · "))));
    }

    adicionar(m) {
      if (!this.historico.length) this.lista.replaceChildren();
      this.historico.push(m);
      this.lista.append(this.elementoDaMensagem(m));
      this.salvarConversa();
      this.rolarParaFim(m.papel === "usuario");
      return m;
    }

    rolarParaFim(forcar) {
      const r = this.rolagem;
      const perto = r.scrollHeight - r.scrollTop - r.clientHeight < 160;
      if (forcar || perto) requestAnimationFrame(() => { r.scrollTop = r.scrollHeight; });
    }

    mostrarDigitando(sim, texto) {
      if (sim) {
        if (this.digitando) this.digitando.remove();
        this.digitando = h("div", { class: "pde-msg pde-msg--assistente" },
          h("div", { class: "pde-balao" }, h("span", { class: "pde-digitando" },
            h("span", { class: "pde-pontos", "aria-hidden": "true" }, h("span"), h("span"), h("span")), texto || this.t.pensando)));
        this.lista.append(this.digitando);
        this.rolarParaFim(true);
      } else if (this.digitando) {
        this.digitando.remove();
        this.digitando = null;
      }
    }

    mostrarErro(mensagem, tentarDeNovo, extra) {
      const alerta = h("div", { class: "pde-alerta", role: "alert" }, icone("alerta", 20),
        h("span", { class: "pde-alerta-texto" }, mensagem),
        tentarDeNovo ? h("button", { class: "pde-botao pde-botao--secundario pde-botao--pequeno", type: "button",
          onclick: () => { alerta.remove(); tentarDeNovo(); } }, this.t.tentarDeNovo) : null,
        extra || null);
      this.lista.append(alerta);
      this.rolarParaFim(true);
      return alerta;
    }

    mensagemDeErro(e) {
      const t = this.t;
      if (e instanceof ErroApi) return fmt(t.erros[e.codigo] || t.erros.pop_erro_interno, e.extra);
      return (e && e.message) || t.erros.pop_erro_interno;
    }

    tratarErroEspecial(e, tentarDeNovo) {
      if (!(e instanceof ErroApi)) return false;
      if (e.codigo === "auth_required_expert" || (e.status === 401 && CFG.exigeSessao)) {
        avisarPagina("pop:sessao", { motivo: "expirada" });
        if (CFG.exigeSessao) { this.semSessao = true; this.renderizarConversa(); this.atualizarCompositor(); }
        else this.mostrarErro(this.mensagemDeErro(e));
        return true;
      }
      if (e.codigo === "pop_teto_diario") {
        if (e.extra && e.extra.uso_dia) this.atualizarUso(e.extra.uso_dia);
        this.mostrarTeto(tentarDeNovo);
        return true;
      }
      if (e.codigo === "pop_chave_recusada" || e.codigo === "pop_chave_invalida" || e.codigo === "pop_chave_sem_modelo") {
        this.removerChave(true);
        const alerta = this.mostrarErro(this.mensagemDeErro(e), tentarDeNovo || null, h("button", { class: "pde-botao pde-botao--secundario pde-botao--pequeno",
          type: "button", onclick: () => this.abrirChave(tentarDeNovo && (() => { alerta.remove(); tentarDeNovo(); })) }, this.t.chaveUsarMinha));
        return true;
      }
      return false;
    }

    mostrarTeto(tentarDeNovo) {
      const t = this.t;
      const cartao = h("section", { class: "pde-alerta pde-alerta--aviso pde-teto", role: "alert" },
        icone("alerta", 20),
        h("div", { class: "pde-alerta-texto" }, h("strong", null, t.tetoTitulo), h("p", null, t.tetoTexto),
          h("button", { class: "pde-botao pde-botao--secundario pde-botao--pequeno", type: "button",
            onclick: () => this.abrirChave(tentarDeNovo && (() => { cartao.remove(); tentarDeNovo(); })) }, icone("chave", 16), t.chaveUsarMinha)));
      this.lista.append(cartao);
      this.rolarParaFim(true);
    }

    atualizarUso(uso) {
      if (!uso || !(uso.teto > 0)) return;
      this.uso = uso;
      this.mostrarUsoSeAlto();
    }

    mostrarUsoSeAlto() {
      if (!this.aviso) return;
      const u = this.uso;
      const alto = u && u.teto > 0 && u.usado / u.teto >= 0.8;
      this.aviso.classList.toggle("pde-oculto", !alto);
      if (alto) this.aviso.replaceChildren(icone("alerta", 16), h("span", null, this.t.uso80));
    }

    painelEspelho(g) {
      const t = this.t;
      const word = g && g.etapas.word && g.etapas.word.json;
      return h("div", { class: "pde-espelho" },
        h("strong", null, t.espelhoTitulo),
        h("ol", null, t.espelhoPassos.map((p) => h("li", null, p))),
        h("button", { class: "pde-botao pde-botao--secundario pde-botao--pequeno", type: "button",
          onclick: () => this.abrirEspelho("falha", word) }, t.espelhoAbrir));
    }

    async abrirEspelho(motivo, json) {
      let copiado = false;
      if (json && navigator.clipboard) {
        try { await navigator.clipboard.writeText(JSON.stringify(json, null, 1)); copiado = true; } catch { copiado = false; }
      }
      if (copiado) this.anuncio.textContent = this.t.espelhoCopiado;
      if (!avisarPagina("pop:espelho", { motivo, copiado, url: CFG.espelhoUrl })) {
        window.open(CFG.espelhoUrl, "_blank", "noopener");
      }
    }

    ajustarAltura() {
      this.entrada.style.height = "auto";
      // GUARDA: vazio, volta a uma linha (o placeholder quebrado não deve aumentar a caixa)
      if (this.entrada.value) this.entrada.style.height = `${Math.min(this.entrada.scrollHeight, 180)}px`;
      else this.entrada.style.height = "";
    }

    teclado(e) {
      if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
        e.preventDefault();
        this.enviar();
      }
    }

    colar(e) {
      const arquivos = [...((e.clipboardData && e.clipboardData.files) || [])];
      if (arquivos.length) { e.preventDefault(); this.adicionarArquivos(arquivos); }
    }

    atualizarCompositor() {
      const t = this.t;
      const bloqueado = this.ocupado || this.gerando || this.semSessao;
      const preparando = this.pendentes.some((p) => p.estado === "preparando");
      this.botaoEnviar.disabled = bloqueado || preparando;
      this.botaoAnexar.disabled = this.gerando || this.semSessao;
      this.botaoGravar.disabled = bloqueado || !(navigator.mediaDevices && (window.AudioContext || window.webkitAudioContext));
      this.entrada.disabled = this.semSessao;
      const nomeTipo = this.tipo && t.tipos[this.tipo];
      this.entrada.placeholder = this.gerando ? t.placeholderGerando
        : this.modo === "auditoria" && !this.auditado ? t.placeholderAuditoria : nomeTipo ? t.placeholderTipo : t.placeholder;
      this.etiquetaEl.replaceChildren(...(nomeTipo ? [h("span", { class: "pde-tipo-etiqueta" },
        h("span", null, fmt(t.tipoEtiqueta, { tipo: nomeTipo })),
        h("button", { class: "pde-tipo-etiqueta-x", type: "button", title: t.tipoRemover, "aria-label": t.tipoRemover,
          disabled: this.gerando || null, onclick: () => this.escolherTipo("") }, icone("x", 14)))] : []));
      const conversou = this.historico.some((m) => m.papel === "assistente" && m.tipo !== "geracao" && m.tipo !== "pedido_auditoria");
      this.botaoGerar.disabled = bloqueado || preparando || !conversou;
    }

    anexosDaConversa() {
      const lista = [];
      for (const m of this.historico) for (const a of m.anexos || []) lista.push(a);
      for (const p of this.pendentes) if (p.anexo && p.estado === "pronto") lista.push(p.anexo);
      return lista;
    }

    adicionarArquivos(arquivos) {
      const t = this.t;
      for (const arquivo of arquivos) {
        const ehAudio = (arquivo.type || "").startsWith("audio/") || /^(wav|mp3|m4a|aac|ogg|oga|opus|flac|webm)$/.test(extensao(arquivo.name));
        if (ehAudio) { this.transcreverArquivo(arquivo); continue; }
        const ocupados = this.anexosDaConversa().length + this.pendentes.filter((p) => p.estado === "preparando").length;
        if (ocupados >= ANEXOS.maximo) { this.mostrarErro(fmt(t.anexoMax, { n: ANEXOS.maximo })); break; }
        const p = { id: novoId(), nome: arquivo.name || "arquivo", estado: "preparando" };
        this.pendentes.push(p);
        this.prepararAnexo(arquivo, p.id).then((anexo) => { p.anexo = anexo; p.estado = "pronto"; })
          .catch((e) => { p.estado = "erro"; p.erro = e instanceof ErroApi ? this.mensagemDeErro(e) : e.message; })
          .finally(() => { this.renderizarPendentes(); this.atualizarCompositor(); });
      }
      this.renderizarPendentes();
      this.atualizarCompositor();
    }

    async prepararAnexo(arquivo, id) {
      const t = this.t;
      const ext = extensao(arquivo.name);
      const nome = arquivo.name || "arquivo";
      if (["doc", "ppt", "xls"].includes(ext)) throw new Error(t.anexoDoc);
      if (EXT_OFFICE.has(ext) || EXT_TEXTO.has(ext) || (arquivo.type || "").startsWith("text/")) {
        let texto;
        if (EXT_OFFICE.has(ext)) {
          try { texto = await textoDoOffice(arquivo); } catch (e) {
            throw new Error(e.message === "navegador" ? t.anexoNavegador : t.anexoVazio);
          }
        } else {
          texto = (await arquivo.text()).trim();
        }
        if (!texto) throw new Error(t.anexoVazio);
        texto = texto.slice(0, ANEXOS.texto);
        await banco.gravar(`anexo:${id}`, texto);
        return { id, tipo: "texto", nome, tamanho: texto.length };
      }
      let mime = (arquivo.type || "").toLowerCase();
      if (!MIME_POR_EXT[ext] && !/^image\/|^application\/pdf$/.test(mime)) throw new Error(t.anexoTipo);
      mime = /^image\/|^application\/pdf$/.test(mime) ? mime : MIME_POR_EXT[ext];
      let blob = arquivo;
      let miniatura = null;
      if (mime.startsWith("image/")) {
        try {
          ({ blob, miniatura } = await reduzirImagem(arquivo));
          mime = "image/jpeg";
        } catch {
          // GUARDA: HEIC num navegador que não abre o formato é recusado, porque o original levaria o EXIF (local e aparelho)
          throw new Error(/heic|heif/.test(mime) ? t.anexoHeic : t.anexoTipo);
        }
      } else if (mime !== "application/pdf") {
        throw new Error(t.anexoTipo);
      }
      if (blob.size > ANEXOS.porArquivoMb * 1048576) throw new Error(fmt(t.anexoGrande, { mb: ANEXOS.porArquivoMb }));
      if (mime === "application/pdf" && (await paginasDoPdf(blob)) > ANEXOS.paginasPdf) {
        throw new Error(fmt(t.anexoPaginas, { n: ANEXOS.paginasPdf }));
      }
      const total = this.anexosDaConversa().reduce((s, a) => s + (a.tipo === "arquivo" ? a.tamanho || 0 : 0), 0);
      if (total + blob.size > ANEXOS.totalMb * 1048576) throw new Error(fmt(t.anexoTotal, { mb: ANEXOS.totalMb }));
      await banco.gravar(`anexo:${id}`, blob);
      return { id, tipo: "arquivo", nome, mime, tamanho: blob.size, miniatura };
    }

    renderizarPendentes() {
      const t = this.t;
      const filhos = this.pendentes.map((p) =>
        h("span", { class: "pde-anexo", "data-estado": p.estado, title: p.erro || p.nome },
          p.estado === "preparando" ? h("span", { class: "pde-giro", "aria-hidden": "true" })
            : p.anexo && p.anexo.miniatura ? h("img", { class: "pde-anexo-mini", src: p.anexo.miniatura, alt: "" })
              : icone(p.estado === "erro" ? "alerta" : "clipe", 16),
          h("span", { class: "pde-anexo-nome" }, p.estado === "erro" ? `${p.nome}: ${p.erro}`
            : p.estado === "preparando" ? `${p.nome} (${t.preparandoAnexo})` : p.nome),
          h("button", { type: "button", "aria-label": `${t.remover} ${p.nome}`,
            onclick: () => { this.pendentes = this.pendentes.filter((x) => x !== p); this.renderizarPendentes(); this.atualizarCompositor(); } }, "×")));
      const temFoto = this.pendentes.some((p) => p.anexo && p.anexo.mime && p.anexo.mime.startsWith("image/"));
      if (temFoto) filhos.push(h("p", { class: "pde-pendentes-nota" }, `${t.avisoFoto} ${t.dicaFoto}`));
      this.pendentesEl.replaceChildren(...filhos);
    }

    async iniciarGravacao() {
      if (this.gravador || this.semSessao) return;
      this.blocosAudio = [];
      this.gravador = new GravadorEmBlocos((bloco) => this.transcreverBloco(bloco));
      try {
        await this.gravador.iniciar();
      } catch {
        if (this.gravador) this.gravador.cancelar();
        this.gravador = null;
        this.mostrarErro(this.t.microfoneNegado);
        return;
      }
      this.modoGravacao(true);
      this.cronometro = setInterval(() => {
        const s = this.gravador ? this.gravador.segundos : 0;
        this.tempoGravacao.textContent = relogio(s);
        if (s >= AUDIO.maximoS) this.concluirGravacao();
      }, 250);
    }

    transcreverBloco(bloco) {
      const item = { indice: bloco.indice, texto: "", erro: null };
      this.blocosAudio.push(item);
      if (bloco.mudo || bloco.oculto) { item.promessa = Promise.resolve(); return; }
      const tentar = (n) => this.api.transcrever(bloco, this.idioma).then((texto) => { item.texto = texto; })
        .catch((e) => { if (n > 0 && !(e instanceof ErroApi && [401, 403, 413].includes(e.status))) return tentar(n - 1); item.erro = e; });
      item.promessa = tentar(1);
    }

    modoGravacao(sim) {
      for (const el of [this.entrada, this.botaoAnexar, this.botaoGravar, this.botaoEnviar]) el.classList.toggle("pde-oculto", sim);
      for (const el of [this.painelGravacao, this.botaoCancelarGravacao, this.botaoEnviarAudio]) el.classList.toggle("pde-oculto", !sim);
      if (!sim) { clearInterval(this.cronometro); this.tempoGravacao.textContent = "0:00"; }
    }

    cancelarGravacao() {
      if (this.gravador) this.gravador.cancelar();
      this.gravador = null;
      this.blocosAudio = [];
      this.modoGravacao(false);
      if (this.idiomaPendente) this.redesenhar();
    }

    async concluirGravacao() {
      const gravador = this.gravador;
      if (!gravador) return;
      const segundos = gravador.segundos;
      this.gravador = null;
      this.modoGravacao(false);
      gravador.parar();
      this.ocupado = true;
      this.atualizarCompositor();
      this.mostrarDigitando(true, this.t.transcrevendo);
      // GUARDA: espera TODOS os blocos voltarem antes de montar a mensagem (o último trecho não se perde)
      await Promise.all(this.blocosAudio.map((b) => b.promessa));
      this.mostrarDigitando(false);
      this.ocupado = false;
      const blocos = this.blocosAudio.sort((a, b) => a.indice - b.indice);
      this.blocosAudio = [];
      const falha = blocos.find((b) => b.erro);
      const texto = blocos.map((b) => b.texto).filter(Boolean).join(" ").trim();
      if (falha && this.tratarErroEspecial(falha.erro)) { this.atualizarCompositor(); return; }
      if (!texto) {
        this.mostrarErro(falha ? this.mensagemDeErro(falha.erro) : segundos < 1.5 ? this.t.audioCurto : this.t.audioSemFala);
        this.atualizarCompositor();
        return;
      }
      if (falha) this.mostrarErro(this.mensagemDeErro(falha.erro));
      const numero = this.historico.filter((m) => m.gravacao).length + 1;
      const cabecalho = fmt(this.t.gravacaoCabecalho, { n: numero, duracao: duracaoLonga(segundos) });
      await this.enviar(undefined, { texto: `${cabecalho}\n${texto}`, gravacao: true });
      if (this.idiomaPendente) this.redesenhar();
    }

    async transcreverArquivo(arquivo) {
      const t = this.t;
      if (this.ocupado || this.gerando || this.semSessao) return;
      if (arquivo.size > AUDIO.arquivoMb * 1048576) { this.mostrarErro(fmt(t.anexoGrande, { mb: AUDIO.arquivoMb })); return; }
      this.ocupado = true;
      this.atualizarCompositor();
      this.mostrarDigitando(true, t.transcrevendo);
      let texto = "";
      let erro = null;
      try {
        const pcm = await pcmDoArquivo(arquivo);
        const passo = AUDIO.taxa * 60;
        const partes = [];
        for (let i = 0, indice = 0; i < Math.min(pcm.length, AUDIO.taxa * 600); i += passo, indice++) {
          const trecho = pcm.subarray(i, Math.min(pcm.length, i + passo));
          if (picoRms(trecho) < AUDIO.silencio) continue;
          partes.push(await this.api.transcrever({ indice, segundos: trecho.length / AUDIO.taxa, wav: wavDe(trecho) }, this.idioma));
        }
        texto = partes.filter(Boolean).join(" ").trim();
      } catch (e) {
        erro = e;
      }
      this.mostrarDigitando(false);
      this.ocupado = false;
      this.atualizarCompositor();
      if (erro && this.tratarErroEspecial(erro)) return;
      if (!texto) { this.mostrarErro(erro ? this.mensagemDeErro(erro) : t.audioSemFala); return; }
      await this.enviar(undefined, { texto: `${fmt(t.audioArquivoCabecalho, { nome: arquivo.name || "" })}\n${texto}`, gravacao: true });
    }

    async enviar(textoForcado, extra) {
      if (this.ocupado || this.gerando || this.semSessao) return;
      if (this.pendentes.some((p) => p.estado === "preparando")) { this.mostrarErro(this.t.aguardeAnexos); return; }
      const digitado = this.entrada.value.trim();
      const partes = [];
      if (extra && extra.texto) {
        partes.push(extra.texto);
        if (digitado) partes.push(`${this.t.notaCabecalho} ${digitado}`);
      } else {
        partes.push(digitado);
      }
      if (textoForcado) partes.push(textoForcado);
      const texto = partes.filter(Boolean).join("\n\n");
      const anexos = this.pendentes.filter((p) => p.estado === "pronto").map((p) => p.anexo);
      if (!texto && !anexos.length) return;
      this.adicionar({ papel: "usuario", texto, anexos, gravacao: Boolean(extra && extra.gravacao) || undefined, hora: Date.now() });
      this.entrada.value = "";
      this.ajustarAltura();
      this.pendentes = this.pendentes.filter((p) => p.estado === "erro");
      this.renderizarPendentes();
      await this.conversar();
    }

    historicoParaApi(semGeracao) {
      return this.historico.filter((m) => !(semGeracao && m.tipo === "geracao" && m.geracaoId === semGeracao)).map((m) => ({
        papel: m.papel === "usuario" ? "usuario" : "assistente",
        texto: m.texto || "",
        anexos: (m.anexos || []).map((a) => ({ nome: a.nome })),
      })).filter((m) => m.texto || m.anexos.length);
    }

    async anexosParaGeracao() {
      const saida = [];
      const perdidos = [];
      for (const a of this.anexosDaConversa().slice(0, ANEXOS.maximo)) {
        const dado = await banco.ler(`anexo:${a.id}`);
        if (dado === undefined || dado === null) { perdidos.push(a.nome); continue; }
        if (a.tipo === "texto") saida.push({ tipo: "texto", nome: a.nome, texto: String(dado) });
        else saida.push({ nome: a.nome, mime: a.mime, dados: await blobParaBase64(dado) });
      }
      for (const nome of perdidos) this.mostrarErro(fmt(this.t.anexoIndisponivel, { nome }));
      return saida;
    }

    async auditar() {
      if (!this.anexosDaConversa().length) {
        this.adicionar({ papel: "assistente", tipo: "pedido_auditoria", texto: this.t.auditoriaLembrete, hora: Date.now() });
        return;
      }
      this.ocupado = true;
      this.atualizarCompositor();
      this.mostrarDigitando(true, this.t.auditando);
      try {
        const r = await this.api.json("auditar", { historico: this.historicoParaApi(), anexos: await this.anexosParaGeracao() });
        this.mostrarDigitando(false);
        this.atualizarUso(r.uso_dia);
        if (r.texto) this.auditado = true;
        this.adicionar({ papel: "assistente", texto: r.texto || (r.aviso ? this.t.erros[r.aviso] : "") || this.t.erros.pop_ia_sem_resposta,
          hora: Date.now() });
      } catch (e) {
        this.mostrarDigitando(false);
        if (!this.tratarErroEspecial(e, () => this.conversar())) this.mostrarErro(this.mensagemDeErro(e), () => this.conversar());
      } finally {
        this.ocupado = false;
        this.atualizarCompositor();
      }
    }

    async conversar() {
      if (this.modo === "auditoria" && !this.auditado) { await this.auditar(); return; }
      this.ocupado = true;
      this.atualizarCompositor();
      this.mostrarDigitando(true);
      try {
        const r = await this.api.json("conversa", { historico: this.historicoParaApi(), ...(this.tipo ? { tipo_escolhido: this.tipo } : {}),
          ...(this.modo === "auditoria" ? { revisao: true } : {}) });
        this.mostrarDigitando(false);
        this.atualizarUso(r.uso_dia);
        if (r.acao === "gerar" && r.brief) {
          this.adicionar({ papel: "assistente", texto: r.texto || this.t.combinado, hora: Date.now() });
          this.ocupado = false;
          await this.iniciarGeracao(r.brief);
        } else {
          const texto = r.texto || (r.aviso ? this.t.erros[r.aviso] : "") || this.t.erros.pop_ia_sem_resposta;
          this.adicionar({ papel: "assistente", texto, hora: Date.now() });
        }
      } catch (e) {
        this.mostrarDigitando(false);
        if (!this.tratarErroEspecial(e, () => this.conversar())) this.mostrarErro(this.mensagemDeErro(e), () => this.conversar());
      } finally {
        this.ocupado = false;
        this.atualizarCompositor();
        if (this.idiomaPendente && !this.gerando) this.redesenhar();
        if (!this.gerando && !this.semSessao && window.matchMedia && window.matchMedia("(pointer: fine)").matches) this.entrada.focus();
      }
    }

    novaGeracao(brief, formatos) {
      const g = { id: Date.now().toString(36), brief, formatos, etapas: {}, inicio: Date.now(), fim: null };
      for (const f of FORMATOS) g.etapas[f] = { estado: formatos.includes(f) ? "aguardando" : "pulado" };
      return g;
    }

    async iniciarGeracao(brief) {
      if (this.gerando) return;
      const pedidos = Array.isArray(brief.formatos) && brief.formatos.length ? brief.formatos : FORMATOS;
      const formatos = FORMATOS.filter((f) => f === "word" || (pedidos.includes(f) && this.config[f] !== false));
      this.substituirGeracao(this.novaGeracao(brief, formatos));
      this.adicionar({ papel: "assistente", tipo: "geracao", geracaoId: this.geracao.id, texto: this.t.notaGerando, hora: Date.now() });
      await this.continuarGeracao(this.geracao);
    }

    substituirGeracao(g) {
      if (this.geracao) {
        for (const f of FORMATOS) {
          const e = this.geracao.etapas[f];
          if (e && e.arquivo) URL.revokeObjectURL(e.arquivo.url);
        }
        const antigo = this.cartoes.get(this.geracao.id);
        if (antigo) {
          const b = h("div", { class: "pde-balao pde-md", dir: "auto" });
          b.innerHTML = markdown(this.notaDaGeracao(this.geracao));
          antigo.el.replaceWith(b);
          this.cartoes.delete(this.geracao.id);
        }
      }
      this.geracao = g;
    }

    async continuarGeracao(g) {
      if (g !== this.geracao) return;
      const ativos = (f) => ["trabalhando", "montando"].includes(g.etapas[f].estado);
      if (FORMATOS.some(ativos)) return;
      this.gerando = true;
      g.fim = null;
      this.atualizarCompositor();
      const cartao = () => this.cartoes.get(g.id);
      const relogioCartao = setInterval(() => { const c = cartao(); if (c) c.atualizar(); }, 1000);
      try {
        for (const f of g.formatos) if (g.etapas[f].estado === "erro") g.etapas[f].estado = g.etapas[f].json ? "salvo" : "aguardando";
        if (cartao()) cartao().atualizar();
        if (g.formatos.includes("word") && !g.etapas.word.json) {
          try {
            await this.gerarEtapa(g, "word");
          } catch (e) {
            this.falhaEtapa(g, "word", e);
            return;
          }
        }
        await Promise.all(g.formatos.map(async (f) => {
          const e = g.etapas[f];
          if (e.arquivo) return;
          try {
            if (!e.json) await this.gerarEtapa(g, f);
            if (f === "ppt" && !e.ilustrado) await this.ilustrar(g);
            await this.montarArquivo(g, f);
            this.anuncio.textContent = fmt(this.t.prontoParaBaixar, { nome: this.t.etapas[f] });
          } catch (erro) {
            this.falhaEtapa(g, f, erro);
          }
        }));
      } finally {
        clearInterval(relogioCartao);
        g.fim = Date.now();
        this.gerando = false;
        const entrada = this.historico.find((m) => m.tipo === "geracao" && m.geracaoId === g.id);
        if (entrada) entrada.texto = this.notaDaGeracao(g);
        this.salvarConversa();
        if (cartao()) cartao().atualizar();
        this.atualizarCompositor();
        if (this.idiomaPendente) this.redesenhar();
      }
    }

    notaDaGeracao(g) {
      const t = this.t;
      const prontos = g.formatos.filter((f) => g.etapas[f].json);
      if (!prontos.length) return t.notaFalhou;
      const nomes = { word: "Word", excel: "Excel", ppt: "PowerPoint" };
      return fmt(t.notaGerado, { titulo: (g.brief && g.brief.titulo_processo) || "", lista: prontos.map((f) => nomes[f]).join(", ") });
    }

    falhaEtapa(g, f, e) {
      const etapa = g.etapas[f];
      etapa.estado = "erro";
      if (this.tratarErroEspecial(e)) etapa.erro = "";
      else etapa.erro = this.mensagemDeErro(e);
      const c = this.cartoes.get(g.id);
      if (c) c.atualizar();
    }

    async gerarEtapa(g, f) {
      const etapa = g.etapas[f];
      Object.assign(etapa, { estado: "trabalhando", fase: f === "word" ? "literatura" : "preparando", caracteres: 0, erro: null });
      const atualizar = () => { const c = this.cartoes.get(g.id); if (c) c.atualizarLinha(f); };
      atualizar();
      let resultado = null, erro = null;
      const corpo = { etapa: f, brief: g.brief };
      if (f === "word") {
        corpo.historico = this.historicoParaApi(g.id);
        corpo.anexos = await this.anexosParaGeracao();
        if (this.modo === "auditoria") corpo.revisao = true;
      } else {
        corpo.word = g.etapas.word.json;
        if (f === "ppt" && g.etapas.excel && g.etapas.excel.json) corpo.excel = g.etapas.excel.json;
      }
      await this.api.fluxo("gerar", corpo, (evento, dados) => {
        if (evento === "progresso") {
          etapa.fase = dados.fase || etapa.fase;
          if (dados.caracteres) etapa.caracteres = dados.caracteres;
          if (dados.pendencias) etapa.pendencias = dados.pendencias;
          if (dados.secoes) etapa.secoes = dados.secoes;
          atualizar();
        } else if (evento === "resultado") resultado = dados;
        else if (evento === "erro") erro = dados;
      });
      const usoDia = (resultado && resultado.uso_dia) || (erro && erro.uso_dia);
      if (usoDia) this.atualizarUso(usoDia);
      if (!resultado || !resultado.json) {
        if (erro) throw new ErroApi(502, erro.error, erro);
        throw new Error(this.t.semResultado);
      }
      Object.assign(etapa, { json: resultado.json, avisos: resultado.avisos || [], uso: resultado.uso || null,
        literatura: resultado.literatura || null, estado: "salvo" });
      if (f === "word") {
        const meta = resultado.json.metadata || {};
        g.brief = Object.assign({}, g.brief, { titulo_processo: meta.titulo_processo || g.brief.titulo_processo, codigo: meta.codigo });
      }
      this.salvarConversa();
      atualizar();
    }

    async ilustrar(g) {
      const etapa = g.etapas.ppt;
      Object.assign(etapa, { estado: "trabalhando", fase: "ilustrando" });
      const c = this.cartoes.get(g.id);
      if (c) c.atualizarLinha("ppt");
      try {
        const r = await this.api.json("imagens", { ppt: etapa.json });
        this.atualizarUso(r.uso_dia);
        const ilustracoes = {};
        for (const img of r.imagens || []) {
          try {
            const { blob } = await reduzirImagem(base64ParaBlob(img.base64, img.mime), FOTO.lado, FOTO.qualidade);
            ilustracoes[img.numero] = await blobParaBase64(blob);
          } catch {   }
        }
        if ((r.falhas || []).length) etapa.avisos = [...(etapa.avisos || []), this.t.erros.pop_imagem_falhou];
        await banco.gravar(`ilustracoes:${g.id}`, ilustracoes);
      } catch (e) {
        if (e instanceof ErroApi && e.codigo === "pop_teto_diario") this.atualizarUso(e.extra.uso_dia);
        etapa.avisos = [...(etapa.avisos || []), this.t.erros.pop_imagem_falhou];
      }
      etapa.ilustrado = true;
      etapa.estado = "salvo";
      this.salvarConversa();
    }

    async montarArquivo(g, f) {
      const etapa = g.etapas[f];
      etapa.estado = "montando";
      etapa.desde = Date.now();
      const c = this.cartoes.get(g.id);
      if (c) c.atualizarLinha(f);
      try {
        const corpo = { [f]: etapa.json, cor: this.config.cor, logo_b64: this.config.logo || null, estilo: this.config.estilo };
        if (f === "ppt") corpo.imagens = (await banco.ler(`ilustracoes:${g.id}`)) || null;
        const r = await this.api.json("renderizar", corpo);
        const arquivo = (r.arquivos || []).find((a) => a.formato === f);
        if (!arquivo) throw new ErroApi(422, "pop_motor_falhou");
        if (etapa.arquivo) URL.revokeObjectURL(etapa.arquivo.url);
        etapa.arquivo = { nome: arquivo.nome, tamanho: arquivo.tamanho,
          url: URL.createObjectURL(base64ParaBlob(arquivo.base64, arquivo.mime)) };
        etapa.estado = "pronto";
      } catch (e) {
        etapa.estado = "salvo";
        throw e;
      } finally {
        etapa.desde = null;
        if (c) c.atualizar();
      }
    }

    async montarEBaixar(g, f) {
      try {
        await this.montarArquivo(g, f);
        const e = g.etapas[f];
        if (e.arquivo) {
          const link = h("a", { href: e.arquivo.url, download: e.arquivo.nome, class: "pde-oculto" });
          document.body.append(link);
          link.click();
          link.remove();
        }
      } catch (e) {
        this.falhaEtapa(g, f, e);
      }
    }

    async montarDeNovo(g) {
      if (this.gerando) return;
      this.gerando = true;
      this.atualizarCompositor();
      try {
        await Promise.all(g.formatos.filter((f) => g.etapas[f].json).map((f) =>
          this.montarArquivo(g, f).catch((e) => this.falhaEtapa(g, f, e))));
      } finally {
        this.gerando = false;
        this.atualizarCompositor();
      }
    }

    restaurarGeracao(g) {
      for (const f of FORMATOS) {
        const e = g.etapas && g.etapas[f];
        if (!e) { (g.etapas = g.etapas || {})[f] = { estado: "pulado" }; continue; }
        delete e.arquivo;
        if (e.estado !== "pulado") e.estado = e.json ? "salvo" : "erro";
        if (e.estado === "erro" && !e.erro) e.erro = "";
      }
      g.fim = g.fim || Date.now();
      return g;
    }

    abrirConfiguracoes() {
      this.atualizarConfiguracoes();
      this.dialogoConfig.showModal();
    }

    atualizarConfiguracoes() {
      const t = this.t;
      const cor = String(this.config.cor || CORES[0]).toUpperCase();
      this.coresEl.replaceChildren(...CORES.map((c) => h("button", { class: "pde-cor", type: "button", style: `background:${c}`,
        title: c, "aria-label": c, "aria-pressed": String(c === cor), onclick: () => this.definirCor(c) })));
      this.corLivre.value = /^#[0-9A-F]{6}$/i.test(cor) ? cor.toLowerCase() : "#283264";
      this.logoPrevia.replaceChildren(this.config.logo ? h("img", { src: this.config.logo, alt: t.cfgLogo }) : t.cfgLogoSem);
      this.botaoRemoverLogo.classList.toggle("pde-oculto", !this.config.logo);
      for (const r of this.dialogoConfig.querySelectorAll('input[name="pde-estilo"]')) r.checked = r.value === this.config.estilo;
      const permitidos = (this.tipo && this.formatosPorTipo[this.tipo]) || FORMATOS;
      for (const f of ["excel", "ppt"]) {
        const c = this.dialogoConfig.querySelector(`input[name="pde-${f}"]`);
        if (!c) continue;
        c.disabled = !permitidos.includes(f);
        c.checked = !c.disabled && this.config[f] !== false;
      }
      const restrito = permitidos.length < FORMATOS.length;
      this.notaFormatos.textContent = restrito ? fmt(t.cfgFormatoNaoSeAplica, { tipo: t.tipos[this.tipo] }) : "";
      this.notaFormatos.classList.toggle("pde-oculto", !restrito);
    }

    definirCor(cor) {
      this.config.cor = String(cor).toUpperCase();
      this.salvarConfig();
      this.atualizarConfiguracoes();
    }

    async escolherLogo() {
      const arquivo = this.seletorLogo.files[0];
      this.seletorLogo.value = "";
      if (!arquivo) return;
      try {
        if (arquivo.size > 5 * 1024 * 1024) throw new Error();
        this.config.logo = await logoParaPng(arquivo);
        this.salvarConfig();
      } catch {
        this.logoPrevia.replaceChildren(this.t.logoInvalido);
        return;
      }
      this.atualizarConfiguracoes();
    }

    salvarConfig() {
      armazenamento.gravar("config", this.config);
    }

    salvarConversa() {
      if (this.semSessao) return;
      const geracao = this.geracao ? JSON.parse(JSON.stringify(this.geracao, (k, v) => (k === "arquivo" ? undefined : v))) : null;
      const tipo = this.tipo || undefined;
      const modo = this.modo || undefined;
      const auditado = this.auditado || undefined;
      if (!armazenamento.gravar("conversa", { historico: this.historico, geracao, tipo, modo, auditado })) {
        armazenamento.gravar("conversa", { historico: this.historico, geracao: null, tipo, modo, auditado });
      }
    }

    async novaConversa() {
      if (this.gerando) return;
      if (this.historico.length) { this.pedirConfirmacaoNova(); return; }
      await this.apagarConversa();
    }

    /** GUARDA: confirma dentro do widget. window.confirm não aparece em quadro com sandbox, e o navegador responde "não" sozinho. */
    pedirConfirmacaoNova() {
      const t = this.t;
      const apagar = h("button", { class: "pde-botao pde-botao--primario pde-botao--pequeno", type: "button",
        onclick: async () => {
          this.fecharConfirmacao();
          if (!this.gerando) await this.apagarConversa();
        } }, t.novoDocumento);
      this.confirmacao.replaceChildren(
        h("p", { class: "pde-confirmacao-texto" }, t.confirmarNova),
        h("div", { class: "pde-confirmacao-acoes" },
          h("button", { class: "pde-botao pde-botao--secundario pde-botao--pequeno", type: "button",
            onclick: () => this.fecharConfirmacao() }, t.cancelar),
          apagar));
      this.confirmacao.classList.remove("pde-oculto");
      apagar.focus();
    }

    fecharConfirmacao(foco = true) {
      if (!this.confirmacao || this.confirmacao.classList.contains("pde-oculto")) return;
      this.confirmacao.classList.add("pde-oculto");
      this.confirmacao.replaceChildren();
      if (foco && this.botaoNova) this.botaoNova.focus();
    }

    async apagarConversa() {
      armazenamento.apagar("conversa");
      await banco.apagarTudo();
      this.recomecar();
      this.entrada.value = "";
      this.ajustarAltura();
    }

    async verificarServico() {
      try {
        const r = await this.api.json("saude");
        this.atualizarUso(r.uso_dia);
        this.formatosPorTipo = r.formatos_por_tipo || {};
        if ((r.corpus && r.corpus.error) || (r.motor && r.motor.error)) throw new ErroApi(503, "pop_corpus_indisponivel");
      } catch (e) {
        if (this.tratarErroEspecial(e)) return;
        if (e instanceof ErroApi && e.codigo === "pop_desativado") {
          this.mostrarErro(this.mensagemDeErro(e));
          return;
        }
        const aviso = h("div", { class: "pde-alerta pde-alerta--aviso", role: "status" }, icone("alerta", 20),
          h("span", { class: "pde-alerta-texto" }, this.t.servicoIndisponivel));
        this.lista.prepend(aviso);
      }
    }
  }

  function montar(el, opcoes) {
    if (!el || el.__popDeElite) return el && el.__popDeElite;
    el.__popDeElite = new PopDeElite(el, opcoes);
    return el.__popDeElite;
  }

  window.PopDeElite = { montar, versao: VERSAO, _interno: { markdown, fmt, picoRms, reamostrar, normalizarIdioma } };

  function auto() {
    document.querySelectorAll("#pop-de-elite, [data-pop-de-elite]").forEach((el) => montar(el));
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", auto);
  else auto();
})();
