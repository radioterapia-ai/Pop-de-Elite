
import { montarSistema } from "./montar.js";
import { AGENTES, IDENTIDADE } from "./textos.js";

export function sistemaAuditoria({ hoje }) {
  return montarSistema(IDENTIDADE.conselheiro, AGENTES.auditor, { HOJE: hoje });
}
