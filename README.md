# Copacol — Ferramentas de PDF

Dois projetos independentes:

| Projeto | O que é | Porta |
|---|---|---|
| [`frontend/`](frontend/) | SPA em React (Vite), servida por nginx, que também proxia `/api` | 8080 |
| [`backend/`](backend/) | API Node/Express: todo o processamento, validação e configuração | 3000 (interna) |

## Como as duas partes se falam

```
navegador  ──►  nginx (frontend:80)  ──►  Express (backend:3000)
                     │                          │
                     ├─ build do Vite           ├─ pdf-lib (juntar, dividir, girar…)
                     └─ proxy de /api/*         ├─ LibreOffice headless (docx/pptx → pdf)
                                                └─ pdf2docx (pdf → docx)
```

Três regras que sustentam a separação:

1. **O frontend não conhece o backend.** As chamadas usam só o caminho relativo `/api/...`
   ([`src/api/client.js`](frontend/src/api/client.js)). Quem sabe onde o backend mora é o
   nginx, via `BACKEND_ORIGIN` ([`nginx.conf.template`](frontend/nginx.conf.template)); em
   desenvolvimento o proxy do Vite faz o mesmo papel, então não existe URL de API embutida
   no bundle em nenhum ambiente. Um Content-Security-Policy com `connect-src 'self'` faz o
   navegador impor isso, e não há CDN nem fonte externa — as fontes são auto-hospedadas em
   `frontend/public/fonts/`.

2. **O frontend não processa arquivo.** Ele coleta, envia, mostra progresso e entrega o
   download. Toda a manipulação de PDF vive em [`backend/src/lib/pdfTools.js`](backend/src/lib/pdfTools.js).

3. **Toda credencial e configuração ficam em `backend/.env`.** Nada disso trafega até o
   navegador — o backend nem publica porta no host, só o frontend o alcança pela rede
   interna do Compose. O único dado de config que a página recebe é `/api/config`, que
   devolve apenas os limites de upload para a tela poder avisar o usuário.

## Rodando

```bash
cp backend/.env.example backend/.env   # ajuste se precisar
docker compose up --build
```

Acesse **http://localhost:8080**.

## Frontend

React 19 + Vite. O `index.html` é só a casca da SPA (`<div id="root">` e o script que
aplica o tema antes do primeiro paint, pra página não piscar) — toda a interface é React.

```
frontend/
├── index.html              casca da SPA
├── vite.config.js          build + proxy de /api em desenvolvimento
├── public/                 servido como está: img/, fonts/
└── src/
    ├── main.jsx            entrada; importa os estilos pro bundle
    ├── App.jsx             layout e qual ferramenta está aberta
    ├── api/client.js       ÚNICO módulo que fala com a rede
    ├── data/tools.js       catálogo das ferramentas (cards, modal, rota da API)
    ├── components/         SiteHeader, ToolsGrid, ToolModal, Dropzone, icons…
    ├── hooks/              useTheme, useServerLimits, useModalA11y
    └── styles/             style.css e fonts.css (auto-hospedadas)
```

Acrescentar uma ferramenta é acrescentar uma entrada em `src/data/tools.js` e a rota
correspondente no backend — os cards e o modal saem dali.

```bash
cd frontend
npm install
npm run dev      # http://localhost:5173, com /api proxiado pro backend local
npm run build    # gera dist/
npm run preview  # serve o dist/ em :4173, pra conferir o build de produção
```

O `npm run dev` espera um backend em `http://localhost:3000` (ajustável por
`VITE_DEV_BACKEND`) — normalmente `cd backend && npm run dev` numa outra aba.

### Abrir de outro aparelho da rede

`dev` e `preview` escutam em todas as interfaces (`host: true` no `vite.config.js`), então
o Vite imprime o link já pronto ao subir:

```
➜  Local:   http://localhost:5173/
➜  Network: http://10.1.18.213:5173/     ← este é o link pra compartilhar
```

Havendo mais de uma linha `Network:`, use a do IP da sua rede de verdade; os `172.x`
costumam ser switches virtuais do Docker/WSL e não são alcançáveis por outros aparelhos.

