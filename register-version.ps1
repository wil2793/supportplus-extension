# register-version.ps1
# Registra la version 6.3.2 en la BD del backend
# Ejecutar desde la red interna (o con VPN activa)

$Version  = "6.3.3"
$Cambios  = "Fix modal DBA Info: tabla completa con productos, checkboxes, cumpleanos y botones reiniciar, igual que version anterior. Fix boton Actualizar comparacion semver correcta. Fix boton DBA Info ahora aparece en header."
$ZipUrl   = "https://raw.githubusercontent.com/wil2793/supportplus-extension/feat/typescript-migration/releases/v6.3.3.zip"
$ApiBase  = "https://back-extension-sp.macropay.mx/api"
$ApiKey   = "c93666bd500472565a7e183365092191bd8fa734720fd20d04bd5c456949864d"

$body = @{
    version       = $Version
    cambios       = $Cambios
    archivoZipUrl = $ZipUrl
    usuarioAlta   = "DBA"
    activo        = $true
} | ConvertTo-Json -Depth 5

$headers = @{
    "Content-Type" = "application/json"
    "X-API-Key"    = $ApiKey
}

try {
    $r = Invoke-RestMethod -Uri "$ApiBase/versiones" -Method POST -Headers $headers `
         -Body ([System.Text.Encoding]::UTF8.GetBytes($body))
    Write-Host "Version $Version registrada OK (id: $($r.data.idVersion))" -ForegroundColor Green
    Write-Host "ZIP URL: $ZipUrl"
} catch {
    Write-Host "Error: $_" -ForegroundColor Red
}
