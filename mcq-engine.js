// Shared MCQ engine for the UCAT and GAMSAT S1 tools. WIP in outputs/mcq-build; moves to repo root with the pages.
// Field-agnostic: UCAT uses categoryField "subtest" / subtypeField "type"; GAMSAT S1 uses "genre" / "skill".
// Pure state + scoring + analytics, plus an optional default renderer. No questions live here.

(function (global) {
  "use strict";

  function shuffle(arr) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  function escapeHtml(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function arraysEqual(a, b) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    for (var i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
    return true;
  }

  function isCorrect(question, value) {
    if (question == null || value == null) return false;
    if (question.format === "drag_rank") return arraysEqual(value, question.answer);
    return value === question.answer;
  }

  function normaliseFilter(filter) {
    filter = filter || {};
    return {
      category: filter.category || null,
      subtype: filter.subtype || null,
      difficulty: filter.difficulty || null
    };
  }

  function createSession(config) {
    config = config || {};
    var categoryField = config.categoryField || "subtest";
    var subtypeField = config.subtypeField || "type";
    var allQuestions = Array.isArray(config.questions) ? config.questions : [];
    var taxonomy = config.taxonomy || {};
    var scales = config.scales || {};

    var state = {
      pool: [],
      index: 0,
      answers: {},
      startedAt: 0,
      questionStartedAt: 0,
      finished: false
    };

    function applyFilter(filter) {
      var f = normaliseFilter(filter);
      return allQuestions.filter(function (q) {
        if (q.aiImagePending) return false;
        if (f.category && q[categoryField] !== f.category) return false;
        if (f.subtype && q[subtypeField] !== f.subtype) return false;
        if (f.difficulty && q.difficulty !== f.difficulty) return false;
        return true;
      });
    }

    function build(opts) {
      opts = opts || {};
      var list = applyFilter(opts.filter);
      if (opts.shuffle !== false) list = shuffle(list);
      if (opts.limit && opts.limit > 0) list = list.slice(0, opts.limit);
      state.pool = list;
      state.index = 0;
      state.answers = {};
      state.finished = false;
      state.startedAt = Date.now();
      state.questionStartedAt = state.startedAt;
      return state.pool.length;
    }

    function current() {
      return state.pool[state.index] || null;
    }

    function submit(value) {
      var q = current();
      if (!q) return null;
      var rec = { value: value, correct: isCorrect(q, value), ms: Date.now() - state.questionStartedAt };
      state.answers[q.id] = rec;
      return rec;
    }

    function answerFor(q) {
      return q ? state.answers[q.id] || null : null;
    }

    function move(delta) {
      var n = state.index + delta;
      if (n < 0 || n >= state.pool.length) return false;
      state.index = n;
      state.questionStartedAt = Date.now();
      return true;
    }

    function results() {
      var cats = {}, subs = {}, diffs = {};
      var correct = 0, answered = 0, totalMs = 0;
      var items = [];
      state.pool.forEach(function (q) {
        var rec = state.answers[q.id];
        var cat = q[categoryField] || "unknown";
        var sub = q[subtypeField] || "unknown";
        var dif = q.difficulty || "unknown";
        function bump(bucket, key) {
          if (!bucket[key]) bucket[key] = { total: 0, answered: 0, correct: 0 };
          bucket[key].total++;
          if (rec) {
            bucket[key].answered++;
            if (rec.correct) bucket[key].correct++;
          }
        }
        bump(cats, cat);
        bump(subs, sub);
        bump(diffs, dif);
        if (rec) {
          answered++;
          totalMs += rec.ms || 0;
          if (rec.correct) correct++;
        }
        items.push({
          id: q.id, category: cat, subtype: sub, difficulty: dif,
          answered: !!rec, correct: rec ? rec.correct : null, ms: rec ? rec.ms : null
        });
      });
      return {
        total: state.pool.length,
        answered: answered,
        correct: correct,
        accuracy: answered ? Math.round((correct / answered) * 100) : 0,
        totalMs: totalMs,
        byCategory: cats,
        bySubtype: subs,
        byDifficulty: diffs,
        items: items
      };
    }

    function finish() {
      state.finished = true;
      return results();
    }

    return {
      build: build,
      current: current,
      submit: submit,
      answerFor: answerFor,
      next: function () { return move(1); },
      prev: function () { return move(-1); },
      goto: function (i) {
        if (i < 0 || i >= state.pool.length) return false;
        state.index = i;
        state.questionStartedAt = Date.now();
        return true;
      },
      index: function () { return state.index; },
      size: function () { return state.pool.length; },
      pool: function () { return state.pool.slice(); },
      results: results,
      finish: finish,
      taxonomy: taxonomy,
      scales: scales,
      categoryField: categoryField,
      subtypeField: subtypeField
    };
  }

  var Renderer = {
    optionList: function (q, scales) {
      if (q.format === "rating_appropriate" || q.format === "rating_important") {
        return (scales && scales[q.format]) || [];
      }
      return q.options || [];
    },
    stimulusHtml: function (q) {
      if (!q || !q.stimulus) return "";
      var st = q.stimulus;
      var cap = st.caption || st.attribution || "";
      var body;
      if (st.kind === "image") {
        body = '<img class="mcq-stimulus-img" alt="' + escapeHtml(st.alt || st.caption || "") + '" src="' + escapeHtml(st.content) + '">';
      } else if (st.kind === "svg" || st.kind === "table" || st.kind === "html") {
        body = '<div class="mcq-stimulus-fig"' + (st.alt ? ' role="img" aria-label="' + escapeHtml(st.alt) + '"' : '') + '>' + st.content + '</div>';
      } else {
        body = '<div class="mcq-stimulus-text">' + escapeHtml(st.content) + '</div>';
      }
      return '<div class="mcq-stimulus">' + body +
        (cap ? '<div class="mcq-stimulus-cap">' + escapeHtml(cap) + '</div>' : '') + '</div>';
    },
    questionHtml: function (q, scales) {
      if (q.format === "drag_rank") {
        return '<div class="mcq-question">' + Renderer.stimulusHtml(q) +
          '<div class="mcq-stem">' + escapeHtml(q.stem) + '</div>' +
          '<div class="mcq-empty">This drag-to-rank question type is not supported in this view yet.</div></div>';
      }
      var opts = Renderer.optionList(q, scales);
      var letters = "ABCDEFGH";
      var optionHtml = opts.map(function (opt, i) {
        return '<label class="mcq-option" data-value="' + i + '">' +
          '<span class="mcq-option-key">' + letters.charAt(i) + '</span>' +
          '<span class="mcq-option-text">' + escapeHtml(opt) + '</span></label>';
      }).join("");
      return '<div class="mcq-question">' +
        Renderer.stimulusHtml(q) +
        '<div class="mcq-stem">' + escapeHtml(q.stem) + '</div>' +
        '<div class="mcq-options">' + optionHtml + '</div></div>';
    },
    emptyHtml: function (msg) {
      return '<div class="mcq-empty">' + escapeHtml(msg || "No questions available yet.") + '</div>';
    }
  };

  global.MCQEngine = {
    version: "0.1",
    createSession: createSession,
    Renderer: Renderer,
    util: { shuffle: shuffle, escapeHtml: escapeHtml, isCorrect: isCorrect }
  };

})(typeof window !== "undefined" ? window : this);
