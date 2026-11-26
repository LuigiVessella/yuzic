param([switch]$ExistingTag, [switch]$SkipBuild, [switch]$Publish)
$ErrorActionPreference = 'Stop'
. "$PSScriptRoot/common.ps1"
$config = Read-ForkConfig
$version = Get-ForkVersion
Assert-ForkReleaseVersion $version
if (Invoke-ForkGit status --porcelain) { throw 'Release requires a clean worktree: commit or stash your changes first.' }
$commit = Invoke-ForkGit rev-parse HEAD
if ($ExistingTag) {
    if ((Invoke-ForkGit rev-parse "refs/tags/$version^{}") -ne $commit) { throw 'The release tag must point to HEAD.' }
    Invoke-ForkGit merge-base --is-ancestor HEAD origin/master | Out-Null
} else {
    if ((Invoke-ForkGit branch --show-current) -ne 'master') { throw 'Create fork releases from master, after promoting tested develop changes.' }
    & git -C $ForkRoot rev-parse --verify --quiet "refs/tags/$version" *> $null
    if ($LASTEXITCODE -eq 0) { throw 'This tag already exists; published versions are immutable.' }
}
$notes = Join-Path $ForkRoot "docs/releases/$version.md"
if (-not (Test-Path $notes)) { throw "Missing docs/releases/$version.md" }
$notesText = Get-Content $notes -Raw
if ([string]::IsNullOrWhiteSpace($notesText) -or $notesText -match '(?i)\bTODO\b') { throw 'Complete the release notes before releasing.' }
$releaseDir = Join-Path $ForkRoot "releases/$version"
if (Test-Path $releaseDir) { throw 'The release directory already exists; release artifacts are immutable.' }
if ($Publish) {
    $origin = Invoke-ForkGit remote get-url origin
    if ($origin -notmatch '[:/]LuigiVessella/yuzic(?:\.git)?$') { throw 'Publishing is restricted to the configured personal fork.' }
}
if (-not $SkipBuild) { & "$PSScriptRoot/build-apk.ps1" -Channel Release }
$apk = Join-Path $ForkRoot "build/Yuzic-Test-$version-arm64.apk"
$metadataPath = [IO.Path]::ChangeExtension($apk, '.json')
if (-not (Test-Path $apk) -or -not (Test-Path $metadataPath)) { throw 'Missing release APK or build metadata.' }
$metadata = Get-Content $metadataPath -Raw | ConvertFrom-Json
$hash = (Get-FileHash -LiteralPath $apk -Algorithm SHA256).Hash.ToLowerInvariant()
if ($metadata.channel -ne 'Release' -or $metadata.version -ne $version -or $metadata.versionName -ne $version -or $metadata.commit -ne $commit -or $metadata.dirty -or $metadata.applicationId -ne $config.applicationId -or $metadata.versionCode -ne $config.versionCode -or $metadata.signerSha256 -ne $config.signerSha256 -or $metadata.sha256 -ne $hash) {
    throw 'APK metadata does not match this clean release commit, identity, signature or hash.'
}
if ((Invoke-ForkGit rev-parse HEAD) -ne $commit -or (Invoke-ForkGit status --porcelain)) { throw 'Worktree changed during the release build.' }
New-Item -ItemType Directory -Path $releaseDir -Force | Out-Null
Copy-Item -LiteralPath $apk -Destination $releaseDir
Copy-Item -LiteralPath $metadataPath -Destination (Join-Path $releaseDir 'release.json')
Copy-Item -LiteralPath $notes -Destination (Join-Path $releaseDir 'notes.md')
Write-ForkText (Join-Path $releaseDir 'SHA256.txt') "$hash  $([IO.Path]::GetFileName($apk))`n"
if (-not $ExistingTag) { Invoke-ForkGit tag -a $version -F $notes $commit | Out-Null }
Write-Output "RELEASE_READY=$releaseDir"
if ($Publish) {
    if (-not $ExistingTag) { Invoke-ForkGit push origin "refs/tags/$version" | Out-Null }
    # The tag workflow owns the GitHub draft and attachments; avoid two publishers.
    Write-Output "Tag pushed. The fork APK workflow will build and create the draft GitHub release."
}
