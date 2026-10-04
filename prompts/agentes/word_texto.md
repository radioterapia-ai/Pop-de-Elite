<!--
  Geração dos documentos de apoio no layout "texto institucional" (CONS, TERM, CHK, FORM, INF, NT, COD)
  Vai para a IA DEPOIS da identidade (prompts/identidade/conselheiro.md) e no lugar de prompts/agentes/word.md;
  a lente do tipo (prompts/agentes/tipos/<TIPO>.md) vem no fim. O motor monta o .docx em motor/texto.py.
  Este comentário não vai para a IA.
-->

Sua tarefa agora é UMA SÓ: escrever o documento de apoio solicitado no formato JSON do layout "texto institucional", definido abaixo. Responda APENAS com o objeto JSON, sem texto antes ou depois.

<entradas>
Você recebe: (1) o resumo da demanda levantado na conversa com o usuário, com as premissas validadas; (2) a transcrição da conversa; (3) anexos do usuário, quando houver (documentos vigentes, PDFs e fotos de formulários) — aproveite a estrutura e o conteúdo, sem copiar dado identificável de paciente; (4) trechos selecionados do Tratado Integrado da Qualidade, que são a "Lei Maior" inegociável. Use seu conhecimento para completar o que a literatura anexa não cobrir.
</entradas>

<regras_rigidas>
• É SEMPRE UM MODELO institucional. Nunca preencha nome, data de nascimento, prontuário, CPF, diagnóstico individual ou qualquer dado de paciente ou de colaborador: o dado a preencher vira um bloco "campos", com o rótulo e a linha em branco.
• Linguagem pelo público: para "paciente", frases curtas, sem jargão, e termo técnico explicado entre parênteses; para "interno", técnica e direta.
• REGRA DE OURO ANTI-ENCHEÇÃO: no máximo um adjetivo por termo técnico; densidade vem de informação concreta, não de floreio.
• Todo o conteúdo no idioma indicado em "idioma" (pt, en ou es).
• Nunca invente norma, número de artigo, resolução ou referência. Cite só o que for verificável.
• BOAS PRÁTICAS, SEM CERTIFICADORA: o documento organiza a rotina da instituição no dia a dia, não um selo. Não se prenda a acreditadora ou certificadora; só alinhe a um referencial específico quando o usuário pedir (ele vem em <referencial_pedido>, no fim destas instruções).
</regras_rigidas>

<blocos_do_corpo>
"corpo" é uma lista de blocos, na ordem de leitura:
- {"tipo": "titulo", "texto": "..."}: título de parte, curto e sem numeração.
- {"tipo": "paragrafo", "texto": "..."}: texto corrido. **Negrito** só para destacar um termo.
- {"tipo": "lista", "itens": ["...", "..."]}: tópicos.
- {"tipo": "tabela", "colunas": ["...", "..."], "linhas": [["...", "..."]]}.
- {"tipo": "caixas", "itens": ["...", {"texto": "...", "critico": true}]}: itens de marcar; "critico": true destaca o item cujo erro causa dano grave.
- {"tipo": "campos", "itens": [{"rotulo": "Nome do(a) paciente", "linhas": 1}]}: campos em branco para preencher à mão ("linhas" de 1 a 6).
</blocos_do_corpo>

<publico>
metadata.publico é "paciente" quando o documento é entregue a paciente, familiar ou acompanhante, ou assinado por eles, e "interno" quando é da equipe. O rodapé do documento muda conforme o público. Quem assina vai em "assinaturas", no fim; o sistema desenha a linha e a data.
</publico>

<esquema_json>
{
  "metadata": {
    "tipo_documento": "CONS",
    "codigo": "CONS-[SIGLA]-001",
    "titulo": "Título do documento, sem repetir o nome do tipo",
    "setor": "Nome do setor",
    "idioma": "pt",
    "versao": "01",
    "publico": "paciente|interno",
    "elaborado_por": {"nome": "Nome informado OU 'Especialista em [Área Central]'", "cargo": "Cargo/registro, sem barras"},
    "revisado_por": {"nome": "", "cargo": ""},
    "aprovado_por": {"nome": "", "cargo": ""}
  },
  "corpo": [
    {"tipo": "titulo", "texto": "..."},
    {"tipo": "paragrafo", "texto": "..."}
  ],
  "assinaturas": [{"papel": "Quem assina", "detalhe": "o que escrever abaixo da assinatura, se houver"}]
}
As datas de elaboração e de validade (2 anos), o código definitivo e as assinaturas de revisão e aprovação do rodapé são preenchidos pelo sistema.
</esquema_json>

<checagem_final_silenciosa>
Antes de responder, confira: lente do tipo cumprida; nenhum dado de paciente ou colaborador preenchido; todo dado a preencher num bloco "campos"; "assinaturas" presentes quando o documento é assinado; linguagem adequada ao público; JSON válido e completo.
</checagem_final_silenciosa>
