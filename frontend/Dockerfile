# ── Etapa 1: build da SPA ──
# O Node só existe aqui. A imagem final leva apenas os arquivos estáticos.
ARG NODE_IMAGE=node:24.21.0-trixie-slim
ARG NGINX_IMAGE=nginxinc/nginx-unprivileged:1.30.5-alpine

FROM ${NODE_IMAGE} AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY index.html vite.config.js ./
COPY src ./src
COPY public ./public
RUN npm run build

# ── Etapa 2: servir ──
# nginx-unprivileged: mesma base oficial do nginx, mas roda como usuário sem
# privilégios (UID 101) e escuta numa porta alta (8080).
FROM ${NGINX_IMAGE}

COPY nginx/default.conf.template /etc/nginx/templates/default.conf.template
COPY nginx/security-headers.conf /etc/nginx/snippets/security-headers.conf
COPY --from=build /app/dist /usr/share/nginx/html

# O entrypoint oficial preenche NGINX_LOCAL_RESOLVERS com o DNS do Docker.
ENV NGINX_ENTRYPOINT_LOCAL_RESOLVERS=1 \
    NGINX_PORT=8080 \
    BACKEND_ORIGIN=http://backend:3000 \
    OAUTH2_PROXY_UPSTREAM=http://oauth2-proxy:4180 \
    MAX_UPLOAD_SIZE=210m \
    PROXY_TIMEOUT=180s \
    OIDC_JWKS_UPSTREAM=http://keycloak:8080/realms/copacol/protocol/openid-connect/certs \
    OIDC_TLS_VERIFY=on \
    OIDC_CA_FILE=/etc/ssl/certs/ca-certificates.crt

EXPOSE 8080 8081
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -q -O /dev/null "http://127.0.0.1:${NGINX_PORT}/healthz" || exit 1
