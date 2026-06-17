<#
.SYNOPSIS
  Lanzador rapido de Fabric: backend NestJS (:3000) + frontend Angular (:4200).

.DESCRIPTION
  Arranca, para, reinicia y consulta el estado de Fabric desde cualquier PC y
  desde cualquier carpeta (se autolocaliza con $PSScriptRoot). Sin pasos
  innecesarios:
    - idempotente: si un servidor ya escucha su puerto, NO lo relanza.
    - instala dependencias solo si falta node_modules (no reinstala cada vez).
    - no reconstruye: usa los dev servers en watch.
    - avisa si la BD real es alcanzable (si no lo es, el modo Real dara 500 y
      hay que usar el switch DEMO; NO es un bug del codigo).

  Los servidores quedan corriendo en segundo plano (ventana oculta) y su salida
  se vuelca a 05_proyectos\fabric\.logs\*.log (ignorados por git).

.PARAMETER Command
  up | start      Arranca backend + frontend (por defecto).
  backend | be    Arranca solo el backend.
  frontend | fe   Arranca solo el frontend.
  restart         Reinicia (ver Target). Lo mas habitual: 'restart backend'.
  stop            Para (ver Target).
  status          Estado de puertos + BD + URLs.
  logs            Ultimas lineas de log (ver Target).

.PARAMETER Target
  all (por defecto) | backend | be | frontend | fe
  Aplica a restart / stop / logs.

.EXAMPLE
  .\fabric.ps1                 # arranca todo
  .\fabric.ps1 restart backend # reinicia solo el backend (lo mas pedido)
  .\fabric.ps1 status          # que esta corriendo + BD alcanzable?
  .\fabric.ps1 stop            # para todo
#>
[CmdletBinding()]
param(
  [Parameter(Position = 0)][string]$Command = 'up',
  [Parameter(Position = 1)][string]$Target  = 'all'
)

$Root        = $PSScriptRoot
$BackendDir  = Join-Path $Root 'backend'
$FrontendDir = Join-Path $Root 'frontend'
$LogDir      = Join-Path $Root '.logs'
$EnvFile     = Join-Path $BackendDir '.env'

# --- Puertos (el backend respeta PORT del .env; por defecto 3000 / 4200) ---
$BackendPort  = 3000
$FrontendPort = 4200
if (Test-Path $EnvFile) {
  $portLine = Get-Content $EnvFile | Where-Object { $_ -match '^\s*PORT\s*=' } | Select-Object -First 1
  if ($portLine -and ($portLine -match '=\s*"?(\d+)"?')) { $BackendPort = [int]$Matches[1] }
}

if (-not (Test-Path $LogDir)) { New-Item -ItemType Directory -Path $LogDir | Out-Null }

function Get-PortPid([int]$Port) {
  $c = Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($c) { return [int]$c.OwningProcess }
  return $null
}

function Stop-Tree([int]$ProcId) {
  if ($ProcId -and $ProcId -gt 0) { cmd /c "taskkill /PID $ProcId /T /F >nul 2>&1" }
}

function Stop-One([string]$Name, [int]$Port) {
  $pidFile = Join-Path $LogDir "$Name.pid"
  $any = $false
  if (Test-Path $pidFile) {
    $saved = Get-Content $pidFile -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($saved) { Stop-Tree ([int]$saved); $any = $true }
    Remove-Item $pidFile -ErrorAction SilentlyContinue
  }
  $owner = Get-PortPid $Port
  if ($owner) { Stop-Tree $owner; $any = $true }
  if ($any) { Write-Host "  - $Name detenido (puerto $Port)" -ForegroundColor Yellow }
  else      { Write-Host "  - $Name no estaba corriendo" -ForegroundColor DarkGray }
}

