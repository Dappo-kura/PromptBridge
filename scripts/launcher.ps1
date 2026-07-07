param(
    [switch]$Stop
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$url = "http://localhost:3000"

function Test-ServerUp {
    try {
        Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 1 | Out-Null
        return $true
    } catch {
        return $false
    }
}

if ($Stop) {
    $conn = Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue
    if ($conn) {
        $conn | Select-Object -ExpandProperty OwningProcess -Unique | ForEach-Object {
            Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue
        }
        Write-Host "PromptBridge を停止しました。"
    } else {
        Write-Host "PromptBridge は起動していません。"
    }
    Start-Sleep -Seconds 2
    exit 0
}

# --- すでに起動済みならブラウザを開くだけ ---
if (Test-ServerUp) {
    Write-Host "PromptBridge はすでに起動しています。ブラウザを開きます。"
    Start-Process $url
    Start-Sleep -Seconds 2
    exit 0
}

# --- Node.js の存在確認 ---
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Host "[エラー] Node.js が見つかりません。https://nodejs.org からインストールしてください。" -ForegroundColor Red
    exit 1
}

Set-Location $root

# --- 初回のみ: 依存関係のインストール ---
if (-not (Test-Path (Join-Path $root "node_modules"))) {
    Write-Host "初回セットアップ: 依存関係をインストールしています...（数分かかります）"
    & npm install --no-audit --no-fund
    if ($LASTEXITCODE -ne 0) {
        Write-Host "[エラー] npm install に失敗しました。" -ForegroundColor Red
        exit 1
    }
}

# --- 初回のみ: 本番ビルド ---
if (-not (Test-Path (Join-Path $root ".next\BUILD_ID"))) {
    Write-Host "アプリをビルドしています...（初回のみ、1～2分かかります）"
    & npm run build
    if ($LASTEXITCODE -ne 0) {
        Write-Host "[エラー] ビルドに失敗しました。" -ForegroundColor Red
        exit 1
    }
}

# --- サーバーを最小化ウィンドウで起動 ---
Write-Host "PromptBridge サーバーを起動しています..."
Start-Process -FilePath "cmd.exe" `
    -ArgumentList '/c', 'title PromptBridge Server && npm run start' `
    -WorkingDirectory $root -WindowStyle Minimized

# --- サーバーが応答するまで待機（最大30秒） ---
$ready = $false
for ($i = 0; $i -lt 60; $i++) {
    if (Test-ServerUp) { $ready = $true; break }
    Start-Sleep -Milliseconds 500
}

if (-not $ready) {
    Write-Host "[エラー] サーバーの起動を確認できませんでした。" -ForegroundColor Red
    Write-Host "最小化されている「PromptBridge Server」ウィンドウのログを確認してください。"
    exit 1
}

Start-Process $url
Write-Host ""
Write-Host "ブラウザで $url を開きました。" -ForegroundColor Green
Write-Host "終了するには「PromptBridge終了.bat」をダブルクリックするか、"
Write-Host "タスクバーの「PromptBridge Server」ウィンドウを閉じてください。"
Start-Sleep -Seconds 4
exit 0
