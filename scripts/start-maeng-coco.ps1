param(
  [string]$ModelPath = (
    Join-Path ([Environment]::GetFolderPath("UserProfile")) `
      "Downloads\busstop_coco_rfdetr\output_v7\checkpoint_selected_app.pth"
  ),
  [string]$ReferenceModelPath = (
    Join-Path ([Environment]::GetFolderPath("UserProfile")) `
      "Downloads\busstop_coco_rfdetr\output_v5\checkpoint_selected_app.pth"
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
  throw "Python virtual environment not found: $pythonPath"
}
if (-not (Test-Path -LiteralPath $apiScript -PathType Leaf)) {
  throw "maeng_coco API script not found: $apiScript"
}
if (-not (Test-Path -LiteralPath $ModelPath -PathType Leaf)) {
  throw "Primary model not found: $ModelPath"
}
if (-not (Test-Path -LiteralPath $ReferenceModelPath -PathType Leaf)) {
  throw "Reference model not found: $ReferenceModelPath"
}

$env:PATH = "$venvScripts;$env:PATH"
$env:PYTHONUTF8 = "1"
$env:PYTHONIOENCODING = "utf-8"
$resolvedModelPath = (Resolve-Path -LiteralPath $ModelPath).Path
$resolvedReferenceModelPath = (
  Resolve-Path -LiteralPath $ReferenceModelPath
).Path
$env:MAENG_COCO_MODEL_PATH = $resolvedModelPath
$env:MAENG_COCO_REFERENCE_MODEL_PATH = $resolvedReferenceModelPath
$env:VITE_MAENG_COCO_API_URL = "http://127.0.0.1:$ApiPort"

$apiProcess = $null
$apiReady = $false
try {
  try {
    $health = Invoke-RestMethod -Uri $healthUrl -TimeoutSec 2
    $apiReady = (
      $health.status -eq "ready" -and
      $health.model_path -eq $resolvedModelPath -and
      $health.reference_model_path -eq $resolvedReferenceModelPath
    )
  } catch {
    $apiReady = $false
  }

  if (-not $apiReady) {
    $apiProcess = Start-Process `
      -FilePath $pythonPath `
      -ArgumentList @(
        "`"$apiScript`"",
        "--model",
        "`"$resolvedModelPath`"",
        "--reference-model",
        "`"$resolvedReferenceModelPath`"",
        "--host",
        "127.0.0.1",
        "--port",
        "$ApiPort"
      ) `
      -WorkingDirectory $repoRoot `
      -WindowStyle Hidden `
      -PassThru

    for ($attempt = 0; $attempt -lt 40; $attempt += 1) {
      if ($apiProcess.HasExited) {
        throw "maeng_coco API exited during startup."
      }
      try {
        $health = Invoke-RestMethod -Uri $healthUrl -TimeoutSec 2
        if (
          $health.status -eq "ready" -and
          $health.model_path -eq $resolvedModelPath -and
          $health.reference_model_path -eq $resolvedReferenceModelPath
        ) {
          $apiReady = $true
          break
        }
      } catch {
        Start-Sleep -Milliseconds 500
      }
    }
  }

  if (-not $apiReady) {
    throw "maeng_coco API was not ready within 20 seconds."
  }

  Write-Host "maeng_coco API ready: $healthUrl"
  Write-Host "Open http://127.0.0.1:5173/app in the app."
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