function Install-DepsIfMissing([string]$Name, [string]$Dir, [bool]$IsBackend) {
  if (-not (Test-Path (Join-Path $Dir 'node_modules'))) {
    Write-Host "  - ${Name}: instalando dependencias (primera vez, puede tardar)..." -ForegroundColor Cyan
    Push-Location $Dir
    try {
      & npm install
      if ($IsBackend) { & npm run prisma:generate }
    } finally { Pop-Location }
  }
}

function Start-One([string]$Name, [string]$Dir, [string[]]$NpmArgs, [int]$Port, [bool]$IsBackend) {
  $existing = Get-PortPid $Port
  if ($existing) {
    Write-Host "  - $Name ya corre en :$Port (PID $existing) - no relanzo" -ForegroundColor Green
    return
  }
  Install-DepsIfMissing $Name $Dir $IsBackend
  $out = Join-Path $LogDir "$Name.out.log"
  $err = Join-Path $LogDir "$Name.err.log"
  # Lanzamos via cmd.exe (CreateProcess no ejecuta .cmd directamente) en ventana
  # oculta y volcamos la salida a ficheros para poder consultar logs luego.
  $proc = Start-Process -FilePath $env:ComSpec `
            -ArgumentList (@('/c', 'npm') + $NpmArgs) `
            -WorkingDirectory $Dir -WindowStyle Hidden `
            -RedirectStandardOutput $out -RedirectStandardError $err -PassThru
  $proc.Id | Out-File -FilePath (Join-Path $LogDir "$Name.pid") -Encoding ascii
  Write-Host "  - $Name arrancando en :$Port (PID $($proc.Id)) - log: .logs\$Name.out.log" -ForegroundColor Green
}

function Wait-Port([string]$Name, [int]$Port, [int]$TimeoutSec = 60) {
  $deadline = (Get-Date).AddSeconds($TimeoutSec)
  while ((Get-Date) -lt $deadline) {
    if (Get-PortPid $Port) {
      Write-Host "  - $Name escuchando en :$Port  ->  http://127.0.0.1:$Port" -ForegroundColor Green
      return $true
    }
    Start-Sleep -Milliseconds 700
  }
  Write-Host "  - $Name no abrio :$Port en ${TimeoutSec}s - revisa .logs\$Name.err.log" -ForegroundColor Red
  return $false
}

function Test-Db {
  if (-not (Test-Path $EnvFile)) {
    Write-Host "  BD: falta backend\.env (copia backend\.env.example y rellena DATABASE_URL)" -ForegroundColor Yellow
    return
  }
  $url = Get-Content $EnvFile | Where-Object { $_ -match '^\s*DATABASE_URL\s*=' } | Select-Object -First 1
  if ($url -and ($url -match '@([^:/?@]+):(\d+)')) {
    $h = $Matches[1]; $p = [int]$Matches[2]
    $ok = (Test-NetConnection -ComputerName $h -Port $p -WarningAction SilentlyContinue).TcpTestSucceeded
    if ($ok) {
      Write-Host "  BD real ${h}:${p}: ALCANZABLE  ->  el modo Real sirve datos" -ForegroundColor Green
    } else {
      Write-Host "  BD real ${h}:${p}: NO alcanzable  ->  el modo Real dara 500." -ForegroundColor Yellow
      Write-Host "    Este PC no esta en la red de fabrica: usa el switch DEMO de la barra superior." -ForegroundColor Yellow
    }
  } else {
    Write-Host "  BD: no pude leer host:puerto de DATABASE_URL" -ForegroundColor Yellow
  }
}

function Show-Status {
  Write-Host "Fabric - estado" -ForegroundColor Cyan
  $be = Get-PortPid $BackendPort
  $fe = Get-PortPid $FrontendPort
  if ($be) { Write-Host "  backend  :$BackendPort  CORRIENDO (PID $be)   http://127.0.0.1:$BackendPort" -ForegroundColor Green }
  else     { Write-Host "  backend  :$BackendPort  parado" -ForegroundColor DarkGray }
  if ($fe) { Write-Host "  frontend :$FrontendPort  CORRIENDO (PID $fe)   http://127.0.0.1:$FrontendPort" -ForegroundColor Green }
  else     { Write-Host "  frontend :$FrontendPort  parado" -ForegroundColor DarkGray }
  Test-Db
}

function Resolve-Target([string]$T) {
  switch ($T.ToLower()) {
    'be'       { return 'backend' }
    'backend'  { return 'backend' }
    'fe'       { return 'frontend' }
    'frontend' { return 'frontend' }
    default    { return 'all' }
  }
}

$BackendArgs  = @('run', 'start:dev')
$FrontendArgs = @('start')

switch ($Command.ToLower()) {
  { $_ -in 'up', 'start' } {
    Write-Host "Arrancando Fabric..." -ForegroundColor Cyan
    Start-One 'backend'  $BackendDir  $BackendArgs  $BackendPort  $true
    Start-One 'frontend' $FrontendDir $FrontendArgs $FrontendPort $false
    Wait-Port 'backend'  $BackendPort  60 | Out-Null
    Wait-Port 'frontend' $FrontendPort 90 | Out-Null
    Write-Host ""
    Show-Status
    break
  }
  { $_ -in 'backend', 'be' } {
    Start-One 'backend' $BackendDir $BackendArgs $BackendPort $true
    Wait-Port 'backend' $BackendPort 60 | Out-Null
    Test-Db
    break
  }
  { $_ -in 'frontend', 'fe' } {
    Start-One 'frontend' $FrontendDir $FrontendArgs $FrontendPort $false
    Wait-Port 'frontend' $FrontendPort 90 | Out-Null
    break
  }
  'stop' {
    $t = Resolve-Target $Target
    Write-Host "Parando Fabric ($t)..." -ForegroundColor Cyan
    if ($t -in 'all', 'backend')  { Stop-One 'backend'  $BackendPort }
    if ($t -in 'all', 'frontend') { Stop-One 'frontend' $FrontendPort }
    break
  }
  'restart' {
    $t = Resolve-Target $Target
    Write-Host "Reiniciando Fabric ($t)..." -ForegroundColor Cyan
    if ($t -in 'all', 'backend')  { Stop-One 'backend'  $BackendPort }
    if ($t -in 'all', 'frontend') { Stop-One 'frontend' $FrontendPort }
    Start-Sleep -Milliseconds 500
    if ($t -in 'all', 'backend')  { Start-One 'backend'  $BackendDir  $BackendArgs  $BackendPort  $true }
    if ($t -in 'all', 'frontend') { Start-One 'frontend' $FrontendDir $FrontendArgs $FrontendPort $false }
    if ($t -in 'all', 'backend')  { Wait-Port 'backend'  $BackendPort  60 | Out-Null }
    if ($t -in 'all', 'frontend') { Wait-Port 'frontend' $FrontendPort 90 | Out-Null }
    Write-Host ""
    Show-Status
    break
  }
  'status' { Show-Status; break }
  'logs' {
    $t = Resolve-Target $Target
    $names = if ($t -eq 'all') { @('backend', 'frontend') } else { @($t) }
    foreach ($n in $names) {
      foreach ($suffix in @('out', 'err')) {
        $f = Join-Path $LogDir "$n.$suffix.log"
        if (Test-Path $f) {
          Write-Host "=== $n.$suffix.log (ultimas 25) ===" -ForegroundColor Cyan
          Get-Content $f -Tail 25
        }
      }
    }
    break
  }
  default {
    Write-Host "Comando desconocido: $Command" -ForegroundColor Red
    Write-Host "Uso: fabric.ps1 [up|backend|frontend|restart|stop|status|logs] [all|backend|frontend]"
    Write-Host "Ejemplos:  fabric.ps1 up   |   fabric.ps1 restart backend   |   fabric.ps1 status"
  }
}
