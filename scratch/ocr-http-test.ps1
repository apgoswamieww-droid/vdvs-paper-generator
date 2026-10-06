# Live test for POST /api/ocr against the dev server (auth required).
$ErrorActionPreference = "Stop"
$tmp = Join-Path $env:TEMP "opencode"
$jar = Join-Path $tmp "ocr-cookies.txt"
$bodyPath = Join-Path $tmp "ocr-body.json"

$uri = "http://localhost:3000"

$b64 = [Convert]::ToBase64String([IO.File]::ReadAllBytes("$PWD\scratch\ocr-test.png"))
[IO.File]::WriteAllText($bodyPath, (ConvertTo-Json @{ image = $b64 }))

# 1. CSRF token
$csrfRes = curl.exe -s -c $jar "$uri/api/auth/csrf"
$csrf = ($csrfRes | ConvertFrom-Json).csrfToken
if ($csrf -match '^(.*?)(%7C|\|)') { $csrf = $Matches[1] }

# 2. Credentials login
$loginCode = curl.exe -s -o (Join-Path $tmp "ocr-login.txt") -w "%{http_code}" -b $jar -c $jar `
  -X POST "$uri/api/auth/callback/credentials" `
  -H "Content-Type: application/x-www-form-urlencoded" `
  --data-urlencode "csrfToken=$csrf" `
  --data-urlencode "email=vidyadhish.edu@gmail.com" `
  --data-urlencode "password=Admin@123"
Write-Host "login: HTTP $loginCode"

# 3. OCR requests
foreach ($n in 1..2) {
  $out = curl.exe -s -b $jar -c $jar -X POST "$uri/api/ocr" `
    -H "Content-Type: application/json" `
    --data-binary "@$bodyPath" `
    -w "`nTIME:%{time_total} HTTP:%{http_code}"
  $parts = $out -split "`nTIME:"
  Write-Host "req${n}: $($parts[1].Trim())"
  Write-Host "  body: $($parts[0].Trim().Substring(0, [Math]::Min(300, $parts[0].Trim().Length)))"
}
