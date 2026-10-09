# Backend: API Node + motores de conversão (LibreOffice, Ghostscript, pdf2docx).
#
# Versões controladas: imagem base com tag exata, pacotes npm pelo package-lock
# (npm ci), pacotes Python fixados em requirements-pdf2docx.txt. Os pacotes do Debian
# acompanham a release estável (trixie) e recebem correções de segurança ao
# reconstruir a imagem — ver "Atualização" no README.
#
# Para fixar também o digest (recomendado em homologação/produção), troque a tag por
# node:24.21.0-trixie-slim@sha256:<digest> — `docker buildx imagetools inspect` mostra.
ARG NODE_IMAGE=node:24.21.0-trixie-slim

FROM ${NODE_IMAGE}

# - LibreOffice: só Writer e Impress (não o metapacote), sem Java.
# - Fontes metricamente compatíveis com Arial/Times (Liberation) e Calibri/Cambria
#   (Carlito/Caladea): sem elas o texto reflui e o PDF sai visualmente diferente.
# - ghostscript: compressão de PDF. util-linux traz o prlimit.
# - python3-venv: ambiente isolado do pdf2docx (sem pip global).
RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      libreoffice-writer-nogui libreoffice-impress-nogui \
      fonts-liberation fonts-crosextra-carlito fonts-crosextra-caladea fonts-dejavu-core fontconfig \
      ghostscript util-linux \
      python3 python3-venv \
      tini \
 && apt-get upgrade -y \
 && rm -rf /var/lib/apt/lists/*

# pdf2docx (MIT) depende do PyMuPDF (AGPL-3.0) e do OpenCV headless (Apache-2.0, que
# embute FFmpeg LGPL). Ver LICENCAS.md antes de habilitar em produção.
COPY requirements-pdf2docx.txt /tmp/requirements-pdf2docx.txt
RUN python3 -m venv /opt/pdf2docx \
 && /opt/pdf2docx/bin/pip install --no-cache-dir --no-compile -r /tmp/requirements-pdf2docx.txt \
 && rm /tmp/requirements-pdf2docx.txt

WORKDIR /app
COPY package.json package-lock.json ./
# sharp baixa o binário pré-compilado do libvips pelo próprio npm (pacote @img/sharp-linux-x64).
RUN npm ci --omit=dev --no-audit --no-fund && npm cache clean --force
COPY src ./src

# Usuário sem privilégios, UID fixo (o volume de dados precisa pertencer a ele).
RUN groupadd -r -g 10001 conversor && useradd -r -u 10001 -g conversor -d /nonexistent -s /usr/sbin/nologin conversor \
 && mkdir -p /data && chown conversor:conversor /data && chmod 700 /data
USER 10001:10001

ENV NODE_ENV=production \
    PORT=3000 \
    DATA_DIR=/data \
    LIBREOFFICE_BIN=/usr/bin/soffice \
    GHOSTSCRIPT_BIN=/usr/bin/gs \
    PYTHON_BIN=/opt/pdf2docx/bin/python3 \
    PRLIMIT_BIN=/usr/bin/prlimit

EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "require('http').get('http://127.0.0.1:'+process.env.PORT+'/api/health',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"

# tini reaproveita processos órfãos (netos do LibreOffice) e repassa SIGTERM.
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "src/index.js"]
