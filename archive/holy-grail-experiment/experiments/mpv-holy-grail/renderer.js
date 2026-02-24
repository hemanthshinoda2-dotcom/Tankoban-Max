/* ── mpv Holy Grail — Renderer (Phase 2b) ───────────────────────────
   GPU-accelerated mpv video playback via the holy grail pipeline.
─────────────────────────────────────────────────────────────────── */

var canvas    = document.getElementById('videoCanvas');
var hud       = document.getElementById('hud');
var landing   = document.getElementById('landing');
var btnOpen   = document.getElementById('btnOpen');
var btnPlay   = document.getElementById('btnPlayPause');
var seekBar   = document.getElementById('seekBar');
var seekFill  = document.getElementById('seekFill');
var timeDisp  = document.getElementById('timeDisplay');
var fileName  = document.getElementById('fileName');
var status    = document.getElementById('status');

var hudTimeout = null;
var isPlaying  = false;
var gpuReady   = false;
var stateTimer = null;
var frameCount = 0;
var lastFpsTime = Date.now();

// ── Check capabilities on load ─────────────────────────────────────
(async function() {
    var caps = await window.holyGrail.checkCapabilities();
    console.log('[renderer] Capabilities:', caps);

    if (!caps.addonLoaded) {
        status.textContent = 'Native addon not loaded — run: npm run build';
        return;
    }
    if (!caps.mpvFound) {
        status.textContent = 'libmpv-2.dll not found';
        return;
    }
    if (!caps.sharedTexture) {
        status.textContent = 'sharedTexture not available — Electron 40+ required';
        return;
    }

    status.textContent = 'Ready — open a video file';
})();

// ── VideoFrame receiver — draws GPU frames to canvas ───────────────
window.holyGrail.onVideoFrame(function(videoFrame) {
    // Resize canvas if needed
    if (canvas.width !== videoFrame.codedWidth || canvas.height !== videoFrame.codedHeight) {
        canvas.width  = videoFrame.codedWidth;
        canvas.height = videoFrame.codedHeight;
    }

    var ctx = canvas.getContext('2d');
    ctx.drawImage(videoFrame, 0, 0);
    videoFrame.close();

    // FPS counter
    frameCount++;
    var now = Date.now();
    if (now - lastFpsTime >= 1000) {
        var fps = Math.round(frameCount * 1000 / (now - lastFpsTime));
        console.log('[renderer] %d fps', fps);
        frameCount = 0;
        lastFpsTime = now;
    }
});

// ── Open + play video ──────────────────────────────────────────────
btnOpen.addEventListener('click', async function() {
    var filePath = await window.holyGrail.openVideo();
    if (!filePath) return;

    var name = filePath.replace(/\\/g, '/').split('/').pop();
    fileName.textContent = name;
    status.textContent = 'Initializing GPU pipeline...';

    try {
        // Init GPU if not done yet
        if (!gpuReady) {
            await window.holyGrail.initGpu(1920, 1080);
            gpuReady = true;
            console.log('[renderer] GPU pipeline initialized');
        }

        // Load the video
        status.textContent = 'Loading: ' + name;
        await window.holyGrail.loadVideoMpv(filePath);

        // Start frame loop
        await window.holyGrail.startFrameLoop();

        // Show player UI
        landing.style.display = 'none';
        canvas.style.display = 'block';
        hud.classList.remove('hidden');
        isPlaying = true;
        btnPlay.textContent = '⏸';
        showHudBriefly();

        // Start state polling for seek bar / time display
        startStatePoll();

        status.textContent = 'Playing via mpv Holy Grail pipeline';
        console.log('[renderer] Playback started:', name);

    } catch (err) {
        status.textContent = 'ERROR: ' + err.message;
        console.error('[renderer]', err);
    }
});

// ── State polling (seek bar, time display) ─────────────────────────
function startStatePoll() {
    if (stateTimer) return;
    stateTimer = setInterval(async function() {
        try {
            var state = await window.holyGrail.mpvGetState();
            if (!state) return;

            // Update seek bar
            if (state.duration > 0) {
                var pct = (state.timePos / state.duration) * 100;
                seekFill.style.width = pct + '%';
                timeDisp.textContent = formatTime(state.timePos) + ' / ' + formatTime(state.duration);
            }

            // Detect end of file
            if (state.eofReached && isPlaying) {
                isPlaying = false;
                btnPlay.textContent = '▶';
            }
        } catch (e) {}
    }, 250);
}

// ── Controls ───────────────────────────────────────────────────────
btnPlay.addEventListener('click', async function() {
    if (!gpuReady) return;
    try {
        var state = await window.holyGrail.mpvGetState();
        if (state && state.paused) {
            await window.holyGrail.mpvSetProperty('pause', 'no');
            isPlaying = true;
            btnPlay.textContent = '⏸';
        } else {
            await window.holyGrail.mpvSetProperty('pause', 'yes');
            isPlaying = false;
            btnPlay.textContent = '▶';
        }
    } catch (e) {}
});

seekBar.addEventListener('click', async function(e) {
    if (!gpuReady) return;
    try {
        var state = await window.holyGrail.mpvGetState();
        if (!state || !state.duration) return;
        var rect = seekBar.getBoundingClientRect();
        var pct  = (e.clientX - rect.left) / rect.width;
        var sec  = pct * state.duration;
        await window.holyGrail.mpvCommand(['seek', String(sec), 'absolute']);
    } catch (e) {}
});

// ── HUD auto-hide ──────────────────────────────────────────────────
document.addEventListener('mousemove', function() {
    if (landing.style.display !== 'none') return;
    showHudBriefly();
});

function showHudBriefly() {
    hud.classList.remove('hidden');
    clearTimeout(hudTimeout);
    hudTimeout = setTimeout(function() {
        if (isPlaying) hud.classList.add('hidden');
    }, 3000);
}

// ── Keyboard shortcuts ─────────────────────────────────────────────
document.addEventListener('keydown', function(e) {
    if (!gpuReady) return;
    if (e.code === 'Space') {
        e.preventDefault();
        btnPlay.click();
    } else if (e.code === 'ArrowRight') {
        window.holyGrail.mpvCommand(['seek', '5', 'relative']);
    } else if (e.code === 'ArrowLeft') {
        window.holyGrail.mpvCommand(['seek', '-5', 'relative']);
    } else if (e.code === 'KeyM') {
        window.holyGrail.mpvCommand(['cycle', 'mute']);
    }
});

// ── Helpers ─────────────────────────────────────────────────────────
function formatTime(sec) {
    if (!sec || sec < 0) sec = 0;
    var h = Math.floor(sec / 3600);
    var m = Math.floor((sec % 3600) / 60);
    var s = Math.floor(sec % 60);
    if (h > 0) return h + ':' + (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s;
    return m + ':' + (s < 10 ? '0' : '') + s;
}
