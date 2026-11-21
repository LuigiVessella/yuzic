$ForkRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))

function Read-ForkConfig {
    $config = Get-Content (Join-Path $ForkRoot 'fork.config.json') -Raw | ConvertFrom-Json
    if ($config.applicationId -ne 'com.arinora.rawarr.test' -or $config.applicationName -ne 'Yuzic Test' -or $config.scheme -ne 'yuzic-test') {
        throw 'Fork identity changed: existing Yuzic Test installations could no longer update.'
    }
    if (($config.versionCode -isnot [int] -and $config.versionCode -isnot [long]) -or $config.versionCode -lt 56 -or $config.versionCode -gt 2100000000) { throw 'Invalid fork versionCode.' }
    return $config
}

function Get-ForkVersion {
    return (Get-Content (Join-Path $ForkRoot 'package.json') -Raw | ConvertFrom-Json).version
}

function Assert-ForkReleaseVersion([string]$Version) {
    if ($Version -notmatch '^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)-lv\.[1-9]\d*$') { throw 'Use a fork version such as 2.17.1-lv.1, without a v prefix or leading zeros.' }
}

function Write-ForkText([string]$Path, [string]$Text) {
    [IO.File]::WriteAllText($Path, $Text, (New-Object Text.UTF8Encoding($false)))
}

function Invoke-ForkGit {
    $result = & git -C $ForkRoot @args
    if ($LASTEXITCODE -ne 0) { throw "git $args failed." }
    return $result
}

function Initialize-ForkNode {
    if (-not (Get-Command node -ErrorAction SilentlyContinue) -and $env:TEMP) {
        $nodeFallback = Join-Path $env:TEMP 'yuzic-node-v22.14.0/node-v22.14.0-win-x64'
        if (Test-Path "$nodeFallback/node.exe") { $env:PATH = "$nodeFallback;$env:PATH" }
    }
    if (-not (Get-Command node -ErrorAction SilentlyContinue)) { throw 'Install Node.js 22 or add it to PATH.' }
    $nodeVersion = & node -p 'process.versions.node'
    if ($LASTEXITCODE -ne 0 -or [int]($nodeVersion -split '\.')[0] -lt 22) { throw 'Node.js 22 or newer is required for fork tooling.' }
}

function Initialize-ForkTools {
    Initialize-ForkNode
    $portableJava = Join-Path $env:USERPROFILE '.jdks/yuzic-temurin17/jdk-17.0.21+9'
    $javaCandidates = @($env:FORK_JAVA_HOME, $portableJava, $env:JAVA_HOME_17_X64, $env:JAVA_HOME)
    $javaHome = $javaCandidates | Where-Object { $_ -and (Test-Path (Join-Path $_ 'bin/java.exe')) } | Select-Object -First 1
    if (-not $javaHome) { throw 'Set FORK_JAVA_HOME to a JDK 17 installation.' }
    if (-not (Test-Path "$javaHome/release") -or (Get-Content "$javaHome/release" -Raw) -notmatch '(?m)^JAVA_VERSION="17[.\-"+]') { throw 'Set FORK_JAVA_HOME to JDK 17; other Java versions are not used by this builder.' }
    $env:JAVA_HOME = $javaHome
    $env:PATH = "$javaHome/bin;$env:PATH"
    if (-not $env:ANDROID_HOME) { $env:ANDROID_HOME = $env:ANDROID_SDK_ROOT }
    if (-not $env:ANDROID_HOME) { $env:ANDROID_HOME = Join-Path $env:LOCALAPPDATA 'Android/Sdk' }
    $env:ANDROID_SDK_ROOT = $env:ANDROID_HOME
    foreach ($part in @('platforms/android-36/android.jar', 'build-tools/36.0.0/aapt.exe', 'build-tools/36.0.0/apksigner.bat', 'ndk/27.1.12297006/source.properties', 'cmake/3.22.1/bin/cmake.exe')) {
        if (-not (Test-Path (Join-Path $env:ANDROID_HOME $part))) { throw "Missing Android SDK component: $part" }
    }
    if (-not (Test-Path (Join-Path $ForkRoot 'node_modules/expo/package.json'))) { throw 'Run npm ci --omit=dev first.' }
    if ((Test-Path (Join-Path $ForkRoot 'node_modules/expo-dev-client')) -or (Test-Path (Join-Path $ForkRoot 'node_modules/expo-dev-launcher'))) {
        throw 'Remove development-only packages before making a standalone APK: npm prune --omit=dev --ignore-scripts'
    }
}

function Get-ForkSigner([string]$KeyStore) {
    $previousPreference = $ErrorActionPreference
    try {
        $ErrorActionPreference = 'Continue'
        $certOutput = & "$env:JAVA_HOME/bin/keytool.exe" -exportcert -rfc -keystore $KeyStore -alias androiddebugkey -storepass android 2>&1
        $keyExit = $LASTEXITCODE
    } finally { $ErrorActionPreference = $previousPreference }
    if ($keyExit -ne 0) { throw 'Cannot read the existing Android test signing certificate.' }
    $pem = ($certOutput -join "`n")
    if ($pem -notmatch '(?s)-----BEGIN CERTIFICATE-----\s*(.*?)\s*-----END CERTIFICATE-----') { throw 'Missing signing certificate.' }
    $bytes = [Convert]::FromBase64String(($Matches[1] -replace '\s', ''))
    $sha = [Security.Cryptography.SHA256]::Create()
    try { return ([BitConverter]::ToString($sha.ComputeHash($bytes))).Replace('-', '').ToLowerInvariant() }
    finally { $sha.Dispose() }
}
