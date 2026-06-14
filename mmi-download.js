/**
 * mmi-download.js - Key2MD
 * Reliable, seekable downloads of MMI / CASPer recordings.
 *
 * Recording now prefers MP4 (Chrome/Edge/Safari): a proper, seekable, VLC-native
 * file - saved as-is. WebM (Firefox fallback) is a streaming container with no
 * seek index; client-side remux (ffmpeg.wasm / ts-ebml) proved unreliable to load
 * from a CDN, and self-hosting ffmpeg's core is too large for the static site, so
 * we save the WebM directly and tell first-time downloaders to use VLC (which
 * handles browser recordings far better than most default players). A proper WebM
 * fix belongs server-side (see notes) if it ever becomes a priority.
 */
window.MMIDownload = (() => {
 function mimeOf(blob) { return String((blob && blob.type) || '').toLowerCase(); }
 function isMp4(blob) { return mimeOf(blob).includes('mp4'); }
 function extFor(blob) {
  const m = mimeOf(blob);
  if (m.includes('mp4')) return '.mp4';
  if (m.includes('matroska') || m.includes('x-matroska')) return '.mkv';
  if (m.includes('ogg')) return '.ogg';
  return '.webm';
 }

 function saveBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 15000);
 }

 // -- One-time, self-contained toast ------------------------------------------
 let toastEl = null, toastTimer = null;
 function dismiss() { if (toastTimer) { clearTimeout(toastTimer); toastTimer = null; } if (toastEl) { toastEl.remove(); toastEl = null; } }
 function showToast(html, ttl) {
  dismiss();
  const t = document.createElement('div');
  t.setAttribute('role', 'status');
  t.style.cssText = 'position:fixed;left:50%;bottom:26px;transform:translateX(-50%);max-width:min(520px,92vw);background:#0a1628;color:#fff;font-family:DM Sans,system-ui,sans-serif;font-size:0.84rem;line-height:1.5;padding:12px 16px;border-radius:12px;box-shadow:0 10px 30px rgba(0,0,0,0.32);z-index:100000;display:flex;gap:12px;align-items:flex-start;';
  t.innerHTML = `<div style="flex:1;">${html}</div><button aria-label="Dismiss" style="background:none;border:none;color:rgba(255,255,255,0.65);font-size:1.1rem;line-height:1;cursor:pointer;padding:0;">&times;</button>`;
  t.querySelectorAll('a').forEach(a => { a.style.color = '#38bdf8'; a.style.fontWeight = '700'; });
  t.querySelector('button').addEventListener('click', dismiss);
  document.body.appendChild(t);
  toastEl = t;
  toastTimer = setTimeout(dismiss, ttl || 14000);
 }

 function vlcTipOnce() {
  let seen = false;
  try { seen = !!localStorage.getItem('k2_dl_vlc_tip'); } catch (e) {}
  if (seen) return;
  try { localStorage.setItem('k2_dl_vlc_tip', '1'); } catch (e) {}
  showToast('Saved. This is a browser webcam recording - it plays and scrubs best in <strong>VLC</strong> (free, every platform); some built-in players open it without a seek bar. <a href="https://www.videolan.org/vlc/" target="_blank" rel="noopener">Get VLC</a>', 16000);
 }

 // -- Public ------------------------------------------------------------------
 // baseName must NOT include an extension.
 function download(blob, baseName) {
  if (!blob) return;
  const name = String(baseName || 'Key2MD-recording');
  const ext = extFor(blob);
  saveBlob(blob, name + ext);
  // MP4 plays and seeks everywhere - no nag. Anything else: one-time VLC tip.
  if (ext !== '.mp4') vlcTipOnce();
 }

 return { download, saveBlob, isMp4, extFor };
})();
