# Copacol — Conversor de Arquivos

Conversor de documentos pelo navegador, para uso interno da Copacol. Todo o
processamento acontece em servidor Linux da cooperativa; nenhum arquivo é enviado a
serviços externos.

| Ferramenta | Motor | Observação |
|---|---|---|
| Juntar PDF | pdf-lib | ordem escolhida pelo usuário |
| Dividir PDF | pdf-lib | intervalo para um PDF, ou um PDF por página (ZIP) |
| Girar PDF / Remover páginas | pdf-lib | já existiam |
| Comprimir PDF | Ghostscript | 3 níveis; nunca devolve arquivo maior que o original |
| Word (DOCX) → PDF | LibreOffice | conferido visualmente: cabeçalho, tabela, imagens, acentos |
| PowerPoint (PPTX) → PDF | LibreOffice | já existia |
| Imagens → PDF | sharp + pdf-lib | JPG, PNG e WebP; corrige orientação de foto de celular |
| Converter imagem | sharp | JPG ↔ PNG ↔ WebP; várias imagens saem em ZIP |
| PDF → Word | pdf2docx | só PDF com texto; PDF digitalizado é identificado e recusado (sem OCR). Ver licença em [LICENCAS.md](LICENCAS.md) |

A tela só mostra a ferramenta se o motor dela estiver instalado no servidor
(`GET /api/tools`). "PDF para Excel" saiu da tela: não há implementação confiável.

---

## Arquitetura

```
navegador ──HTTPS──► proxy reverso corporativo
                          │ HTTP + X-Forwarded-Proto
                          ▼
                 nginx (frontend) :8080 ──auth_request──► oauth2-proxy :4180 ──► Keycloak
                          │  SPA + /api com "Authorization: Bearer <token da sessão>"
                          ▼  rede "interno" (internal: sem saída)
                 backend Node :3000  ── fila de trabalhos ──► pdf-lib / sharp  (worker thread)
                          │                                └► LibreOffice / Ghostscript / pdf2docx
                          ▼                                   (processos isolados)
                 volume /data/jobs/<uuid>/{input,work,output,meta.json}
```

### Por que não integrar com o Transmute

Comparação feita sobre o código do Transmute (commit `7de1265`, 03/10/2026):

| | Integrar meu sistema ao Transmute pela API | Fork do Transmute | **Evoluir meu backend com motores específicos (escolhido)** |
|---|---|---|---|
| Autenticação/autorização | Transmute tem usuários e banco próprios. Pela API, todos os colaboradores virariam **um único usuário técnico** (chave de API): o isolamento entre usuários teria de ser refeito no meu backend de qualquer forma. | Herda e precisa manter o modelo de usuários dele | Dono do trabalho = `sub` do token do Keycloak, verificado em toda rota |
| Superfície de ataque | Imagem com Calibre, Inkscape, Draw.io (Electron), FFmpeg, Pandoc, yt-dlp, LibreOffice, Ghostscript, PyMuPDF… para usar 6 operações. Importação por URL embutida (teve SSRF, CVE-2026-54054) sem opção para desligar | Igual, mais o custo de remover partes | Só LibreOffice (Writer/Impress), Ghostscript, pdf2docx, sharp e pdf-lib |
| Dados | Arquivos duplicados: meu backend + banco SQLite/volume do Transmute, com duas políticas de retenção | Uma, mas no modelo dele | Uma retenção, configurável, num lugar só |
| Atualizações de segurança | Trocar a tag da imagem (bom) | **Pior caso**: merge manual a cada release | `apt upgrade` + `npm audit` na reconstrução; poucas dependências para acompanhar |
| Licenças | Traz PyMuPDF e Ghostscript (AGPL) obrigatoriamente | Idem | Ghostscript e PyMuPDF só nas ferramentas que precisam, desligáveis |
| Esforço | Proxy de upload, mapeamento de formatos, sincronização de estado | Alto e contínuo | Reaproveita o backend existente (pdf-lib, LibreOffice, pdf2docx, `execFile`) |

O backend existente já fazia 5 das 6 operações prioritárias. Faltavam conversão de
imagens e compressão de verdade (a anterior só removia metadados). Adicionar sharp e
Ghostscript foi menos manutenção do que operar um segundo sistema completo — o
Transmute ficou como referência de desenho (trabalhos por usuário, checagem de dono em
toda rota, detecção de PDF digitalizado).

### Fluxo de um trabalho

