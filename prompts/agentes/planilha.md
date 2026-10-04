<!--
  Geração da planilha de gestão (Excel, modelo leve)
  Vai para a IA DEPOIS da identidade (prompts/identidade/conselheiro_planilha.md): a identidade diz quem responde;
  este arquivo diz qual é a tarefa no site.
  Este comentário não vai para a IA.
-->

Sua tarefa: transformar o documento institucional recebido (JSON) em uma planilha de gestão da qualidade com 6 abas. Responda APENAS com o objeto JSON, sem texto antes ou depois.

<regras>
• Extraia o conteúdo do documento recebido: passos críticos, papéis, riscos, barreiras, contingências, indicadores e setores. Preencha as abas 2 a 6 com dados REAIS cruzados do documento — nada genérico.
• Todo o texto no idioma do documento (metadata.idioma).
• NATUREZA DO PROCESSO (metadata.natureza_processo):
  - assistencial ou misto: o registro operacional segue o paciente (prontuário, dupla checagem) e a auditoria por rastreamento segue o paciente real, citando as Metas pelo número ("Meta 1").
  - tecnico, radiotecnico ou gestao: NÃO HÁ PACIENTE. Nada de colunas de paciente/prontuário, higienização das mãos, pulseira, consentimento ou Metas da OMS. O registro operacional segue o equipamento ou o processo (número de série, sala, executante, parâmetros medidos, visto do responsável técnico) e o Tracer segue o EQUIPAMENTO (do dossiê ao registro de calibração e à assinatura de liberação).
• REGRA DE CHÃO DE FÁBRICA: a 1ª aba é para imprimir e preencher à mão — no mínimo 12 linhas totalmente em branco ("").
• "colunas" e "linhas" sempre no nível da aba; "linhas" é sempre uma lista de listas de strings, cada linha com o mesmo número de colunas.
• Matriz de risco: Severidade e Probabilidade de 1 a 5 e Score = S × P (como texto numérico), ordenada do maior score para o menor.
• Painel de indicadores: os indicadores do documento com fórmula explícita (numerador / denominador), frequência, fonte e meta; "Status atual" em branco.
• Cadeia cliente-fornecedor: as áreas reais do documento, com SLA objetivo.
• Plano de ação 5W2H: linhas em branco para preenchimento (no mínimo 5).
</regras>

<esquema_json>
{
  "metadata_excel": {
    "arquivo": "Gestao_Qualidade_[NOME_PROCESSO].xlsx",
    "codigo": "PLAN-[SIGLA]-001",
    "foco_auditoria": "Auditoria interna",
    "setor": "do documento"
  },
  "planilhas": [
    {"nome_aba": "Registro_Operacional", "titulo": "Controle Diário e Registro de Execução (Chão de Fábrica)",
     "colunas": ["Data/Hora", "...colunas adequadas à natureza...", "Intercorrência?", "Visto Dupla Checagem"],
     "linhas": [["", "", "", ""]]},
    {"nome_aba": "Painel_Indicadores", "titulo": "Dashboard de Monitoramento de Qualidade",
     "colunas": ["ID", "Indicador", "Meta", "Fórmula (Numerador / Denominador)", "Frequência", "Fonte de Dados", "Status Atual"],
     "linhas": [["01", "...", "...", "...", "...", "...", ""]]},
    {"nome_aba": "Matriz_de_Risco", "titulo": "Matriz de Riscos",
     "colunas": ["Processo/Etapa", "Risco Identificado", "Severidade (1-5)", "Probabilidade (1-5)", "Score (S x P)", "Barreira Aplicada", "Plano de Contingência"],
     "linhas": [["...", "...", "5", "2", "10", "...", "..."]]},
    {"nome_aba": "Auditoria_Rastreamento", "titulo": "Checklist Reverso — Auditoria por Rastreamento",
     "colunas": ["Item Verificável (Passo Crítico)", "Conforme (S/N/NA)", "Evidência Registrada", "Entrevista com o Profissional", "Observações"],
     "linhas": [["...", "", "...", "...", ""]]},
    {"nome_aba": "Cadeia_Cliente_Fornecedor", "titulo": "Mapeamento Intersetorial e SLA de Entrega",
     "colunas": ["Setor Fornecedor", "Entrada (Input)", "Este Setor (Processamento)", "Saída (Output)", "Setor Cliente", "SLA Exigido"],
     "linhas": [["...", "...", "...", "...", "...", "..."]]},
    {"nome_aba": "Plano_de_Acao_PDCA", "titulo": "Gestão de Não Conformidades (5W2H)",
     "colunas": ["What (O quê)", "Why (Por quê)", "Where (Onde)", "When (Quando)", "Who (Quem)", "How (Como)", "How Much (Custo/Impacto)", "Status"],
     "linhas": [["", "", "", "", "", "", "", ""]]}
  ]
}
Os nomes das abas e os títulos acompanham o idioma do documento.
</esquema_json>
