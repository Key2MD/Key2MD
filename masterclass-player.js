(function () {
  var state = {
    apiBase: '',
    kind: '',
    tokenProvider: function () { return ''; },
    setStatus: function () {},
    ready: false,
    watermarkTimer: null,
    positionIndex: 0
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
    if (state.watermarkTimer) {
      clearInterval(state.watermarkTimer);
      state.watermarkTimer = null;
    }
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
    state.watermarkTimer = setInterval(moveWatermark, 75000);
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
      if (!res.ok || !data.playback_url) throw new Error(data.message || data.error || 'Could not create a secure playback session.');
      video.pause();
      video.setAttribute('controlsList', 'nodownload noremoteplayback nofullscreen');
      video.setAttribute('disablePictureInPicture', '');
      video.src = data.playback_url;
      video.load();
      show($('mcRecordingStage'), 'block');
      startWatermark(data.watermark_text || '');
      var bits = [];
      if (data.session_id) bits.push('Session ' + String(data.session_id).replace(/^mc_/, '').slice(0, 10));
      if (data.size) bits.push(formatBytes(data.size));
      if (data.expires_in) bits.push('secure link expires in about ' + Math.round(Number(data.expires_in) / 3600) + ' hours');
      setText('mcRecordingSession', bits.join(' | '));
      if (btn) btn.textContent = 'Refresh secure link';
    } catch (err) {
      state.setStatus(err.message || 'Could not load the recording.', 'err');
      if (btn) btn.textContent = 'Load recording';
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  function updateFromStatus(data) {
    var section = $('mcRecordingSection');
    if (!section) return;
    var canWatch = !!(data && data.authenticated && data.has_access && data.recording_available);
    show(section, canWatch ? 'block' : 'none');
    if (!canWatch) clearVideo();
    var mc = data && data.masterclass ? data.masterclass : {};
    setText('mcRecordingTitle', (mc.short_title || mc.title || 'Masterclass') + ' recording');
    setText('mcRecordingMeta', canWatch
      ? 'Your private stream is watermarked to your account each time you watch.'
      : '');
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
        state.setStatus('The secure video link expired or could not load. Refresh the secure link and try again.', 'warn');
      });
    }
  }

  window.Key2MDMasterclassPlayer = {
    init: init,
    updateFromStatus: updateFromStatus,
    loadRecording: loadRecording
  };
})();
