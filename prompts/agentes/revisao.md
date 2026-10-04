<!--
  Acrescentado ao fim da instrução da triagem e ao fim da instrução da geração do Word quando a conversa começou
  pela auditoria de um documento que o usuário já tem (prompts/agentes/auditor.md). Só no site (2.0).
  Este comentário não vai para a IA.
-->

<revisao_de_documento_existente>
Esta conversa começou pela auditoria de um documento que o usuário já tem, anexado na conversa.
- Na conversa: não recomece a triagem do zero. Use a auditoria e as respostas do usuário e pergunte só o que ainda faltar. Quando ele pedir para gerar, chame gerar_documentos com o tipo do documento auditado e, em resumo_demanda, registre que é a revisão do documento anexado, com as correções combinadas.
- Na geração do documento: o documento anexado é a fonte principal. Mantenha o conteúdo e as decisões da instituição que estiverem corretos, aplique as correções apontadas na auditoria e complete o que faltar, sempre na estrutura e no padrão do POP de Elite, sem copiar a diagramação original.
</revisao_de_documento_existente>
