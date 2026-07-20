param(
  [Parameter(Mandatory = $true)]
  [string]$InputCsv,
  [Parameter(Mandatory = $true)]
  [string]$FullOutputCsv,
  [Parameter(Mandatory = $true)]
  [string]$MaengOutputCsv,
  [string]$BasisOutputCsv = ''
)

$ErrorActionPreference = 'Stop'
$projectRoot = if ($PSScriptRoot) { Split-Path -Parent $PSScriptRoot } else { (Get-Location).Path }
$locationPath = Join-Path $projectRoot 'data\강원특별자치도 춘천시_버스정류장 위치정보_20260326.csv'
$stopsPath = Join-Path $projectRoot 'app\public\data\stops.json'

$surveyRows = @(Import-Csv -LiteralPath $InputCsv -Encoding UTF8)
$locations = @(Import-Csv -LiteralPath $locationPath -Encoding Default)
$stops = @((Get-Content -LiteralPath $stopsPath -Raw -Encoding UTF8 | ConvertFrom-Json).stops)

$locationById = @{}
foreach ($row in $locations) {
  $locationById[[string]$row.관리번호] = $row
}

$stopById = @{}
foreach ($stop in $stops) {
  $stopById[[string]$stop.id] = $stop
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

$fullRows = foreach ($survey in $surveyRows) {
  $id = [string]$survey.관리번호
  $location = $locationById[$id]
  $stop = $stopById[$id]
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
    방면정보 = '공식 원본 미제공'
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
    식별자관리방식 = '관리번호=기관 내부 조인키; 정류장번호=현장·모바일 안내번호'
    우선순위작성기준 = $priorityBasis
  }
}

$fullRows | Export-Csv -LiteralPath $FullOutputCsv -NoTypeInformation -Encoding UTF8

$maengRows = @($fullRows | Where-Object {
  $rank = 0
  [int]::TryParse([string]$_.우선순위, [ref]$rank) -and $rank -ge 66 -and $rank -le 110
} | Select-Object 우선순위,관리번호,정류장번호,정류장명,방면정보,카카오지도핀URL,로드뷰URL,그늘,의자,조명,도착안내기,'촬영시점(YYYY.MM)',촬영시점확인상태,조사자,비고)
$maengRows | Export-Csv -LiteralPath $MaengOutputCsv -NoTypeInformation -Encoding UTF8

if (-not $BasisOutputCsv) {
  $BasisOutputCsv = Join-Path (Split-Path -Parent $FullOutputCsv) 'roadview_survey_column_basis.csv'
}

$columnBasis = @(
  [pscustomobject]@{ 열='관리번호'; 구분='공식 원본'; 공식출처='춘천시 버스정류장 위치정보'; 원본필드='관리번호'; 처리='원문 그대로'; 비고='위치·노선 자료를 연결하는 기관 관리 식별자' }
  [pscustomobject]@{ 열='정류장번호'; 구분='공식 원본'; 공식출처='춘천시 버스정류장 위치정보'; 원본필드='정류장 번호'; 처리='원문 그대로'; 비고='현장·모바일 안내용 번호' }
  [pscustomobject]@{ 열='정류장명'; 구분='공식 원본'; 공식출처='춘천시 버스정류장 위치정보'; 원본필드='정류장명'; 처리='원문 그대로'; 비고='' }
  [pscustomobject]@{ 열='정류장명영문'; 구분='공식 원본'; 공식출처='춘천시 버스정류장 위치정보'; 원본필드='정류장명(영어)'; 처리='원문 그대로'; 비고='' }
  [pscustomobject]@{ 열='위도'; 구분='공식 원본'; 공식출처='춘천시 버스정류장 위치정보'; 원본필드='위도'; 처리='원문 그대로'; 비고='' }
  [pscustomobject]@{ 열='경도'; 구분='공식 원본'; 공식출처='춘천시 버스정류장 위치정보'; 원본필드='경도'; 처리='원문 그대로'; 비고='' }
  [pscustomobject]@{ 열='위치데이터기준일'; 구분='공식 원본'; 공식출처='춘천시 버스정류장 위치정보'; 원본필드='데이터기준일'; 처리='원문 그대로'; 비고='' }
  [pscustomobject]@{ 열='방면정보'; 구분='공식 미제공 표시'; 공식출처='춘천시 위치정보·노선정보'; 원본필드='해당 필드 없음'; 처리='공식 원본 미제공으로 고정'; 비고='상행·하행 및 방면을 추정하지 않음' }
  [pscustomobject]@{ 열='한낮승차'; 구분='프로젝트 산출'; 공식출처='승하차 표본자료'; 원본필드='11~16시 승차'; 처리='동명 정류장 단위 집계'; 비고='춘천시 정류장 위치정보 원본 필드가 아님' }
  [pscustomobject]@{ 열='우선순위'; 구분='프로젝트 산출'; 공식출처='없음'; 원본필드='없음'; 처리='수요 분위수와 시설 미확인 비율 결합'; 비고='공식 중요도 또는 행정 우선순위가 아님' }
  [pscustomobject]@{ 열='카카오지도핀URL'; 구분='편의용 파생'; 공식출처='공식 위도·경도'; 원본필드='위도, 경도'; 처리='카카오맵 좌표 링크 생성'; 비고='춘천시 원본 필드가 아님' }
  [pscustomobject]@{ 열='로드뷰URL'; 구분='조사용 파생'; 공식출처='공식 위도·경도'; 원본필드='위도, 경도'; 처리='카카오 로드뷰 좌표 링크 생성'; 비고='가장 가까운 파노라마로 이동할 수 있음' }
  [pscustomobject]@{ 열='그늘·의자·조명·도착안내기'; 구분='현장 조사'; 공식출처='없음'; 원본필드='없음'; 처리='있음/없음/미확인 3상태 입력'; 비고='근거 없이 없음으로 입력하지 않음' }
  [pscustomobject]@{ 열='촬영시점(YYYY.MM)'; 구분='로드뷰 수기 확인'; 공식출처='카카오 로드뷰 화면'; 원본필드='공식 API 필드 없음'; 처리='화면에서 확인한 경우만 입력'; 비고='자동 추정 금지' }
)
$columnBasis | Export-Csv -LiteralPath $BasisOutputCsv -NoTypeInformation -Encoding UTF8

Write-Output "FULL_ROWS=$($fullRows.Count)"
Write-Output "MAENG_ROWS=$($maengRows.Count)"
Write-Output "FULL_OUTPUT=$FullOutputCsv"
Write-Output "MAENG_OUTPUT=$MaengOutputCsv"
Write-Output "BASIS_OUTPUT=$BasisOutputCsv"
