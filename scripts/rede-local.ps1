<#
.SYNOPSIS
  Sobe o Conversor (homologação) neste computador Windows para ser acessado por outras
  pessoas da MESMA REDE, com o Keycloak de TESTE (usuários fictícios alice e bob).

.DESCRIPTION
  - Descobre o IP desta máquina na rede local.
  - Gera .env.rede com segredos aleatórios (não vai para o git).
  - Sobe os containers com Docker Compose (perfil keycloak-local).
  - Libera as portas 8080 e 8180 no Firewall do Windows (perfis Domínio e Privado).
  - Mostra o endereço, os usuários e a senha de teste.

  SÓ PARA TESTE: tráfego em HTTP (sem certificado) e Keycloak com usuários fictícios.
  Não use documentos reais nem senhas reais. Para homologação oficial, veja o README.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File scripts\rede-local.ps1
  powershell -ExecutionPolicy Bypass -File scripts\rede-local.ps1 -IP 10.1.18.213
  powershell -ExecutionPolicy Bypass -File scripts\rede-local.ps1 -Parar
#>
[CmdletBinding()]
param(
  [string]$IP,
  [switch]$Parar,
  [switch]$SemFirewall
)

$ErrorActionPreference = 'Stop'
$Raiz = Split-Path -Parent $PSScriptRoot
Set-Location $Raiz
$EnvFile = Join-Path $Raiz '.env.rede'
$Compose = @('compose', '--env-file', '.env.rede', '--profile', 'keycloak-local')

function Escrever($texto, $cor = 'Gray') { Write-Host $texto -ForegroundColor $cor }

# ── Docker ──
try { docker info --format '{{.ServerVersion}}' *> $null } catch { }
if ($LASTEXITCODE -ne 0) {
  Escrever 'O Docker não está rodando. Abra o Docker Desktop, espere ficar "Running" e rode de novo.' Red
  exit 1
}

if ($Parar) {
  if (-not (Test-Path $EnvFile)) { Escrever 'Nada para parar (.env.rede não existe).' Yellow; exit 0 }
  docker @Compose down
  Escrever 'Conversor parado.' Green
  exit 0
}

# ── IP desta máquina na rede local ──
if (-not $IP) {
  $rota = Get-NetRoute -DestinationPrefix '0.0.0.0/0' -ErrorAction SilentlyContinue |
    Sort-Object { $_.RouteMetric + $_.InterfaceMetric } | Select-Object -First 1
  if ($rota) {
    $IP = (Get-NetIPAddress -InterfaceIndex $rota.InterfaceIndex -AddressFamily IPv4 -ErrorAction SilentlyContinue |
      Where-Object { $_.IPAddress -notlike '169.254.*' } | Select-Object -First 1).IPAddress
  }
}
if (-not $IP) {
  Escrever 'Não consegui descobrir o IP desta máquina. Rode de novo informando: -IP 10.x.x.x' Red
  exit 1
}

function Segredo([int]$bytes = 32) {
  $b = New-Object byte[] $bytes
  [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b)
  [Convert]::ToBase64String($b).Replace('+', '-').Replace('/', '_')
}
function Senha {
  # Legível para digitar no celular: 3 blocos de letras/números.
  $c = 'abcdefghjkmnpqrstuvwxyz23456789'.ToCharArray()
  $b = New-Object byte[] 12
  [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b)
  $s = -join ($b | ForEach-Object { $c[$_ % $c.Length] })
  "Teste-$($s.Substring(0,4))-$($s.Substring(4,4))"
}

# Reaproveita senhas de uma execução anterior (só o IP muda).
$anterior = @{}
if (Test-Path $EnvFile) {
  Get-Content $EnvFile | Where-Object { $_ -match '^\s*([A-Z0-9_]+)=(.*)$' } |
    ForEach-Object { $anterior[$Matches[1]] = $Matches[2] }
}
function Manter($nome, $novo) { if ($anterior[$nome]) { $anterior[$nome] } else { $novo } }

