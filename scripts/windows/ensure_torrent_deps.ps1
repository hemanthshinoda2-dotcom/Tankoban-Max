
<#
.SYNOPSIS
    Downloads qBittorrent portable and Prowlarr into resources/ if not already present.
.DESCRIPTION
    Checks for qbittorrent.exe and Prowlarr.exe in their expected locations.
    If missing, downloads the latest portable/zip releases from GitHub and extracts them.
    Skips download if executables already exist (use -Force to re-download).
#>

param(
    [switch]$Force
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"  # Speeds up Invoke-WebRequest significantly

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$resourcesDir = Join-Path $repoRoot "resources"

$headers = @{
    "User-Agent" = "Tankoban-Butterfly"
    "Accept"     = "application/vnd.github+json"
}

# ---------------------------------------------------------------------------
# qBittorrent
# ---------------------------------------------------------------------------

$qbitDir = Join-Path $resourcesDir "qbittorrent"
$qbitExe = Join-Path $qbitDir "qbittorrent.exe"

function Ensure-QBittorrent {
    if ((-not $Force) -and (Test-Path $qbitExe)) {
        Write-Host "[torrent] qBittorrent already present at '$qbitDir'."
        return
    }

    Write-Host "[torrent] Fetching latest qBittorrent release info..."
    $releaseUrl = "https://api.github.com/repos/qbittorrent/qBittorrent/releases/latest"
    $release = Invoke-RestMethod -Uri $releaseUrl -Headers $headers
    $tag = $release.tag_name -replace '^release-', ''
    Write-Host "[torrent] Latest qBittorrent version: $tag"

    # Look for the portable x64 zip (e.g. qbittorrent_5.1.0_x64.zip)
    # qBittorrent names their assets inconsistently, so try multiple patterns
    $asset = $release.assets | Where-Object {
        $_.name -match 'qbittorrent.*x64.*\.zip$' -and $_.name -notmatch 'setup|installer|qt5'
    } | Select-Object -First 1

    if (-not $asset) {
        # Fallback: any zip that's x64
        $asset = $release.assets | Where-Object {
            $_.name -match '64.*\.zip$' -and $_.name -notmatch 'setup|installer'
        } | Select-Object -First 1
    }

    if (-not $asset) {
        Write-Host "[torrent] WARNING: Could not find a portable qBittorrent zip in release $tag."
        Write-Host "[torrent] Available assets:"
        $release.assets | ForEach-Object { Write-Host "  - $($_.name)" }
        Write-Host "[torrent] Please download manually and extract to '$qbitDir'."
        Write-Host "[torrent] Expected: qbittorrent.exe in '$qbitDir'"
        return
    }

    Write-Host "[torrent] Downloading '$($asset.name)' ($([math]::Round($asset.size / 1MB, 1)) MB)..."
    $tempZip = Join-Path $env:TEMP "tankoban-qbit-$($asset.name)"
    Invoke-WebRequest -Uri $asset.browser_download_url -Headers $headers -OutFile $tempZip

    Write-Host "[torrent] Extracting to '$qbitDir'..."
    New-Item -ItemType Directory -Path $qbitDir -Force | Out-Null
    $tempExtract = Join-Path $env:TEMP "tankoban-qbit-extract"
    if (Test-Path $tempExtract) { Remove-Item $tempExtract -Recurse -Force }
    Expand-Archive -Path $tempZip -DestinationPath $tempExtract -Force

    # Find the directory containing qbittorrent.exe (may be nested)
    $exeFile = Get-ChildItem -Path $tempExtract -Recurse -Filter "qbittorrent.exe" | Select-Object -First 1
    if ($exeFile) {
        # Copy everything from the directory containing the exe
        Copy-Item -Path (Join-Path $exeFile.Directory.FullName "*") -Destination $qbitDir -Recurse -Force
        Write-Host "[torrent] qBittorrent installed to '$qbitDir'."
    } else {
        # Just copy everything and hope for the best
        Copy-Item -Path (Join-Path $tempExtract "*") -Destination $qbitDir -Recurse -Force
        Write-Host "[torrent] WARNING: qbittorrent.exe not found in archive. Files extracted to '$qbitDir'."
    }

    # Cleanup
    Remove-Item $tempZip -Force -ErrorAction SilentlyContinue
    Remove-Item $tempExtract -Recurse -Force -ErrorAction SilentlyContinue
}

# ---------------------------------------------------------------------------
# Prowlarr
# ---------------------------------------------------------------------------

$prowlarrDir = Join-Path $resourcesDir "prowlarr"
$prowlarrExe = Join-Path $prowlarrDir "Prowlarr.exe"

function Ensure-Prowlarr {
    if ((-not $Force) -and (Test-Path $prowlarrExe)) {
        Write-Host "[torrent] Prowlarr already present at '$prowlarrDir'."
        return
    }

    Write-Host "[torrent] Fetching latest Prowlarr release info..."
    $releaseUrl = "https://api.github.com/repos/Prowlarr/Prowlarr/releases/latest"
    $release = Invoke-RestMethod -Uri $releaseUrl -Headers $headers
    $tag = $release.tag_name
    Write-Host "[torrent] Latest Prowlarr version: $tag"

    # Look for Windows x64 zip (e.g. Prowlarr.develop.1.32.2.5006.windows-core-x64.zip)
    $asset = $release.assets | Where-Object {
        $_.name -match 'windows.*x64.*\.zip$' -and $_.name -notmatch 'installer'
    } | Select-Object -First 1

    if (-not $asset) {
        # Fallback: any windows zip
        $asset = $release.assets | Where-Object {
            $_.name -match 'windows.*\.zip$'
        } | Select-Object -First 1
    }

    if (-not $asset) {
        Write-Host "[torrent] WARNING: Could not find a Prowlarr Windows zip in release $tag."
        Write-Host "[torrent] Available assets:"
        $release.assets | ForEach-Object { Write-Host "  - $($_.name)" }
        Write-Host "[torrent] Please download manually and extract to '$prowlarrDir'."
        Write-Host "[torrent] Expected: Prowlarr.exe in '$prowlarrDir'"
        return
    }

    Write-Host "[torrent] Downloading '$($asset.name)' ($([math]::Round($asset.size / 1MB, 1)) MB)..."
    $tempZip = Join-Path $env:TEMP "tankoban-prowlarr-$($asset.name)"
    Invoke-WebRequest -Uri $asset.browser_download_url -Headers $headers -OutFile $tempZip

    Write-Host "[torrent] Extracting to '$prowlarrDir'..."
    New-Item -ItemType Directory -Path $prowlarrDir -Force | Out-Null
    $tempExtract = Join-Path $env:TEMP "tankoban-prowlarr-extract"
    if (Test-Path $tempExtract) { Remove-Item $tempExtract -Recurse -Force }
    Expand-Archive -Path $tempZip -DestinationPath $tempExtract -Force

    # Find the directory containing Prowlarr.exe (may be nested in a "Prowlarr" subfolder)
    $exeFile = Get-ChildItem -Path $tempExtract -Recurse -Filter "Prowlarr.exe" | Select-Object -First 1
    if ($exeFile) {
        Copy-Item -Path (Join-Path $exeFile.Directory.FullName "*") -Destination $prowlarrDir -Recurse -Force
        Write-Host "[torrent] Prowlarr installed to '$prowlarrDir'."
    } else {
        Copy-Item -Path (Join-Path $tempExtract "*") -Destination $prowlarrDir -Recurse -Force
        Write-Host "[torrent] WARNING: Prowlarr.exe not found in archive. Files extracted to '$prowlarrDir'."
    }

    # Cleanup
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
    Write-Host "[torrent]   qBittorrent: https://github.com/qbittorrent/qBittorrent/releases"
    Write-Host "[torrent]     -> Extract to '$qbitDir' (need qbittorrent.exe)"
    Write-Host "[torrent]   Prowlarr: https://github.com/Prowlarr/Prowlarr/releases"
    Write-Host "[torrent]     -> Extract to '$prowlarrDir' (need Prowlarr.exe)"
    exit 1
}
