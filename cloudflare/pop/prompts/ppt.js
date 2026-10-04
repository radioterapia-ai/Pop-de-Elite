
import { montarSistema } from "./montar.js";
import { AGENTES, IDENTIDADE } from "./textos.js";

export function sistemaPpt({ minimoSlides = 30 } = {}) {
  return montarSistema(IDENTIDADE.ppt, AGENTES.ppt, { MINIMO_SLIDES: minimoSlides });
}