Quem abre pelo IP também usa o `/api` normalmente: o proxy roda nesta máquina, então o
backend continua acessível só por aqui e não precisa ser exposto na rede.

No Windows, a primeira execução costuma abrir o aviso do firewall — é preciso permitir o
Node no perfil de rede em uso, senão a página só responde em `localhost`. Para conferir se
a permissão já existe:

```powershell
Get-NetFirewallRule -DisplayName 'Node.js JavaScript Runtime' |
  Where-Object Direction -eq 'Inbound' |
  Select-Object Enabled, Action, Profile
```

## Backend

```bash
cd backend && npm install && npm run dev
```

As conversões de Office exigem LibreOffice e o pacote Python `pdf2docx` instalados na
máquina (ajuste `LIBREOFFICE_BIN` e `PYTHON_BIN` no `.env`). As demais ferramentas de PDF
não dependem de nada externo.

## Testes

```bash
cd backend && npm test          # todas as rotas, sem Docker
cd backend && npm run test:e2e  # o caminho inteiro pela porta 8080 (exige a stack de pé)
cd frontend && npm run test:ui  # a interface num Chrome real (exige a stack de pé)
```

- `npm test` sobe o backend numa porta de teste e exercita cada rota, incluindo entradas
  inválidas e arquivos corrompidos.
- `test:e2e` cobre as conversões reais (PDF → DOCX → PDF), confere que o bundle não
  referencia domínio externo e que o backend não está publicado no host.
- `test:ui` usa a tela como um usuário — clica, escolhe arquivo, processa, confere o
  download — e falha se **qualquer** requisição da página sair desta origem. Usa um Chrome
  ou Edge já instalado (não baixa navegador).

## API

Todas as rotas recebem `multipart/form-data` e devolvem o arquivo pronto, ou
`{ "error": "mensagem em português" }` em caso de falha. Quando há algo a dizer sobre o
resultado (quanto a compressão economizou, quantas páginas saíram), vem no header
`X-Result-Info`, porque o corpo já é o binário.

| Método | Rota | Campos | Devolve |
|---|---|---|---|
| GET  | `/api/health` | — | `{"status":"ok"}` |
| GET  | `/api/config` | — | limites de upload |
| POST | `/api/pdf/merge` | `files[]` (2+) | PDF |
| POST | `/api/pdf/split` | `file`, `range` (`1-3`, `2,4,6`) | PDF |
| POST | `/api/pdf/rotate` | `file`, `angle` (90/180/270) | PDF |
| POST | `/api/pdf/remove-pages` | `file`, `pages` | PDF |
| POST | `/api/pdf/compress` | `file` | PDF |
| POST | `/api/pdf/images-to-pdf` | `files[]` (JPG/PNG) | PDF |
| POST | `/api/convert` | `file`, `target` (`docx`\|`pdf`) | DOCX ou PDF |

Códigos de erro: `400` entrada inválida, `413` arquivo grande demais, `422` arquivo
corrompido ou não convertível, `503` servidor ocupado, `504` conversão demorou demais.

## Configuração

Tudo em [`backend/.env.example`](backend/.env.example). Quatro pares precisam andar
juntos, senão o nginx corta antes do backend ter chance de responder:

| Backend (`.env`) | Frontend (`docker-compose.yml`) |
|---|---|
| `MAX_FILE_SIZE_MB=100` | `MAX_UPLOAD_SIZE: 100m` (≥) |
| `CONVERT_TIMEOUT_MS=90000` | `PROXY_TIMEOUT: 120s` (>) |
| `PORT=3000` | `BACKEND_ORIGIN: http://backend:3000` |
| — | `NGINX_PORT` = lado direito do mapeamento em `ports` |

`CORS_ORIGIN` fica vazio no arranjo padrão: como o nginx proxia `/api`, navegador e API
compartilham a origem e não existe requisição cross-origin. Só preencha se expor o
backend diretamente para um frontend hospedado em outro domínio.

## `_legacy-monolito/`

Versão anterior (site e servidor no mesmo projeto, JavaScript sem build), guardada só
para conferência. Nada em `frontend/` ou `backend/` depende dela — pode apagar quando
quiser.
