// Client-side intonation tracker for premium MMI delivery feedback.
// Samples voice pitch (F0) during recording via normalised autocorrelation and reports
// how much the pitch moved (monotone vs expressive). Audio never leaves the browser;
// only the summary numbers are sent up. Premium-gated at the call sites.

(function (global) {
  "use strict";

  var MIN_HZ = 75, MAX_HZ = 400;        // human speech fundamental band
  var RMS_GATE = 0.012;                 // skip near-silent frames
  var CLARITY_GATE = 0.9;               // normalised autocorrelation peak required for a voiced frame
  var SAMPLE_MS = 50;                   // ~20 pitch reads per second
  var MIN_VOICED_FRAMES = 30;           // need this much voiced speech to report
  var FLAT_ST = 2.0, EXPRESSIVE_ST = 5.0;

  var state = null;
  var lastPitches = [];

  // Normalised autocorrelation pitch estimate for one frame of float samples.
  function detectPitch(buf, sampleRate) {
    var n0 = buf.length;
    var rms = 0;
    for (var i = 0; i < n0; i++) rms += buf[i] * buf[i];
    rms = Math.sqrt(rms / n0);
    if (rms < RMS_GATE) return null;

    var maxLag = Math.min(Math.floor(sampleRate / MIN_HZ), n0 - 1);
    var minLag = Math.floor(sampleRate / MAX_HZ);
    if (minLag < 1) minLag = 1;
    var ncc = new Float32Array(maxLag + 2);
    var globalMax = 0;
    for (var lag = minLag; lag <= maxLag; lag++) {
      var sxy = 0, sxx = 0, syy = 0, n = n0 - lag;
      for (var k = 0; k < n; k++) {
        var x = buf[k], y = buf[k + lag];
        sxy += x * y; sxx += x * x; syy += y * y;
      }
      var denom = sxx * syy;
      var v = denom > 0 ? sxy / Math.sqrt(denom) : 0;
      ncc[lag] = v;
      if (v > globalMax) globalMax = v;
    }
    if (globalMax < CLARITY_GATE) return null;
    // Pick the shortest-lag (fundamental) peak near the global max, so a sub-harmonic
    // at double the period does not pull the estimate down an octave.
    var thresh = 0.9 * globalMax;
    var chosenLag = -1;
    for (var L = minLag + 1; L < maxLag; L++) {
      if (ncc[L] >= thresh && ncc[L] >= ncc[L - 1] && ncc[L] >= ncc[L + 1]) { chosenLag = L; break; }
    }
    if (chosenLag < 0) return null;
    var f0 = sampleRate / chosenLag;
    if (f0 < MIN_HZ || f0 > MAX_HZ) return null;
    return f0;
  }

  function median(arr) {
    var a = arr.slice().sort(function (x, y) { return x - y; });
    var n = a.length;
    return n % 2 ? a[(n - 1) / 2] : (a[n / 2 - 1] + a[n / 2]) / 2;
  }
  function percentile(sorted, p) {
    if (!sorted.length) return 0;
    var idx = (sorted.length - 1) * p;
    var lo = Math.floor(idx), hi = Math.ceil(idx);
    return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
  }

  // Pure summary from a list of voiced F0 samples (Hz). Returns null if too sparse.
  function metricsFromPitches(pitches) {
    if (!pitches || pitches.length < MIN_VOICED_FRAMES) return null;
    var med = median(pitches);
    if (!(med > 0)) return null;
    var sts = pitches.map(function (f) { return 12 * Math.log(f / med) / Math.LN2; });
    var mean = sts.reduce(function (a, b) { return a + b; }, 0) / sts.length;
    var variance = sts.reduce(function (a, b) { return a + (b - mean) * (b - mean); }, 0) / sts.length;
    var sd = Math.sqrt(variance);
    var sortedSt = sts.slice().sort(function (a, b) { return a - b; });
    var rangeSt = percentile(sortedSt, 0.9) - percentile(sortedSt, 0.1);
    var label = sd < FLAT_ST ? 'flat' : sd > EXPRESSIVE_ST ? 'expressive' : 'natural';
    return {
      voiced_frames: pitches.length,
      median_hz: Math.round(med),
      variation_st: Math.round(sd * 10) / 10,
      range_st: Math.round(rangeSt * 10) / 10,
      label: label
    };
  }

  function start(stream) {
    stop();
    lastPitches = [];
    var track = stream && stream.getAudioTracks ? stream.getAudioTracks()[0] : null;
    if (!track) return;
    try {
      var AudioCtx = global.AudioContext || global.webkitAudioContext;
      if (!AudioCtx) return;
      var ctx = new AudioCtx();
      if (ctx.state === 'suspended') ctx.resume().catch(function () {});
      var analyser = ctx.createAnalyser();
      analyser.fftSize = 2048;
      var source = ctx.createMediaStreamSource(new MediaStream([track]));
      source.connect(analyser);
      var buf = new Float32Array(analyser.fftSize);
      var pitches = [];
      var timer = setInterval(function () {
        try {
          if (ctx.state === 'suspended') return;
          analyser.getFloatTimeDomainData(buf);
          var f0 = detectPitch(buf, ctx.sampleRate);
          if (f0) pitches.push(f0);
        } catch (e) {}
      }, SAMPLE_MS);
      state = { ctx: ctx, analyser: analyser, source: source, timer: timer, pitches: pitches };
    } catch (e) { state = null; }
  }

  function stop() {
    if (!state) return;
    clearInterval(state.timer);
    lastPitches = state.pitches.slice();
    try { state.source.disconnect(); } catch (e) {}
    try { state.ctx.close(); } catch (e) {}
    state = null;
  }

  function getMetrics() {
    var pitches = (state && state.pitches.length) ? state.pitches : lastPitches;
    return metricsFromPitches(pitches);
  }

  function reset() { stop(); lastPitches = []; }

  global.MMIIntonation = {
    start: start,
    stop: stop,
    getMetrics: getMetrics,
    reset: reset,
    detectPitch: detectPitch,
    metricsFromPitches: metricsFromPitches
  };
})(typeof window !== 'undefined' ? window : this);