1. `POST /api/jobs` (multipart: `tool`, `files`, opções) — arquivos vão para
   `/data/incoming` com nome aleatório; o backend detecta o **formato real** pelo conteúdo
   (assinatura; DOCX/PPTX pelas entradas do ZIP, recusando versões com macro), valida
   opções e limites, cria `/data/jobs/<uuid>/` e responde **202**.
2. A fila processa até `MAX_CONCURRENT_JOBS` por vez. A tela consulta
   `GET /api/jobs/<id>` e mostra a **etapa** ("Na fila (posição 2)", "Convertendo com
   LibreOffice"…) — sem porcentagem inventada. Só o envio mostra % real.
3. Ao terminar (sucesso, falha, timeout ou cancelamento): `work/` é apagado; os originais
   também, se `ORIGINAL_RETENTION_MINUTES=0` (padrão).
4. `GET /api/jobs/<id>/download` entrega o resultado **só ao dono**. Trabalho de outra
   pessoa responde 404 igual a um inexistente.
5. A limpeza periódica apaga tudo que passou do prazo (`RESULT_RETENTION_MINUTES`).
   O usuário também pode apagar na hora.

### Controles de segurança

| Requisito | Onde está |
|---|---|
| Login corporativo OIDC (Keycloak) | oauth2-proxy + `auth_request` no nginx (`frontend/nginx/default.conf.template`) |
| Defesa em profundidade | backend valida sozinho o access token: assinatura (JWKS), `iss`, `aud`, `exp`, papel opcional (`backend/src/auth/`) — ignora headers como `X-Forwarded-User` |
| Cada usuário só vê os próprios trabalhos | `JobStore.getOwned` (`backend/src/jobs/store.js`), testado em `test/ownership.test.js` e no e2e |
| Ids não adivinháveis / sem path traversal | UUID v4 validado por regex antes de qualquer acesso ao disco; nomes internos `input-1.pdf`; nome original só é usado (sanitizado) no `Content-Disposition` |
| Formato real, não extensão | `backend/src/lib/sniff.js` |
| Sem shell | `spawn` com array de argumentos, ambiente mínimo (o filho não vê segredos), grupo de processos morto por inteiro no timeout (`backend/src/lib/process.js`) |
| Limites | tamanho por arquivo, total por envio, nº de arquivos, páginas, pixels; tempo por trabalho; concorrência global, fila e por usuário; heap do worker; tamanho de saída (`prlimit`); CPU/RAM/PIDs no compose |
| Temporários por trabalho, limpos após falha | `finally` na fila + limpeza periódica + limpeza no boot |
| Retenção configurável | `ORIGINAL_RETENTION_MINUTES`, `RESULT_RETENTION_MINUTES` |
| Logs sem conteúdo, nomes ou tokens | `backend/src/lib/logger.js` (JSON por linha; campos com nomes sensíveis descartados) |
| Sem importação por URL | não existe essa função |
| Conversores sem rede | backend só na rede `interno` (`internal: true`); chaves do Keycloak chegam pelo repasse `/jwks` do nginx |
| Permissões mínimas | containers `read_only`, `cap_drop: ALL`, `no-new-privileges`, usuários sem root (backend UID 10001, nginx UID 101), sem socket Docker, um volume nomeado só para os dados |
| Sem telemetria/terceiros | CSP `default-src 'self'`; bundle sem URL externa (testado); nenhum serviço chama a internet — só o oauth2-proxy e o nginx falam com o Keycloak |

---

## Homologação (Docker, Linux)

Pré-requisitos: Docker Engine 24+ com Compose v2; o servidor precisa baixar imagens de
`docker.io` e `quay.io` e pacotes Debian/npm/PyPI **durante o build**. Em execução,
só o oauth2-proxy e o nginx precisam alcançar o Keycloak.

### 1. Keycloak (corporativo)

No realm da cooperativa, crie o client:

- **Client ID** `conversor`, *OpenID Connect*, **Client authentication: ON** (confidencial)
- **Standard flow: ON**; Direct access grants: OFF
- **Valid redirect URIs**: `https://<endereço do conversor>/oauth2/callback`
- **Valid post logout redirect URIs**: `https://<endereço do conversor>/*`
- Advanced → **PKCE method: S256**
- Client scopes → `conversor-dedicated` → *Add mapper* → **Audience**:
  *Included Client Audience* = `conversor`, *Add to access token* = ON
  (o backend recusa tokens sem `aud: conversor`)
- (opcional) Realm role `conversor-usuario` atribuída a quem pode usar; deixe
  `OIDC_REQUIRED_ROLE` vazio para liberar todo o realm.

Copie o *Client secret* (aba Credentials).

### 2. Configuração

```bash
git clone <repositório> conversor && cd conversor
git checkout feat/homologacao-jobs-oidc     # até ser integrado
cp .env.example .env && chmod 600 .env
cp backend/.env.example backend/.env
python3 -c 'import os,base64;print(base64.urlsafe_b64encode(os.urandom(32)).decode())'  # -> OAUTH2_COOKIE_SECRET
nano .env      # PUBLIC_URL, OIDC_ISSUER, OIDC_CLIENT_SECRET, OAUTH2_COOKIE_SECRET
```

Variáveis da raiz (`.env`) — exemplos sem credenciais reais:

| Variável | Exemplo | Para quê |
|---|---|---|
| `PUBLIC_URL` | `https://conversor-hml.exemplo.copacol.intra` | endereço público; define o redirect do OIDC |
| `BIND_ADDRESS` / `HTTP_PORT` | `127.0.0.1` / `8080` | onde o nginx escuta para o proxy reverso |
| `OIDC_ISSUER` | `https://sso.exemplo.copacol.intra/realms/copacol` | issuer do realm |
| `OIDC_CLIENT_ID` | `conversor` | client e audience exigida |
| `OIDC_CLIENT_SECRET` | `troque-pelo-segredo-do-client` | segredo do client |
| `OIDC_REQUIRED_ROLE` | `conversor-usuario` | papel exigido (vazio = todos) |
| `OAUTH2_COOKIE_SECRET` | *(32 bytes base64, gerado)* | cifra o cookie de sessão |
| `OAUTH2_COOKIE_NAME` / `OAUTH2_COOKIE_SECURE` | `__Host-conversor` / `true` | cookie só via HTTPS |
| `BACKEND_CPUS` / `BACKEND_MEMORY` | `2` / `3g` | limites do container do backend |
| `MAX_UPLOAD_SIZE` | `210m` | corpo máximo no nginx (≥ `MAX_TOTAL_UPLOAD_MB`) |
| `EDGE_SUBNET` | `172.30.10.0/24` | rede edge; só ela pode mandar X-Forwarded-* ao oauth2-proxy |

Variáveis do backend (`backend/.env`): retenção, limites de tamanho, tempo,
concorrência e `ENABLE_PDF_TO_DOCX` — todas comentadas em
[`backend/.env.example`](backend/.env.example).

Se o Keycloak usar certificado de AC interna, salve a cadeia em
`deploy/ca/ac-copacol.pem` e acrescente `-f docker-compose.ca.yml` aos comandos.

### 3. Subir

```bash
docker compose up -d --build
docker compose ps                          # backend e frontend "healthy"
docker compose logs backend | head -5      # evento "startup" lista os motores disponíveis
curl -s http://127.0.0.1:8080/healthz      # ok
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:8080/api/tools   # 401 (sem sessão)
```

### 4. Proxy reverso HTTPS

O proxy corporativo termina o TLS e encaminha para `http://<servidor>:8080`, enviando
`Host`, `X-Forwarded-Proto: https` e `X-Forwarded-For`. Exemplo (nginx):

```nginx
location / {
    proxy_pass http://127.0.0.1:8080;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Proto https;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    client_max_body_size 210m;
    proxy_request_buffering off;
    proxy_read_timeout 300s;
}
```

Não publique a porta 8080 para a rede: só o proxy deve alcançá-la.

### Teste completo sem o Keycloak corporativo

Há um Keycloak **de teste** com usuários sintéticos `alice` e `bob`:

```bash
# no .env: PUBLIC_URL=http://localhost:8080
#          OIDC_ISSUER=http://keycloak.localhost:8180/realms/copacol
#          OAUTH2_COOKIE_NAME=_conversor_sessao  OAUTH2_COOKIE_SECURE=false
#          KC_LOCAL_ADMIN_PASSWORD=...  KC_LOCAL_TEST_PASSWORD=...
docker compose --profile keycloak-local up -d --build
# navegador na própria máquina: http://localhost:8080  (login alice / KC_LOCAL_TEST_PASSWORD)
```

O nome `keycloak.localhost` funciona no Chrome/Edge/Firefox (resolvem `*.localhost`
para a própria máquina) e dentro dos containers (alias de rede). Nunca use este
perfil com usuários reais.

---

## Operação

### Atualização (inclui correções de segurança)

```bash
git pull
docker compose build --pull --no-cache     # base nova + apt upgrade + npm ci do lockfile
docker compose up -d
docker image prune -f
```

Faça ao menos **mensalmente** e sempre que sair aviso de segurança de Ghostscript,
LibreOffice, Node, nginx ou oauth2-proxy. Para mudar versões fixadas: tags no
`docker-compose.yml`/Dockerfiles, `npm update` + `npm audit` em `backend/` e
`frontend/`, e `backend/requirements-pdf2docx.txt` (instruções no próprio arquivo).

### Limpeza

A limpeza é automática (`CLEANUP_INTERVAL_SECONDS`). Para apagar **tudo** na hora:

```bash
docker compose stop backend
docker run --rm -v conversor-copacol-dados:/data alpine sh -c 'rm -rf /data/jobs/* /data/incoming/*'
docker compose start backend
```

Uso do volume: `docker system df -v | grep conversor-copacol-dados`.

### Recuperação

| Situação | O que fazer |
|---|---|
| Container reiniciou no meio de conversões | Nada: no boot os trabalhos interrompidos viram "falhou — envie novamente" e os temporários são apagados |
| Tudo 401 / login em loop | `docker compose logs oauth2-proxy`; confira `PUBLIC_URL`, redirect URI no Keycloak, `OAUTH2_COOKIE_SECURE` × HTTP/HTTPS e o relógio do servidor |
| API 503 "Serviço de autenticação indisponível" | backend não obteve o JWKS: `docker compose exec frontend wget -qO- http://127.0.0.1:8081/jwks` |
| "Servidor ocupado" frequente | aumente `MAX_CONCURRENT_JOBS` **junto com** `BACKEND_MEMORY`/`BACKEND_CPUS` |
| Volume corrompido ou cheio | os dados são temporários por definição: pare o backend, recrie o volume (`docker volume rm conversor-copacol-dados`) e suba de novo |
| Versão nova com problema | `git checkout <tag anterior>` e `docker compose up -d --build` (não há migração de dados) |

Não há backup a fazer: o volume só guarda arquivos temporários com prazo de vida.

### Logs

Backend: uma linha JSON por evento (`job.created`, `job.done`, `job.failed`,
`job.download`, `job.access_denied`, `auth.rejected`, `cleanup.sweep`…) com id do
trabalho, `sub` do usuário, ferramenta, tamanhos e tempos — nunca nome de arquivo,
conteúdo ou token.

---

## Desenvolvimento

```bash
cd backend && npm ci && cp .env.example .env
# no .env: AUTH_MODE=dev  AUTH_DEV_USER=dev  DATA_DIR=./data  NODE_ENV=development
npm run dev                            # :3000 (precisa de LibreOffice, gs, python3 + pdf2docx para todas as ferramentas)
cd ../frontend && npm ci && npm run dev  # :5173, proxia /api para :3000
```

`AUTH_MODE=dev` é recusado com `NODE_ENV=production`.

## Testes

```bash
cd backend && npm test        # 62 verificações, sem Docker (motores ausentes são pulados)
cd backend && E2E_SITE=http://localhost:8080 E2E_PASSWORD=<senha da alice> npm run test:e2e
cd frontend && UI_PASSWORD=<senha da alice> [CHROME_PATH=...] npm run test:ui
```

- `npm test` (node:test): autenticação (token de outra chave, issuer/audience errados,
  expirado, ID token, headers forjados, papel), isolamento entre usuários e ids
  manipulados, validação (vazio, extensão falsa, DOCX com macro, acima do limite, total,
  quantidade, opções), falha/saída vazia/timeout do conversor (com verificação de que
  o filho não fica órfão), timeout do worker, PDF corrompido e protegido, limites de
  concorrência, retenção e limpeza, reinício no meio do processamento, logs sem dados
  sensíveis, e todas as conversões abrindo o resultado (páginas, texto com acentos via
  `pdftotext`, imagens via `pdfimages`, formato e EXIF das imagens).
- `test:e2e`: login real no Keycloak pelo formulário, conversão pela stack, alice × bob,
  cabeçalhos de segurança, bundle sem domínio externo, logout.
- `test:ui`: Chromium com login, teclado, mensagens de erro, etapa sem %, download,
  reordenação, celular (375 px) e nenhuma requisição a terceiros.
- Arquivos de teste são **sintéticos** (`backend/test/fixtures/make_fixtures.py`).

Licenças: [LICENCAS.md](LICENCAS.md).
