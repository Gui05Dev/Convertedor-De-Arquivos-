# ── Etapa 1: build da SPA ──
# O Node só existe aqui. A imagem final não leva Node, nem node_modules, nem código-fonte:
# só os arquivos estáticos que o Vite gerou.
FROM node:20-alpine AS build

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY index.html vite.config.js ./
COPY src ./src
COPY public ./public
RUN npm run build

# ── Etapa 2: servir ──
FROM nginx:1.27-alpine

# O entrypoint oficial do nginx roda envsubst nos templates em /etc/nginx/templates
# e escreve o resultado em /etc/nginx/conf.d — é assim que BACKEND_ORIGIN e os limites
# entram na config sem precisar reconstruir a imagem por ambiente.
COPY nginx.conf.template /etc/nginx/templates/default.conf.template

COPY --from=build /app/dist /usr/share/nginx/html

# Faz o entrypoint preencher NGINX_LOCAL_RESOLVERS com o DNS de /etc/resolv.conf
# (o DNS interno do Docker). Sem isso o entrypoint pula esse passo e a diretiva
# `resolver` do nginx.conf.template fica sem valor, derrubando o nginx no boot.
ENV NGINX_ENTRYPOINT_LOCAL_RESOLVERS=1

# Defaults do docker-compose; sobrescreva no ambiente se o backend estiver noutro host.
ENV NGINX_PORT=80
ENV BACKEND_ORIGIN=http://backend:3000
ENV MAX_UPLOAD_SIZE=100m
ENV PROXY_TIMEOUT=120s

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget -q -O /dev/null "http://127.0.0.1:${NGINX_PORT}/" || exit 1
