
import { TIPOS_DOCUMENTO } from "../regras.js";
import { montarSistema, preencher } from "./montar.js";
import { AGENTES, IDENTIDADE } from "./textos.js";

export const FUNCAO_GERAR = {
  name: "gerar_documentos",
  description:
    "Gera os documentos da qualidade (Word, Excel de auditoria e PPT de treinamento) a partir do que " +
    "foi levantado na conversa. Chame quando o usuário pedir para gerar ou quando já houver informação suficiente " +
    "e ele confirmar. Nunca escreva o documento no chat: chame esta função.",
  parameters: {
    type: "OBJECT",
    properties: {
      tipo_documento: { type: "STRING", enum: TIPOS_DOCUMENTO,
        description: "Tipo documental. Normativos: POP, POL (Política), PROT (Protocolo), DIR (Diretriz), PLAN (Plano), " +
          "NOR (Norma), PROG (Programa), REG (Regimento), MAN (Manual). Apoio: FTI (Ficha Técnica de Indicadores), " +
          "CONS (TCLE), TERM (Termo de Ciência), CHK (Checklist), FORM (Formulário), INF (Informativo), " +
          "NT (Nota Técnica), COD (Código de Conduta)." },
      publico: { type: "STRING", enum: ["paciente", "interno"],
        description: "Para quem é o documento de apoio: paciente (entregue ou assinado por paciente, familiar ou " +
          "acompanhante) ou interno (equipe). Só conta em FORM e INF; nos outros tipos o sistema define." },
      natureza_processo: { type: "STRING", enum: ["assistencial", "tecnico", "radiotecnico", "gestao", "misto"],
        description: "Quem sofre o dano se o processo falhar (ver natureza_do_processo)." },
      titulo_processo: { type: "STRING", description: "Nome completo do processo, no idioma do usuário." },
      setor: { type: "STRING", description: "Setor ou serviço responsável." },
      sigla_setor: { type: "STRING", description: "Sigla curta do setor em maiúsculas (2 a 6 letras), ex.: RTX, UTI, CC, FAR." },
      idioma: { type: "STRING", enum: ["pt", "en", "es"], description: "Idioma da conversa e dos documentos." },
      instituicao: { type: "STRING", description: "Nome da instituição, se informado." },
      elaborado_por_nome: { type: "STRING", description: "Nome de quem elabora, só se o usuário informou." },
      elaborado_por_cargo: { type: "STRING", description: "Cargo/registro de quem elabora, só se o usuário informou." },
      resumo_demanda: { type: "STRING",
        description: "Resumo fiel e completo de tudo o que foi levantado: escopo, setores, atores, sistemas (TASY/MV...), " +
          "equipamentos e marcas, passos e rotinas que o usuário descreveu, exigências locais e o conteúdo útil dos anexos." },
      premissas: { type: "ARRAY", items: { type: "STRING" }, description: "Suposições Padrão Ouro assumidas e validadas." },
      formatos: { type: "ARRAY", items: { type: "STRING", enum: ["word", "excel", "ppt"] },
        description: "Arquivos a gerar. Padrão: todos os que o tipo gera (o sistema confere a matriz do tipo)." },
      capitulos: { type: "ARRAY", items: { type: "STRING" },
        description: "2 a 6 IDs de capítulos do índice dos Tratados mais relevantes (ex.: V1-C17)." },
      termos_busca: { type: "ARRAY", items: { type: "STRING" },
        description: "6 a 15 termos de busca EM PORTUGUÊS para localizar as seções dos Tratados." },
      publico_treinamento: { type: "STRING", description: "Público-alvo do treinamento (PPT), ex.: multiprofissional." },
      referenciais: { type: "ARRAY", items: { type: "STRING" },
        description: "Nome da acreditação ou certificação a que o usuário PEDIU para alinhar o documento. " +
          "Vazio na maioria dos casos: o documento segue boas práticas, sem certificadora." },
      classificacao: { type: "STRING", enum: ["publico", "interno", "restrito", "confidencial"],
        description: "Classificação de acesso do documento, só se o usuário informou. Sem ela, o sistema usa " +
          "interno, ou público nos documentos para paciente." },
    },
    required: ["tipo_documento", "natureza_processo", "titulo_processo", "setor", "sigla_setor", "idioma",
      "resumo_demanda", "formatos", "capitulos", "termos_busca"],
  },
};

export function sistemaConversa({ capitulos, hoje, tipoEscolhido, revisao }) {
  const partes = [montarSistema(IDENTIDADE.conselheiro, AGENTES.triagem, { CAPITULOS: capitulos, HOJE: hoje })];
  if (tipoEscolhido) partes.push(preencher(AGENTES.tipo_escolhido, { TIPO: tipoEscolhido }));
  if (revisao) partes.push(AGENTES.revisao);
  return partes.join("\n\n");
}
