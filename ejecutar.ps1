param(
    [Parameter(Mandatory = $true)]
    [string]$NodePath
)

$ErrorActionPreference = "Stop"
$registro = Join-Path $PSScriptRoot "ejecuciones.log"

try {
    $env:WEBHOOK_URL = [Environment]::GetEnvironmentVariable(
        "WEBHOOK_URL",
        "User"
    )

    if (-not $env:WEBHOOK_URL) {
        throw "Falta configurar WEBHOOK_URL para el usuario."
    }

    Add-Content -Path $registro -Value "`nInicio: $(Get-Date -Format s)"

    & $NodePath (Join-Path $PSScriptRoot "catalogo.js") >> $registro 2>&1
    $codigoSalida = $LASTEXITCODE

    Add-Content -Path $registro -Value "Fin. Codigo: $codigoSalida"
    exit $codigoSalida
}
catch {
    Add-Content -Path $registro -Value "ERROR: $($_.Exception.Message)"
    exit 1
}