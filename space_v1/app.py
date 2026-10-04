"""POP de Elite 1.0 — app do Space do Hugging Face (Radioterapia-AI/POP).

As mesmas telas da 1.0 (logo, cores, colar o código das Gemas e baixar), agora montando os
arquivos com o motor 2.0 (pasta motor/), o mesmo que atende o site. É o caminho passo a passo
e o fallback do site: quem estoura o teto diário ou pega uma falha do fluxo automático é
orientado a vir para cá, com as Gemas e a conta Gemini da própria pessoa.

Publicado automaticamente a cada atualização do repositório (.github/workflows/publicar-spaces.yml).
Só app.py, motor/, requirements.txt e packages.txt são enviados: o README (configuração do Space)
e assets/ (logo da capa) ficam como estão no Space.
"""

import os
import tempfile

from motor import gerar_excel, gerar_ppt, gerar_word, validar_word
from motor.base import DEFAULT_PRIMARY, build_palette, carregar_json, carregar_json_multiplo, parse_color_input

DEFAULT_UI_COLOR = DEFAULT_PRIMARY


def _logo_bytes(logo_file):
    """Logo enviado no Passo 1 (caminho do arquivo no Gradio) → bytes, ou None."""
    if logo_file is None:
        return None
    try:
        caminho = logo_file if isinstance(logo_file, str) else getattr(logo_file, "name", None)
        if caminho and os.path.exists(caminho):
            with open(caminho, "rb") as f:
                return f.read()
    except OSError:
        pass
    return None


def _cor(c_pri):
    bruto = (c_pri or "").strip()
    return DEFAULT_UI_COLOR if not bruto or bruto == "#" else parse_color_input(bruto)


def _sobreposicoes(c_sec, c_ter, c_zeb):
    pares = (("secondary", c_sec), ("tertiary", c_ter), ("quaternary", c_zeb))
    return {k: v for k, v in pares if v and v.strip() and v.strip() != "#"}


def _pasta():
    return tempfile.mkdtemp(prefix="pop1_")


def processar(json_text, c_pri, c_sec, c_ter, c_zeb, logo_file):
    """Word: valida o código da Gema e monta o .docx com as regras da 2.0."""
    if not (json_text or "").strip():
        return None, "\u26a0\ufe0f Insira o c\u00f3digo.", None
    ok, msg, dados = validar_word(json_text)
    if not ok:
        return None, msg, None
    try:
        caminho = gerar_word(dados, pasta=_pasta(), cor=_cor(c_pri), logo=_logo_bytes(logo_file),
                             overrides=_sobreposicoes(c_sec, c_ter, c_zeb))
        return caminho, "\u2705  POP gerado com sucesso!", dados.get("metadata", {})
    except Exception as e:
        return None, f"\u274c {e}", None


def processar_excel(json_text, c_pri, c_sec, c_ter, c_zeb, logo_file):
    if not (json_text or "").strip():
        return None, "\u26a0\ufe0f Insira o c\u00f3digo da planilha.", None
    try:
        dados = carregar_json(json_text)
    except (ValueError, TypeError) as e:
        return None, f"\u274c C\u00f3digo inv\u00e1lido: {e}", None
    try:
        caminho = gerar_excel(dados, pasta=_pasta(), cor=_cor(c_pri), logo=_logo_bytes(logo_file),
                              overrides=_sobreposicoes(c_sec, c_ter, c_zeb))
        return caminho, "\u2705 Planilha gerada com sucesso!", dados.get("metadata_excel", dados.get("metadata", {}))
    except Exception as e:
        return None, f"\u274c Erro: {e}", None


def processar_ppt(json_text, c_pri, c_sec, c_ter, c_zeb, logo_file,
                  template_file=None, attachment_files=None, estilo_visual=None):
    if not (json_text or "").strip():
        return None, "\u26a0\ufe0f Insira o c\u00f3digo do PPT.", None
    try:
        dados = carregar_json_multiplo(json_text)
    except (ValueError, TypeError) as e:
        return None, f"\u274c C\u00f3digo inv\u00e1lido: {e}", None
    try:
        caminho = gerar_ppt(dados, pasta=_pasta(), cor=_cor(c_pri), logo=_logo_bytes(logo_file),
                            overrides=_sobreposicoes(c_sec, c_ter, c_zeb), estilo=estilo_visual)
        return caminho, "\u2705 Apresenta\u00e7\u00e3o gerada com sucesso!", dados.get("metadata", dados.get("metadata_ppt", {}))
    except Exception as e:
        return None, f"\u274c Erro: {e}", None



