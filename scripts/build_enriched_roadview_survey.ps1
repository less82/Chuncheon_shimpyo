param(
  [Parameter(Mandatory = $true)]
  [string]$InputCsv,
  [Parameter(Mandatory = $true)]
  [string]$FullOutputCsv,
  [Parameter(Mandatory = $true)]
  [string]$MaengOutputCsv
)

$ErrorActionPreference = 'Stop'
$projectRoot = if ($PSScriptRoot) { Split-Path -Parent $PSScriptRoot } else { (Get-Location).Path }
$locationPath = Join-Path $projectRoot 'data\강원특별자치도 춘천시_버스정류장 위치정보_20260326.csv'
$routePath = Join-Path $projectRoot 'data\강원특별자치도 춘천시_버스정류장 노선정보_20260326.csv'
$stopsPath = Join-Path $projectRoot 'app\public\data\stops.json'

$surveyRows = @(Import-Csv -LiteralPath $InputCsv -Encoding UTF8)
$locations = @(Import-Csv -LiteralPath $locationPath -Encoding Default)
$routeRows = @(Import-Csv -LiteralPath $routePath -Encoding Default)
$stops = @((Get-Content -LiteralPath $stopsPath -Raw -Encoding UTF8 | ConvertFrom-Json).stops)

$locationById = @{}
foreach ($row in $locations) {
  $locationById[[string]$row.관리번호] = $row
}

$stopById = @{}
foreach ($stop in $stops) {
  $stopById[[string]$stop.id] = $stop
}

$routeGroups = @{}
foreach ($group in ($routeRows | Group-Object 노선)) {
  $routeGroups[[string]$group.Name] = @($group.Group | Sort-Object { [int]$_.정류장순서 })
}

$routeEntriesByStop = @{}
foreach ($row in $routeRows) {
  $id = [string]$row.정류장
  if (-not $routeEntriesByStop.ContainsKey($id)) {
    $routeEntriesByStop[$id] = [System.Collections.Generic.List[object]]::new()
  }
  $routeEntriesByStop[$id].Add($row)
}

function Get-UnknownFacilities([object]$stop) {
  if ($null -eq $stop) { return @() }
  $labels = [ordered]@{ shade = '그늘'; seat = '의자'; light = '조명'; sign = '도착안내기' }
  $unknown = @()
  foreach ($property in $labels.Keys) {
    if ($stop.facilities.$property.status -eq 'unknown') {
      $unknown += $labels[$property]
    }
  }
  return $unknown
}

function Get-RouteDirectionInfo([string]$stopId) {
  if (-not $routeEntriesByStop.ContainsKey($stopId)) {
    return [pscustomobject]@{ Routes = ''; NextStops = ''; Detail = '노선정보 없음' }
  }

  $routeNames = [System.Collections.Generic.List[string]]::new()
  $nextNames = [System.Collections.Generic.List[string]]::new()
  $details = [System.Collections.Generic.List[string]]::new()

  foreach ($entry in @($routeEntriesByStop[$stopId] | Sort-Object 노선번호, { [int]$_.정류장순서 })) {
    $routeId = [string]$entry.노선
    $routeNo = [string]$entry.노선번호
    if (-not $routeNames.Contains($routeNo)) { $routeNames.Add($routeNo) }
    $ordered = @($routeGroups[$routeId])
    $currentIndex = -1
    for ($i = 0; $i -lt $ordered.Count; $i++) {
      if ([string]$ordered[$i].정류장 -eq $stopId -and [string]$ordered[$i].정류장순서 -eq [string]$entry.정류장순서) {
        $currentIndex = $i
        break
      }
    }
    if ($currentIndex -lt 0) { continue }
    $following = @()
    for ($j = $currentIndex + 1; $j -lt $ordered.Count -and $following.Count -lt 2; $j++) {
      $following += [string]$ordered[$j].정류장명
    }
    if ($following.Count -eq 0) {
      $details.Add("${routeNo}: 운행종료/회차")
    } else {
      if (-not $nextNames.Contains($following[0])) { $nextNames.Add($following[0]) }
      $details.Add("${routeNo}: " + ($following -join ' → '))
    }
  }

  return [pscustomobject]@{
    Routes = $routeNames -join ' · '
    NextStops = $nextNames -join ' / '
    Detail = $details -join ' | '
  }
}

