# Instala o .vsix desta pasta no Antigravity IDE e/ou no VS Code (o que estiver instalado).
# Uso: powershell -ExecutionPolicy Bypass -File .\Instalar.ps1

$ErrorActionPreference = 'Stop'

$vsix = Get-ChildItem -Path $PSScriptRoot -Filter '*.vsix' |
    Sort-Object LastWriteTime -Descending |
    Select-Object -First 1
if (-not $vsix) { throw "Nenhum .vsix encontrado em $PSScriptRoot. Gere com: npx @vscode/vsce package --allow-missing-repository --skip-license" }

$candidatos = @(
    (Join-Path $env:LOCALAPPDATA 'Programs\Antigravity IDE\bin\antigravity-ide.cmd'),
    (Join-Path $env:LOCALAPPDATA 'Programs\Microsoft VS Code\bin\code.cmd')
)
foreach ($nome in 'antigravity-ide', 'antigravity', 'code') {
    $cmd = Get-Command $nome -ErrorAction SilentlyContinue
    if ($cmd) { $candidatos += $cmd.Source }
}

$clis = $candidatos | Where-Object { $_ -and (Test-Path $_) } | Select-Object -Unique
if (-not $clis) { throw 'Nem Antigravity nem VS Code encontrados. Instale um deles e rode de novo.' }

foreach ($cli in $clis) {
    Write-Host "Instalando $($vsix.Name) via $cli"
    & $cli --install-extension $vsix.FullName --force
}

Write-Host 'Pronto. Recarregue a janela do editor (Ctrl+Shift+P > Developer: Reload Window).'
