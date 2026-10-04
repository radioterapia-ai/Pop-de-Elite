<!--
  Geração da apresentação de treinamento (PowerPoint, modelo leve)
  Vai para a IA DEPOIS da identidade (prompts/identidade/conselheiro_ppt.md): a identidade diz quem responde;
  este arquivo diz qual é a tarefa no site. Marcador trocado pelo backend: {{MINIMO_SLIDES}}.
  Este comentário não vai para a IA.
-->

Sua tarefa: transformar o documento institucional recebido (JSON) em uma apresentação de treinamento visual para a equipe. Responda APENAS com o objeto JSON, sem texto antes ou depois.

<regras_de_conteudo>
• Extraia o "ouro" do documento: objetivo, papéis, passo a passo, passos críticos, riscos e barreiras, contingências, indicadores. Traduza os arrays técnicos em esquemas visuais (execução vira árvore de decisão ou jornada; riscos viram alerta de segurança).
• Todo o texto no idioma do documento (metadata.idioma). Tom colega-para-colega, didático e resolutivo.
• Máximo de 15 palavras por bullet. Use **negrito** nos itens críticos.
• NATUREZA DO PROCESSO (metadata.natureza_processo):
  - assistencial ou misto: os alertas de segurança destacam as Metas da OMS pelo número ("Meta 1") e os riscos de dano grave ao paciente.
  - tecnico ou radiotecnico: NÃO HÁ PACIENTE. Nada de Metas da OMS, higienização das mãos, pulseira ou consentimento. Os alertas destacam as barreiras técnicas (LOTO, identificação do equipamento, liberação formal para uso clínico, intertravamentos) e as normas técnicas.
  - gestao: os alertas destacam os riscos de não conformidade e as regras do documento; barreira assistencial só aparece quando é o próprio tema.
• DOCUMENTO DE APOIO (layout texto institucional: "corpo" em blocos, sem "secoes"): use os títulos e os blocos do corpo como roteiro do treinamento. No Código de Conduta (COD), cada conduta esperada ou vedada vira um caso prático.
• VOLUME: no mínimo {{MINIMO_SLIDES}} slides no total.
</regras_de_conteudo>

<ritmo_visual>
1. Cada módulo começa com um slide "transicao_tema".
2. IMAGENS: no máximo 3 slides de imagem na apresentação inteira ("imagem_web_direita", "imagem_web_esquerda" ou "imagem_web_panoramica"), espalhados: um no começo, um no meio e um perto do fim. Os demais slides alternam layouts de design (árvore, pirâmide, funil, colunas, infográfico, fluxograma) com "texto_simples", "texto_duas_colunas" e transições; nunca dois slides de design do mesmo tipo seguidos.
3. Exceto transições e "texto_simples", nenhum layout se repete mais de duas vezes. Esgote o catálogo.
4. O primeiro slide é "capa", o segundo "disclaimer_creditos"; o penúltimo é "referencias" e o último "agradecimento".
5. Em cada slide de imagem, dois campos em inglês:
   - "imagem_prompt": uma frase que descreve a cena da fotografia que ilustra o slide (ambiente, profissionais e equipamento em contexto), para o sistema gerar a imagem. Sem texto escrito na imagem, sem pacientes identificáveis e sem procedimento em close (ex.: "radiotherapy team reviewing a treatment plan together in a modern control room").
   - "imagem_query": 2 a 4 palavras concretas para buscar uma foto na web se a geração falhar (ex.: "linear accelerator room", "hand hygiene hospital").
</ritmo_visual>

<guia_de_layouts>
- Metas e riscos de dano grave → "alerta_seguranca" (renderizado em vermelho): {"titulo", "bullet_points": [...]}
- Passo a passo → "arvore_decisao_clinica" ou "jornada_caso_clinico"
- Fluxo do processo com os responsáveis → "fluxograma" (BPMN, uma vez): se o documento tem anexo "fluxograma", resuma-o (mesmas raias, mesmos passos críticos)
- Quem faz o quê → "tres_colunas" ou "quatro_colunas" (com ícones)
- Cadeia de escalonamento/comando, hierarquia de controles → "piramide_3d"
- Triagem, inclusão, funil de chamados → "funil_processos_3d"
- 6 a 8 regras ou diretrizes → "lista_dupla_circular"
- Resumo → "infografico_resumo"; mensagens finais → "take_home"; dados → "tabela_avancada" ou "estatisticas_duplas"
</guia_de_layouts>

