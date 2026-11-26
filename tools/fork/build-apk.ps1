param(
    [ValidateSet('Test', 'Release')][string]$Channel = 'Test',
    [switch]$CheckOnly
)
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
. "$PSScriptRoot/common.ps1"
$config = Read-ForkConfig
$version = Get-ForkVersion
if ($Channel -eq 'Release') { Assert-ForkReleaseVersion $version }
$versionName = if ($Channel -eq 'Test') { "$version-test" } else { $version }
Initialize-ForkTools
$keyStore = Join-Path $ForkRoot 'android/app/debug.keystore'
$signer = Get-ForkSigner $keyStore
if ($signer -ne $config.signerSha256) { throw 'Signing certificate changed: this APK would not update the installed Yuzic Test app.' }
if ($CheckOnly) {
    Write-Output "Ready: $($config.applicationId), $versionName, versionCode $($config.versionCode), signer $signer"
    return
}
$commit = Invoke-ForkGit rev-parse HEAD
$dirty = [bool](Invoke-ForkGit status --porcelain)
$buildDir = Join-Path $ForkRoot 'build/local-test'
$stateDir = Join-Path $ForkRoot '.local/fork'
New-Item -ItemType Directory -Force -Path $buildDir, $stateDir | Out-Null
try { $buildLock = [IO.File]::Open((Join-Path $stateDir 'build.lock'), 'OpenOrCreate', 'ReadWrite', 'None') }
catch { throw 'Another fork build is running in this workspace.' }
$originals = @{}
$paths = @('app.json', 'android/app/build.gradle', 'android/app/src/main/AndroidManifest.xml', 'android/app/src/main/res/values/strings.xml')
$backupDir = Join-Path $stateDir 'native-backup'
$envNames = @('NODE_ENV', 'CI', 'DEBUG', 'ANDROID_KEYSTORE_PATH', 'ANDROID_KEYSTORE_PASSWORD', 'ANDROID_KEY_ALIAS', 'ANDROID_KEY_PASSWORD')
$savedEnv = @{}
foreach ($name in $envNames) { $savedEnv[$name] = [Environment]::GetEnvironmentVariable($name, 'Process') }
try {
    New-Item -ItemType Directory -Force -Path $backupDir | Out-Null
    foreach ($relative in $paths) {
        $originals[$relative] = [IO.File]::ReadAllBytes((Join-Path $ForkRoot $relative))
        [IO.File]::WriteAllBytes((Join-Path $backupDir ($relative.Replace('/', '_'))), $originals[$relative])
    }
    $env:NODE_ENV = 'production'
    $env:CI = '1'
    $env:DEBUG = $null
    $env:ANDROID_KEYSTORE_PATH = $keyStore
    $env:ANDROID_KEYSTORE_PASSWORD = 'android'
    $env:ANDROID_KEY_ALIAS = 'androiddebugkey'
    $env:ANDROID_KEY_PASSWORD = 'android'
    $appPath = Join-Path $ForkRoot 'app.json'
    $appConfig = Get-Content $appPath -Raw | ConvertFrom-Json
    $appConfig.expo.name = $config.applicationName
    $appConfig.expo.android.package = $config.applicationId
    $appConfig.expo.scheme = $config.scheme
    Write-ForkText $appPath ($appConfig | ConvertTo-Json -Depth 50)
    $gradlePath = Join-Path $ForkRoot 'android/app/build.gradle'
    $gradleText = [IO.File]::ReadAllText($gradlePath)
    if (-not $gradleText.Contains("applicationId 'com.arinora.rawarr'")) { throw 'Unexpected upstream applicationId; refusing to build.' }
    Write-ForkText $gradlePath $gradleText.Replace("applicationId 'com.arinora.rawarr'", "applicationId '$($config.applicationId)'")
    $manifestPath = Join-Path $ForkRoot 'android/app/src/main/AndroidManifest.xml'
    $manifest = [IO.File]::ReadAllText($manifestPath).Replace('android:scheme="yuzic"', "android:scheme=`"$($config.scheme)`"").Replace('android:scheme="exp+yuzic"', "android:scheme=`"exp+$($config.scheme)`"")
    Write-ForkText $manifestPath $manifest
    $stringsPath = Join-Path $ForkRoot 'android/app/src/main/res/values/strings.xml'
    Write-ForkText $stringsPath ([IO.File]::ReadAllText($stringsPath).Replace('>Yuzic</string>', ">$($config.applicationName)</string>"))
    Push-Location (Join-Path $ForkRoot 'android')
    try {
        $ErrorActionPreference = 'Continue'
        & ./gradlew.bat generateCodegenArtifactsFromSchema :app:assembleRelease '-PreactNativeArchitectures=arm64-v8a' "-Pandroid.injected.version.name=$versionName" "-Pandroid.injected.version.code=$($config.versionCode)" "-Porg.gradle.java.installations.paths=$env:JAVA_HOME" '-Porg.gradle.java.installations.auto-download=false' '-Pkotlin.compiler.execution.strategy=in-process' --max-workers=2 --console=plain
        $gradleExit = $LASTEXITCODE
        $ErrorActionPreference = 'Stop'
        if ($gradleExit -ne 0) { throw "Gradle failed with exit code $gradleExit" }
    } finally { Pop-Location }
    $builtApk = Join-Path $ForkRoot 'android/app/build/outputs/apk/release/app-release.apk'
    $badging = & "$env:ANDROID_HOME/build-tools/36.0.0/aapt.exe" dump badging $builtApk
    if ($LASTEXITCODE -ne 0 -or -not ($badging -match "package: name='$([regex]::Escape($config.applicationId))' versionCode='$($config.versionCode)' versionName='$([regex]::Escape($versionName))'")) {
        throw 'APK identity or version verification failed.'
    }
    $certs = & "$env:ANDROID_HOME/build-tools/36.0.0/apksigner.bat" verify --print-certs $builtApk
    if ($LASTEXITCODE -ne 0 -or -not ($certs -match "certificate SHA-256 digest: $signer")) { throw 'APK signing certificate verification failed.' }
    $apk = Join-Path $ForkRoot "build/Yuzic-Test-$version-arm64.apk"
    Copy-Item -LiteralPath $builtApk -Destination $apk
    $metadata = [ordered]@{
        version = $version; versionName = $versionName; versionCode = $config.versionCode
        applicationId = $config.applicationId; channel = $Channel; architecture = 'arm64-v8a'
        commit = $commit; dirty = $dirty; signerSha256 = $signer
        sha256 = (Get-FileHash -LiteralPath $apk -Algorithm SHA256).Hash.ToLowerInvariant()
    }
    Write-ForkText ([IO.Path]::ChangeExtension($apk, '.json')) ($metadata | ConvertTo-Json)
    Write-Output "APK_READY=$apk"
} finally {
    foreach ($relative in $originals.Keys) { [IO.File]::WriteAllBytes((Join-Path $ForkRoot $relative), $originals[$relative]) }
    foreach ($name in $envNames) { [Environment]::SetEnvironmentVariable($name, $savedEnv[$name], 'Process') }
    $buildLock.Dispose()
}
