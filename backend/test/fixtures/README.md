# Arquivos de teste — todos sintéticos

Nenhum documento real da cooperativa. Origem de cada um:

| Arquivo | Como foi gerado |
|---|---|
| `relatorio.docx`, `apresentacao.pptx`, `digitalizado.pdf`, `foto-rotacionada.jpg`, `transparente.png`, `imagem.webp` | `python3 make_fixtures.py` (python-docx, python-pptx, Pillow) |
| `texto.pdf` | `relatorio.docx` convertido pelo próprio conversor (LibreOffice) |
| `protegido.pdf` | `qpdf --encrypt <senha> <senha> 256 -- texto.pdf protegido.pdf` |
| `com-macro.docx` | `relatorio.docx` + entrada `word/vbaProject.bin` falsa (só para testar a recusa) |
