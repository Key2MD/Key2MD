// Station-mode runtime for the GAMSAT S1 and S3 tools. Mirrors the real exam: a stimulus carries
// several questions, you navigate freely, cross out options, jot working, flag, and submit per station.
// Shares MCQEngine.util for scoring and escaping. UCAT stays on mcq-app.js; this file does not touch it.

(function () {
  "use strict";
  var U = (window.MCQEngine && window.MCQEngine.util) || {};
  var esc = U.escapeHtml || function (s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); };
  var isCorrect = U.isCorrect || function (q, v) { return v === q.answer; };
  var shuffle = U.shuffle || function (a) { return a.slice(); };

  function $(id) { return document.getElementById(id); }
  function show(id) { var el = $(id); if (el) el.style.display = ""; }
  function hide(id) { var el = $(id); if (el) el.style.display = "none"; }
  function setText(id, t) { var el = $(id); if (el) el.textContent = t; }
  function fmt(s) { s = Math.max(0, Math.round(s)); var m = Math.floor(s / 60), r = s % 60; return m + ":" + (r < 10 ? "0" : "") + r; }
  function cap(s) { s = String(s || ""); return s.charAt(0).toUpperCase() + s.slice(1); }

  function init(cfg) {
    var categoryField = cfg.categoryField, subtypeField = cfg.subtypeField;
    var perQ = cfg.perQuestionSeconds || 100;
    var noun = cfg.stationNoun || "station";
    var letters = "ABCDEFGH";

    var S = { stations: [], idx: 0, ans: {}, submitted: {}, startMs: 0, raceOn: true, timer: null };

    function getBank() { return cfg.getBank() || []; }
    function ansFor(qid) {
      if (!S.ans[qid]) S.ans[qid] = { selected: null, struck: {}, comment: "", flagged: false, noteOpen: false };
      return S.ans[qid];
    }

    function pickRow(wrapId, items, field, allLabel) {
      var wrap = $(wrapId);
      if (!wrap || !items) return;
      var counts = {};
      getBank().forEach(function (q) { counts[q[field]] = (counts[q[field]] || 0) + 1; });
      var html = '<button class="mcq-pick active" data-key="">' + esc(allLabel) + ' <span>' + getBank().length + '</span></button>';
      items.forEach(function (it) {
        html += '<button class="mcq-pick" data-key="' + esc(it.key) + '">' + esc(it.label) + ' <span>' + (counts[it.key] || 0) + '</span></button>';
      });
      wrap.innerHTML = html;
      wrap.querySelectorAll(".mcq-pick").forEach(function (b) {
        b.addEventListener("click", function () {
          wrap.querySelectorAll(".mcq-pick").forEach(function (x) { x.classList.remove("active"); });
          b.classList.add("active");
        });
      });
    }
    function activeKey(wrapId) {
      var b = document.querySelector("#" + wrapId + " .mcq-pick.active");
      return b ? b.getAttribute("data-key") : "";
    }

    function buildSetup() {
      setText("mcqCatPrompt", cfg.categoryPrompt);
      pickRow("mcqCats", cfg.categories, categoryField, cfg.allCategoryLabel || "All");
      if (cfg.subtypes) pickRow("mcqSubs", cfg.subtypes, subtypeField, cfg.allSubtypeLabel || "All");
      if (cfg.difficulties && $("mcqDiff")) pickRow("mcqDiff", cfg.difficulties, "difficulty", cfg.allDifficultyLabel || "Mixed");
      injectControls();
    }

    function injectControls() {
      if ($("mcqsRaceToggle") || !$("mcqSetup")) return;
      var startRow = $("mcqStart") ? $("mcqStart").closest(".row") : null;
      var row = document.createElement("div");
      row.className = "row mcqs-setup-row";
      row.innerHTML =
        '<label class="mcqs-switch"><input type="checkbox" id="mcqsRaceToggle" checked><span class="mcqs-slider"></span><span class="mcqs-switch-lbl">Race timer</span></label>' +
        '<span class="mcqs-setup-note">Each ' + noun + ' is a stimulus with its questions. Cross out options, jot working, flag anything to revisit, then submit the ' + noun + '. The timer runs green when you beat the ' + Math.round(perQ) + 's-per-question pace, amber around it, red behind. Turn it off any time.</span>';
      if (startRow && startRow.parentNode) startRow.parentNode.insertBefore(row, startRow);
      else $("mcqSetup").appendChild(row);
    }

    function buildStations(bank, filter) {
      var order = [], map = {};
      bank.forEach(function (q) {
        if (filter.category && q[categoryField] !== filter.category) return;
        if (filter.subtype && q[subtypeField] !== filter.subtype) return;
        if (filter.difficulty && q.difficulty !== filter.difficulty) return;
        var key = q.stimulusId || ("solo-" + q.id);
        if (!map[key]) { map[key] = { key: key, category: q[categoryField], subtype: q[subtypeField], stimulus: q.stimulus, questions: [] }; order.push(key); }
        map[key].questions.push(q);
      });
      return order.map(function (k) { return map[k]; });
    }

    function start() {
      var bank = getBank();
      if (!bank.length) { alert("No questions available yet."); return; }
      var filter = {};
      var c = activeKey("mcqCats"); if (c) filter.category = c;
      var s = cfg.subtypes ? activeKey("mcqSubs") : ""; if (s) filter.subtype = s;
      var d = $("mcqDiff") ? activeKey("mcqDiff") : ""; if (d) filter.difficulty = d;
      var stations = buildStations(bank, filter);
      if (!stations.length) { alert("No " + noun + "s match that filter yet."); return; }
      stations = shuffle(stations);
      var n = parseInt($("mcqCount") ? $("mcqCount").value : "0", 10) || 0;
      if (n > 0 && n < stations.length) stations = stations.slice(0, n);
      S.stations = stations; S.idx = 0; S.ans = {}; S.submitted = {};
      S.raceOn = $("mcqsRaceToggle") ? !!$("mcqsRaceToggle").checked : true;
      S.startMs = Date.now();
      hide("mcqSetup"); hide("mcqReview"); show("mcqPractice");
      buildShell(); startTimer(); renderStation();
    }

    function buildShell() {
      var host = $("mcqPractice");
      host.innerHTML =
        '<div class="mcqs-top">' +
          '<div class="mcqs-progress" id="mcqsProgress"></div>' +
          '<div class="mcqs-clock"><button type="button" class="mcqs-pace" id="mcqsPace"></button><span class="mcqs-time" id="mcqsTime">0:00</span></div>' +
        '</div>' +
        '<div class="mcqs-strip" id="mcqsStrip"></div>' +
        '<div class="mcqs-station" id="mcqsStation"></div>' +
        '<div class="mcqs-nav">' +
          '<button class="btn btn-ghost" id="mcqsPrev">Back</button>' +
          '<button class="btn btn-ghost" id="mcqsFinish">Finish &amp; see results</button>' +
          '<button class="btn btn-primary" id="mcqsNext">Next ' + esc(noun) + '</button>' +
        '</div>';
      $("mcqsPrev").addEventListener("click", function () { gotoStation(S.idx - 1); });
      $("mcqsNext").addEventListener("click", function () { gotoStation(S.idx + 1); });
      $("mcqsFinish").addEventListener("click", finish);
      $("mcqsPace").addEventListener("click", function () { S.raceOn = !S.raceOn; updatePace(); });
    }

    function stimulusHtml(st) {
      if (!st) return "";
      var capn = st.caption || st.attribution || "";
      var body = st.kind === "image"
        ? '<img class="mcq-stimulus-img" alt="" src="' + esc(st.content) + '">'
        : '<div class="mcq-stimulus-text">' + esc(st.content) + '</div>';
      return '<div class="mcq-stimulus">' + body + (capn ? '<div class="mcq-stimulus-cap">' + esc(capn) + '</div>' : '') + '</div>';
    }
    function addedInfoHtml(text) {
      return '<div class="mcqs-added"><span class="mcqs-added-tag">Additional information</span><div class="mcq-stimulus-text">' + esc(text) + '</div></div>';
    }
    function verdictPill(q, a) {
      if (a.selected === null || a.selected === undefined) return '<span class="mcqs-pill blank">Not answered</span>';
      return isCorrect(q, a.selected) ? '<span class="mcqs-pill ok">Correct</span>' : '<span class="mcqs-pill no">Not quite</span>';
    }

    function questionHtml(q, qi, revealed) {
      var a = ansFor(q.id), opts = q.options || [];
      var optHtml = opts.map(function (opt, i) {
        var cls = "mcqs-opt";
        if (a.struck[i]) cls += " struck";
        if (a.selected === i) cls += " selected";
        if (revealed) { if (i === q.answer) cls += " correct"; else if (a.selected === i) cls += " wrong"; }
        return '<div class="' + cls + '" data-q="' + esc(q.id) + '" data-i="' + i + '">' +
          '<span class="mcqs-key">' + letters.charAt(i) + '</span>' +
          '<span class="mcqs-opt-text">' + esc(opt) + '</span>' +
          (revealed ? '' : '<button type="button" class="mcqs-strike" data-q="' + esc(q.id) + '" data-i="' + i + '" title="Cross out" aria-label="Cross out ' + letters.charAt(i) + '">&times;</button>') +
          '</div>';
      }).join("");
      var head = '<div class="mcqs-qhead"><span class="mcqs-qnum">Q' + (qi + 1) + '</span>' +
        (revealed ? verdictPill(q, a) : '<button type="button" class="mcqs-flag' + (a.flagged ? " on" : "") + '" data-q="' + esc(q.id) + '">' + (a.flagged ? "Flagged" : "Flag") + '</button>') +
        '</div>';
      var note = '<div class="mcqs-note-wrap">' +
        '<button type="button" class="mcqs-note-toggle" data-q="' + esc(q.id) + '">' + (a.comment ? "Note saved" : "+ Note") + '</button>' +
        '<textarea class="mcqs-note-area" data-q="' + esc(q.id) + '" placeholder="Your working or thoughts (not marked)" style="display:' + (a.noteOpen || a.comment ? "block" : "none") + '">' + esc(a.comment) + '</textarea>' +
        '</div>';
      var ex = revealed && q.explanation ? '<div class="mcqs-ex">' + esc(q.explanation) + '</div>' : '';
      return '<div class="mcqs-q' + (a.flagged ? " flagged" : "") + '" id="q_' + esc(q.id) + '">' + head + '<div class="mcqs-stem">' + esc(q.stem) + '</div><div class="mcqs-opts">' + optHtml + '</div>' + note + ex + '</div>';
    }

    function stationScore(st) {
      var c = 0;
      st.questions.forEach(function (q) { var a = S.ans[q.id]; if (a && a.selected != null && isCorrect(q, a.selected)) c++; });
      return { correct: c, total: st.questions.length };
    }
    function stationHasFlag(st) {
      return st.questions.some(function (q) { var a = S.ans[q.id]; return a && a.flagged; });
    }

    function renderStation() {
      var st = S.stations[S.idx], sub = !!S.submitted[st.key];
      setText("mcqsProgress", cap(noun) + " " + (S.idx + 1) + " of " + S.stations.length + "  -  " + st.questions.length + " question" + (st.questions.length === 1 ? "" : "s"));
      renderStrip();
      var html = '<span class="qtag">' + esc(cfg.categoryLabel(st.category)) + '</span>' + stimulusHtml(st.stimulus);
      st.questions.forEach(function (q, qi) {
        if (q.addedInfo) html += addedInfoHtml(q.addedInfo);
        html += questionHtml(q, qi, sub);
      });
      if (sub) {
        var sc = stationScore(st);
        html += '<div class="mcqs-stscore">' + cap(noun) + " score: " + sc.correct + " / " + sc.total + '</div>';
      } else {
        html += '<div class="mcqs-submit-wrap"><button type="button" class="btn btn-primary" id="mcqsSubmit">Submit ' + esc(noun) + '</button>' +
          '<span class="mcqs-submit-note">Marks this ' + noun + ' and shows the answers. You can submit with some left blank.</span></div>';
      }
      $("mcqsStation").innerHTML = html;
      wireStation(st, sub);
      updateNav(); updatePace();
    }

    function wireStation(st, revealed) {
      var body = $("mcqsStation");
      if (!revealed) {
        body.querySelectorAll(".mcqs-opt").forEach(function (el) {
          el.addEventListener("click", function (e) {
            if (e.target && e.target.classList.contains("mcqs-strike")) return;
            selectOption(el.getAttribute("data-q"), parseInt(el.getAttribute("data-i"), 10));
          });
        });
        body.querySelectorAll(".mcqs-strike").forEach(function (b) {
          b.addEventListener("click", function (e) { e.stopPropagation(); toggleStrike(b.getAttribute("data-q"), parseInt(b.getAttribute("data-i"), 10)); });
        });
        body.querySelectorAll(".mcqs-flag").forEach(function (b) {
          b.addEventListener("click", function () { toggleFlag(b.getAttribute("data-q")); });
        });
        var sb = $("mcqsSubmit");
        if (sb) sb.addEventListener("click", function () { S.submitted[st.key] = true; renderStation(); });
      }
      body.querySelectorAll(".mcqs-note-toggle").forEach(function (b) {
        b.addEventListener("click", function () {
          var qid = b.getAttribute("data-q"), a = ansFor(qid);
          var ta = body.querySelector('.mcqs-note-area[data-q="' + qid + '"]');
          if (!ta) return;
          a.noteOpen = ta.style.display === "none";
          ta.style.display = a.noteOpen ? "block" : "none";
          if (a.noteOpen) ta.focus();
        });
      });
      body.querySelectorAll(".mcqs-note-area").forEach(function (ta) {
        ta.addEventListener("input", function () { var a = ansFor(ta.getAttribute("data-q")); a.comment = ta.value; a.noteOpen = true; });
      });
    }

    function selectOption(qid, i) {
      var a = ansFor(qid); a.selected = i; a.struck[i] = false;
      var qEl = $("q_" + qid); if (!qEl) return;
      qEl.querySelectorAll(".mcqs-opt").forEach(function (el) {
        var oi = parseInt(el.getAttribute("data-i"), 10);
        el.classList.toggle("selected", oi === i);
        if (oi === i) el.classList.remove("struck");
      });
    }
    function toggleStrike(qid, i) {
      var a = ansFor(qid); a.struck[i] = !a.struck[i];
      if (a.struck[i] && a.selected === i) a.selected = null;
      var qEl = $("q_" + qid); if (!qEl) return;
      var el = qEl.querySelector('.mcqs-opt[data-i="' + i + '"]');
      if (el) { el.classList.toggle("struck", !!a.struck[i]); if (a.struck[i]) el.classList.remove("selected"); }
    }
    function toggleFlag(qid) {
      var a = ansFor(qid); a.flagged = !a.flagged;
      var qEl = $("q_" + qid);
      if (qEl) {
        qEl.classList.toggle("flagged", a.flagged);
        var b = qEl.querySelector(".mcqs-flag");
        if (b) { b.classList.toggle("on", a.flagged); b.textContent = a.flagged ? "Flagged" : "Flag"; }
      }
      renderStrip();
    }

    function renderStrip() {
      var strip = $("mcqsStrip"); if (!strip) return;
      strip.innerHTML = S.stations.map(function (st, i) {
        var cls = "mcqs-chip";
        if (i === S.idx) cls += " cur";
        if (S.submitted[st.key]) cls += " done";
        if (stationHasFlag(st)) cls += " flag";
        return '<button type="button" class="' + cls + '" data-i="' + i + '">' + (i + 1) + '</button>';
      }).join("");
      strip.querySelectorAll(".mcqs-chip").forEach(function (b) {
        b.addEventListener("click", function () { gotoStation(parseInt(b.getAttribute("data-i"), 10)); });
      });
    }

    function updateNav() {
      var prev = $("mcqsPrev"), next = $("mcqsNext");
      if (prev) prev.disabled = S.idx === 0;
      if (next) {
        var last = S.idx >= S.stations.length - 1;
        next.disabled = last;
        next.style.visibility = last ? "hidden" : "visible";
      }
    }

    function updatePace() {
      var pace = $("mcqsPace"); if (!pace) return;
      if (!S.raceOn) { pace.className = "mcqs-pace off"; pace.textContent = "Pace off"; return; }
      var elapsed = (Date.now() - S.startMs) / 1000;
      var before = 0, cur = 0;
      for (var i = 0; i < S.stations.length; i++) {
        var b = S.stations[i].questions.length * perQ;
        if (i < S.idx) before += b;
        if (i === S.idx) cur = b;
      }
      var Bi = before + cur, r = cur > 0 ? (Bi - elapsed) / cur : 1;
      var cls, label;
      if (r > 0.25) { cls = "green"; label = "Ahead of pace"; }
      else if (r >= -0.1) { cls = "amber"; label = "On pace"; }
      else { cls = "red"; label = "Behind pace"; }
      pace.className = "mcqs-pace " + cls;
      pace.textContent = label;
    }

    function gotoStation(n) {
      if (n < 0 || n >= S.stations.length) return;
      S.idx = n; renderStation();
      var host = $("mcqPractice"); if (host && host.scrollIntoView) host.scrollIntoView({ behavior: "smooth", block: "start" });
    }

    function startTimer() {
      stopTimer();
      S.timer = setInterval(function () { setText("mcqsTime", fmt((Date.now() - S.startMs) / 1000)); updatePace(); }, 500);
    }
    function stopTimer() { if (S.timer) { clearInterval(S.timer); S.timer = null; } }

    function pctOf(b) { return b.answered ? Math.round(b.correct / b.answered * 100) : 0; }
    function brkRow(label, b) {
      return '<div class="mcq-brk-row"><span class="mcq-brk-label">' + esc(label) + '</span>' +
        '<span class="mcq-brk-bar"><i style="width:' + pctOf(b) + '%"></i></span>' +
        '<span class="mcq-brk-val">' + b.correct + '/' + b.answered + '</span></div>';
    }
    function bump(bucket, key, ok, has) {
      if (!bucket[key]) bucket[key] = { total: 0, answered: 0, correct: 0 };
      bucket[key].total++;
      if (has) { bucket[key].answered++; if (ok) bucket[key].correct++; }
    }

    function computeResults() {
      var cats = {}, subs = {}, diffs = {}, subCat = {}, perStation = [], correct = 0, answered = 0, total = 0;
      S.stations.forEach(function (st) {
        var sc = 0, sAns = 0;
        st.questions.forEach(function (q) {
          total++;
          var a = S.ans[q.id], sel = a ? a.selected : null, has = sel !== null && sel !== undefined;
          var ok = has && isCorrect(q, sel);
          var sub = q[subtypeField] || "unknown";
          if (!subCat[sub]) subCat[sub] = q[categoryField] || "";
          bump(cats, q[categoryField] || "unknown", ok, has);
          bump(subs, sub, ok, has);
          bump(diffs, q.difficulty || "unknown", ok, has);
          if (has) { answered++; sAns++; if (ok) { correct++; sc++; } }
        });
        perStation.push({ category: st.category, total: st.questions.length, correct: sc, answered: sAns });
      });
      return { total: total, answered: answered, correct: correct, accuracy: answered ? Math.round(correct / answered * 100) : 0,
        byCategory: cats, bySubtype: subs, byDifficulty: diffs, subCat: subCat, perStation: perStation, elapsed: (Date.now() - S.startMs) / 1000 };
    }

    function finish() {
      stopTimer();
      renderReview(computeResults());
      hide("mcqPractice"); show("mcqReview");
      var host = $("mcqReview"); if (host && host.scrollIntoView) host.scrollIntoView({ behavior: "smooth", block: "start" });
    }

    function renderReview(r) {
      setText("mcqScore", r.accuracy + "%");
      setText("mcqScoreSub", r.correct + " of " + r.answered + " answered correct, across " + r.total + " questions");
      var catH = ""; Object.keys(r.byCategory).forEach(function (k) { catH += brkRow(cfg.categoryLabel(k), r.byCategory[k]); });
      if ($("mcqBreakdownCat")) $("mcqBreakdownCat").innerHTML = catH;
      var subH = ""; Object.keys(r.bySubtype).forEach(function (k) { subH += brkRow(cfg.subtypeLabel ? cfg.subtypeLabel(r.subCat[k] || "", k) : k, r.bySubtype[k]); });
      if ($("mcqBreakdownSub")) $("mcqBreakdownSub").innerHTML = subH;
      var per = r.answered ? Math.round(r.elapsed / r.answered) : 0;
      var budget = r.total * perQ, delta = budget - r.elapsed;
      var raceLine = S.raceOn
        ? " Pace budget was " + fmt(budget) + ", so you finished " + fmt(Math.abs(delta)) + (delta >= 0 ? " under." : " over.")
        : "";
      setText("mcqTimeStat", "Total " + fmt(r.elapsed) + ", average " + per + "s per answered question." + raceLine);
      renderPerStation(r.perStation);
    }

    function renderPerStation(list) {
      var review = $("mcqReview"); if (!review) return;
      var box = $("mcqsPerStation");
      if (!box) {
        box = document.createElement("div");
        box.id = "mcqsPerStation";
        var anchor = $("mcqTimeStat");
        if (anchor && anchor.parentNode) anchor.parentNode.insertBefore(box, anchor.nextSibling);
        else review.appendChild(box);
      }
      var rows = list.map(function (p, i) {
        var pct = p.answered ? Math.round(p.correct / p.answered * 100) : 0;
        return '<div class="mcq-brk-row"><span class="mcq-brk-label">' + cap(noun) + " " + (i + 1) + " - " + esc(cfg.categoryLabel(p.category)) + '</span>' +
          '<span class="mcq-brk-bar"><i style="width:' + pct + '%"></i></span>' +
          '<span class="mcq-brk-val">' + p.correct + '/' + p.total + '</span></div>';
      }).join("");
      box.innerHTML = '<p class="brk-title">By ' + noun + '</p>' + rows;
    }

    function backToSetup() { stopTimer(); hide("mcqReview"); hide("mcqPractice"); show("mcqSetup"); }

    function boot() {
      buildSetup();
      if ($("mcqStart")) $("mcqStart").addEventListener("click", start);
      if ($("mcqAgain")) $("mcqAgain").addEventListener("click", backToSetup);
      if ($("mcqBack")) $("mcqBack").addEventListener("click", backToSetup);
    }

    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
    else boot();
  }

  window.MCQStation = { init: init };
})();
