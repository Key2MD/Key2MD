const MMIPlayer = (function () {
 'use strict';

 const SPEEDS = [0.75, 1, 1.25, 1.5, 2];

 function fmtTime(sec) {
  if (!Number.isFinite(sec) || sec < 0) sec = 0;
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return m + ':' + String(s).padStart(2, '0');
 }

 function extFromMime(mime) {
  const m = String(mime || '').toLowerCase();
  if (m.includes('mp4')) return '.mp4';
  if (m.includes('ogg')) return '.ogg';
  if (m.includes('mpeg')) return '.mp3';
  if (m.includes('wav')) return '.wav';
  return '.webm';
 }

 function attach(media, opts) {
  opts = opts || {};
  if (media._mmiPlayer && typeof media._mmiPlayer.destroy === 'function') media._mmiPlayer.destroy();

  const wrap = opts.wrap || media.parentElement;
  const mount = opts.mount || null;
  const fsTarget = opts.fsTarget || wrap;
  const audioOnly = !!opts.audioOnly;
  const cleanups = [];
  let durationOverride = 0;
  let scrubbing = false;
  let lastObjectUrl = null;

  function on(target, evt, fn, capture) {
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

  if (!audioOnly) {
   on(media, 'loadedmetadata', () => {
    if (media.duration === Infinity || Number.isNaN(media.duration)) {
     const restore = () => {
      if (Number.isFinite(media.duration) && media.duration > 0) {
       durationOverride = media.duration;
       media.currentTime = 0;
       media.removeEventListener('durationchange', restore);
       sync();
      }
     };
     media.addEventListener('durationchange', restore);
     cleanups.push(() => media.removeEventListener('durationchange', restore));
     try { media.currentTime = 1e101; } catch (e) {}
    }
   });
  }

  const bar = document.createElement('div');
  bar.className = 'mmip-bar' + (audioOnly ? ' mmip-audio' : '');
  bar.tabIndex = 0;
  bar.innerHTML =
   '<div class="mmip-row mmip-scrub-row">' +
    '<span class="mmip-time mmip-cur">0:00</span>' +
    '<div class="mmip-track" role="slider" aria-label="Seek">' +
     '<div class="mmip-buffered"></div>' +
     '<div class="mmip-fill"></div>' +
     '<div class="mmip-thumb"></div>' +
    '</div>' +
    '<span class="mmip-time mmip-dur">--:--</span>' +
   '</div>' +
   '<div class="mmip-row mmip-btn-row">' +
    '<button type="button" class="mmip-btn mmip-play" title="Play/pause (space)">&#9654;</button>' +
    '<button type="button" class="mmip-btn mmip-back" title="Back 10 seconds (left arrow)">-10s</button>' +
    '<button type="button" class="mmip-btn mmip-fwd" title="Forward 10 seconds (right arrow)">+10s</button>' +
    '<button type="button" class="mmip-btn mmip-speed" title="Playback speed">1x</button>' +
    '<div class="mmip-spacer"></div>' +
    '<button type="button" class="mmip-btn mmip-mute" title="Mute (m)">&#128266;</button>' +
    '<button type="button" class="mmip-btn mmip-pip" title="Picture in picture" style="display:none;">&#10697;</button>' +
    '<button type="button" class="mmip-btn mmip-fs" title="Fullscreen (f)" style="display:none;">&#9974;</button>' +
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
   if (overlay) overlay.style.display = playing ? 'none' : 'flex';
  }

  function togglePlay() {
   if (media.paused || media.ended) media.play().catch(() => {});
   else media.pause();
  }

  function skip(sec) {
   const dur = getDuration();
   media.currentTime = Math.max(0, Math.min(dur || media.currentTime + sec, media.currentTime + sec));
   sync();
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

  on(media, 'timeupdate', sync);
  on(media, 'progress', sync);
  on(media, 'durationchange', sync);
  on(media, 'play', () => setPlayIcon(true));
  on(media, 'pause', () => setPlayIcon(false));
  on(media, 'ended', () => { setPlayIcon(false); });
  on(playBtn, 'click', togglePlay);
  on(el('.mmip-back'), 'click', () => skip(-10));
  on(el('.mmip-fwd'), 'click', () => skip(10));

  on(speedBtn, 'click', () => {
   const idx = SPEEDS.indexOf(media.playbackRate);
   const next = SPEEDS[(idx + 1) % SPEEDS.length] || 1;
   media.playbackRate = next;
   speedBtn.textContent = (next % 1 === 0 ? next : next.toFixed(2).replace(/0+$/, '')) + 'x';
  });

  on(muteBtn, 'click', () => {
   media.muted = !media.muted;
   muteBtn.innerHTML = media.muted ? '&#128263;' : '&#128266;';
  });

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
   track.setPointerCapture(e.pointerId);
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

  on(bar, 'keydown', e => {
   const k = e.key;
   if (k === ' ' || k === 'k') { e.preventDefault(); togglePlay(); }
   else if (k === 'ArrowLeft') { e.preventDefault(); skip(-5); }
   else if (k === 'ArrowRight') { e.preventDefault(); skip(5); }
   else if (k === 'j') skip(-10);
   else if (k === 'l') skip(10);
   else if (k === 'f' && !audioOnly) toggleFullscreen();
   else if (k === 'm') muteBtn.click();
  });

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
