param([switch]$SkipAndroidPreflight)
$ErrorActionPreference = 'Stop'
. "$PSScriptRoot/common.ps1"
$sourceRoot = $ForkRoot
$testRoot = Join-Path $sourceRoot ('build/fork-tool-tests/' + [guid]::NewGuid().ToString('N'))
$passed = 0

function Assert-Tool([bool]$Condition, [string]$Message) {
    if (-not $Condition) { throw $Message }
    $script:passed++
}
function Expect-ToolFailure([string]$Script, [hashtable]$Parameters, [string]$Pattern) {
    $failure = $null
    try { & $Script @Parameters | Out-Null } catch { $failure = $_.Exception.Message }
    Assert-Tool ($failure -and $failure -match $Pattern) "Expected failure matching '$Pattern', got '$failure'"
}
function Fixture-Git {
    $result = & git -C $testRoot @args
    if ($LASTEXITCODE -ne 0) { throw "Fixture git $args failed" }
    return $result
}

try {
    foreach ($file in Get-ChildItem "$PSScriptRoot/*.ps1") {
        $tokens = $null; $errors = $null
        [void][System.Management.Automation.Language.Parser]::ParseFile($file.FullName, [ref]$tokens, [ref]$errors)
        Assert-Tool ($errors.Count -eq 0) "Parse failed: $($file.Name): $errors"
    }
    Initialize-ForkNode
    & node "$PSScriptRoot/test-workflows.cjs"
    Assert-Tool ($LASTEXITCODE -eq 0) 'Workflow checks failed'
    New-Item -ItemType Directory -Force -Path "$testRoot/tools/fork", "$testRoot/android/app", "$testRoot/node_modules/expo" | Out-Null
    Copy-Item "$PSScriptRoot/*.ps1" "$testRoot/tools/fork/"
    Copy-Item (Join-Path $sourceRoot 'fork.config.json') $testRoot
    Copy-Item (Join-Path $sourceRoot 'android/app/debug.keystore') "$testRoot/android/app/"
    Write-ForkText "$testRoot/.gitignore" "build/`n/releases/`n/.local/`nnode_modules/`n"
    Write-ForkText "$testRoot/package.json" '{"name":"fixture","version":"2.17.1"}'
    Write-ForkText "$testRoot/package-lock.json" '{"name":"fixture","version":"2.17.1","lockfileVersion":3,"packages":{"":{"version":"2.17.1"},"node_modules/example":{"version":"1.0.0"}}}'
    Write-ForkText "$testRoot/node_modules/expo/package.json" '{}'
    Fixture-Git init -q -b develop | Out-Null
    Fixture-Git config user.name 'Fork tooling test' | Out-Null
    Fixture-Git config user.email 'fork-test@example.invalid' | Out-Null
    Fixture-Git config core.autocrlf false | Out-Null
    Fixture-Git add . | Out-Null
    Fixture-Git commit -q -m fixture | Out-Null
    $prepare = "$testRoot/tools/fork/prepare-release.ps1"
    $release = "$testRoot/tools/fork/release-apk.ps1"
    $builder = "$testRoot/tools/fork/build-apk.ps1"
    if (-not $SkipAndroidPreflight) {
        & $builder -CheckOnly | Out-Null
        Assert-Tool (-not (Test-Path "$testRoot/.local")) 'Builder CheckOnly created mutable build state'
        New-Item -ItemType Directory -Path "$testRoot/node_modules/expo-dev-client" | Out-Null
        Expect-ToolFailure $builder @{ CheckOnly = $true } 'development-only packages'
        Remove-Item -LiteralPath "$testRoot/node_modules/expo-dev-client"
    }
    $originalCode = (Get-Content "$testRoot/fork.config.json" -Raw | ConvertFrom-Json).versionCode
    $before = (Get-FileHash "$testRoot/package.json").Hash
    & $prepare -Version '2.17.1-lv.1' -CheckOnly | Out-Null
    Assert-Tool ((Get-FileHash "$testRoot/package.json").Hash -eq $before) 'CheckOnly modified package.json'
    & $prepare -Version '2.17.1-lv.1' | Out-Null
    $prepared = Get-Content "$testRoot/fork.config.json" -Raw | ConvertFrom-Json
    $lockSummary = & node -e "const l=require(process.argv[1]);console.log(JSON.stringify({root:l.version,package:l.packages[''].version,dependency:l.packages['node_modules/example'].version}));" "$testRoot/package-lock.json"
    $lock = $lockSummary | ConvertFrom-Json
    Assert-Tool ($prepared.versionCode -eq $originalCode + 1) 'Release did not increment Android code exactly once'
    Assert-Tool ($lock.root -eq '2.17.1-lv.1' -and $lock.package -eq '2.17.1-lv.1') 'Lock root versions differ'
    Assert-Tool ($lock.dependency -eq '1.0.0') 'Dependency version was modified'
    Assert-Tool ((Get-Content "$testRoot/package.json" -Raw | ConvertFrom-Json).version -eq '2.17.1-lv.1') 'Package version differs'
    Assert-Tool (Test-Path "$testRoot/docs/releases/2.17.1-lv.1.md") 'Missing release notes'
    Expect-ToolFailure $prepare @{ Version = '2.17.1-lv.1' } 'advance'
    Expect-ToolFailure $prepare @{ Version = 'v2.17.1-lv.2' } 'without a v'
    Assert-Tool ((Get-Content "$testRoot/fork.config.json" -Raw | ConvertFrom-Json).versionCode -eq $prepared.versionCode) 'Rejected preparation changed the Android code'
    Fixture-Git add . | Out-Null
    Fixture-Git commit -q -m prepare | Out-Null
    Expect-ToolFailure $release @{ SkipBuild = $true } 'from master'
    Fixture-Git checkout -q -b master | Out-Null
    Write-ForkText "$testRoot/package.json" '{"name":"dirty","version":"2.17.1-lv.1"}'
    Expect-ToolFailure $release @{ SkipBuild = $true } 'clean worktree'
    Fixture-Git restore package.json | Out-Null
    Expect-ToolFailure $release @{ SkipBuild = $true } 'Complete the release notes'
    Write-ForkText "$testRoot/docs/releases/2.17.1-lv.1.md" "# Fixture release`n`n- Tested fixture release.`n"
    Fixture-Git add . | Out-Null
    Fixture-Git commit -q -m notes | Out-Null
    Expect-ToolFailure $release @{ SkipBuild = $true } 'Missing release APK'
    $head = Fixture-Git rev-parse HEAD
    New-Item -ItemType Directory -Force -Path "$testRoot/build" | Out-Null
    $apk = "$testRoot/build/Yuzic-Test-2.17.1-lv.1-arm64.apk"
    Write-ForkText $apk 'Fixture packaging bytes, not an installable APK.'
    $metadata = [ordered]@{
        version = '2.17.1-lv.1'; versionName = '2.17.1-lv.1'; versionCode = $prepared.versionCode
        applicationId = $prepared.applicationId; signerSha256 = $prepared.signerSha256
        channel = 'Test'; commit = $head; dirty = $false
        sha256 = (Get-FileHash $apk -Algorithm SHA256).Hash.ToLowerInvariant()
    }
    Write-ForkText ([IO.Path]::ChangeExtension($apk, '.json')) ($metadata | ConvertTo-Json)
    Expect-ToolFailure $release @{ SkipBuild = $true } 'metadata does not match'
    $metadata.channel = 'Release'
    $metadata.dirty = $true
    Write-ForkText ([IO.Path]::ChangeExtension($apk, '.json')) ($metadata | ConvertTo-Json)
    Expect-ToolFailure $release @{ SkipBuild = $true } 'metadata does not match'
    $metadata.dirty = $false
    $metadata.sha256 = 'incorrect'
    Write-ForkText ([IO.Path]::ChangeExtension($apk, '.json')) ($metadata | ConvertTo-Json)
    Expect-ToolFailure $release @{ SkipBuild = $true } 'metadata does not match'
    $metadata.sha256 = (Get-FileHash $apk -Algorithm SHA256).Hash.ToLowerInvariant()
    Write-ForkText ([IO.Path]::ChangeExtension($apk, '.json')) ($metadata | ConvertTo-Json)
    & $release -SkipBuild | Out-Null
    Assert-Tool ((Fixture-Git cat-file -t refs/tags/2.17.1-lv.1) -eq 'tag') 'Release tag is not annotated'
    Assert-Tool (Test-Path "$testRoot/releases/2.17.1-lv.1/SHA256.txt") 'Missing release checksum'
    Assert-Tool ((Fixture-Git rev-parse HEAD) -eq $head) 'Release created a commit'
    Expect-ToolFailure $release @{ SkipBuild = $true } 'tag already exists'
    $prepared.applicationId = 'com.arinora.rawarr'
    Write-ForkText "$testRoot/fork.config.json" ($prepared | ConvertTo-Json)
    Expect-ToolFailure $builder @{ CheckOnly = $true } 'identity changed'
    if (-not $SkipAndroidPreflight) {
        $prepared.applicationId = 'com.arinora.rawarr.test'
        $prepared.signerSha256 = 'incorrect'
        Write-ForkText "$testRoot/fork.config.json" ($prepared | ConvertTo-Json)
        Expect-ToolFailure $builder @{ CheckOnly = $true } 'Signing certificate changed'
    }
    Write-Output "PASS: $passed fork tooling checks, using an isolated temporary Git fixture; no real branch or tag changed."
} finally {
    # Only remove this newly created fixture, never a computed path outside build/.
    $allowed = [IO.Path]::GetFullPath((Join-Path $sourceRoot 'build/fork-tool-tests')) + [IO.Path]::DirectorySeparatorChar
    $resolvedTest = [IO.Path]::GetFullPath($testRoot)
    if ($resolvedTest.StartsWith($allowed, [StringComparison]::OrdinalIgnoreCase) -and (Test-Path -LiteralPath $resolvedTest)) {
        Remove-Item -LiteralPath $resolvedTest -Recurse -Force
    }
}
