param([Parameter(Mandatory = $true)][string]$Version, [switch]$CheckOnly)
$ErrorActionPreference = 'Stop'
. "$PSScriptRoot/common.ps1"
Assert-ForkReleaseVersion $Version
$config = Read-ForkConfig
$current = Get-ForkVersion
$oldBase = [version]($current -split '-')[0]
$newBase = [version]($Version -split '-')[0]
$oldRevision = if ($current -match '-lv\.(\d+)$') { [int]$Matches[1] } else { 0 }
$newRevision = [int]($Version -split '-lv\.')[1]
if ($newBase -lt $oldBase -or ($newBase -eq $oldBase -and $newRevision -le $oldRevision)) { throw 'The new fork version must advance beyond the current version.' }
if ($config.versionCode -ge 2100000000) { throw 'Android versionCode limit reached.' }
$notesPath = Join-Path $ForkRoot "docs/releases/$Version.md"
if (Test-Path $notesPath) { throw 'Release notes already exist for this version.' }
& git -C $ForkRoot rev-parse --verify --quiet "refs/tags/$Version" *> $null
if ($LASTEXITCODE -eq 0) { throw 'This release tag already exists.' }
$newCode = $config.versionCode + 1
if ($CheckOnly) { Write-Output "Prepare $current -> $Version; Android versionCode $($config.versionCode) -> $newCode"; return }
Initialize-ForkNode
$paths = @('package.json', 'package-lock.json', 'fork.config.json')
$originals = @{}
foreach ($path in $paths) { $originals[$path] = [IO.File]::ReadAllBytes((Join-Path $ForkRoot $path)) }
try {
    # Replace the complete JSON string, preserving all other formatting/content.
    $versionPattern = New-Object regex '("version"\s*:\s*")[^"]+(")'
    $replacement = [System.Text.RegularExpressions.MatchEvaluator]{ param($match) $match.Groups[1].Value + $Version + $match.Groups[2].Value }
    $packageText = [IO.File]::ReadAllText((Join-Path $ForkRoot 'package.json'))
    $lockText = [IO.File]::ReadAllText((Join-Path $ForkRoot 'package-lock.json'))
    $newPackage = $versionPattern.Replace($packageText, $replacement, 1)
    $newLock = $versionPattern.Replace($lockText, $replacement, 2)
    # Windows PowerShell 5.1 cannot parse package-lock's empty package key.
    $newLock | & node -e "let s='';process.stdin.on('data',b=>s+=b);process.stdin.on('end',()=>{const l=JSON.parse(s);if(l.version!==process.argv[1]||l.packages[''].version!==process.argv[1])process.exit(1)});" $Version
    if ($LASTEXITCODE -ne 0) { throw 'Unexpected package-lock layout.' }
    $config.versionCode = $newCode
    Write-ForkText (Join-Path $ForkRoot 'package.json') $newPackage
    Write-ForkText (Join-Path $ForkRoot 'package-lock.json') $newLock
    Write-ForkText (Join-Path $ForkRoot 'fork.config.json') (($config | ConvertTo-Json) + "`n")
    New-Item -ItemType Directory -Force -Path (Split-Path $notesPath) | Out-Null
    Write-ForkText $notesPath "# Yuzic Test $Version`n`n## Changes`n`n- TODO: describe the changes.`n`n## Validation`n`n- TODO: record tests and device checks.`n`n## Upstream base`n`n- Version label: $newBase`n- TODO: record the upstream commit when known.`n"
} catch {
    foreach ($path in $paths) { [IO.File]::WriteAllBytes((Join-Path $ForkRoot $path), $originals[$path]) }
    throw
}
Write-Output "Prepared $Version (Android $newCode). Complete docs/releases/$Version.md, review and commit these files with your tested changes. No commit or tag was created."