$senhaTeste = Manter 'KC_LOCAL_TEST_PASSWORD' (Senha)
$conteudo = @"
# Gerado por scripts/rede-local.ps1 — SÓ PARA TESTE NA REDE LOCAL. Não versionar.
PUBLIC_URL=http://${IP}:8080
BIND_ADDRESS=0.0.0.0
HTTP_PORT=8080
OIDC_ISSUER=http://${IP}:8180/realms/copacol
OIDC_INTERNAL_URL=http://keycloak:8180/realms/copacol
OIDC_CLIENT_ID=conversor
OIDC_CLIENT_SECRET=$(Manter 'OIDC_CLIENT_SECRET' (Segredo))
OIDC_REQUIRED_ROLE=conversor-usuario
OAUTH2_COOKIE_SECRET=$(Manter 'OAUTH2_COOKIE_SECRET' (Segredo))
OAUTH2_COOKIE_NAME=_conversor_sessao
OAUTH2_COOKIE_SECURE=false
KC_LOCAL_HOSTNAME=http://${IP}:8180
KC_LOCAL_BIND=0.0.0.0
KC_LOCAL_ADMIN_PASSWORD=$(Manter 'KC_LOCAL_ADMIN_PASSWORD' (Segredo 18))
KC_LOCAL_TEST_PASSWORD=$senhaTeste
"@
Set-Content -Path $EnvFile -Value $conteudo -Encoding ascii
# Arquivo com segredos: só o usuário atual lê.
try { icacls $EnvFile /inheritance:r /grant:r "$($env:USERNAME):(R,W)" | Out-Null } catch { }

$backendEnv = Join-Path $Raiz 'backend\.env'
if (-not (Test-Path $backendEnv)) { Copy-Item (Join-Path $Raiz 'backend\.env.example') $backendEnv }

# ── Firewall ──
if (-not $SemFirewall) {
  $admin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole(
    [Security.Principal.WindowsBuiltInRole]::Administrator)
  $regra = Get-NetFirewallRule -DisplayName 'Conversor Copacol (teste)' -ErrorAction SilentlyContinue
  if (-not $regra) {
    if ($admin) {
      New-NetFirewallRule -DisplayName 'Conversor Copacol (teste)' -Direction Inbound -Action Allow `
        -Protocol TCP -LocalPort 8080, 8180 -Profile Domain, Private | Out-Null
      Escrever 'Firewall: portas 8080 e 8180 liberadas (redes de Domínio e Privada).' Green
    } else {
      Escrever 'Aviso: sem permissão de administrador para liberar o firewall.' Yellow
      Escrever '  Se outras pessoas não conseguirem abrir, rode UMA vez num PowerShell como administrador:' Yellow
      Escrever "  New-NetFirewallRule -DisplayName 'Conversor Copacol (teste)' -Direction Inbound -Action Allow -Protocol TCP -LocalPort 8080,8180 -Profile Domain,Private" Yellow
    }
  }
}

# ── Subir ──
Escrever "`nConstruindo e subindo os containers (a primeira vez leva alguns minutos)..." Cyan
docker @Compose up -d --build
if ($LASTEXITCODE -ne 0) { Escrever 'Falha ao subir. Veja as mensagens acima.' Red; exit 1 }

Escrever 'Aguardando o Keycloak e o conversor ficarem prontos...' Cyan
$pronto = $false
for ($i = 0; $i -lt 90; $i++) {
  try {
    $kc = Invoke-WebRequest -UseBasicParsing -TimeoutSec 3 "http://${IP}:8180/realms/copacol"
    $fe = Invoke-WebRequest -UseBasicParsing -TimeoutSec 3 "http://${IP}:8080/healthz"
    if ($kc.StatusCode -eq 200 -and $fe.StatusCode -eq 200) { $pronto = $true; break }
  } catch { }
  Start-Sleep -Seconds 3
}
if (-not $pronto) {
  Escrever 'Ainda não respondeu. Confira com:  docker compose --env-file .env.rede ps' Yellow
}

Escrever "`n=========================================================" Green
Escrever "  Conversor no ar:   http://${IP}:8080" Green
Escrever "  Usuários de teste: alice  e  bob" Green
Escrever "  Senha (dos dois):  $senhaTeste" Green
Escrever '=========================================================' Green
Escrever 'Mande o endereço para quem estiver na mesma rede. É só um ambiente de TESTE:'
Escrever 'não envie documentos reais. Para parar:  scripts\rede-local.ps1 -Parar'
