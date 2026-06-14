const MMIPlayer = (function () {
 'use strict';

 const SPEEDS = [0.75, 1, 1.25, 1.5, 2];
 const RATE_KEY = 'k2mmiRate';
 const VOL_KEY = 'k2mmiVol';

 function fmtTime(sec) {
  if (!Number.isFinite(sec) || sec < 0) sec = 0;
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return m + ':' + String(s).padStart(2, '0');
 }

 function rateLabel(r) {
  return (r % 1 === 0 ? r : r.toFixed(2).replace(/0+$/, '').replace(/\.$/, '')) + 'x';
 }

 function loadNum(key, def) {
  try { const v = parseFloat(localStorage.getItem(key)); return Number.isFinite(v) ? v : def; } catch (e) { return def; }
 }
 function saveNum(key, v) { try { localStorage.setItem(key, String(v)); } catch (e) {} }

 function extFromMime(mime) {
  const m = String(mime || '').toLowerCase();
  if (m.includes('mp4')) return '.mp4';
  if (m.includes('ogg')) return '.ogg';
  if (m.includes('mpeg')) return '.mp3';
  if (m.includes('wav')) return '.wav';
  return '.webm';
 }

 function ensureStyles() {
  if (document.getElementById('mmip-extra-styles')) return;
  const s = document.createElement('style');
  s.id = 'mmip-extra-styles';
  s.textContent =
   '.mmip-vol{width:74px;height:4px;accent-color:#0ea5e9;cursor:pointer;vertical-align:middle;margin:0 2px;}' +
   '.mmip-bar .mmip-btn{cursor:pointer;}' +
   '.mmip-bar{outline:none;}' +
   '.mmip-track:focus-visible{outline:2px solid #0ea5e9;outline-offset:3px;}' +
   '.mmip-vol-wrap{display:inline-flex;align-items:center;}';
  document.head.appendChild(s);
 }

 function attach(media, opts) {
  opts = opts || {};
  if (media._mmiPlayer && typeof media._mmiPlayer.destroy === 'function') media._mmiPlayer.destroy();
  ensureStyles();

  const wrap = opts.wrap || media.parentElement;
  const mount = opts.mount || null;
  const fsTarget = opts.fsTarget || wrap;
  const audioOnly = !!opts.audioOnly;
  const cleanups = [];
  let durationOverride = 0;
  let scrubbing = false;
  let lastObjectUrl = null;
  let lastVolume = 1;

  function on(target, evt, fn, capture) {
   if (!target) return;
   target.addEventListener(evt, fn, capture || false);
   cleanups.push(() => target.removeEventListener(evt, fn, capture || false));
  }

  function getDuration() {
   const d = Number(media.duration);
   if (Number.isFinite(d) && d > 0 && d < 86400) return d;
   if (durationOverride > 0) return durationOverride;
   const fb = Number(typeof opts.getFallbackDuration === 'function' ? opts.getFallbackDuration() : 0);
   return Number.isFinite(fb) && fb > 0 && fb < 86400 ? fb : 0;
  }

  let durationRecovered = false;
  function recoverDuration() {
   if (audioOnly || durationRecovered) return;
   if (media.duration === Infinity || Number.isNaN(media.duration) || media.duration <= 0) {
    const restore = () => {
     if (Number.isFinite(media.duration) && media.duration > 0) {
      durationRecovered = true;
      durationOverride = media.duration;
      try { media.currentTime = 0; } catch (e) {}
      media.removeEventListener('durationchange', restore);
      sync();
     }
    };
    media.addEventListener('durationchange', restore);
    cleanups.push(() => media.removeEventListener('durationchange', restore));
    try { media.currentTime = 1e101; } catch (e) {}
   } else {
    durationRecovered = true;
   }
  }
  if (!audioOnly) {
   on(media, 'loadedmetadata', recoverDuration);
   if (media.readyState >= 1) recoverDuration();
  }

  const bar = document.createElement('div');
  bar.className = 'mmip-bar' + (audioOnly ? ' mmip-audio' : '');
  bar.tabIndex = 0;
  bar.innerHTML =
   '<div class="mmip-row mmip-scrub-row">' +
    '<span class="mmip-time mmip-cur">0:00</span>' +
    '<div class="mmip-track" role="slider" tabindex="0" aria-label="Seek" aria-valuemin="0" aria-valuenow="0">' +
     '<div class="mmip-buffered"></div>' +
     '<div class="mmip-fill"></div>' +
     '<div class="mmip-thumb"></div>' +
    '</div>' +
    '<span class="mmip-time mmip-dur">--:--</span>' +
   '</div>' +
   '<div class="mmip-row mmip-btn-row">' +
    '<button type="button" class="mmip-btn mmip-play" title="Play/pause (space)" aria-label="Play">&#9654;</button>' +
    '<button type="button" class="mmip-btn mmip-back" title="Back 10 seconds (J)">-10s</button>' +
    '<button type="button" class="mmip-btn mmip-fwd" title="Forward 10 seconds (L)">+10s</button>' +
    '<button type="button" class="mmip-btn mmip-speed" title="Playback speed">1x</button>' +
    '<div class="mmip-spacer"></div>' +
    '<span class="mmip-vol-wrap">' +
     '<button type="button" class="mmip-btn mmip-mute" title="Mute (M)" aria-label="Mute">&#128266;</button>' +
     '<input type="range" class="mmip-vol" min="0" max="1" step="0.05" value="1" aria-label="Volume" title="Volume">' +
    '</span>' +
    '<button type="button" class="mmip-btn mmip-pip" title="Picture in picture" style="display:none;">&#10697;</button>' +
    '<button type="button" class="mmip-btn mmip-fs" title="Fullscreen (F)" style="display:none;">&#9974;</button>' +
    '<button type="button" class="mmip-btn mmip-dl" title="Save to device" style="display:none;">&#11015; Save</button>' +
    '<button type="button" class="mmip-btn mmip-rerec" title="Re-record" style="display:none;">&#8635; Re-record</button>' +
   '</div>';
  (mount || wrap).appendChild(bar);

  const el = sel => bar.querySelector(sel);
  const playBtn = el('.mmip-play');
  const track = el('.mmip-track');
  const fill = el('.mmip-fill');
  const buffered = el('.mmip-buffered');
  const thumb = el('.mmip-thumb');
  const curEl = el('.mmip-cur');
  const durEl = el('.mmip-dur');
  const speedBtn = el('.mmip-speed');
  const muteBtn = el('.mmip-mute');
  const volSlider = el('.mmip-vol');
  const pipBtn = el('.mmip-pip');
  const fsBtn = el('.mmip-fs');
  const dlBtn = el('.mmip-dl');
  const rerecBtn = el('.mmip-rerec');

  let overlay = null;
  if (!audioOnly && wrap) {
   overlay = document.createElement('div');
   overlay.className = 'mmip-overlay';
   overlay.innerHTML = '<div class="mmip-overlay-btn">&#9654;</div>';
   wrap.appendChild(overlay);
   on(overlay, 'click', togglePlay);
   on(media, 'dblclick', toggleFullscreen);
   on(media, 'click', togglePlay);
  }

  function sync() {
   const dur = getDuration();
   if (dur) durEl.textContent = fmtTime(dur);
   if (!scrubbing && dur) {
    const pct = Math.min(100, (media.currentTime / dur) * 100);
    fill.style.width = pct + '%';
    thumb.style.left = pct + '%';
    track.setAttribute('aria-valuemax', String(Math.round(dur)));
    track.setAttribute('aria-valuenow', String(Math.round(media.currentTime)));
   }
   curEl.textContent = fmtTime(media.currentTime);
   try {
    if (dur && media.buffered && media.buffered.length) {
     buffered.style.width = Math.min(100, (media.buffered.end(media.buffered.length - 1) / dur) * 100) + '%';
    }
   } catch (e) {}
  }

  function setPlayIcon(playing) {
   playBtn.innerHTML = playing ? '&#10074;&#10074;' : '&#9654;';
   playBtn.setAttribute('aria-label', playing ? 'Pause' : 'Play');
   if (overlay) overlay.style.display = playing ? 'none' : 'flex';
  }

  function togglePlay() {
   if (media.ended) { try { media.currentTime = 0; } catch (e) {} }
   if (media.paused || media.ended) media.play().catch(() => {});
   else media.pause();
  }

  function skip(sec) {
   const dur = getDuration();
   const target = media.currentTime + sec;
   media.currentTime = Math.max(0, dur ? Math.min(dur, target) : Math.max(0, target));
   sync();
  }

  function updateVolUI() {
   const v = media.muted ? 0 : media.volume;
   if (volSlider && document.activeElement !== volSlider) volSlider.value = String(v);
   muteBtn.innerHTML = (media.muted || media.volume === 0) ? '&#128263;' : '&#128266;';
   muteBtn.setAttribute('aria-label', (media.muted || media.volume === 0) ? 'Unmute' : 'Mute');
  }

  function setVolume(v) {
   v = Math.max(0, Math.min(1, v));
   media.volume = v;
   media.muted = v <= 0;
   if (v > 0) lastVolume = v;
   saveNum(VOL_KEY, v);
   updateVolUI();
  }

  function toggleMute() {
   if (media.muted || media.volume === 0) {
    media.muted = false;
    if (media.volume === 0) media.volume = lastVolume > 0 ? lastVolume : 0.5;
    saveNum(VOL_KEY, media.volume);
   } else {
    lastVolume = media.volume;
    media.muted = true;
   }
   updateVolUI();
  }

  function setRate(r) {
   if (!SPEEDS.includes(r)) r = 1;
   media.playbackRate = r;
   speedBtn.textContent = rateLabel(r);
   saveNum(RATE_KEY, r);
  }

  function seekFromPointer(e) {
   const dur = getDuration();
   if (!dur) return;
   const rect = track.getBoundingClientRect();
   const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
   fill.style.width = (pct * 100) + '%';
   thumb.style.left = (pct * 100) + '%';
   curEl.textContent = fmtTime(pct * dur);
   return pct * dur;
  }

  function toggleFullscreen() {
   if (audioOnly) return;
   const target = fsTarget || media;
   if (document.fullscreenElement) {
    document.exitFullscreen().catch(() => {});
   } else if (target.requestFullscreen) {
    target.requestFullscreen().catch(() => {});
   } else if (media.webkitEnterFullscreen) {
    media.webkitEnterFullscreen();
   }
  }

  // Apply remembered preferences.
  const savedVol = loadNum(VOL_KEY, 1);
  media.volume = Math.max(0, Math.min(1, savedVol));
  lastVolume = media.volume > 0 ? media.volume : 1;
  setRate(loadNum(RATE_KEY, 1));
  updateVolUI();

  on(media, 'timeupdate', sync);
  on(media, 'progress', sync);
  on(media, 'durationchange', sync);
  on(media, 'volumechange', updateVolUI);
  on(media, 'play', () => setPlayIcon(true));
  on(media, 'pause', () => setPlayIcon(false));
  on(media, 'ended', () => setPlayIcon(false));
  on(playBtn, 'click', togglePlay);
  on(el('.mmip-back'), 'click', () => skip(-10));
  on(el('.mmip-fwd'), 'click', () => skip(10));

  on(speedBtn, 'click', () => {
   const idx = SPEEDS.indexOf(media.playbackRate);
   setRate(SPEEDS[(idx + 1) % SPEEDS.length] || 1);
  });

  on(muteBtn, 'click', toggleMute);
  if (volSlider) on(volSlider, 'input', () => setVolume(parseFloat(volSlider.value)));

  if (!audioOnly && document.pictureInPictureEnabled && media.tagName === 'VIDEO') {
   pipBtn.style.display = '';
   on(pipBtn, 'click', () => {
    if (document.pictureInPictureElement) document.exitPictureInPicture().catch(() => {});
    else media.requestPictureInPicture().catch(() => {});
   });
  }

  if (!audioOnly && (fsTarget?.requestFullscreen || media.webkitEnterFullscreen)) {
   fsBtn.style.display = '';
   on(fsBtn, 'click', toggleFullscreen);
   on(document, 'fullscreenchange', () => {
    const active = document.fullscreenElement === fsTarget;
    fsBtn.innerHTML = active ? '&#11138;' : '&#9974;';
    if (fsTarget) fsTarget.classList.toggle('mmip-fullscreen', active);
   });
  }

  if (opts.getDownloadBlob || opts.downloadUrl) {
   dlBtn.style.display = '';
   on(dlBtn, 'click', async () => {
    let blob = null;
    const original = dlBtn.innerHTML;
    try {
     if (typeof opts.getDownloadBlob === 'function') blob = opts.getDownloadBlob();
     if (!blob && opts.downloadUrl) {
      dlBtn.disabled = true;
      dlBtn.textContent = 'Saving...';
      const res = await fetch(opts.downloadUrl);
      if (!res.ok) throw new Error('fetch failed');
      blob = await res.blob();
     }
     if (!blob) return;
     if (window.MMIDownload && typeof window.MMIDownload.download === 'function') {
      await window.MMIDownload.download(blob, opts.downloadName || 'Key2MD-recording');
     } else {
      const name = (opts.downloadName || 'Key2MD-recording') + extFromMime(blob.type);
      if (lastObjectUrl) { URL.revokeObjectURL(lastObjectUrl); lastObjectUrl = null; }
      const url = URL.createObjectURL(blob);
      lastObjectUrl = url;
      const a = document.createElement('a');
      a.href = url;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => { if (lastObjectUrl === url) { URL.revokeObjectURL(url); lastObjectUrl = null; } }, 10000);
     }
    } catch (e) {
     alert('Could not save the recording. Please try again.');
    }
    dlBtn.disabled = false;
    dlBtn.innerHTML = original;
   });
  }

  if (typeof opts.onReRecord === 'function') {
   rerecBtn.style.display = '';
   on(rerecBtn, 'click', opts.onReRecord);
  }

  on(track, 'pointerdown', e => {
   scrubbing = true;
   try { track.setPointerCapture(e.pointerId); } catch (er) {}
   seekFromPointer(e);
  });
  on(track, 'pointermove', e => { if (scrubbing) seekFromPointer(e); });
  on(track, 'pointerup', e => {
   if (!scrubbing) return;
   scrubbing = false;
   const t = seekFromPointer(e);
   if (t != null) media.currentTime = t;
  });
  on(track, 'pointercancel', () => { scrubbing = false; });
  on(track, 'keydown', e => {
   if (e.key === 'ArrowLeft') { e.preventDefault(); skip(-5); }
   else if (e.key === 'ArrowRight') { e.preventDefault(); skip(5); }
   else if (e.key === 'Home') { e.preventDefault(); media.currentTime = 0; sync(); }
   else if (e.key === 'End') { e.preventDefault(); const d = getDuration(); if (d) { media.currentTime = Math.max(0, d - 0.1); sync(); } }
  });

  // Shortcuts work whenever the player is hovered, focused, or fullscreen - not just the bar.
  function engaged() {
   if (document.fullscreenElement && fsTarget && (document.fullscreenElement === fsTarget || fsTarget.contains(document.fullscreenElement) || document.fullscreenElement.contains(media))) return true;
   try { if (wrap && wrap.matches(':hover')) return true; } catch (e) {}
   try { if (bar && bar.matches(':hover')) return true; } catch (e) {}
   const ae = document.activeElement;
   if (ae && (ae === bar || (bar && bar.contains(ae)) || (wrap && wrap.contains(ae)))) return true;
   return false;
  }

  function onKey(e) {
   if (!engaged()) return;
   const t = e.target;
   if (t && t.tagName === 'INPUT' && t.type === 'range') return; // let the volume slider use arrows natively
   if (t && (t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
   const k = e.key;
   if (k === ' ' || k === 'k') { e.preventDefault(); togglePlay(); }
   else if (k === 'ArrowLeft') { e.preventDefault(); skip(-5); }
   else if (k === 'ArrowRight') { e.preventDefault(); skip(5); }
   else if (k === 'ArrowUp') { e.preventDefault(); setVolume((media.muted ? 0 : media.volume) + 0.1); }
   else if (k === 'ArrowDown') { e.preventDefault(); setVolume((media.muted ? 0 : media.volume) - 0.1); }
   else if (k === 'j') { e.preventDefault(); skip(-10); }
   else if (k === 'l') { e.preventDefault(); skip(10); }
   else if (k === 'f' && !audioOnly) { e.preventDefault(); toggleFullscreen(); }
   else if (k === 'm') { e.preventDefault(); toggleMute(); }
   else if (k === '0' || k === 'Home') { e.preventDefault(); media.currentTime = 0; sync(); }
  }
  on(document, 'keydown', onKey);

  sync();
  setPlayIcon(false);

  const instance = {
   destroy() {
    cleanups.forEach(fn => { try { fn(); } catch (e) {} });
    if (lastObjectUrl) { URL.revokeObjectURL(lastObjectUrl); lastObjectUrl = null; }
    bar.remove();
    if (overlay) overlay.remove();
    delete media._mmiPlayer;
   },
  };
  media._mmiPlayer = instance;
  return instance;
 }

 return { attach };
})();
