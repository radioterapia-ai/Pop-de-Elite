
import { montarSistema } from "./montar.js";
import { AGENTES, IDENTIDADE } from "./textos.js";

export function sistemaExcel() {
  return montarSistema(IDENTIDADE.planilha, AGENTES.planilha);
}
