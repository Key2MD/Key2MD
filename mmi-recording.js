/**
 * mmi-recording.js — Key2MD MMI Phase 1
 * Recording state machine: timer phases, prompt reveal timestamps, upload
 * Include after auth.js and before practice.html inline scripts
 */

const MMIRecording = (() => {

  // ── State ──────────────────────────────────────────────────────
  let state = 'idle'; // idle | reading | recording | uploading | done | error
  let config = null;
  let recorder = null;
  let chunks = [];
  let recordingBlob = null;
  let promptRevealTimestamps = [];  // [{prompt_index, revealed_at_recording_seconds}]
  let recordingStartedAt = null;
  let recordingDurationSec = 0;
  let readingTimerInterval = null;
  let recordingTimerInterval = null;
  let promptsRevealed = 0;
  let onFeedbackCallback = null;
  let onStateChangeCallback = null;
  let onErrorCallback = null;

  // ── Public API ─────────────────────────────────────────────────

  function init({ onFeedback, onStateChange, onError }) {
    onFeedbackCallback   = onFeedback   || (() => {});
    onStateChangeCallback = onStateChange || (() => {});
    onErrorCallback      = onError      || (() => {});
  }

  function start(cfg) {
    if (state !== 'idle') return;
    config = cfg;
    // {
    //   station: {id, category, scenario},
    //   prompts: ['...', '...'],
    //   preset: 'standard',
    //   readingTime: 120,
    //   recordingTime: 300,
    //   revealMode: 'all_at_once' | 'sequential',
    //   specialistMode: false,
    //   useCredit: false,
    //   webcamStream: MediaStream,
    // }
    chunks = [];
    recordingBlob = null;
    promptRevealTimestamps = [];
    promptsRevealed = 0;
    recordingStartedAt = null;
    recordingDurationSec = 0;

    setState('reading');
    startReadingPhase();
  }

  function revealNextPrompt() {
    if (state !== 'recording') return;
    if (promptsRevealed >= config.prompts.length) return;

    const elapsed = (Date.now() - recordingStartedAt) / 1000;
    promptRevealTimestamps.push({
      prompt_index: promptsRevealed,
      revealed_at_recording_seconds: elapsed,
    });
    promptsRevealed++;
    onStateChangeCallback({ type: 'prompt_revealed', index: promptsRevealed - 1, prompt: config.prompts[promptsRevealed - 1], remaining: config.prompts.length - promptsRevealed });
  }

  function stopEarly() {
    if (state === 'recording') {
      clearInterval(recordingTimerInterval);
      finishRecording();
    }
  }

  function reset() {
    clearInterval(readingTimerInterval);
    clearInterval(recordingTimerInterval);
    if (recorder && recorder.state === 'recording') {
      recorder.stop();
    }
    chunks = [];
    recordingBlob = null;
    state = 'idle';
    config = null;
    recorder = null;
    promptRevealTimestamps = [];
    promptsRevealed = 0;
    recordingStartedAt = null;
  }

  function getState() { return state; }
  function getBlob()  { return recordingBlob; }

  // ── Reading phase ──────────────────────────────────────────────

  function startReadingPhase() {
    const readingTime = config.readingTime;

    // For all_at_once: reveal all prompts immediately
    // For sequential: reveal prompt 0 immediately, rest on button press
    if (config.revealMode === 'all_at_once') {
      onStateChangeCallback({ type: 'reading_start', prompts: config.prompts, revealMode: 'all_at_once', totalSeconds: readingTime });
    } else {
      // sequential: reveal prompt 0 now, timestamp it at second 0
      promptRevealTimestamps.push({ prompt_index: 0, revealed_at_recording_seconds: 0 });
      promptsRevealed = 1;
      onStateChangeCallback({ type: 'reading_start', prompts: config.prompts, revealMode: 'sequential', revealedCount: 1, totalSeconds: readingTime });
    }

    if (readingTime === 0) {
      // No reading time — go straight to recording
      startRecordingPhase();
      return;
    }

    let secondsLeft = readingTime;
    onStateChangeCallback({ type: 'reading_tick', secondsLeft });

    readingTimerInterval = setInterval(() => {
      secondsLeft--;
      onStateChangeCallback({ type: 'reading_tick', secondsLeft });
      if (secondsLeft <= 0) {
        clearInterval(readingTimerInterval);
        startRecordingPhase();
      }
    }, 1000);
  }

  // ── Recording phase ────────────────────────────────────────────

  function startRecordingPhase() {
    if (!config.webcamStream) {
      setState('error');
      onErrorCallback({ code: 'no_stream', message: 'No camera/microphone stream available. Please enable camera access.' });
      return;
    }

    setState('recording');
    recordingStartedAt = Date.now();
    chunks = [];

    // For sequential mode, if reading phase revealed prompt 0 at time 0,
    // update the timestamp to 0 (it was already set at 0 above — correct)

    const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
      ? 'audio/webm;codecs=opus'
      : MediaRecorder.isTypeSupported('audio/webm')
        ? 'audio/webm'
        : '';

    try {
      recorder = new MediaRecorder(config.webcamStream, mimeType ? { mimeType } : {});
    } catch (e) {
      setState('error');
      onErrorCallback({ code: 'recorder_init_failed', message: 'Could not start recorder. ' + e.message });
      return;
    }

    recorder.ondataavailable = e => { if (e.data && e.data.size > 0) chunks.push(e.data); };
    recorder.onstop = () => {
      recordingDurationSec = (Date.now() - recordingStartedAt) / 1000;
      recordingBlob = new Blob(chunks, { type: recorder.mimeType || 'audio/webm' });
      onStateChangeCallback({ type: 'recording_stopped', durationSec: recordingDurationSec, blob: recordingBlob });
      upload();
    };

    recorder.start(1000); // collect chunks every second

    const maxTime = Math.min(config.recordingTime, 600); // hard cap 10 min
    let secondsLeft = maxTime;
    onStateChangeCallback({ type: 'recording_tick', secondsLeft, totalSeconds: maxTime });

    recordingTimerInterval = setInterval(() => {
      secondsLeft--;
      onStateChangeCallback({ type: 'recording_tick', secondsLeft, totalSeconds: maxTime });
      if (secondsLeft <= 0) {
        clearInterval(recordingTimerInterval);
        finishRecording();
      }
    }, 1000);
  }

  function finishRecording() {
    if (recorder && recorder.state === 'recording') {
      recorder.stop();
    }
  }

  // ── Upload ─────────────────────────────────────────────────────

  async function upload() {
    setState('uploading');
    onStateChangeCallback({ type: 'upload_start' });

    if (!recordingBlob || recordingBlob.size === 0) {
      setState('error');
      onErrorCallback({ code: 'empty_blob', message: 'Recording is empty. Please try again.' });
      return;
    }

    const audioFile = new File([recordingBlob], 'recording.webm', { type: recordingBlob.type || 'audio/webm' });

    const fd = new FormData();
    fd.append('audio',                       audioFile);
    fd.append('station_id',                  config.station.id || 'unknown');
    fd.append('station_category',            config.station.category || '');
    fd.append('station_scenario',            config.station.scenario || '');
    fd.append('prompts',                     JSON.stringify(config.prompts));
    fd.append('prompt_reveal_timestamps',    JSON.stringify(promptRevealTimestamps));
    fd.append('timing_preset',               config.preset || 'standard');
    fd.append('reveal_mode',                 config.revealMode || 'all_at_once');
    fd.append('recording_duration_seconds',  String(Math.round(recordingDurationSec)));
    fd.append('tier',                        'transcript'); // Phase 1 only
    fd.append('specialist_mode',             config.specialistMode ? '1' : '0');
    fd.append('use_credit',                  config.useCredit ? '1' : '0');

    const token = Key2MDAuth.getToken();

    try {
      const res = await fetch(Key2MDAuth.getApiBase() + '/api/mmi-review', {
        method: 'POST',
        headers: token ? { 'Authorization': `Bearer ${token}` } : {},
        body: fd,
      });

      if (res.status === 401) {
        setState('error');
        Key2MDAuth.showAuthModal('signup');
        onErrorCallback({ code: 'auth_required', message: 'Please sign in to use AI feedback.' });
        return;
      }

      if (res.status === 402) {
        const data = await res.json().catch(() => ({}));
        setState('error');
        onErrorCallback({ code: data.error || 'payment_required', message: data.message || 'Credits required for this review.' });
        return;
      }

      if (res.status === 429) {
        const data = await res.json().catch(() => ({}));
        setState('error');
        onErrorCallback({ code: 'daily_limit_reached', message: data.message || 'Daily limit reached. Come back tomorrow or buy credits.' });
        return;
      }

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setState('error');
        onErrorCallback({ code: data.error || 'server_error', message: data.message || 'Something went wrong. Please try again.' });
        return;
      }

      const data = await res.json();
      setState('done');
      onFeedbackCallback(data);

    } catch (err) {
      setState('error');
      onErrorCallback({ code: 'network_error', message: 'Network error. Please check your connection and try again.' });
    }
  }

  // ── Helpers ────────────────────────────────────────────────────

  function setState(newState) {
    state = newState;
    onStateChangeCallback({ type: 'state_change', state: newState });
  }

  // ── Public ─────────────────────────────────────────────────────

  return { init, start, revealNextPrompt, stopEarly, reset, getState, getBlob };

})();
