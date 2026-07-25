param(
  [string]$ModelPath = (
    Join-Path ([Environment]::GetFolderPath("UserProfile")) `
      "Downloads\busstop_coco_rfdetr\output_v2\checkpoint_best_total.pth"
  ),
  [int]$ApiPort = 8000
)

$ErrorActionPreference = "Stop"
$repoRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..")).Path
$pythonPath = Join-Path $repoRoot ".venv\Scripts\python.exe"
$venvScripts = Join-Path $repoRoot ".venv\Scripts"
$apiScript = Join-Path $repoRoot "ml\busstop_damage\api_server.py"
$appDirectory = Join-Path $repoRoot "app"
$healthUrl = "http://127.0.0.1:$ApiPort/api/maeng-coco/health"

if (-not (Test-Path -LiteralPath $pythonPath -PathType Leaf)) {
  throw "Python 가상환경을 찾을 수 없습니다: $pythonPath"
}
if (-not (Test-Path -LiteralPath $apiScript -PathType Leaf)) {
  throw "maeng_coco API 파일을 찾을 수 없습니다: $apiScript"
}
if (-not (Test-Path -LiteralPath $ModelPath -PathType Leaf)) {
  throw "학습 모델을 찾을 수 없습니다: $ModelPath"
}

$env:PATH = "$venvScripts;$env:PATH"
$env:PYTHONUTF8 = "1"
$env:PYTHONIOENCODING = "utf-8"
$env:MAENG_COCO_MODEL_PATH = (Resolve-Path -LiteralPath $ModelPath).Path
$env:VITE_MAENG_COCO_API_URL = "http://127.0.0.1:$ApiPort"

$apiProcess = $null
$apiReady = $false
try {
  try {
    $health = Invoke-RestMethod -Uri $healthUrl -TimeoutSec 2
    $apiReady = $health.status -eq "ready"
  } catch {
    $apiReady = $false
  }

  if (-not $apiReady) {
    $apiProcess = Start-Process `
      -FilePath $pythonPath `
      -ArgumentList @("`"$apiScript`"", "--host", "127.0.0.1", "--port", "$ApiPort") `
      -WorkingDirectory $repoRoot `
      -WindowStyle Hidden `
      -PassThru

    for ($attempt = 0; $attempt -lt 40; $attempt += 1) {
      if ($apiProcess.HasExited) {
        throw "maeng_coco API가 시작 중 종료됐습니다."
      }
      try {
        $health = Invoke-RestMethod -Uri $healthUrl -TimeoutSec 2
        if ($health.status -eq "ready") {
          $apiReady = $true
          break
        }
      } catch {
        Start-Sleep -Milliseconds 500
      }
    }
  }

  if (-not $apiReady) {
    throw "maeng_coco API 준비가 20초 안에 완료되지 않았습니다."
  }

  Write-Host "maeng_coco API 준비 완료: $healthUrl"
  Write-Host "앱에서 http://127.0.0.1:5173/app 을 여세요."
  Push-Location $appDirectory
  try {
    & npm.cmd run dev:citizen -- --host 127.0.0.1
  } finally {
    Pop-Location
  }
} finally {
  if ($null -ne $apiProcess -and -not $apiProcess.HasExited) {
    Stop-Process -Id $apiProcess.Id
  }
}
