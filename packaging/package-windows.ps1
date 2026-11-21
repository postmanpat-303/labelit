param(
    [string]$Makensis = 'makensis.exe'
)

$ErrorActionPreference = 'Stop'
$project = Split-Path -Parent $PSScriptRoot
$binaryDirectory = Join-Path $project 'src-tauri/target/release'
$app = Join-Path $binaryDirectory 'labelit.exe'
$webview = Join-Path $binaryDirectory 'WebView2Loader.dll'
$icon = Join-Path $project 'src-tauri/icons/icon.ico'
$bwipLicense = Join-Path $project 'src/vendor/BWIP-JS-LICENSE.txt'
$fontLicense = Join-Path $project 'src/vendor/INCONSOLATA-LICENSE.txt'
$config = Get-Content -LiteralPath (Join-Path $project 'src-tauri/tauri.conf.json') -Raw | ConvertFrom-Json

foreach ($file in @($app, $webview, $icon, $bwipLicense, $fontLicense)) {
    if (!(Test-Path -LiteralPath $file -PathType Leaf)) {
        throw "Missing package input: $file. Build the Windows GNU release first."
    }
}

$output = Join-Path $binaryDirectory "$($config.productName)-$($config.version)-windows-x64-setup.exe"
& $Makensis "/DVERSION=$($config.version)" "/DOUTPUT=$output" "/DAPP_EXE=$app" "/DWEBVIEW_LOADER=$webview" "/DAPP_ICON=$icon" "/DBWIP_LICENSE=$bwipLicense" "/DFONT_LICENSE=$fontLicense" (Join-Path $PSScriptRoot 'labelit.nsi')
if ($LASTEXITCODE -ne 0) {
    throw "NSIS exited with code $LASTEXITCODE."
}

Get-Item -LiteralPath $output
