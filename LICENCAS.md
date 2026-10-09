# Licenças — Conversor de Arquivos Copacol

Levantamento feito em 09/10/2026 sobre o que **efetivamente** entra nas imagens deste
repositório. Não é parecer jurídico: os pontos marcados como **pendente** devem ser
confirmados pelo jurídico da cooperativa antes da produção.

## 1. Código deste repositório

Código próprio (backend, frontend, configuração). Nenhum arquivo foi copiado dos
repositórios de referência. Marca, logotipos e ilustrações em `frontend/public/img/`
são da Copacol, para uso interno.

## 2. Repositórios de referência — o que foi (e não foi) usado

| Projeto | Licença verificada | Uso neste projeto |
|---|---|---|
| [transmute-app/transmute](https://github.com/transmute-app/transmute) (commit `7de1265`, 03/10/2026; tag mais recente v2.1.1) | MIT | **Nenhum código.** Serviu de referência de desenho: trabalhos por usuário, verificação de dono em toda rota, detecção de PDF digitalizado. Ver justificativa da arquitetura no README. |
| [C4illin/ConvertX](https://github.com/C4illin/ConvertX) | **AGPL-3.0** | Nada. Apenas consultado. Copiar trechos obrigaria a licenciar o derivado sob AGPL. |
| [Stirling-Tools/Stirling-PDF](https://github.com/Stirling-Tools/Stirling-PDF) | MIT no núcleo; **licença proprietária** em `app/proprietary/`, `app/saas/`, `engine/` e em partes de `frontend/editor/src/` (ver `LICENSE` na raiz deles) | Nada. Apenas a ideia de usar Ghostscript para comprimir. Nenhuma verificação de licença foi contornada porque nenhum componente foi usado. |
| [storytold/pdfcraft](https://github.com/storytold/pdfcraft) | MIT / Apache-2.0; nome e logos ArtCraft em `docs/brand/` **não são livres** (só podem ser usados sem modificação e dentro do PdfCraft) | Nada. Nenhum nome, logo ou ícone do PdfCraft/ArtCraft foi usado. |
| [KnifeLemon/Filee](https://github.com/KnifeLemon/Filee) | MIT | Nada. Apenas consultado. |

## 3. Componentes que vão para as imagens

### Backend (`conversor-copacol/backend`)

| Componente | Licença | Como é usado | Obrigação |
|---|---|---|---|
| Node.js 24 (imagem `node:24.21.0-trixie-slim`) | MIT + licenças de terceiros do Node | runtime | manter avisos (já dentro da imagem) |
| express 5, multer 2, jose 6, pdf-lib 1.17 e dependências | MIT / ISC / BSD / 0BSD (82 pacotes, ver `npx license-checker-rseidelsohn --production`) | biblioteca | manter avisos |
| sharp 0.35 | Apache-2.0 | biblioteca | manter avisos |
| libvips (`@img/sharp-libvips-linux-x64`) | **LGPL-3.0-or-later** | biblioteca dinâmica, sem modificação | manter aviso; permitir substituição da biblioteca (atendido: é um pacote npm separado) |
| LibreOffice (pacotes Debian `libreoffice-*-nogui`) | MPL-2.0 (e outras compatíveis) | executável separado, sem modificação | manter avisos (em `/usr/share/doc`) |
| **Ghostscript** (pacote Debian) | **AGPL-3.0** (ou licença comercial Artifex) | executável separado, chamado por linha de comando, **sem modificação** | ver 4.1 |
| pdf2docx 0.5.13 | MIT | script Python em processo separado | manter aviso |
| **PyMuPDF 1.28.2** | **AGPL-3.0** (ou licença comercial Artifex) | importado pelo pdf2docx e por `pdf2docx_convert.py` | ver 4.2 |
| opencv-python-headless 5.0 | Apache-2.0; **embute FFmpeg (LGPL-2.1)** e outras bibliotecas (ver `LICENSE-3RD-PARTY.txt` do pacote) | dependência do pdf2docx | manter avisos; FFmpeg é biblioteca dinâmica sem modificação |
| Fontes Liberation / Carlito / Caladea / DejaVu | SIL OFL 1.1 / licença DejaVu | renderização dos PDFs | manter avisos |
| tini | MIT | init do container | — |

### Frontend (`conversor-copacol/frontend`)

| Componente | Licença | Observação |
|---|---|---|
| React 19 | MIT | no bundle |
| Fontes Nunito e Sora (auto-hospedadas) | SIL OFL 1.1 | já existiam no projeto |
| nginx (`nginxinc/nginx-unprivileged:1.30.5-alpine`) | BSD-2-Clause | servidor |

### Serviços auxiliares

| Componente | Licença |
|---|---|
| oauth2-proxy v7.15.5 | MIT |
| Keycloak 26.8.0 (só perfil de teste `keycloak-local`) | Apache-2.0 |

**Não usados:** FFmpeg como ferramenta de conversão, ImageMagick, Calibre, Pandoc,
Inkscape, yt-dlp, OCRmyPDF, Tesseract.

## 4. Componentes AGPL — análise e pendências

### 4.1 Ghostscript (compressão de PDF) — **pendente: confirmação do jurídico**

- É chamado como **programa separado**, via linha de comando, com arquivos temporários.
  Pela interpretação usual da FSF, comunicação por linha de comando/arquivos mantém os
  programas separados; o código do Conversor não vira obra derivada do Ghostscript.
- **Não é modificado.** A cláusula 13 da AGPL (oferecer o código-fonte a quem usa pela
  rede) se aplica a versões modificadas.
- Se a imagem Docker for **distribuída** para fora da cooperativa, é preciso oferecer o
  código-fonte correspondente do Ghostscript (o pacote-fonte do Debian:
  `apt-get source ghostscript`, na mesma versão da imagem).
- Alternativa sem AGPL: licença comercial da Artifex, ou desativar a ferramenta
  "Comprimir PDF" (remover `ghostscript` do Dockerfile — a ferramenta some da tela
  sozinha, porque `/api/tools` só lista o que tem motor instalado).

### 4.2 PyMuPDF (PDF para Word) — **pendente: decisão antes da produção**

- O PyMuPDF é **importado** como biblioteca por `pdf2docx` e pelo nosso
  `backend/src/engines/pdf2docx_convert.py`. Esse script forma uma obra combinada com o
  PyMuPDF, e os colaboradores o usam **pela rede**.
- O resto do backend (Node) roda em outro processo e conversa com o script só por linha de
  comando e arquivos — tratado aqui como programa separado.
- Para cumprir a AGPL no módulo Python: disponibilizar aos usuários o código-fonte do
  script (este repositório) e o dos pacotes Python usados, nas versões de
  `backend/requirements-pdf2docx.txt`. A página `/licencas.html` do próprio conversor
  informa isso; **falta definir o endereço interno** (repositório Git interno ou pedido
  à TI) e atualizar a página.
- Se o jurídico não aprovar: `ENABLE_PDF_TO_DOCX=false` no `backend/.env` remove a
  ferramenta da tela e da API sem rebuild; para tirar o PyMuPDF da imagem, apague o bloco
  do pdf2docx no `backend/Dockerfile`.

## 5. Avisos de segurança relacionados a dependências (09/10/2026)

- **Transmute < 1.3.0**: SSRF na importação por URL (CVE-2026-54054). Não afeta este
  projeto (não usamos o Transmute nem importação por URL), mas pesou na decisão de não
  expor um serviço com importação por URL e `yt-dlp` embutidos.
- **multer < 2.2.0**: arquivos parciais órfãos em uploads abortados (CVE-2026-5038).
  Usamos 2.4.0, e a limpeza de `incoming/` cobre o caso de qualquer forma.
- **Ghostscript**: histórico frequente de CVEs (ex.: CVE-2026-39919, estouro de heap).
  Mitigações: `-dSAFER`, processo sem rede, sem privilégios, com tempo e tamanho de saída
  limitados; e **reconstruir a imagem com frequência** para pegar as correções do Debian.
- **OpenCV headless (dependência do pdf2docx)** embute bibliotecas próprias, inclusive
  OpenSSL 1.1.1 (fora de suporte). O código de rede delas não é usado pelo conversor e o
  container do backend não tem saída de rede, mas é mais um motivo para avaliar o item 4.2.
- **pdf-lib 1.17.1** está sem novas versões desde 2022. Roda em worker isolado, com
  timeout e limite de memória; acompanhar e considerar substituto se surgir CVE.
