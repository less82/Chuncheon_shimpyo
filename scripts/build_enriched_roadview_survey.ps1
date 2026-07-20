param(
  [Parameter(Mandatory = $true)]
  [string]$InputCsv,
  [Parameter(Mandatory = $true)]
  [string]$FullOutputCsv,
  [Parameter(Mandatory = $true)]
  [string]$MaengOutputCsv,
  [string]$BasisOutputCsv = '',
  [string]$PriorityEvidenceOutputCsv = ''
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

$fullRows = foreach ($survey in $surveyRows) {
  $id = [string]$survey.관리번호
  $location = $locationById[$id]
  $stop = $stopById[$id]
  $lat = if ($location) { [string]$location.위도 } elseif ($stop) { [string]$stop.lat } else { '' }
  $lng = if ($location) { [string]$location.경도 } elseif ($stop) { [string]$stop.lng } else { '' }
  $name = if ($location) { [string]$location.정류장명 } else { [string]$survey.정류장명 }
  $pinLabel = [uri]::EscapeDataString("${name} 정류장")
  $pinUrl = if ($lat -and $lng) { "https://map.kakao.com/link/map/${pinLabel},${lat},${lng}" } else { '' }
  $isNumericRank = 0
  $rankIsNumber = [int]::TryParse([string]$survey.우선순위, [ref]$isNumericRank)

  [pscustomobject][ordered]@{
    '조사 순번(내부 작업순서)' = [string]$survey.우선순위
    '정류장 번호' = if ($location) { [string]$location.'정류장 번호' } else { '' }
    관리번호 = $id
    정류장명 = $name
    '정류장명(영어)' = if ($location) { [string]$location.'정류장명(영어)' } else { '' }
    경도 = $lng
    위도 = $lat
    '표본기간 한낮(11~16시) 승차건수(동명 정류장 합산)' = [string]$survey.한낮승차
    '정류장 위치 확인 URL(카카오맵)' = $pinUrl
    '정류장 주변 확인 URL(카카오 로드뷰)' = [string]$survey.로드뷰URL
    그늘 = [string]$survey.그늘
    의자 = [string]$survey.의자
    조명 = [string]$survey.조명
    도착안내기 = [string]$survey.도착안내기
    '촬영시점(YYYY.MM)' = [string]$survey.'촬영시점(YYYY.MM)'
    조사자 = [string]$survey.조사자
    비고 = [string]$survey.비고
  }
}

$fullRows | Export-Csv -LiteralPath $FullOutputCsv -NoTypeInformation -Encoding UTF8

$maengRows = @($fullRows | Where-Object {
  $rank = 0
  [int]::TryParse([string]$_.'조사 순번(내부 작업순서)', [ref]$rank) -and $rank -ge 66 -and $rank -le 110
} | Select-Object '조사 순번(내부 작업순서)','정류장 번호',관리번호,정류장명,'정류장명(영어)',경도,위도,'표본기간 한낮(11~16시) 승차건수(동명 정류장 합산)','정류장 위치 확인 URL(카카오맵)','정류장 주변 확인 URL(카카오 로드뷰)',그늘,의자,조명,도착안내기,'촬영시점(YYYY.MM)',조사자,비고
)
$maengRows | Export-Csv -LiteralPath $MaengOutputCsv -NoTypeInformation -Encoding UTF8

if (-not $BasisOutputCsv) {
  $BasisOutputCsv = Join-Path (Split-Path -Parent $FullOutputCsv) 'roadview_survey_column_basis.csv'
}

$columnBasis = @(
  [pscustomobject]@{ 열='관리번호'; 구분='공식 원본'; 공식출처='춘천시 버스정류장 위치정보'; 원본필드='관리번호'; 처리='원문 그대로'; 비고='위치·노선 자료를 연결하는 기관 관리 식별자' }
  [pscustomobject]@{ 열='정류장 번호'; 구분='공식 원본'; 공식출처='춘천시 버스정류장 위치정보'; 원본필드='정류장 번호'; 처리='원문 그대로'; 비고='현장·모바일 안내용 번호' }
  [pscustomobject]@{ 열='정류장명'; 구분='공식 원본'; 공식출처='춘천시 버스정류장 위치정보'; 원본필드='정류장명'; 처리='원문 그대로'; 비고='' }
  [pscustomobject]@{ 열='정류장명(영어)'; 구분='공식 원본'; 공식출처='춘천시 버스정류장 위치정보'; 원본필드='정류장명(영어)'; 처리='원문 그대로'; 비고='' }
  [pscustomobject]@{ 열='위도'; 구분='공식 원본'; 공식출처='춘천시 버스정류장 위치정보'; 원본필드='위도'; 처리='원문 그대로'; 비고='' }
  [pscustomobject]@{ 열='경도'; 구분='공식 원본'; 공식출처='춘천시 버스정류장 위치정보'; 원본필드='경도'; 처리='원문 그대로'; 비고='' }
  [pscustomobject]@{ 열='데이터기준일'; 구분='출처 근거표에서만 관리'; 공식출처='춘천시 버스정류장 위치정보'; 원본필드='데이터기준일'; 처리='조사 작업표에서는 제외'; 비고='사용한 위치 원본은 2026-03-26 기준' }
  [pscustomobject]@{ 열='표본기간 한낮(11~16시) 승차건수(동명 정류장 합산)'; 구분='프로젝트 집계'; 공식출처='강원특별자치도 춘천시_버스노선별 시간대별 승하차 인원_20251209.csv'; 원본필드='수집일자, 정류장명, 이용시간대, 승차건수'; 처리='2025-06-25~28의 11~16시 승차건수를 동명 정류장 단위로 합산'; 비고='방향별 값이 아니며 일평균·연간 수요로 해석하지 않음' }
  [pscustomobject]@{ 열='조사 순번(내부 작업순서)'; 구분='프로젝트 내부값'; 공식출처='없음'; 원본필드='없음'; 처리='기존 대상 선정 결과의 작업 순서를 보존'; 비고='개별 정류장 위험도나 공식 행정 우선순위로 사용하지 않음' }
  [pscustomobject]@{ 열='정류장 위치 확인 URL(카카오맵)'; 구분='편의용 파생'; 공식출처='춘천시 위치정보의 위도·경도'; 원본필드='위도, 경도'; 처리='좌표를 카카오맵 위치 링크 형식으로 변환'; 비고='춘천시 원본 필드가 아닌 조사 참고 링크' }
  [pscustomobject]@{ 열='정류장 주변 확인 URL(카카오 로드뷰)'; 구분='조사용 파생'; 공식출처='춘천시 위치정보의 위도·경도'; 원본필드='위도, 경도'; 처리='좌표를 카카오 로드뷰 링크 형식으로 변환'; 비고='가장 가까운 파노라마로 이동할 수 있음' }
  [pscustomobject]@{ 열='그늘·의자·조명·도착안내기'; 구분='현장 조사'; 공식출처='없음'; 원본필드='없음'; 처리='있음/없음/미확인 3상태 입력'; 비고='근거 없이 없음으로 입력하지 않음' }
  [pscustomobject]@{ 열='촬영시점(YYYY.MM)'; 구분='로드뷰 수기 확인'; 공식출처='카카오 로드뷰 화면'; 원본필드='공식 API 필드 없음'; 처리='화면에서 확인한 경우만 입력'; 비고='자동 추정 금지' }
)
$columnBasis | Export-Csv -LiteralPath $BasisOutputCsv -NoTypeInformation -Encoding UTF8

if (-not $PriorityEvidenceOutputCsv) {
  $PriorityEvidenceOutputCsv = Join-Path (Split-Path -Parent $FullOutputCsv) 'roadview_survey_priority_evidence.csv'
}

$priorityEvidence = foreach ($survey in $surveyRows) {
  $id = [string]$survey.관리번호
  $location = $locationById[$id]
  $stop = $stopById[$id]
  $unknownCount = if ($stop) {
    @('shade','seat','light','sign' | Where-Object { $stop.facilities.$_.status -eq 'unknown' }).Count
  } else { '' }
  $numericRank = 0
  $hasRank = [int]::TryParse([string]$survey.우선순위, [ref]$numericRank)
  [pscustomobject][ordered]@{
    우선순위 = [string]$survey.우선순위
    '조사대상 구분' = if ($hasRank) { '승차자료 있음(순위 산정)' } else { '승차자료 없음(별도 조사)' }
    '정류장 번호' = if ($location) { [string]$location.'정류장 번호' } else { '' }
    관리번호 = $id
    정류장명 = if ($location) { [string]$location.정류장명 } else { [string]$survey.정류장명 }
    '위치정보 데이터기준일' = if ($location) { [string]$location.데이터기준일 } else { '' }
    '승차자료 데이터기준일' = '2025-12-09'
    '승차자료 표본기간' = '2025-06-25~2025-06-28'
    '한낮 시간대' = '11~16시'
    '표본기간 한낮 승차건수' = [string]$survey.한낮승차
    '기존자료 미확인 시설 수' = $unknownCount
    '우선순위 산정식' = if ($hasRank) { '승차건수 분위수(D) + 미확인 시설 수/4(UNK)' } else { '순위 미산정' }
    '승차자료 연결 방식' = '정류장명 기준 합산'
    '연결 한계' = '승차자료 정류장아이디와 위치정보 관리번호의 공식 대응표가 없어 동명 정류장은 양방향 합산'
    '승차자료 출처' = '강원특별자치도 춘천시_버스노선별 시간대별 승하차 인원_20251209.csv'
    '위치정보 출처' = '강원특별자치도 춘천시_버스정류장 위치정보_20260326.csv'
  }
}
$priorityEvidence | Export-Csv -LiteralPath $PriorityEvidenceOutputCsv -NoTypeInformation -Encoding UTF8

Write-Output "FULL_ROWS=$($fullRows.Count)"
Write-Output "MAENG_ROWS=$($maengRows.Count)"
Write-Output "FULL_OUTPUT=$FullOutputCsv"
Write-Output "MAENG_OUTPUT=$MaengOutputCsv"
Write-Output "BASIS_OUTPUT=$BasisOutputCsv"
Write-Output "PRIORITY_EVIDENCE_OUTPUT=$PriorityEvidenceOutputCsv"