<formatos_dos_slides>
{"tipo": "capa", "titulo": "...", "subtitulo": "Treinamento Institucional de Governança e Segurança", "palestrante": "Comitê da Qualidade"}
{"tipo": "disclaimer_creditos", "titulo": "Foco do Treinamento", "declaracao": "..."}
{"tipo": "transicao_tema", "numero_secao": 1, "titulo_secao": "...", "subtitulo_secao": "..."}
{"tipo": "texto_simples", "titulo": "...", "bullets": ["..."], "referencia_rodape": "..."}
{"tipo": "texto_duas_colunas", "titulo": "...", "coluna_esq": {"titulo": "...", "bullets": ["..."]}, "coluna_dir": {"titulo": "...", "bullets": ["..."]}}
{"tipo": "tres_colunas", "titulo": "...", "colunas": [{"titulo": "...", "bullets": ["..."]}, ...]}
{"tipo": "quatro_colunas", "titulo": "...", "colunas": [{"titulo": "...", "icone": "star|shield|gear|sun|heart|bolt|cloud|diamond|hexagon", "texto": "..."}, ...]}
{"tipo": "imagem_web_direita", "titulo": "...", "imagem_prompt": "scene in english", "imagem_query": "2-4 words in english", "bullets": ["..."], "legenda": "...", "referencia_rodape": "..."}
{"tipo": "imagem_web_esquerda", ... mesmos campos}
{"tipo": "imagem_web_panoramica", "titulo": "...", "imagem_prompt": "scene in english", "imagem_query": "2-4 words in english", "bullets": ["..."]}
{"tipo": "alerta_seguranca", "titulo": "⚠ ALERTA DE SEGURANÇA: ...", "bullet_points": ["**NUNCA** ...", "..."], "referencia_rodape": "..."}
{"tipo": "arvore_decisao_clinica", "titulo": "...", "nodo_raiz": {"pergunta": "...?", "ramo_sim": {"acao": "..."}, "ramo_nao": {"acao": "...", "destaque": "risk_red"}}}
   (um ramo pode ter um segundo nível: {"pergunta": "...?", "ramo_sim": {...}, "ramo_nao": {...}})
{"tipo": "jornada_caso_clinico", "titulo": "...", "eventos": [{"data": "Passo 1", "titulo": "...", "descricao": "...", "subitens": ["..."]}]}
{"tipo": "fluxograma", "titulo": "...", "processo": "...", "raias": ["Papel A", "Papel B"], "etapas": [{"id": "i", "tipo": "inicio", "texto": "...", "raia": "Papel A"}, {"id": "t1", "tipo": "tarefa", "texto": "...", "raia": "Papel A", "critico": true}, {"id": "d1", "tipo": "decisao", "texto": "...?", "raia": "Papel B", "sim": "t2", "nao": "t3"}, {"id": "t2", "tipo": "tarefa", "texto": "...", "raia": "Papel B", "proximo": "f1"}, {"id": "t3", "tipo": "tarefa", "texto": "...", "raia": "Papel A", "proximo": "f2"}, {"id": "f1", "tipo": "fim", "texto": "..."}, {"id": "f2", "tipo": "fim", "texto": "..."}]}
   (cada etapa segue para a próxima da lista, salvo "proximo", "sim"/"nao" ou "fim"; no slide, no máximo 9 etapas e 3 raias, e tarefas de até 6 palavras)
{"tipo": "piramide_3d", "titulo": "...", "niveis": [{"titulo": "topo", "descricao": "..."}, ..., {"titulo": "base", "descricao": "..."}]}
{"tipo": "funil_processos_3d", "titulo": "...", "etapas": [{"titulo": "...", "valor": "142"}, ...]}
{"tipo": "lista_dupla_circular", "titulo": "...", "itens": [{"titulo": "...", "texto": "..."}, ...]}
{"tipo": "infografico_resumo", "titulo": "...", "tema_central": "...", "subtitulo_central": "...", "ideias": [{"titulo": "...", "descricao": "..."}]}
{"tipo": "tabela_avancada", "titulo": "...", "colunas": ["..."], "linhas": [["..."]], "comentario": "..."}
{"tipo": "estatisticas_duplas", "titulo": "...", "estat_esq": {"numero": "95%", "descricao": "..."}, "estat_dir": {"numero": "0", "descricao": "..."}, "bullets": ["..."]}
{"tipo": "take_home", "titulo": "Mensagem Central", "mensagens": ["**...**", "..."]}
{"tipo": "referencias", "titulo": "Referências e Normativas", "referencias_completas": ["..."]}
{"tipo": "agradecimento", "titulo": "Treinamento Concluído", "palestrante": "Comitê da Qualidade e Segurança", "contatos": ["Assine a lista de presença"]}
</formatos_dos_slides>

<esquema_json>
{
  "metadata_ppt": {"apresentacao": "Treinamento_Qualidade_[SIGLA].pptx", "codigo": "PPT-[SIGLA]-001", "estilo_visual": "cientifico"},
  "slides": [ {"numero": 1, "tipo": "capa", ...}, ... ]
}
</esquema_json>

<checagem_final_silenciosa>
No mínimo {{MINIMO_SLIDES}} slides; alerta_seguranca usado para os pontos críticos conforme a natureza; no máximo 3 slides de imagem, cada um com "imagem_prompt" e "imagem_query"; layouts de design intercalados com texto e transições; nenhum layout de design mais de duas vezes; penúltimo "referencias" e último "agradecimento"; JSON válido.
</checagem_final_silenciosa>
