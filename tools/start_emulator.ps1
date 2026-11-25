param(
    [switch]$ReuseApk,
    [string]$Avd = 'BBLL_TV_API34',
    [string]$Sdk = $env:ANDROID_HOME,
    [string]$Python = $env:BILIBS_PYTHON
)

$ErrorActionPreference = 'Stop'
$project = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $project

function Invoke-Checked([string]$Command, [string[]]$Arguments) {
    & $Command @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw "$Command failed with exit code $LASTEXITCODE."
    }
}

function Get-EmulatorSerial {
    $devices = & $adb devices
    foreach ($line in $devices) {
        if ($line -match '^(emulator-\d+)\s+device\b') {
            $candidate = $Matches[1]
            $name = & $adb -s $candidate emu avd name 2>$null
            if ($name -contains $Avd) { return $candidate }
        }
    }
}

try {
    if (-not $Sdk) { $Sdk = $env:ANDROID_SDK_ROOT }
    if (-not $Sdk) { $Sdk = 'C:\Work\Tools\BiliTV\sdk' }
    $env:ANDROID_HOME = $Sdk
    $env:ANDROID_SDK_ROOT = $Sdk
    if (-not $env:JAVA_HOME) {
        $env:JAVA_HOME = 'C:\Work\Tools\BiliTV\zulu\zulu17.68.203-ca-jdk17.0.20.1-win_x64'
    }
    $adb = Join-Path $Sdk 'platform-tools\adb.exe'
    $emulator = Join-Path $Sdk 'emulator\emulator.exe'
    foreach ($program in @($adb, $emulator)) {
        if (-not (Test-Path -LiteralPath $program)) { throw "Executable not found: $program" }
    }
    if (-not $Python) { $Python = 'python' }
    $env:PYTHONUTF8 = '1'
    # Duplicate proxy variable spellings can prevent this Windows emulator from starting.
    foreach ($name in @('http_proxy', 'https_proxy', 'all_proxy', 'no_proxy')) {
        Remove-Item "Env:$name" -ErrorAction SilentlyContinue
    }
    $evidence = Join-Path $project 'verification\evidence'
    New-Item -ItemType Directory -Force -Path $evidence | Out-Null
    $apk = Join-Path $project 'BiliBS-latest.apk'
    if (-not $ReuseApk) {
        Write-Host '[1/4] Building the current sources ...'
        Invoke-Checked $python @('tools/build_ui.py')
        Invoke-Checked $python @('tools/build_android.py', '--out', $apk)
    }
    if (-not (Test-Path -LiteralPath $apk)) { throw "APK not found: $apk" }
    Write-Host '[2/4] Checking the signed APK and source consistency ...'
    Invoke-Checked $python @('tools/check_android_package.py', '--apk', $apk, '--out', 'verification/evidence/emulator-package.json')

    $serial = Get-EmulatorSerial
    if (-not $serial) {
        $available = & $emulator -list-avds
        if ($available -notcontains $Avd) { throw "Android TV AVD not found: $Avd" }
        Write-Host "[3/4] Starting $Avd ..."
        $process = Start-Process -FilePath $emulator -ArgumentList @(
            '-avd', $Avd, '-gpu', 'host', '-feature', '-Vulkan',
            '-no-snapshot-load', '-no-snapshot-save'
        ) -PassThru -RedirectStandardOutput (Join-Path $evidence 'emulator-output.log') `
          -RedirectStandardError (Join-Path $evidence 'emulator-error.log')
    } else {
        Write-Host "[3/4] Reusing $Avd on $serial ..."
    }
    $timer = [Diagnostics.Stopwatch]::StartNew()
    do {
        if (-not $serial) { $serial = Get-EmulatorSerial }
        if ($serial) {
            $boot = & $adb -s $serial shell getprop sys.boot_completed 2>$null
            if ($boot -contains '1') { break }
        }
        if ($process -and $process.HasExited) { throw 'The emulator exited. Check verification/evidence/emulator-error.log.' }
        if ($timer.Elapsed.TotalSeconds -gt 240) { throw 'The Android TV emulator did not finish booting within 4 minutes.' }
        Start-Sleep -Seconds 2
    } while ($true)

    Write-Host "[4/4] Installing and opening $apk on $serial ..."
    Invoke-Checked $adb @('-s', $serial, 'shell', 'am', 'force-stop', 'tv.bilibs.app')
    Invoke-Checked $adb @('-s', $serial, 'install', '-r', $apk)
    $installed = & $adb -s $serial shell pm path tv.bilibs.app
    if ($LASTEXITCODE -ne 0 -or -not ($installed -match '^package:')) { throw 'Cannot locate the installed package.' }
    $installedPath = ($installed | Where-Object { $_ -match '^package:' } | Select-Object -First 1) -replace '^package:', ''
    $remoteHash = & $adb -s $serial shell sha256sum $installedPath.Trim()
    $hasher = [Security.Cryptography.SHA256]::Create()
    $stream = [IO.File]::OpenRead($apk)
    try {
        $localHash = [BitConverter]::ToString($hasher.ComputeHash($stream)).Replace('-', '').ToLowerInvariant()
    } finally {
        $stream.Dispose()
        $hasher.Dispose()
    }
    if ($LASTEXITCODE -ne 0 -or -not ($remoteHash -match "^$localHash\s")) { throw 'The installed APK hash differs from the local APK.' }
    Invoke-Checked $adb @('-s', $serial, 'shell', 'am', 'start', '-W', '-n', 'tv.bilibs.app/.TvActivity')
    Write-Host "Opened current APK. SHA-256 $localHash"
    Write-Host 'Arrow keys = D-pad, Enter = OK, Esc = Back. Closing this console keeps the emulator open.'
    exit 0
} catch {
    Write-Host $_.Exception.Message -ForegroundColor Red
    exit 1
}
