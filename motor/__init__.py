"""Motor de renderização do POP de Elite: JSON → Word, Excel e PowerPoint.

Roda no Space do Hugging Face (API de dependências) e também localmente:

    from motor import gerar_word, gerar_excel, gerar_ppt
    caminho = gerar_word(dados_json, pasta="saida", cor="#283264")
"""

from .excel import gerar_excel
from .ppt import gerar_ppt
from .word import gerar_word, natureza_processo, validar_word

__all__ = ["gerar_word", "gerar_excel", "gerar_ppt", "validar_word", "natureza_processo"]
