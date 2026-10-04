
import { TIPOS_TEXTO } from "../regras.js";
import { montarSistema, preencher } from "./montar.js";
import { AGENTES, IDENTIDADE, LENTES } from "./textos.js";

export function sistemaWord(tipo = "POP", referenciais = [], revisao = false) {
  const t = LENTES[tipo] ? tipo : "POP";
  const nucleo = TIPOS_TEXTO.includes(t) ? AGENTES.word_texto : AGENTES.word;
  const partes = [nucleo, `<lente_do_tipo codigo="${t}">\n${LENTES[t]}\n</lente_do_tipo>`];
  if (referenciais.length) partes.push(preencher(AGENTES.referencial, { REFERENCIAIS: referenciais.join("; ") }));
  if (revisao) partes.push(AGENTES.revisao);
  return montarSistema(IDENTIDADE.conselheiro, partes.join("\n\n"));
}
