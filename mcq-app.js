// Config-driven page logic shared by the UCAT and GAMSAT S1 tools. WIP in outputs/mcq-build.
// A page calls MCQApp.init(cfg) with its taxonomy, field names, labels and bank accessor.
// The shared markup uses mcq* element ids regardless of which tool is mounted.

(function () {
  "use strict";
  var E = window.MCQEngine;

  function $(id) { return document.getElementById(id); }
  function show(id) { var el = $(id); if (el) el.style.display = ""; }
  function hide(id) { var el = $(id); if (el) el.style.display = "none"; }
  function setText(id, t) { var el = $(id); if (el) el.textContent = (t == null ? "" : t); }
  function fmt(s) { var m = Math.floor(s / 60), r = s % 60; return m + ":" + (r < 10 ? "0" : "") + r; }

  function init(cfg) {
    var session = null, selectedValue = null, revealed = false, totalTimer = null, startMs = 0;
    var categoryField = cfg.categoryField, subtypeField = cfg.subtypeField;
    var scales = cfg.scales || {};

    function getBank() { return cfg.getBank() || []; }

    function pickRow(wrapId, items, field, allLabel) {
      var wrap = $(wrapId);
      if (!wrap) return;
      var counts = {};
      getBank().forEach(function (q) { counts[q[field]] = (counts[q[field]] || 0) + 1; });
      var html = '<button class="mcq-pick active" data-key="">' + allLabel + ' <span>' + getBank().length + '</span></button>';
      items.forEach(function (it) {
        html += '<button class="mcq-pick" data-key="' + it.key + '">' + it.label + ' <span>' + (counts[it.key] || 0) + '</span></button>';
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
      setText("mcqSubPrompt", cfg.subtypePrompt);
      setText("mcqCatHeading", cfg.categoryHeading);
      setText("mcqSubHeading", cfg.subtypeHeading);
      pickRow("mcqCats", cfg.categories, categoryField, cfg.allCategoryLabel || "All");
      if (cfg.subtypes) pickRow("mcqSubs", cfg.subtypes, subtypeField, cfg.allSubtypeLabel || "All");
      if (cfg.difficulties && $("mcqDiff")) pickRow("mcqDiff", cfg.difficulties, "difficulty", cfg.allDifficultyLabel || "Mixed");
    }

    function startPractice() {
      var bank = getBank();
      if (!bank.length) { alert("No questions available yet."); return; }
      session = E.createSession({
        questions: bank, taxonomy: cfg.taxonomy, scales: scales,
        categoryField: categoryField, subtypeField: subtypeField
      });
      var filter = {};
      var c = activeKey("mcqCats"); if (c) filter.category = c;
      var s = cfg.subtypes ? activeKey("mcqSubs") : ""; if (s) filter.subtype = s;
      var d = $("mcqDiff") ? activeKey("mcqDiff") : ""; if (d) filter.difficulty = d;
      var count = parseInt($("mcqCount").value, 10) || 0;
      if (!session.build({ filter: filter, limit: count, shuffle: true })) {
        alert("No questions match that filter yet."); return;
      }
      hide("mcqSetup"); hide("mcqReview"); show("mcqPractice");
      startMs = Date.now(); startTimer(); renderCurrent();
    }

    function startTimer() {
      stopTimer();
      totalTimer = setInterval(function () {
        setText("mcqTotalTime", fmt(Math.floor((Date.now() - startMs) / 1000)));
      }, 500);
    }
    function stopTimer() { if (totalTimer) { clearInterval(totalTimer); totalTimer = null; } }

    function renderCurrent() {
      selectedValue = null; revealed = false;
      var q = session.current();
      setText("mcqProgress", "Question " + (session.index() + 1) + " of " + session.size());
      $("mcqTag").textContent = cfg.categoryLabel(q[categoryField]) + " / " + cfg.subtypeLabel(q[categoryField], q[subtypeField]);
      $("mcqQ").innerHTML = E.Renderer.questionHtml(q, scales);
      $("mcqExplain").innerHTML = ""; hide("mcqExplain");
      var btn = $("mcqAction"); btn.textContent = "Submit"; btn.disabled = true;
      var opts = $("mcqQ").querySelectorAll(".mcq-option");
      opts.forEach(function (o) {
        o.addEventListener("click", function () {
          if (revealed) return;
          opts.forEach(function (x) { x.classList.remove("selected"); });
          o.classList.add("selected");
          selectedValue = parseInt(o.getAttribute("data-value"), 10);
          btn.disabled = false;
        });
      });
    }

    function reveal() {
      var q = session.current();
      var rec = session.submit(selectedValue);
      revealed = true;
      $("mcqQ").querySelectorAll(".mcq-option").forEach(function (o) {
        var v = parseInt(o.getAttribute("data-value"), 10);
        if (v === q.answer) o.classList.add("correct");
        else if (v === selectedValue) o.classList.add("wrong");
      });
      $("mcqExplain").innerHTML = '<div class="mcq-verdict ' + (rec.correct ? "ok" : "no") + '">' +
        (rec.correct ? "Correct" : "Not quite") + '</div>' +
        (q.explanation ? '<div class="mcq-ex-text">' + E.util.escapeHtml(q.explanation) + '</div>' : '');
      show("mcqExplain");
      var btn = $("mcqAction");
      btn.textContent = (session.index() + 1 < session.size()) ? "Next" : "See results";
      btn.disabled = false;
    }

    function onAction() {
      if (!revealed) { if (selectedValue === null) return; reveal(); return; }
      if (!session.next()) { finish(); return; }
      renderCurrent();
    }

    function finish() { stopTimer(); renderReview(session.finish()); hide("mcqPractice"); show("mcqReview"); }

    function pctOf(b) { return b.answered ? Math.round((b.correct / b.answered) * 100) : 0; }
    function brkRow(label, b) {
      return '<div class="mcq-brk-row"><span class="mcq-brk-label">' + E.util.escapeHtml(label) + '</span>' +
        '<span class="mcq-brk-bar"><i style="width:' + pctOf(b) + '%"></i></span>' +
        '<span class="mcq-brk-val">' + b.correct + '/' + b.answered + '</span></div>';
    }

    function renderReview(r) {
      setText("mcqScore", r.accuracy + "%");
      setText("mcqScoreSub", r.correct + " of " + r.answered + " correct");
      var cat = "";
      Object.keys(r.byCategory).forEach(function (k) { cat += brkRow(cfg.categoryLabel(k), r.byCategory[k]); });
      var catEl = $("mcqBreakdownCat"); if (catEl) catEl.innerHTML = cat;
      var sub = "";
      Object.keys(r.bySubtype).forEach(function (k) {
        var item = r.items.filter(function (it) { return it.subtype === k; })[0];
        sub += brkRow(cfg.subtypeLabel(item ? item.category : "", k), r.bySubtype[k]);
      });
      var subEl = $("mcqBreakdownSub"); if (subEl) subEl.innerHTML = sub;
      var s = Math.floor(r.totalMs / 1000), per = r.answered ? Math.round((r.totalMs / r.answered) / 1000) : 0;
      setText("mcqTimeStat", "Total " + fmt(s) + ", average " + per + "s per question");
    }

    function bindKeys() {
      document.addEventListener("keydown", function (e) {
        var practice = $("mcqPractice");
        if (!practice || practice.style.display === "none") return;
        var tag = e.target && e.target.tagName;
        if (tag === "TEXTAREA" || tag === "INPUT" || tag === "SELECT") return;
        if (e.key === "Enter") {
          var btn = $("mcqAction"); if (btn && !btn.disabled) { e.preventDefault(); btn.click(); }
          return;
        }
        if (revealed) return;
        var idx = -1;
        if (/^[1-9]$/.test(e.key)) idx = parseInt(e.key, 10) - 1;
        else if (/^[a-hA-H]$/.test(e.key)) idx = e.key.toUpperCase().charCodeAt(0) - 65;
        if (idx < 0) return;
        var qEl = $("mcqQ");
        var opts = qEl ? qEl.querySelectorAll(".mcq-option") : [];
        if (idx < opts.length) { e.preventDefault(); opts[idx].click(); }
      });
    }

    function boot() {
      buildSetup();
      var start = $("mcqStart"); if (start) start.addEventListener("click", startPractice);
      var action = $("mcqAction"); if (action) action.addEventListener("click", onAction);
      var again = $("mcqAgain"); if (again) again.addEventListener("click", function () { hide("mcqReview"); show("mcqSetup"); });
      var back = $("mcqBack"); if (back) back.addEventListener("click", function () { stopTimer(); hide("mcqPractice"); show("mcqSetup"); });
      bindKeys();
    }

    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
    else boot();
  }

  window.MCQApp = { init: init };
})();
