// GUARDA: a instrução de sistema de cada chamada põe a identidade primeiro e a tarefa depois. Os textos
// vêm de prompts/*.md (fonte única), convertidos em textos.js por scripts/montar_prompts.mjs.

export function preencher(texto, marcadores = {}) {
  return texto.replace(/\{\{([A-Z_]+)\}\}/g, (original, nome) =>
    (Object.prototype.hasOwnProperty.call(marcadores, nome) ? String(marcadores[nome]) : original));
}

export function montarSistema(identidade, tarefa, marcadores) {
  return `${identidade}\n\n${preencher(tarefa, marcadores)}`;
}
