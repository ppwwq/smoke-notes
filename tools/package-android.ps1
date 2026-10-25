param(
    [string]$Jdk = 'D:/program/Android/Android studio/jbr',
    [string]$BuildTools = 'D:/program/Android/SDK/build-tools/35.0.0'
)
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$unsigned = Join-Path $root 'apps/android/app/build/outputs/apk/release/app-release-unsigned.apk'
if (!(Test-Path -LiteralPath $unsigned)) { throw 'Build :app:assembleRelease first.' }
$private = Join-Path $root 'work/android-signing'
$out = Join-Path $root 'outputs/android'
New-Item -ItemType Directory -Force -Path $private,$out | Out-Null
$keystore = Join-Path $private 'jotday-release.p12'
$passwordFile = Join-Path $private 'password.dpapi'
$env:JAVA_HOME = $Jdk
try {
    if (!(Test-Path -LiteralPath $passwordFile)) {
        if (Test-Path -LiteralPath $keystore) { throw 'Existing signing key has no saved password. Do not replace it.' }
        $random = New-Object byte[] 32
        [System.Security.Cryptography.RandomNumberGenerator]::Fill($random)
        $env:JOTDAY_SIGNING_PASSWORD = [Convert]::ToBase64String($random)
        ConvertTo-SecureString $env:JOTDAY_SIGNING_PASSWORD -AsPlainText -Force | ConvertFrom-SecureString | Set-Content -LiteralPath $passwordFile
    } else {
        $secure = Get-Content -LiteralPath $passwordFile | ConvertTo-SecureString
        $env:JOTDAY_SIGNING_PASSWORD = [System.Net.NetworkCredential]::new('', $secure).Password
    }
    if (!(Test-Path -LiteralPath $keystore)) {
        & "$Jdk/bin/keytool.exe" -genkeypair -keystore $keystore -storetype PKCS12 -alias jotday -keyalg RSA -keysize 3072 -validity 10000 -dname 'CN=Jotday Android, O=Jotday' -storepass:env JOTDAY_SIGNING_PASSWORD -keypass:env JOTDAY_SIGNING_PASSWORD
        if ($LASTEXITCODE) { throw 'Signing key creation failed.' }
    }
    $aligned = Join-Path $out 'jotday-aligned.apk'
    $apk = Join-Path $out 'Jotday-0.1.0-android.apk'
    & "$BuildTools/zipalign.exe" -f -p 4 $unsigned $aligned
    if ($LASTEXITCODE) { throw 'APK alignment failed.' }
    & "$BuildTools/apksigner.bat" sign --ks $keystore --ks-key-alias jotday --ks-pass env:JOTDAY_SIGNING_PASSWORD --out $apk $aligned
    if ($LASTEXITCODE) { throw 'APK signing failed.' }
    & "$BuildTools/apksigner.bat" verify --verbose --print-certs $apk
    if ($LASTEXITCODE) { throw 'APK signature verification failed.' }
    Get-FileHash -LiteralPath $apk -Algorithm SHA256 | Format-List
} finally {
    Remove-Item Env:JOTDAY_SIGNING_PASSWORD -ErrorAction SilentlyContinue
}
