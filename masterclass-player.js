(function () {
  var state = {
    apiBase: '',
    kind: '',
    tokenProvider: function () { return ''; },
    setStatus: function () {},
    ready: false,
    watermarkTimer: null,
    countdownTimer: null,
    reloadTimer: null,
    positionIndex: 0,
    viewWindow: { started_at: 0, expires_at: 0, expired: false },
    playbackToken: '',
    watchedSeconds: 0,
    lastTime: 0,
    lastBeacon: 0,
    progressBound: false
  };

  var positions = [
    { left: '6%', top: '12%' },
    { left: '50%', top: '10%' },
    { left: '12%', top: '46%' },
    { left: '58%', top: '42%' },
    { left: '8%', top: '78%' },
    { left: '48%', top: '76%' }
  ];

  function $(id) {
    return document.getElementById(id);
  }

  function show(el, display) {
    if (el) el.style.display = display;
  }

  function setText(id, value) {
    var el = $(id);
    if (el) el.textContent = value || '';
  }

  function formatBytes(value) {
    var n = Number(value || 0);
    if (!n) return '';
    if (n < 1024 * 1024) return Math.round(n / 1024) + ' KB';
    if (n < 1024 * 1024 * 1024) return (n / (1024 * 1024)).toFixed(1) + ' MB';
    return (n / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
  }

  function formatRemaining(ms) {
    var total = Math.max(0, Math.floor(ms / 1000));
    var h = Math.floor(total / 3600);
    var m = Math.floor((total % 3600) / 60);
    var s = total % 60;
    if (h > 0) return h + 'h ' + m + 'm left';
    if (m > 0) return m + 'm ' + s + 's left';
    return s + 's left';
  }

  function clearTimers() {
    if (state.watermarkTimer) { clearInterval(state.watermarkTimer); state.watermarkTimer = null; }
    if (state.countdownTimer) { clearInterval(state.countdownTimer); state.countdownTimer = null; }
    if (state.reloadTimer) { clearTimeout(state.reloadTimer); state.reloadTimer = null; }
  }

  function clearVideo() {
    var video = $('mcRecordingVideo');
    if (video) {
      video.pause();
      video.removeAttribute('src');
      video.load();
    }
    show($('mcRecordingStage'), 'none');
    show($('mcRecordingWatermark'), 'none');
    setText('mcRecordingSession', '');
    state.playbackToken = '';
    clearTimers();
  }

  function moveWatermark() {
    var watermark = $('mcRecordingWatermark');
    if (!watermark) return;
    var pos = positions[state.positionIndex % positions.length];
    state.positionIndex += 1;
    watermark.style.left = pos.left;
    watermark.style.top = pos.top;
  }

  function startWatermark(text) {
    var watermark = $('mcRecordingWatermark');
    if (!watermark) return;
    watermark.textContent = text || '';
    show(watermark, text ? 'block' : 'none');
    moveWatermark();
    if (state.watermarkTimer) clearInterval(state.watermarkTimer);
    state.watermarkTimer = setInterval(moveWatermark, 45000);
  }

  function sendProgress(keepalive) {
    var video = $('mcRecordingVideo');
    if (!video || !state.playbackToken) return;
    var token = state.tokenProvider();
    if (!token) return;
    var payload = JSON.stringify({
      kind: state.kind,
      token: state.playbackToken,
      position: Math.round(video.currentTime || 0),
      duration: Math.round(video.duration || 0),
      watched: Math.round(state.watchedSeconds || 0)
    });
    try {
      fetch(state.apiBase + '/api/masterclass/progress', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
        body: payload,
        keepalive: !!keepalive
      }).catch(function () {});
    } catch (e) {}
  }

  function onTimeUpdate() {
    var video = $('mcRecordingVideo');
    if (!video) return;
    var t = video.currentTime || 0;
    var dt = t - state.lastTime;
    if (dt > 0 && dt < 2) state.watchedSeconds += dt;
    state.lastTime = t;
    var nowMs = Date.now();
    if (nowMs - state.lastBeacon >= 20000) { state.lastBeacon = nowMs; sendProgress(false); }
  }

  function onSeeking() {
    var video = $('mcRecordingVideo');
    if (video) state.lastTime = video.currentTime || 0;
  }

  function showExpired() {
    state.viewWindow.expired = true;
    clearVideo();
    var btn = $('mcRecordingLoadBtn');
    if (btn) { btn.disabled = true; btn.textContent = 'Viewing window ended'; }
    setText('mcRecordingMeta', 'Your one-time 4-hour viewing window has ended, so this recording is no longer available to play.');
    state.setStatus('Your one-time viewing window for this recording has ended.', 'warn');
  }

  function scheduleExpiry(expiresAt) {
    if (state.reloadTimer) { clearTimeout(state.reloadTimer); state.reloadTimer = null; }
    if (!expiresAt) return;
    var ms = expiresAt - Date.now();
    if (ms <= 0) { showExpired(); return; }
    state.reloadTimer = setTimeout(function () {
      clearVideo();
      try { location.reload(); } catch (e) { showExpired(); }
    }, ms + 1500);
  }

  function startCountdown(expiresAt, baseBits) {
    if (state.countdownTimer) { clearInterval(state.countdownTimer); state.countdownTimer = null; }
    function render() {
      var ms = expiresAt - Date.now();
      if (ms <= 0) {
        if (state.countdownTimer) { clearInterval(state.countdownTimer); state.countdownTimer = null; }
        setText('mcRecordingSession', baseBits.concat(['viewing window ended']).join(' | '));
        return;
      }
      setText('mcRecordingSession', baseBits.concat(['viewing window: ' + formatRemaining(ms)]).join(' | '));
    }
    render();
    state.countdownTimer = setInterval(render, 1000);
  }

  async function loadRecording() {
    var token = state.tokenProvider();
    var btn = $('mcRecordingLoadBtn');
    var video = $('mcRecordingVideo');
    if (!token) {
      state.setStatus('Log in before watching the recording.', 'warn');
      return;
    }
    if (!video) return;
    if (state.viewWindow.expired) { showExpired(); return; }
    if (!state.viewWindow.started_at) {
      var ok = window.confirm(
        'Starting playback begins your single one-time viewing window for this recording.\n\n' +
        'You will have 4 hours from now to watch it in full, and access cannot be reset afterwards. ' +
        'Make sure you can watch it now in one sitting.\n\nStart your viewing window?'
      );
      if (!ok) return;
    }
    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Creating secure player...';
    }
    try {
      var res = await fetch(state.apiBase + '/api/masterclass/playback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
        body: JSON.stringify({ kind: state.kind })
      });
      var data = await res.json().catch(function () { return {}; });
      if (res.status === 403 && data.error === 'view_window_expired') { showExpired(); return; }
      if (!res.ok || !data.playback_url) throw new Error(data.message || data.error || 'Could not create a secure playback session.');
      video.pause();
      video.setAttribute('controlsList', 'nodownload noremoteplayback nofullscreen');
      video.setAttribute('disablePictureInPicture', '');
      video.src = data.playback_url;
      video.load();
      show($('mcRecordingStage'), 'block');
      try { state.playbackToken = new URL(data.playback_url, location.href).searchParams.get('token') || ''; } catch (e) { state.playbackToken = ''; }
      state.watchedSeconds = 0;
      state.lastTime = 0;
      state.lastBeacon = Date.now();
      startWatermark(data.watermark_text || '');
      var expiresAt = Number(data.view_window_expires_at || 0);
      if (expiresAt) {
        state.viewWindow.started_at = expiresAt - (Number(data.view_window_seconds || 14400) * 1000);
        state.viewWindow.expires_at = expiresAt;
        scheduleExpiry(expiresAt);
      }
      if (data.first_load) {
        state.setStatus('Your one-time 4-hour viewing window has started. Watch the recording in full now, it cannot be reopened later.', 'warn');
      }
      var bits = [];
      if (data.session_id) bits.push('Session ' + String(data.session_id).replace(/^mc_/, '').slice(0, 10));
      if (data.size) bits.push(formatBytes(data.size));
      if (expiresAt) startCountdown(expiresAt, bits);
      else setText('mcRecordingSession', bits.join(' | '));
      if (btn) btn.textContent = 'Refresh secure link';
    } catch (err) {
      state.setStatus(err.message || 'Could not load the recording.', 'err');
      if (btn) btn.textContent = 'Load recording';
    } finally {
      if (btn && !state.viewWindow.expired) btn.disabled = false;
    }
  }

  function updateFromStatus(data) {
    var section = $('mcRecordingSection');
    if (!section) return;
    state.viewWindow.started_at = Number(data && data.view_window_started_at || 0);
    state.viewWindow.expires_at = Number(data && data.view_window_expires_at || 0);
    state.viewWindow.expired = !!(data && data.view_window_expired);
    var canWatch = !!(data && data.authenticated && data.has_access && data.recording_available);
    show(section, canWatch ? 'block' : 'none');
    if (!canWatch) { clearVideo(); }
    var mc = data && data.masterclass ? data.masterclass : {};
    setText('mcRecordingTitle', (mc.short_title || mc.title || 'Masterclass') + ' recording');
    if (!canWatch) return;
    var btn = $('mcRecordingLoadBtn');
    if (state.viewWindow.expired) {
      showExpired();
      return;
    }
    if (btn) { btn.disabled = false; }
    if (state.viewWindow.started_at && state.viewWindow.expires_at) {
      setText('mcRecordingMeta', 'One-time access: your 4-hour viewing window is open and will not reopen once it ends. Playback is watermarked to your account.');
    } else {
      setText('mcRecordingMeta', 'One-time access: pressing play starts a single 4-hour viewing window that cannot be reset. Watch it in full in one sitting. Playback is watermarked to your account.');
    }
  }

  function init(options) {
    state.apiBase = String(options.apiBase || '').replace(/\/$/, '');
    state.kind = options.kind || '';
    state.tokenProvider = options.tokenProvider || state.tokenProvider;
    state.setStatus = options.setStatus || state.setStatus;
    state.ready = true;
    var btn = $('mcRecordingLoadBtn');
    if (btn) btn.addEventListener('click', loadRecording);
    var stage = $('mcRecordingStage');
    if (stage) stage.addEventListener('contextmenu', function (event) { event.preventDefault(); });
    var fsBtn = $('mcFullscreenBtn');
    if (fsBtn && stage) {
      fsBtn.addEventListener('click', function () {
        var active = document.fullscreenElement || document.webkitFullscreenElement;
        if (active) {
          (document.exitFullscreen || document.webkitExitFullscreen || function () {}).call(document);
        } else {
          (stage.requestFullscreen || stage.webkitRequestFullscreen || function () {}).call(stage);
        }
      });
    }
    var video = $('mcRecordingVideo');
    if (video) {
      video.addEventListener('error', function () {
        if (state.viewWindow.expired) { showExpired(); return; }
        state.setStatus('The secure video link expired or could not load. Refresh the secure link and try again.', 'warn');
      });
      if (!state.progressBound) {
        state.progressBound = true;
        video.addEventListener('timeupdate', onTimeUpdate);
        video.addEventListener('seeking', onSeeking);
        video.addEventListener('pause', function () { sendProgress(false); });
        video.addEventListener('ended', function () { sendProgress(false); });
      }
    }
    window.addEventListener('pagehide', function () { sendProgress(true); });
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'hidden') { sendProgress(true); return; }
      // Re-check the window when the tab regains focus, in case background timers were throttled.
      if (state.viewWindow.expires_at && Date.now() >= state.viewWindow.expires_at) {
        clearVideo();
        try { location.reload(); } catch (e) { showExpired(); }
      }
    });
  }

  window.Key2MDMasterclassPlayer = {
    init: init,
    updateFromStatus: updateFromStatus,
    loadRecording: loadRecording
  };
})();
