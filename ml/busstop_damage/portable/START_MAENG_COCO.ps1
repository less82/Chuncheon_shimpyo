param(
  [Parameter(Mandatory = $true)]
  [string]$RepoRoot,
  [int]$ApiPort = 8000
)

$ErrorActionPreference = "Stop"
$resolvedRepoRoot = (Resolve-Path -LiteralPath $RepoRoot).Path
$launcher = Join-Path $resolvedRepoRoot "scripts\start-maeng-coco.ps1"
$primaryModel = Join-Path $PSScriptRoot "models\maeng_coco_primary_v14.pth"
$referenceModel = Join-Path $PSScriptRoot "models\maeng_coco_reference_v9.pth"

foreach ($requiredFile in @($launcher, $primaryModel, $referenceModel)) {
  if (-not (Test-Path -LiteralPath $requiredFile -PathType Leaf)) {
    throw "Required file not found: $requiredFile"
  }
}

& powershell.exe `
  -NoProfile `
  -ExecutionPolicy Bypass `
  -File $launcher `
  -ModelPath $primaryModel `
  -ReferenceModelPath $referenceModel `
  -ApiPort $ApiPort

exit $LASTEXITCODE
