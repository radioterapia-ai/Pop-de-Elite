// GUARDA: códigos de erro no formato do site, { "error": "<codigo>" }. Os oito primeiros são do
// error-codes.json do radioterapia.ai: não renomeie. As mensagens nos 12 idiomas ficam no widget.

import { ErroHttp } from "./util.js";

export const ERROS = {
  auth_required_expert: 401,
  email_not_verified: 403,
  expert_consent_required: 403,
  rate_limited: 429,
  payload_too_large: 413,
  invalid_json: 400,
  file_type_unsupported: 400,
  file_too_large: 400,
  pop_desativado: 503,
  pop_teto_diario: 429,
  pop_pedido_invalido: 400,
  pop_conversa_vazia: 400,
  pop_word_ausente: 400,
  pop_formato_nao_se_aplica: 400,
  pop_chave_invalida: 400,
  pop_chave_recusada: 403,
  pop_chave_sem_cota: 429,
  pop_chave_sem_modelo: 403,
  pop_auditoria_sem_anexo: 400,
  pop_anexos_demais: 400,
  pop_ia_indisponivel: 502,
  pop_ia_recusou: 422,
  pop_resposta_cortada: 502,
  pop_formato: 502,
  pop_corpus_indisponivel: 503,
  pop_imagem_falhou: 502,
  pop_motor_indisponivel: 504,
  pop_motor_token: 502,
  pop_motor_falhou: 422,
  pop_rota_inexistente: 404,
  pop_metodo_invalido: 405,
  pop_origem_recusada: 403,
  pop_erro_interno: 500,
};

/** GUARDA: `extra` vai junto na resposta: só números e códigos, nunca conteúdo. */
export function erro(codigo, extra) {
  return new ErroHttp(ERROS[codigo] || 500, codigo, extra);
}