$fullRows = foreach ($survey in $surveyRows) {
  $id = [string]$survey.관리번호
  $location = $locationById[$id]
  $stop = $stopById[$id]
  $direction = Get-RouteDirectionInfo $id
  $unknown = @(Get-UnknownFacilities $stop)
  $lat = if ($location) { [string]$location.위도 } elseif ($stop) { [string]$stop.lat } else { '' }
  $lng = if ($location) { [string]$location.경도 } elseif ($stop) { [string]$stop.lng } else { '' }
  $name = if ($location) { [string]$location.정류장명 } else { [string]$survey.정류장명 }
  $pinLabel = [uri]::EscapeDataString("${name} 정류장")
  $pinUrl = if ($lat -and $lng) { "https://map.kakao.com/link/map/${pinLabel},${lat},${lng}" } else { '' }
  $isNumericRank = 0
  $rankIsNumber = [int]::TryParse([string]$survey.우선순위, [ref]$isNumericRank)
  $priorityType = if ($rankIsNumber) { '수요확인 조사 우선순위' } else { '수요미확인 별도 조사후보' }
  $priorityBasis = if ($rankIsNumber) {
    'D(한낮 11~16시 승차 분위수) + UNK(미확인 시설수/4); 동명 정류장 수요는 양방향 합산'
  } else {
    '수요 매칭 없음; 미확인 시설수가 많은 정류장 중 별도 표본 15곳'
  }

  [pscustomobject][ordered]@{
    우선순위 = [string]$survey.우선순위
    우선순위구분 = $priorityType
    관리번호 = $id
    정류장번호 = if ($location) { [string]$location.'정류장 번호' } else { '' }
    정류장명 = $name
    정류장명영문 = if ($location) { [string]$location.'정류장명(영어)' } else { '' }
    위도 = $lat
    경도 = $lng
    한낮승차 = [string]$survey.한낮승차
    미확인시설수 = $unknown.Count
    미확인시설목록 = $unknown -join ' · '
    경유노선 = $direction.Routes
    대표진행방면_다음정류장 = $direction.NextStops
    노선별진행정보_공식순서기반 = $direction.Detail
    상하행구분 = '공식 원본 미제공(노선별 정류장순서로 대체)'
    카카오지도핀URL = $pinUrl
    로드뷰URL = [string]$survey.로드뷰URL
    그늘 = [string]$survey.그늘
    의자 = [string]$survey.의자
    조명 = [string]$survey.조명
    도착안내기 = [string]$survey.도착안내기
    '촬영시점(YYYY.MM)' = [string]$survey.'촬영시점(YYYY.MM)'
    촬영시점확인상태 = if ($survey.'촬영시점(YYYY.MM)') { '수기확인됨' } else { '로드뷰 화면에서 수동확인 필요' }
    조사자 = [string]$survey.조사자
    비고 = [string]$survey.비고
    위치데이터기준일 = if ($location) { [string]$location.데이터기준일 } else { '' }
    노선데이터기준일 = '2026-03-26'
    식별자관리방식 = '관리번호=기관 내부 조인키; 정류장번호=현장·모바일 안내번호'
    방면산출방식 = '춘천시 노선정보의 노선ID·정류장순서를 이용한 다음 정류장 표시(파생값)'
    우선순위작성기준 = $priorityBasis
  }
}

$fullRows | Export-Csv -LiteralPath $FullOutputCsv -NoTypeInformation -Encoding UTF8

$maengRows = @($fullRows | Where-Object {
  $rank = 0
  [int]::TryParse([string]$_.우선순위, [ref]$rank) -and $rank -ge 66 -and $rank -le 110
} | Select-Object 우선순위,관리번호,정류장번호,정류장명,대표진행방면_다음정류장,노선별진행정보_공식순서기반,카카오지도핀URL,로드뷰URL,그늘,의자,조명,도착안내기,'촬영시점(YYYY.MM)',촬영시점확인상태,조사자,비고)
$maengRows | Export-Csv -LiteralPath $MaengOutputCsv -NoTypeInformation -Encoding UTF8

Write-Output "FULL_ROWS=$($fullRows.Count)"
Write-Output "MAENG_ROWS=$($maengRows.Count)"
Write-Output "FULL_OUTPUT=$FullOutputCsv"
Write-Output "MAENG_OUTPUT=$MaengOutputCsv"
