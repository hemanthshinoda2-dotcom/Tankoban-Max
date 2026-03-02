<#
.SYNOPSIS
    Downloads qBittorrent and Prowlarr into resources/ if not already present.
.DESCRIPTION
    qBittorrent: NSIS installer from SourceForge, silently extracted.
    Prowlarr: zip from GitHub Releases.
    Skips if executables already exist. Use -Force to re-download.
#>

param(
    [switch]$Force
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$resourcesDir = Join-Path $repoRoot "resources"

$ghHeaders = @{
    "User-Agent" = "Tankoban-Butterfly"
    "Accept"     = "application/vnd.github+json"
}

# ---------------------------------------------------------------------------
# qBittorrent (SourceForge)
# ---------------------------------------------------------------------------

$qbitDir = Join-Path $resourcesDir "qbittorrent"
$qbitExe = Join-Path $qbitDir "qbittorrent.exe"
$qbitVersion = "5.1.4"

function Ensure-QBittorrent {
    if ((-not $Force) -and (Test-Path $qbitExe)) {
        Write-Host "[torrent] qBittorrent already present at '$qbitDir'."
        return
    }

    $installerName = "qbittorrent_" + $qbitVersion + "_x64_setup.exe"
    $downloadUrl = "https://sourceforge.net/projects/qbittorrent/files/qbittorrent-win32/qbittorrent-" + $qbitVersion + "/" + $installerName + "/download"

    Write-Host "[torrent] Downloading qBittorrent v$qbitVersion from SourceForge..."
    $tempInstaller = Join-Path $env:TEMP ("tankoban-" + $installerName)
    Invoke-WebRequest -Uri $downloadUrl -OutFile $tempInstaller -UserAgent "Tankoban-Butterfly"

    if (-not (Test-Path $tempInstaller)) {
        throw "Download failed."
    }

    $fileSize = [math]::Round((Get-Item $tempInstaller).Length / 1MB, 1)
    Write-Host "[torrent] Downloaded $installerName ($fileSize MB)."

    Write-Host "[torrent] Installing qBittorrent to '$qbitDir'..."
    New-Item -ItemType Directory -Path $qbitDir -Force | Out-Null

    # NSIS /S = silent, /D= destination (must be last, no quotes around path)
    $proc = Start-Process -FilePath $tempInstaller -ArgumentList "/S", ("/D=" + $qbitDir) -Wait -PassThru -NoNewWindow
    if ($proc.ExitCode -ne 0) {
        throw ("qBittorrent installer exited with code " + $proc.ExitCode)
    }

    if (Test-Path $qbitExe) {
        Write-Host "[torrent] qBittorrent installed to '$qbitDir'."
    } else {
        $found = Get-ChildItem -Path $qbitDir -Recurse -Filter "qbittorrent.exe" -ErrorAction SilentlyContinue | Select-Object -First 1
        if ($found) {
            Write-Host "[torrent] qBittorrent found at '$($found.FullName)'."
        } else {
            Write-Host "[torrent] WARNING: qbittorrent.exe not found after install."
        }
    }

    Remove-Item $tempInstaller -Force -ErrorAction SilentlyContinue
}

# ---------------------------------------------------------------------------
# Prowlarr (GitHub Releases)
# ---------------------------------------------------------------------------

$prowlarrDir = Join-Path $resourcesDir "prowlarr"
$prowlarrExe = Join-Path $prowlarrDir "Prowlarr.exe"

function Ensure-Prowlarr {
    if ((-not $Force) -and (Test-Path $prowlarrExe)) {
        Write-Host "[torrent] Prowlarr already present at '$prowlarrDir'."
        return
    }

    Write-Host "[torrent] Fetching latest Prowlarr release info..."
    $release = $null
    try {
        $release = Invoke-RestMethod -Uri "https://api.github.com/repos/Prowlarr/Prowlarr/releases/latest" -Headers $ghHeaders
    } catch {
        Write-Host "[torrent] /latest not available, fetching release list..."
        $releases = Invoke-RestMethod -Uri "https://api.github.com/repos/Prowlarr/Prowlarr/releases?per_page=5" -Headers $ghHeaders
        $release = $releases | Select-Object -First 1
    }

    if (-not $release) {
        throw "Could not fetch any Prowlarr release from GitHub."
    }

    $tag = $release.tag_name
    Write-Host "[torrent] Latest Prowlarr version: $tag"

    $asset = $release.assets | Where-Object {
        $_.name -match 'windows.*x64.*\.zip$' -and $_.name -notmatch 'installer'
    } | Select-Object -First 1

    if (-not $asset) {
        $asset = $release.assets | Where-Object {
            $_.name -match 'windows.*\.zip$'
        } | Select-Object -First 1
    }

    if (-not $asset) {
        Write-Host "[torrent] WARNING: Could not find a Prowlarr Windows zip in release $tag."
        Write-Host "[torrent] Available assets:"
        $release.assets | ForEach-Object { Write-Host ("  - " + $_.name) }
        return
    }

    $assetSize = [math]::Round($asset.size / 1MB, 1)
    Write-Host "[torrent] Downloading '$($asset.name)' ($assetSize MB)..."
    $tempZip = Join-Path $env:TEMP ("tankoban-prowlarr-" + $asset.name)
    Invoke-WebRequest -Uri $asset.browser_download_url -Headers $ghHeaders -OutFile $tempZip

    Write-Host "[torrent] Extracting to '$prowlarrDir'..."
    New-Item -ItemType Directory -Path $prowlarrDir -Force | Out-Null
    $tempExtract = Join-Path $env:TEMP "tankoban-prowlarr-extract"
    if (Test-Path $tempExtract) { Remove-Item $tempExtract -Recurse -Force }
    Expand-Archive -Path $tempZip -DestinationPath $tempExtract -Force

    $exeFile = Get-ChildItem -Path $tempExtract -Recurse -Filter "Prowlarr.exe" | Select-Object -First 1
    if ($exeFile) {
        Copy-Item -Path (Join-Path $exeFile.Directory.FullName "*") -Destination $prowlarrDir -Recurse -Force
        Write-Host "[torrent] Prowlarr installed to '$prowlarrDir'."
    } else {
        Copy-Item -Path (Join-Path $tempExtract "*") -Destination $prowlarrDir -Recurse -Force
        Write-Host "[torrent] WARNING: Prowlarr.exe not found in archive."
    }

    Remove-Item $tempZip -Force -ErrorAction SilentlyContinue
    Remove-Item $tempExtract -Recurse -Force -ErrorAction SilentlyContinue
}

# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

try {
    Ensure-QBittorrent
    Ensure-Prowlarr
    Write-Host "[torrent] All torrent dependencies ready."
    exit 0
}
catch {
    Write-Host "[torrent] ERROR: $($_.Exception.Message)"
    Write-Host "[torrent] You can download manually:"
    Write-Host "[torrent]   qBittorrent: https://www.qbittorrent.org/download"
    Write-Host "[torrent]     -> Install to '$qbitDir' (need qbittorrent.exe)"
    Write-Host "[torrent]   Prowlarr: https://github.com/Prowlarr/Prowlarr/releases"
    Write-Host "[torrent]     -> Extract to '$prowlarrDir' (need Prowlarr.exe)"
    exit 1
}
