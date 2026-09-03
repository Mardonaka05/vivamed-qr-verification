# =============================================================
#  VivaMed QR Verification -> GitHub
#  PowerShell 5.1 / 7.x
#
#  Ishlatish:
#     cd "C:\...\vivamed-qr-verification"
#     .\push-to-github.ps1
# =============================================================

$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$RepoName = 'vivamed-qr-verification'
$Owner    = 'Mardonaka05'
$Desc     = 'QR document verification for clinics - Google Workspace Add-on issues QR-stamped PDFs, Cloudflare Worker verifies them on the clinic domain and streams the file through a 5-minute HMAC-signed private gateway'
$Topics   = @('cloudflare-workers','google-apps-script','qr-code','document-verification','hmac','pdf','healthcare','serverless')

Set-Location $PSScriptRoot

Write-Host ''
Write-Host '=============================================' -ForegroundColor Cyan
Write-Host "   $RepoName -> GitHub" -ForegroundColor Cyan
Write-Host '=============================================' -ForegroundColor Cyan
Write-Host ''

# --- [1] git -------------------------------------------------
Write-Host '[1] git tekshirilmoqda'
try {
    $v = git --version
    Write-Host "    $v" -ForegroundColor Green
} catch {
    Write-Host '    git topilmadi. https://git-scm.com/download/win dan o''rnating.' -ForegroundColor Red
    exit 1
}

# --- [2] maxfiy ma'lumot tekshiruvi --------------------------
Write-Host '[2] Maxfiy ma''lumot qidirilmoqda'

$patterns = @(
    'BEGIN [A-Z ]*PRIVATE KEY',
    'AIza[0-9A-Za-z_\-]{30,}',
    '\bghp_[0-9A-Za-z]{30,}',
    '\b\d{9,10}:AA[0-9A-Za-z_\-]{30,}',
    'intizomda\.uz'
)

$hits = @()
Get-ChildItem -Recurse -File |
    Where-Object { $_.FullName -notmatch '\\\.git\\' -and $_.Length -lt 2MB } |
    ForEach-Object {
        $f = $_
        $text = Get-Content $f.FullName -Raw -ErrorAction SilentlyContinue
        if ($text) {
            foreach ($p in $patterns) {
                if ($text -match $p) { $hits += "$($f.Name) -> $p" }
            }
        }
    }

if ($hits.Count -gt 0) {
    Write-Host '    DIQQAT - quyidagilar topildi:' -ForegroundColor Red
    $hits | ForEach-Object { Write-Host "      $_" -ForegroundColor Red }
    $go = Read-Host '    Baribir davom etamizmi? (ha / yo''q)'
    if ($go -ne 'ha') { exit 1 }
} else {
    Write-Host '    toza' -ForegroundColor Green
}

# --- [3] commit ----------------------------------------------
Write-Host '[3] Lokal commit'

if (-not (Test-Path '.git')) { git init -b main | Out-Null }

git config user.name  'Mardonbek Sulaymonqulov'
git config user.email 'mardonbeksulaymonqulov156@gmail.com'

git add -A 2>$null

$staged = git diff --cached --name-only
if ($staged) {
    git commit -q -m "VivaMed QR document verification system

Google Workspace Add-on for issuing QR-stamped PDF documents, and a
Cloudflare Worker that verifies them on the clinic's own domain and
streams the file from Restricted Drive storage through a private,
HMAC-signed 5-minute gateway.

All identifiers, hostnames and credentials are placeholders."
    Write-Host "    $(($staged | Measure-Object).Count) ta fayl commit qilindi" -ForegroundColor Green
} else {
    Write-Host '    o''zgarish yo''q' -ForegroundColor Yellow
}

# --- [4] GitHub'da repo -------------------------------------
Write-Host '[4] GitHub repozitoriysi'

$token = Read-Host '    Personal access token (repo scope). Bo''sh qoldirsangiz brauzer orqali yaratasiz'

if ($token) {
    $headers = @{
        Authorization          = "Bearer $token"
        'User-Agent'           = 'vivamed-setup'
        Accept                 = 'application/vnd.github+json'
        'X-GitHub-Api-Version' = '2022-11-28'
    }

    $body = @{
        name        = $RepoName
        description = $Desc
        private     = $false
        has_issues  = $true
        has_wiki    = $false
    } | ConvertTo-Json

    try {
        Invoke-RestMethod -Method Post -Uri 'https://api.github.com/user/repos' `
            -Headers $headers -Body $body -ContentType 'application/json' | Out-Null
        Write-Host '    repo yaratildi' -ForegroundColor Green
    } catch {
        if ($_.Exception.Response.StatusCode.value__ -eq 422) {
            Write-Host '    repo allaqachon mavjud - davom etamiz' -ForegroundColor Yellow
        } else {
            Write-Host "    xato: $($_.Exception.Message)" -ForegroundColor Red
            exit 1
        }
    }

    try {
        Invoke-RestMethod -Method Put -Uri "https://api.github.com/repos/$Owner/$RepoName/topics" `
            -Headers $headers -Body (@{ names = $Topics } | ConvertTo-Json) `
            -ContentType 'application/json' | Out-Null
        Write-Host '    topiclar qo''shildi' -ForegroundColor Green
    } catch {
        Write-Host '    topiclarni qo''shib bo''lmadi (muhim emas)' -ForegroundColor Yellow
    }
} else {
    $url = "https://github.com/new?name=$RepoName&description=$([uri]::EscapeDataString($Desc))"
    Write-Host '    Brauzerda GitHub sahifasi ochiladi.' -ForegroundColor Yellow
    Write-Host '    MUHIM: README, .gitignore va litsenziya QO''SHMANG - bo''sh qoldiring.' -ForegroundColor Yellow
    Start-Process $url
    Read-Host '    Repo yaratilgach Enter bosing'
}

# --- [5] push ------------------------------------------------
Write-Host '[5] Push'

$remoteUrl = "https://github.com/$Owner/$RepoName.git"

if (git remote 2>$null) {
    git remote set-url origin $remoteUrl
} else {
    git remote add origin $remoteUrl
}

git branch -M main

# Ba'zan birinchi urinishda "Repository not found" chiqadi - GitHub
# repo yaratilishini hali tarqatib ulgurmagan bo'ladi. Uch marta urinamiz.
$ok = $false
for ($i = 1; $i -le 3; $i++) {
    git push -u origin main
    if ($LASTEXITCODE -eq 0) { $ok = $true; break }
    Write-Host "    urinish $i muvaffaqiyatsiz, 3 soniyadan keyin qayta..." -ForegroundColor Yellow
    Start-Sleep -Seconds 3
    git remote set-url origin $remoteUrl
}

Write-Host ''
if ($ok) {
    Write-Host '=============================================' -ForegroundColor Green
    Write-Host "   Tayyor: https://github.com/$Owner/$RepoName" -ForegroundColor Green
    Write-Host '=============================================' -ForegroundColor Green
    Write-Host ''
    Write-Host 'Keyingi qadam: repo sahifasida "Pin" bosib, uni profilingizga qadang.'
    Start-Process "https://github.com/$Owner/$RepoName"
} else {
    Write-Host 'Push bo''lmadi. Tekshiring:' -ForegroundColor Red
    Write-Host "  - https://github.com/$Owner/$RepoName ochiladimi?"
    Write-Host '  - token repo scope bilanmi?'
    Write-Host '  - qo''lda: git push -u origin main'
}
Write-Host ''
