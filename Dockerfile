FROM node:20-bookworm-slim

# LibreOffice headless (só Writer/Impress/Calc, não o metapacote completo) + fontes
# metricamente compatíveis com Arial/Calibri/Times. Sem essas fontes, o texto de
# DOCX/PPTX convertidos reflui diferente e o resultado sai visualmente errado
# mesmo quando a conversão "funciona".
RUN apt-get update && apt-get install -y --no-install-recommends \
    libreoffice-writer libreoffice-impress libreoffice-calc \
    fonts-liberation fonts-dejavu-core fontconfig \
    python3 python3-pip \
    && rm -rf /var/lib/apt/lists/*

# pdf2docx: LibreOffice sozinho não converte PDF->DOCX (abre PDF como Draw, sem filtro de
# exportação p/ Writer) — pdf2docx reconstrói texto/layout de verdade a partir do PDF.
# --break-system-packages: Debian 12 bloqueia pip global por padrão (PEP 668); aceitável
# aqui porque a imagem não roda mais nada em Python além deste script.
RUN pip3 install --no-cache-dir --break-system-packages pdf2docx

WORKDIR /app

COPY server/package*.json ./server/
RUN cd server && npm ci --omit=dev

COPY server ./server
COPY Index.html script.js style.css ./
COPY img ./img

RUN groupadd -r appuser && useradd -r -g appuser -m appuser \
    && chown -R appuser:appuser /app
USER appuser
ENV HOME=/home/appuser

ENV PORT=3000
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "require('http').get('http://127.0.0.1:'+(process.env.PORT||3000)+'/', r => process.exit(r.statusCode===200?0:1)).on('error', () => process.exit(1))"

CMD ["node", "server/src/index.js"]