GEM_LINK_WORD  = "https://gemini.google.com/gem/1JInqSTWMuj6A8wCeABXg61SaHZ0scUlF?usp=sharing"
GEM_LINK_EXCEL = "https://gemini.google.com/gem/1dDoLg9WH1Gf1mXYyL2TPMMDTJOFd-A6x?usp=sharing"
GEM_LINK_PPT   = "https://gemini.google.com/gem/1WSveEcEY1BguokJs6oEUVnChRv-5MRc4?usp=sharing"


def criar_interface():
    import gradio as gr
    TITLE_COLOR = "#9ab4d2"
    init_pal = build_palette(DEFAULT_UI_COLOR)

    APP_CSS = f"""
        .gradio-container {{ max-width: 1200px !important; overflow-x: hidden; }}
        #pop-hex-pri, #pop-hex-sec, #pop-hex-ter, #pop-hex-zeb {{
            height: 0 !important; overflow: hidden !important;
            margin: 0 !important; padding: 0 !important;
        }}
        #color-state-row {{
            height: 0 !important; overflow: hidden !important;
            margin: 0 !important; padding: 0 !important; gap: 0 !important;
        }}
        #word-paste textarea, #excel-paste textarea, #ppt-paste textarea {{
            min-height: 160px !important; height: 160px !important;
            overflow-y: auto !important;
        }}
        .upload-container span {{ font-size: 10px !important; }}
        .upload-container {{ min-height: 130px !important; }}
        h1, h3 {{ color: {TITLE_COLOR} !important; }}
        .left-col {{ flex-shrink: 0 !important; }}
        .gem-link-btn {{
            background: linear-gradient(135deg, #6b4ba0, #4f3776) !important;
            color: #fff !important;
            min-height: 80px !important;
            white-space: normal !important;
            line-height: 1.35 !important;
            font-weight: 600 !important;
        }}
        .gem-link-btn:hover {{
            background: linear-gradient(135deg, #7d5cb6, #5d4189) !important;
        }}
        .step-divider {{
            border: none;
            border-top: 1px solid #ccc;
            margin: 28px 0 22px 0;
        }}
        .hero-title h1 {{
            text-align: center;
            font-size: 2.2em !important;
            margin: 30px 0 0 0 !important;
        }}
        .hero-sub {{
            text-align: center;
            color: #9ab4d2 !important;
            font-size: 0.95em;
            margin-top: 8px;
            margin-bottom: 30px;
        }}
        .hero-author {{
            text-align: center;
            font-size: 0.78em;
            opacity: 0.55;
            margin-top: 2px;
            margin-bottom: 30px;
        }}
        .download-btn-real {{
            display: block;
            width: 100%;
            padding: 14px;
            background: #283264;
            color: #fff !important;
            text-decoration: none !important;
            text-align: center;
            border-radius: 8px;
            font-weight: 600;
            font-size: 1em;
        }}
        .download-btn-real:hover {{ background: #3a4a8a; }}

        /* ───────── HERO LOGO (radioterapia.ai) ───────── */
        .hero-logo-wrap {{
            display: flex;
            justify-content: center;
            align-items: center;
            margin: 24px auto 0 auto;
        }}
        .hero-logo-img {{
            max-width: 720px !important;
            margin: 0 auto !important;
        }}
        .hero-logo-img img {{
            display: block !important;
            margin: 0 auto !important;
            max-width: 100% !important;
            height: auto !important;
            border-radius: 12px;
        }}
        /* esconde a barra de ferramentas/borda padrão do gr.Image quando usado como logo */
        .hero-logo-img .image-frame,
        .hero-logo-img .image-container {{
            background: transparent !important;
            border: none !important;
            padding: 0 !important;
        }}

        /* ───────── REFORÇO DE TEMA ESCURO ─────────
           Mesmo se o redirecionamento ?__theme=dark falhar, garantimos
           o fundo escuro do app e a tipografia clara. */
        body, .gradio-container, .gradio-container.app {{
            background: #0b0e14 !important;
            color: #e6ecf2 !important;
        }}
    """

    FORCE_DARK_JS = """
    () => {
        // 1) Força a classe .dark no <body> imediatamente (visual instantâneo)
        try { document.body.classList.add('dark'); } catch (e) {}
        // 2) Garante que a query string ?__theme=dark esteja presente
        try {
            const url = new URL(window.location.href);
            if (url.searchParams.get('__theme') !== 'dark') {
                url.searchParams.set('__theme', 'dark');
                window.location.replace(url.toString());
            }
        } catch (e) {}
    }
    """

    with gr.Blocks(title="\u2622\ufe0e RADIOTERAPIA.AI - POP de Elite") as demo:
        gr.HTML("<div class='hero-logo-wrap'>")
        gr.Image(
            value="assets/radioterapia_ai_logo.jpeg",
            show_label=False,
            buttons=[],            # GUARDA: no Gradio 6.0, substitui show_download_button / show_fullscreen_button
            interactive=False,
            container=False,
            elem_classes="hero-logo-img",
            height=240,
        )
        gr.HTML("</div>")

        gr.HTML("""
            <div style='text-align:center; margin-top:18px;'>
              <div style='font-size:2.4em; font-weight:700; color:#9ab4d2;'>POP de Elite</div>
              <div style='font-size:0.78em; opacity:0.55; margin-top:6px; color:#9ab4d2;'>por: Henrique Braga</div>
            </div>
            <hr class='step-divider'/>
        """)

        gr.Markdown("### \U0001f5bc\ufe0e  Passo 1 — Logotipo institucional *(opcional)*")
        gr.Markdown("*Envie o logo do seu hospital em .png ou .jpg. Ele aparecerá no cabeçalho dos documentos.*")
        logo_input = gr.Image(
            type="filepath", sources=["upload"],
            height=130, show_label=False
        )

        gr.HTML("<hr class='step-divider'/>")

        gr.Markdown("### \U0001f3a8\ufe0e  Passo 2 — Paleta de cores")
        gr.Markdown("*Selecione a palheta de cores*")

        with gr.Row(elem_id="color-state-row"):
            color_pri = gr.Textbox(value=f"#{init_pal['primary']}", elem_id="pop-hex-pri",
                                    show_label=False, container=False)
            color_sec = gr.Textbox(value="", elem_id="pop-hex-sec", show_label=False, container=False)
            color_ter = gr.Textbox(value="", elem_id="pop-hex-ter", show_label=False, container=False)
            color_zeb = gr.Textbox(value="", elem_id="pop-hex-zeb", show_label=False, container=False)

        gr.HTML(f"""
        <div style="display:flex; gap:6px; height:50px; position:relative;" id="color-boxes">
          <input type="color" id="cpick-pri" value="#{init_pal['primary']}"
            style="position:absolute;opacity:0;width:0;height:0;"
            oninput="
              var v=this.value, hex=v.replace('#','');
              document.getElementById('cbox-pri').style.background=v;
              document.getElementById('cbox-pri').querySelector('span').innerHTML='Prim\\u00e1ria<br>'+v.toUpperCase();
              var t=document.querySelector('#pop-hex-pri textarea')||document.querySelector('#pop-hex-pri input');
              if(t){{t.value=v;t.dispatchEvent(new Event('input',{{bubbles:true}}));}}
              var r=parseInt(hex.substr(0,2),16),g=parseInt(hex.substr(2,2),16),b=parseInt(hex.substr(4,2),16);
              function mx(c,p){{return Math.min(255,Math.max(0,Math.round(c+(255-c)*p)));}}
              function th(r,g,b){{return '#'+[r,g,b].map(x=>x.toString(16).padStart(2,'0')).join('').toUpperCase();}}
              var cs=th(mx(r,.45),mx(g,.45),mx(b,.45));
              var ct=th(mx(r,.70),mx(g,.70),mx(b,.70));
              var cz=th(mx(r,.85),mx(g,.85),mx(b,.85));
              [['sec',cs,'Secund\\u00e1ria'],['ter',ct,'Terci\\u00e1ria'],['zeb',cz,'Zebra']].forEach(function(x){{
                document.getElementById('cbox-'+x[0]).style.background=x[1];
                document.getElementById('cbox-'+x[0]).querySelector('span').innerHTML=x[2]+'<br>'+x[1];
                document.getElementById('cpick-'+x[0]).value=x[1];
                var t2=document.querySelector('#pop-hex-'+x[0]+' textarea')||document.querySelector('#pop-hex-'+x[0]+' input');
                if(t2){{t2.value=x[1];t2.dispatchEvent(new Event('input',{{bubbles:true}}));}}
              }});
            ">
          <div id="cbox-pri" onclick="document.getElementById('cpick-pri').click();"
            style="flex:1;background:#{init_pal['primary']};border-radius:6px;cursor:pointer;
                   display:flex;align-items:center;justify-content:center;border:2px solid #444;">
            <span style="color:#fff;font-size:9px;font-weight:bold;text-align:center;pointer-events:none;">
              Prim\u00e1ria<br>#{init_pal['primary']}</span></div>
          <input type="color" id="cpick-sec" value="#{init_pal['secondary']}"
            style="position:absolute;opacity:0;width:0;height:0;"
            oninput="var v=this.value;document.getElementById('cbox-sec').style.background=v;
              document.getElementById('cbox-sec').querySelector('span').innerHTML='Secund\\u00e1ria<br>'+v.toUpperCase();
              var t=document.querySelector('#pop-hex-sec textarea')||document.querySelector('#pop-hex-sec input');
              if(t){{t.value=v;t.dispatchEvent(new Event('input',{{bubbles:true}}));}}">
          <div id="cbox-sec" onclick="document.getElementById('cpick-sec').click();"
            style="flex:1;background:#{init_pal['secondary']};border-radius:6px;cursor:pointer;
                   display:flex;align-items:center;justify-content:center;">
            <span style="color:#{init_pal['text_on_secondary']};font-size:9px;font-weight:bold;text-align:center;pointer-events:none;">
              Secund\u00e1ria<br>#{init_pal['secondary']}</span></div>
          <input type="color" id="cpick-ter" value="#{init_pal['tertiary']}"
            style="position:absolute;opacity:0;width:0;height:0;"
            oninput="var v=this.value;document.getElementById('cbox-ter').style.background=v;
              document.getElementById('cbox-ter').querySelector('span').innerHTML='Terci\\u00e1ria<br>'+v.toUpperCase();
              var t=document.querySelector('#pop-hex-ter textarea')||document.querySelector('#pop-hex-ter input');
              if(t){{t.value=v;t.dispatchEvent(new Event('input',{{bubbles:true}}));}}">
          <div id="cbox-ter" onclick="document.getElementById('cpick-ter').click();"
            style="flex:1;background:#{init_pal['tertiary']};border-radius:6px;cursor:pointer;
                   display:flex;align-items:center;justify-content:center;">
            <span style="color:#{init_pal['primary_dark']};font-size:9px;font-weight:bold;text-align:center;pointer-events:none;">
              Terci\u00e1ria<br>#{init_pal['tertiary']}</span></div>
          <input type="color" id="cpick-zeb" value="#{init_pal['quaternary']}"
            style="position:absolute;opacity:0;width:0;height:0;"
            oninput="var v=this.value;document.getElementById('cbox-zeb').style.background=v;
              document.getElementById('cbox-zeb').querySelector('span').innerHTML='Zebra<br>'+v.toUpperCase();
              var t=document.querySelector('#pop-hex-zeb textarea')||document.querySelector('#pop-hex-zeb input');
              if(t){{t.value=v;t.dispatchEvent(new Event('input',{{bubbles:true}}));}}">
          <div id="cbox-zeb" onclick="document.getElementById('cpick-zeb').click();"
            style="flex:1;background:#{init_pal['quaternary']};border-radius:6px;cursor:pointer;
                   display:flex;align-items:center;justify-content:center;">
            <span style="color:#{init_pal['primary_dark']};font-size:9px;text-align:center;pointer-events:none;">
              Zebra<br>#{init_pal['quaternary']}</span></div>
        </div>
        """)
        btn_reset_colors = gr.Button("\u21ba  restaurar cores padr\u00e3o",
                                     size="sm", variant="secondary")

        gr.HTML("<hr class='step-divider'/>")

        gr.Markdown("### \U0001f4c4  Passo 3 — Montar documento em WORD (.docx)")
        with gr.Row():
            with gr.Column(scale=1):
                gr.Markdown("#### \U0001f4ac  Agente Conselheiro da Qualidade")
                gr.Markdown(
                    "Clique aqui primeiro, passe sua demanda e receba o conteúdo do POP "
                    "(em código) com o nosso Agente Conselheiro da Qualidade."
                )
                gr.Markdown(
                    "**Tipos aceitos:** POP, Política, Protocolo, Diretriz, Plano, Norma, Programa, Regimento, "
                    "Manual, Ficha Técnica de Indicadores, TCLE (sempre modelo), Termo de Ciência, Checklist, "
                    "Formulário, Informativo, Nota Técnica e Código de Conduta.\n\n"
                    "*Fluxograma avulso: use o MiyAgi Diagram no radioterapia.ai.*"
                )
                btn_link_word = gr.Button(
                    "\U0001f4ac  Abrir o Conselheiro da Qualidade (Word)",
                    elem_classes="gem-link-btn", size="lg"
                )
            with gr.Column(scale=1):
                gr.Markdown("#### \U0001f4cb  Cole aqui o código recebido")
                json_text_input = gr.Textbox(
                    placeholder='Cole o código do Documento Word aqui (JSON)',
                    lines=6, max_lines=6, show_label=False, elem_id="word-paste"
                )
                btn_gerar = gr.Button("\U0001f4c4  GERAR WORD",
                                       variant="primary", size="lg")
                result_info = gr.Markdown("")
                word_file_output = gr.File(
                    label="Arquivo Word gerado", visible=False, interactive=False
                )
                btn_download = gr.DownloadButton(
                    "\U0001f4e5  Baixar Word (.docx)",
                    visible=False, variant="primary", size="lg"
                )
                btn_novo = gr.Button("\U0001f504  Limpar", variant="secondary", size="sm")

        gr.HTML("<hr class='step-divider'/>")

        gr.Markdown("### \U0001f4ca  Passo 4 — Montar Planilha em EXCEL (.xlsx)")
        with gr.Row():
            with gr.Column(scale=1):
                gr.Markdown("#### \U0001f4ac  Agente Conselheiro da Qualidade — Planilha")
                gr.Markdown(
                    "Clique aqui para acionar o segundo agente, cole para ele todo o "
                    "primeiro código recebido para receber o segundo código (para montar a planilha)."
                )
                gr.Markdown(
                    "*A planilha vale para os documentos normativos e para a Ficha Técnica de Indicadores. "
                    "TCLE, Termo de Ciência, Checklist, Formulário, Informativo, Nota Técnica e Código de "
                    "Conduta não têm planilha.*"
                )
                btn_link_excel = gr.Button(
                    "\U0001f4ca  Abrir o Conselheiro (Planilha)",
                    elem_classes="gem-link-btn", size="lg"
                )
            with gr.Column(scale=1):
                gr.Markdown("#### \U0001f4cb  Cole aqui o código recebido")
                excel_text_input = gr.Textbox(
                    placeholder='Cole o código da Planilha Excel aqui (JSON)',
                    lines=6, max_lines=6, show_label=False, elem_id="excel-paste"
                )
                btn_gerar_excel = gr.Button("\U0001f4ca  GERAR EXCEL",
                                            variant="primary", size="lg")
                excel_info = gr.Markdown("")
                excel_file_output = gr.File(
                    label="Arquivo Excel gerado", visible=False, interactive=False
                )
                btn_download_excel = gr.DownloadButton(
                    "\U0001f4e5  Baixar Excel (.xlsx)",
                    visible=False, variant="primary", size="lg"
                )
                btn_novo_excel = gr.Button("\U0001f504  Limpar",
                                           variant="secondary", size="sm")

        gr.HTML("<hr class='step-divider'/>")

        gr.Markdown("### \U0001f4fd\ufe0f  Passo 5 — Montar Apresentação em POWERPOINT (.pptx)")
        with gr.Row():
            with gr.Column(scale=1):
                gr.Markdown("#### \U0001f4ac  Agente Conselheiro da Qualidade — Apresentação")
                gr.Markdown(
                    "Acione aqui o terceiro agente, passe na mesma mensagem os códigos "
                    "recebidos (do Word e, quando houver, da Planilha — passos 3 e 4), para receber o último "
                    "código e gerar os slides de treinamento."
                )
                gr.Markdown(
                    "*O treinamento vale para os documentos normativos e para o Código de Conduta.*"
                )
                btn_link_ppt = gr.Button(
                    "\U0001f4fd\ufe0f  Abrir o Conselheiro (Apresentação)",
                    elem_classes="gem-link-btn", size="lg"
                )
            with gr.Column(scale=1):
                gr.Markdown("#### \U0001f4cb  Cole aqui o código recebido")
                ppt_text_input = gr.Textbox(
                    placeholder='Cole o código do PPT aqui (JSON da Fábrica de Slides 2.0)',
                    lines=6, max_lines=6, show_label=False, elem_id="ppt-paste"
                )
                btn_gerar_ppt = gr.Button("\U0001f4fd\ufe0f  GERAR APRESENTAÇÃO",
                                          variant="primary", size="lg")
                ppt_info = gr.Markdown("")
                ppt_file_output = gr.File(
                    label="Arquivo PPT gerado", visible=False, interactive=False
                )
                btn_download_ppt = gr.DownloadButton(
                    "\U0001f4e5  Baixar Apresentação (.pptx)",
                    visible=False, variant="primary", size="lg"
                )
                btn_novo_ppt = gr.Button("\U0001f504  Limpar",
                                         variant="secondary", size="sm")

        gr.HTML("<hr class='step-divider'/>")

        gr.Markdown("### \u2728  Recomeçar")
        btn_novo_paciente = gr.Button(
            "\u2728  NOVO PACIENTE — limpar os 3 códigos (mantém logo e cores)",
            variant="secondary", size="lg"
        )


        btn_link_word.click(
            fn=None, inputs=None, outputs=None,
            js=f"() => {{ window.open('{GEM_LINK_WORD}', '_blank'); }}"
        )
        btn_link_excel.click(
            fn=None, inputs=None, outputs=None,
            js=f"() => {{ window.open('{GEM_LINK_EXCEL}', '_blank'); }}"
        )
        btn_link_ppt.click(
            fn=None, inputs=None, outputs=None,
            js=f"() => {{ window.open('{GEM_LINK_PPT}', '_blank'); }}"
        )

        def on_generate_word(json_text, cpri, csec, cter, czeb, logo):
            fp, info, meta = processar(json_text, cpri, csec, cter, czeb, logo)
            if fp:
                fname = os.path.basename(fp)
                msg = f"\u2705  `{fname}`"
                return (msg,
                        gr.File(value=fp, visible=True),
                        gr.DownloadButton(value=fp, visible=True),
                        gr.Button("\U0001f4c4  GERAR WORD", interactive=True))
            return (info or "\u26a0\ufe0f Erro",
                    gr.File(visible=False),
                    gr.DownloadButton(visible=False),
                    gr.Button("\U0001f4c4  GERAR WORD", interactive=True))

        def on_start_word():
            return ("\u23f3  *Redigindo o documento Word, aguarde...*",
                    gr.File(visible=False),
                    gr.DownloadButton(visible=False),
                    gr.Button("\u23f3  Redigindo...", variant="secondary", interactive=False))

        btn_gerar.click(
            fn=on_start_word,
            outputs=[result_info, word_file_output, btn_download, btn_gerar]
        ).then(
            fn=on_generate_word,
            inputs=[json_text_input, color_pri, color_sec, color_ter, color_zeb, logo_input],
            outputs=[result_info, word_file_output, btn_download, btn_gerar]
        )

        btn_novo.click(
            fn=lambda: ("", "", gr.File(visible=False), gr.DownloadButton(visible=False)),
            outputs=[json_text_input, result_info, word_file_output, btn_download]
        )

        def on_generate_excel(json_text, cpri, csec, cter, czeb, logo):
            fp, info, meta = processar_excel(json_text, cpri, csec, cter, czeb, logo)
            if fp:
                fname = os.path.basename(fp)
                msg = f"\u2705  `{fname}`"
                return (msg,
                        gr.File(value=fp, visible=True),
                        gr.DownloadButton(value=fp, visible=True),
                        gr.Button("\U0001f4ca  GERAR EXCEL", interactive=True))
            return (info or "\u26a0\ufe0f Erro",
                    gr.File(visible=False),
                    gr.DownloadButton(visible=False),
                    gr.Button("\U0001f4ca  GERAR EXCEL", interactive=True))

        def on_start_excel():
            return ("\u23f3  *Montando a planilha, aguarde...*",
                    gr.File(visible=False),
                    gr.DownloadButton(visible=False),
                    gr.Button("\u23f3  Montando...", variant="secondary", interactive=False))

        btn_gerar_excel.click(
            fn=on_start_excel,
            outputs=[excel_info, excel_file_output, btn_download_excel, btn_gerar_excel]
        ).then(
            fn=on_generate_excel,
            inputs=[excel_text_input, color_pri, color_sec, color_ter, color_zeb, logo_input],
            outputs=[excel_info, excel_file_output, btn_download_excel, btn_gerar_excel]
        )

        btn_novo_excel.click(
            fn=lambda: ("", "", gr.File(visible=False), gr.DownloadButton(visible=False)),
            outputs=[excel_text_input, excel_info, excel_file_output, btn_download_excel]
        )

        def on_generate_ppt(json_text, cpri, csec, cter, czeb, logo):
            fp, info, meta = processar_ppt(json_text, cpri, csec, cter, czeb,
                                             logo, None, None, None)
            if fp:
                fname = os.path.basename(fp)
                size_kb = os.path.getsize(fp) // 1024
                msg = f"\u2705  `{fname}` — {size_kb:,} KB"
                return (msg,
                        gr.File(value=fp, visible=True),
                        gr.DownloadButton(value=fp, visible=True),
                        gr.Button("\U0001f4fd\ufe0f  GERAR APRESENTAÇÃO", interactive=True))
            return (info or "\u26a0\ufe0f Erro",
                    gr.File(visible=False),
                    gr.DownloadButton(visible=False),
                    gr.Button("\U0001f4fd\ufe0f  GERAR APRESENTAÇÃO", interactive=True))

        def on_start_ppt():
            return ("\u23f3  *Montando os slides, aguarde...*",
                    gr.File(visible=False),
                    gr.DownloadButton(visible=False),
                    gr.Button("\u23f3  Montando...", variant="secondary", interactive=False))

        btn_gerar_ppt.click(
            fn=on_start_ppt,
            outputs=[ppt_info, ppt_file_output, btn_download_ppt, btn_gerar_ppt]
        ).then(
            fn=on_generate_ppt,
            inputs=[ppt_text_input, color_pri, color_sec, color_ter, color_zeb, logo_input],
            outputs=[ppt_info, ppt_file_output, btn_download_ppt, btn_gerar_ppt]
        )

        btn_novo_ppt.click(
            fn=lambda: ("", "", gr.File(visible=False), gr.DownloadButton(visible=False)),
            outputs=[ppt_text_input, ppt_info, ppt_file_output, btn_download_ppt]
        )

        def on_novo_paciente():
            return (
                "", "", gr.File(visible=False), gr.DownloadButton(visible=False),
                "", "", gr.File(visible=False), gr.DownloadButton(visible=False),
                "", "", gr.File(visible=False), gr.DownloadButton(visible=False),
            )

        btn_novo_paciente.click(
            fn=on_novo_paciente,
            outputs=[
                json_text_input, result_info, word_file_output, btn_download,
                excel_text_input, excel_info, excel_file_output, btn_download_excel,
                ppt_text_input, ppt_info, ppt_file_output, btn_download_ppt,
            ]
        )

        def on_reset_colors():
            return f"#{init_pal['primary']}", "", "", ""

        btn_reset_colors.click(
            fn=on_reset_colors,
            outputs=[color_pri, color_sec, color_ter, color_zeb],
            js=f"""() => {{
                var p = '{init_pal["primary"]}', s = '{init_pal["secondary"]}',
                    t = '{init_pal["tertiary"]}', z = '{init_pal["quaternary"]}';
                document.getElementById('cbox-pri').style.background='#'+p;
                document.getElementById('cbox-pri').querySelector('span').innerHTML='Prim\\u00e1ria<br>#'+p;
                document.getElementById('cpick-pri').value='#'+p;
                document.getElementById('cbox-sec').style.background='#'+s;
                document.getElementById('cbox-sec').querySelector('span').innerHTML='Secund\\u00e1ria<br>#'+s;
                document.getElementById('cpick-sec').value='#'+s;
                document.getElementById('cbox-ter').style.background='#'+t;
                document.getElementById('cbox-ter').querySelector('span').innerHTML='Terci\\u00e1ria<br>#'+t;
                document.getElementById('cpick-ter').value='#'+t;
                document.getElementById('cbox-zeb').style.background='#'+z;
                document.getElementById('cbox-zeb').querySelector('span').innerHTML='Zebra<br>#'+z;
                document.getElementById('cpick-zeb').value='#'+z;
            }}"""
        )

    return demo, APP_CSS, FORCE_DARK_JS


if __name__ == "__main__":
    demo, app_css, force_dark_js = criar_interface()
    demo.launch(debug=False, show_error=True, css=app_css, js=force_dark_js,
                theme=__import__('gradio').themes.Soft(primary_hue="blue"))
