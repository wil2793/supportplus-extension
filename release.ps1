# =============================================================
# release.ps1 - Script de release automatico SupportPlus Tools
#
# Uso:
#   .\database\release.ps1 -Version "6.3.2" -Cambios "Descripcion de cambios"
#
# El script:
#   1. Corre webpack (build de produccion)
#   2. Genera el ZIP desde dist/
#   3. Commitea y pushea el ZIP a GitHub
#   4. Registra la version en la BD via API con la URL de GitHub
# =============================================================
param(
    [Parameter(Mandatory=$true)]
    [string]$Version,

    [Parameter(Mandatory=$true)]
    [string]$Cambios,

    [string]$UsuarioAlta = "DBA",
    [string]$Branch = "feat/typescript-migration",
    [string]$Repo = "wil2793/supportplus-extension",
    [string]$ApiBase = "https://back-extension-sp.macropay.mx/api",
    [string]$ApiKey = "c93666bd500472565a7e183365092191bd8fa734720fd20d04bd5c456949864d"
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot

# ── 1. Build ──────────────────────────────────────────────────
Write-Host "[1/4] Building webpack..." -ForegroundColor Cyan
Set-Location $Root
$buildResult = & cmd /c "npx webpack --mode production 2>&1"
if ($LASTEXITCODE -ne 0) { throw "Build fallido" }
Write-Host "  Build OK" -ForegroundColor Green

# ── 2. Generar ZIP ────────────────────────────────────────────
Write-Host "[2/4] Generando ZIP..." -ForegroundColor Cyan
$ZipPath = Join-Path $Root "releases\v$Version.zip"
New-Item -ItemType Directory -Force -Path (Join-Path $Root "releases") | Out-Null
Remove-Item $ZipPath -ErrorAction SilentlyContinue
Compress-Archive -Path (Join-Path $Root "dist\*") -DestinationPath $ZipPath -Force

$ZipSize = [math]::Round((Get-Item $ZipPath).Length / 1KB, 1)
Write-Host "  ZIP: $ZipPath ($ZipSize KB)" -ForegroundColor Green

# Verificar que NO contiene env.js
Add-Type -AssemblyName System.IO.Compression.FileSystem
$zip = [System.IO.Compression.ZipFile]::OpenRead($ZipPath)
$entries = $zip.Entries | Select-Object -ExpandProperty Name
$zip.Dispose()
if ($entries -contains "env.js") { throw "ERROR: el ZIP contiene env.js - build incorrecto" }
Write-Host "  Archivos: $($entries -join ', ')" -ForegroundColor DarkGray

# ── 3. Commit + Push ZIP a GitHub ─────────────────────────────
Write-Host "[3/4] Pusheando ZIP a GitHub..." -ForegroundColor Cyan
& git add -f "releases/v$Version.zip"
& git commit -m "release: v$Version.zip"
& git push origin $Branch
Write-Host "  Pushed OK" -ForegroundColor Green

# ── 4. Registrar version en la BD ─────────────────────────────
Write-Host "[4/4] Registrando version en la BD..." -ForegroundColor Cyan
$ZipUrl = "https://raw.githubusercontent.com/$Repo/$Branch/releases/v$Version.zip"

$body = @{
    version       = $Version
    cambios       = $Cambios
    archivoZipUrl = $ZipUrl
    usuarioAlta   = $UsuarioAlta
    activo        = $true
} | ConvertTo-Json -Depth 5

$headers = @{
    "Content-Type" = "application/json"
    "X-API-Key"    = $ApiKey
}

try {
    $response = Invoke-RestMethod `
        -Uri "$ApiBase/versiones" `
        -Method POST `
        -Headers $headers `
        -Body ([System.Text.Encoding]::UTF8.GetBytes($body))
    Write-Host "  Version v$Version registrada en BD OK (id: $($response.data.idVersion))" -ForegroundColor Green
} catch {
    Write-Warning "  No se pudo registrar via API: $_"
    $CambiosEsc = $Cambios -replace "'", "''"
    $sql = @"
USE [SupportPlusDB]
GO
INSERT INTO MSP_Versiones (Version, Cambios, ArchivoZipUrl, UsuarioAlta, Activo)
VALUES (N'$Version', N'$CambiosEsc', N'$ZipUrl', '$UsuarioAlta', 1);
GO
"@
    $sqlPath = Join-Path $Root "database\insert_v$Version.sql"
    Set-Content -Path $sqlPath -Value $sql -Encoding UTF8
    Write-Host "  SQL guardado en: $sqlPath" -ForegroundColor Yellow
    Write-Host "  Ejecutalo manualmente en SQL Server."
}

Write-Host ""
Write-Host "Release v$Version completado!" -ForegroundColor Green
Write-Host "ZIP URL: $ZipUrl"
Write-Host "Los usuarios con version anterior veran el boton Actualizar y descargaran el ZIP directo."
