/* ── mpv Holy Grail — Renderer ──────────────────────────────────────
   Phase 2a: Test the D3D11 → sharedTexture → VideoFrame → Canvas pipeline.
   A solid color rectangle from the GPU = the holy grail works.
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

// ── Phase 2a: GPU texture test buttons ─────────────────────────────
var testPanel = document.getElementById('testPanel');

var hudTimeout = null;
var isPlaying  = false;

// ── Check capabilities on load ─────────────────────────────────────
(async function() {
    var caps = await window.holyGrail.checkCapabilities();
    console.log('[renderer] Capabilities:', caps);

    if (caps.addonLoaded && caps.sharedTexture) {
        status.textContent = 'Phase 2a: Native addon + sharedTexture ready — test the GPU pipeline!';
        if (testPanel) testPanel.style.display = 'flex';
    } else if (!caps.addonLoaded) {
        status.textContent = 'Native addon not loaded — run: npm run build';
    } else if (!caps.sharedTexture) {
        status.textContent = 'sharedTexture module not available — check Electron version';
    }
})();

// ── Register VideoFrame receiver ───────────────────────────────────
window.holyGrail.onVideoFrame(function(videoFrame) {
    console.log('[renderer] Received VideoFrame:', videoFrame.codedWidth, 'x', videoFrame.codedHeight);

    // Resize canvas to match the texture
    canvas.width  = videoFrame.codedWidth;
    canvas.height = videoFrame.codedHeight;
    canvas.style.display = 'block';

    // Draw the GPU-backed VideoFrame to the canvas
    var ctx = canvas.getContext('2d');
    ctx.drawImage(videoFrame, 0, 0);

    // Close the frame (releases GPU resources)
    videoFrame.close();

    status.textContent = 'GPU PIPELINE WORKS! Frame drawn from D3D11 shared texture.';
    console.log('[renderer] Frame drawn successfully!');
});

// ── Test buttons ───────────────────────────────────────────────────
function testColor(r, g, b, name) {
    status.textContent = 'Sending ' + name + ' texture through GPU pipeline...';
    window.holyGrail.testSharedTexture(r, g, b)
        .then(function(result) {
            console.log('[renderer] Test texture sent:', result);
        })
        .catch(function(err) {
            status.textContent = 'ERROR: ' + err.message;
            console.error('[renderer] Test failed:', err);
        });
}

// Attach test button handlers (if the buttons exist)
var btnRed   = document.getElementById('btnTestRed');
var btnGreen = document.getElementById('btnTestGreen');
var btnBlue  = document.getElementById('btnTestBlue');
if (btnRed)   btnRed.addEventListener('click',   function() { testColor(1, 0, 0, 'RED'); });
if (btnGreen) btnGreen.addEventListener('click', function() { testColor(0, 1, 0, 'GREEN'); });
if (btnBlue)  btnBlue.addEventListener('click',  function() { testColor(0, 0, 1, 'BLUE'); });

// ── Phase 1 fallback: HTML5 video ──────────────────────────────────
var video = document.createElement('video');
video.style.display = 'none';
document.body.appendChild(video);

btnOpen.addEventListener('click', async function() {
    var filePath = await window.holyGrail.openVideo();
    if (!filePath) return;
    loadVideo(filePath);
});

function loadVideo(filePath) {
    var name = filePath.replace(/\\/g, '/').split('/').pop();
    fileName.textContent = name;
    status.textContent = 'Loading: ' + name;

    video.src = 'file://' + filePath.replace(/#/g, '%23');
    video.play().then(function() {
        landing.style.display = 'none';
        canvas.style.display = 'block';
        hud.classList.remove('hidden');
        isPlaying = true;
        btnPlay.textContent = '⏸';
        drawLoop();
        showHudBriefly();
    }).catch(function(err) {
        status.textContent = 'Error: ' + err.message;
    });
}

function drawLoop() {
    if (video.paused || video.ended) return;
    if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
        canvas.width  = video.videoWidth  || 1280;
        canvas.height = video.videoHeight || 720;
    }
    var ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    if (video.duration) {
        var pct = (video.currentTime / video.duration) * 100;
        seekFill.style.width = pct + '%';
        timeDisp.textContent = formatTime(video.currentTime) + ' / ' + formatTime(video.duration);
    }
    requestAnimationFrame(drawLoop);
}

// ── Controls ───────────────────────────────────────────────────────
btnPlay.addEventListener('click', function() {
    if (video.paused) {
        video.play(); isPlaying = true; btnPlay.textContent = '⏸'; drawLoop();
    } else {
        video.pause(); isPlaying = false; btnPlay.textContent = '▶';
    }
});

seekBar.addEventListener('click', function(e) {
    if (!video.duration) return;
    var rect = seekBar.getBoundingClientRect();
    video.currentTime = ((e.clientX - rect.left) / rect.width) * video.duration;
});

video.addEventListener('ended', function() { isPlaying = false; btnPlay.textContent = '▶'; });

// ── HUD ────────────────────────────────────────────────────────────
document.addEventListener('mousemove', function() {
    if (landing.style.display !== 'none') return;
    showHudBriefly();
});

function showHudBriefly() {
    hud.classList.remove('hidden');
    clearTimeout(hudTimeout);
    hudTimeout = setTimeout(function() { if (isPlaying) hud.classList.add('hidden'); }, 3000);
}

function formatTime(sec) {
    var m = Math.floor(sec / 60);
    var s = Math.floor(sec % 60);
    return m + ':' + (s < 10 ? '0' : '') + s;
}

document.addEventListener('keydown', function(e) {
    if (e.code === 'Space') { e.preventDefault(); btnPlay.click(); }
    else if (e.code === 'ArrowRight') { video.currentTime = Math.min(video.currentTime + 5, video.duration || 0); }
    else if (e.code === 'ArrowLeft') { video.currentTime = Math.max(video.currentTime - 5, 0); }
});
