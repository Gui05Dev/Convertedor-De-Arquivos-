#!/usr/bin/env python3
"""Converte um PDF para DOCX reconstruindo texto/layout com pdf2docx.

Uso: pdf2docx_convert.py <entrada.pdf> <saida.docx>

Antes de converter, verifica se o PDF tem texto selecionavel. PDF digitalizado
(paginas que sao so imagens) sairia como um DOCX com figuras e nenhum texto
editavel - pior que nada, porque parece que funcionou. Nesse caso sai com o
codigo 3 e o backend explica o motivo ao usuario.

Codigos de saida: 0 ok | 2 uso | 3 digitalizado (sem texto) | 4 protegido | 1 falha.
Nao imprime conteudo do documento em lugar nenhum.
"""
import sys

EXIT_SCANNED = 3
EXIT_ENCRYPTED = 4
# Media de caracteres por pagina abaixo da qual o PDF e tratado como digitalizado.
MIN_CHARS_PER_PAGE = 25


def has_text_layer(path):
    import pymupdf  # dependencia do pdf2docx (AGPL-3.0)

    with pymupdf.open(path) as doc:
        if doc.needs_pass:
            sys.exit(EXIT_ENCRYPTED)
        pages = doc.page_count or 1
        chars = 0
        for page in doc:
            chars += len(page.get_text("text").strip())
            if chars >= MIN_CHARS_PER_PAGE * pages:
                return True
        return chars >= MIN_CHARS_PER_PAGE * pages


def main():
    if len(sys.argv) != 3:
        print("uso: pdf2docx_convert.py <entrada.pdf> <saida.docx>", file=sys.stderr)
        sys.exit(2)
    input_path, output_path = sys.argv[1], sys.argv[2]

    if not has_text_layer(input_path):
        sys.exit(EXIT_SCANNED)

    import logging
    logging.disable(logging.CRITICAL)  # pdf2docx loga trechos do processamento
    from pdf2docx import Converter

    cv = Converter(input_path)
    try:
        cv.convert(output_path)
    finally:
        cv.close()


if __name__ == "__main__":
    main()
