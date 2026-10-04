
import { gerarImagem } from "./gemini.js";
import { preencher } from "./prompts/montar.js";
import { AGENTES } from "./prompts/textos.js";
import { limitar } from "./util.js";

export const MAX_IMAGENS = 3;
export const SLIDES_DE_IMAGEM = ["imagem_web_direita", "imagem_web_esquerda", "imagem_web_panoramica"];

// GUARDA: proporção do espaço da imagem em cada layout do motor (motor/ppt.py): coluna de ~5,9 × 4 pol
// e faixa panorâmica de ~12 × 3 pol. Mudou o layout lá, muda a proporção aqui.
const PROPORCAO = { imagem_web_direita: "3:2", imagem_web_esquerda: "3:2", imagem_web_panoramica: "21:9" };

export function pedidosDeImagem(ppt) {
  const slides = ppt && Array.isArray(ppt.slides) ? ppt.slides : [];
  return slides
    .filter((s) => s && SLIDES_DE_IMAGEM.includes(s.tipo) && (s.imagem_prompt || s.imagem_query))
    .slice(0, MAX_IMAGENS)
    .map((s) => ({
      numero: Number(s.numero) || 0,
      proporcao: PROPORCAO[s.tipo],
      cena: limitar(String(s.imagem_prompt || s.imagem_query).replace(/\s+/g, " ").trim(), 700),
    }))
    .filter((p) => p.numero > 0 && p.cena);
}

export async function gerarImagens(cfg, pedidos) {
  const resultados = await Promise.allSettled(pedidos.map((p) =>
    gerarImagem(cfg, { prompt: preencher(AGENTES.imagem, { CENA: p.cena }), proporcao: p.proporcao })));
  const imagens = [];
  const falhas = [];
  const usos = [];
  resultados.forEach((r, i) => {
    const { numero } = pedidos[i];
    if (r.status === "fulfilled") {
      imagens.push({ numero, mime: r.value.mime, base64: r.value.base64 });
      usos.push(r.value.uso);
    } else {
      falhas.push({ numero, error: (r.reason && r.reason.codigo) || "pop_imagem_falhou" });
    }
  });
  return { imagens, falhas, usos };
}
