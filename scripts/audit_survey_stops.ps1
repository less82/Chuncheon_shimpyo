param(
  [Parameter(Mandatory = $true)][string]$SurveyCsv,
  [Parameter(Mandatory = $true)][string]$OutputCsv
)

$ErrorActionPreference = 'Stop'
$projectRoot = if ($PSScriptRoot) { Split-Path -Parent $PSScriptRoot } else { (Get-Location).Path }
$routePath = Join-Path $projectRoot 'data\강원특별자치도 춘천시_버스정류장 노선정보_20260326.csv'
$locationPath = Join-Path $projectRoot 'data\강원특별자치도 춘천시_버스정류장 위치정보_20260326.csv'
$envPath = Join-Path $projectRoot 'app\.env'

$survey = @(Import-Csv -LiteralPath $SurveyCsv -Encoding UTF8)
$routes = @(Import-Csv -LiteralPath $routePath -Encoding Default)
$locations = @(Import-Csv -LiteralPath $locationPath -Encoding Default)
$keyLine = Get-Content -LiteralPath $envPath -Encoding UTF8 | Where-Object { $_ -match '^VITE_TAGO_KEY=' } | Select-Object -First 1
if (-not $keyLine) { throw 'VITE_TAGO_KEY가 없습니다.' }
$key = $keyLine.Substring($keyLine.IndexOf('=') + 1).Trim()

$routeCount = @{}
foreach ($group in ($routes | Group-Object 정류장)) { $routeCount[[string]$group.Name] = $group.Count }
$activeIds = @{}
foreach ($row in $routes) { $activeIds[[string]$row.정류장] = $true }

function Get-DistanceM([double]$lat1, [double]$lon1, [double]$lat2, [double]$lon2) {
  $radius = 6371000.0
  $dLat = ($lat2 - $lat1) * [Math]::PI / 180
  $dLon = ($lon2 - $lon1) * [Math]::PI / 180
  $a = [Math]::Sin($dLat / 2) * [Math]::Sin($dLat / 2) + [Math]::Cos($lat1 * [Math]::PI / 180) * [Math]::Cos($lat2 * [Math]::PI / 180) * [Math]::Sin($dLon / 2) * [Math]::Sin($dLon / 2)
  return $radius * 2 * [Math]::Atan2([Math]::Sqrt($a), [Math]::Sqrt(1 - $a))
}

$osmStops = @()
$osmQuerySucceeded = $false
try {
  $query = '[out:json][timeout:60];node["highway"="bus_stop"](37.55,127.35,38.15,128.10);out body;'
  $osm = Invoke-RestMethod -Uri 'https://overpass-api.de/api/interpreter' -Method Post -Body @{ data = $query } -TimeoutSec 90
  $osmStops = @($osm.elements)
  $osmQuerySucceeded = $true
} catch {
  Write-Warning "OSM 일괄 조회 실패: $($_.Exception.Message)"
}

$results = [System.Collections.Generic.List[object]]::new()
$index = 0
foreach ($row in $survey) {
  $index++
  $id = [string]$row.관리번호
  $lat = [double]$row.위도
  $lon = [double]$row.경도
  $expectedNodeId = "CCB$id"
  $tagoExact = $false
  $tagoName = ''
  $tagoError = ''
  try {
    $url = 'https://apis.data.go.kr/1613000/BusSttnInfoInqireService/getCrdntPrxmtSttnList' +
      '?serviceKey=' + [uri]::EscapeDataString($key) + '&_type=json&numOfRows=50&pageNo=1' +
      '&gpsLati=' + $lat.ToString([Globalization.CultureInfo]::InvariantCulture) +
      '&gpsLong=' + $lon.ToString([Globalization.CultureInfo]::InvariantCulture)
    $response = Invoke-RestMethod -Uri $url -Method Get -TimeoutSec 30
    $match = @($response.response.body.items.item | Where-Object { [string]$_.nodeid -eq $expectedNodeId } | Select-Object -First 1)
    if ($match.Count -gt 0) {
      $tagoExact = $true
      $tagoName = [string]$match[0].nodenm
    }
  } catch {
    $tagoError = $_.Exception.Message
  }

  $nearestOsm = $null
  $nearestOsmDistance = [double]::PositiveInfinity
  foreach ($osmStop in $osmStops) {
    $distance = Get-DistanceM $lat $lon ([double]$osmStop.lat) ([double]$osmStop.lon)
    if ($distance -lt $nearestOsmDistance) { $nearestOsmDistance = $distance; $nearestOsm = $osmStop }
  }
  $osmWithin30 = $nearestOsm -and $nearestOsmDistance -le 30

  $nearestSameActive = $null
  $nearestSameDistance = [double]::PositiveInfinity
  foreach ($candidate in $locations) {
    if ([string]$candidate.관리번호 -eq $id -or [string]$candidate.정류장명 -ne [string]$row.정류장명 -or -not $activeIds.ContainsKey([string]$candidate.관리번호)) { continue }
    $distance = Get-DistanceM $lat $lon ([double]$candidate.위도) ([double]$candidate.경도)
    if ($distance -lt $nearestSameDistance) { $nearestSameDistance = $distance; $nearestSameActive = $candidate }
  }

  $hasRoute = $routeCount.ContainsKey($id) -and $routeCount[$id] -gt 0
  $status = if ($hasRoute -and $tagoExact) { '춘천시 노선·TAGO 모두 확인' }
    elseif ($hasRoute) { '춘천시 노선만 확인·TAGO 불일치' }
    elseif ($tagoExact) { 'TAGO만 확인·춘천시 노선 미연결' }
    else { '춘천시 노선·TAGO 모두 미확인' }

  $results.Add([pscustomobject][ordered]@{
    '기존 조사 순번' = [string]$row.'조사 순번(내부 작업순서)'
    '정류장 번호' = [string]$row.'정류장 번호'
    관리번호 = $id
    정류장명 = [string]$row.정류장명
    경도 = [string]$row.경도
    위도 = [string]$row.위도
    '춘천시 노선정보 건수' = if ($hasRoute) { [string]$routeCount[$id] } else { '0' }
    'TAGO 관리번호 정확 일치' = if ($tagoExact) { '예' } else { '아니오' }
    'TAGO 정류장명' = $tagoName
    'TAGO 조회 오류' = $tagoError
    'OSM 정류장 객체 30m 이내' = if (-not $osmQuerySucceeded) { '조회 실패·판정 제외' } elseif ($osmWithin30) { '예' } else { '아니오' }
    '최근접 OSM 거리(m)' = if ($osmQuerySucceeded -and $nearestOsm) { [Math]::Round($nearestOsmDistance, 1) } else { '' }
    '최근접 동일명 활성 관리번호' = if ($nearestSameActive) { [string]$nearestSameActive.관리번호 } else { '' }
    '최근접 동일명 활성 거리(m)' = if ($nearestSameActive) { [Math]::Round($nearestSameDistance, 1) } else { '' }
    '교차검증 결과' = $status
    '작업용 조사표 판정' = if ($hasRoute) { '유지' } elseif ($tagoExact) { '유지' } else { '제외' }
    '카카오 지도 URL 성격' = '좌표 핀 링크·정류소 등록 증거 아님'
  })
  if ($index % 20 -eq 0) { Write-Output "PROGRESS=$index/$($survey.Count)" }
}

$results | Export-Csv -LiteralPath $OutputCsv -NoTypeInformation -Encoding UTF8
Write-Output "ROWS=$($results.Count)"
Write-Output "OUTPUT=$OutputCsv"
