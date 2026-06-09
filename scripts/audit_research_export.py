#!/usr/bin/env python3
"""
Audit anonymised Key2MD research exports.

Input: one directory containing the JSONL files downloaded from the admin
"Research export" button, or one or more JSONL file paths.

Output: a reproducible seminar-analysis bundle:
- research-audit-report.md
- failure-mode-counts.csv
- score-band-summary.csv
- category-summary.csv
- representative-examples.jsonl
- claude-compact-dataset.jsonl
- claude-analysis-prompt.md
"""

from __future__ import annotations

import argparse
import csv
import json
import math
import re
from collections import Counter, defaultdict
from dataclasses import dataclass
from pathlib import Path
from statistics import mean
from typing import Any, Iterable


SCORE_BANDS = [
    ("excellent", 0.80, 1.01),
    ("strong", 0.65, 0.80),
    ("middle", 0.50, 0.65),
    ("weak", 0.00, 0.50),
    ("unscored", None, None),
]


@dataclass(frozen=True)
class FailureMode:
    key: str
    label: str
    definition: str
    patterns: tuple[str, ...]
    teach_fix: str


FAILURE_MODES = [
    FailureMode(
        "generic_framework",
        "Generic framework language",
        "The answer uses stock phrases without making the student's reasoning or tone specific to the scenario.",
        (
            r"\bprivate room\b",
            r"\bnon[- ]?judg(?:e)?mental\b",
            r"\bopen[- ]?ended questions?\b",
            r"\bactive listening\b",
            r"\bvalidate (?:their|his|her) feelings\b",
            r"\bI would speak to (?:them|him|her) (?:privately|one[- ]?on[- ]?one|1:1)\b",
            r"\bwithout (?:being )?confrontational\b",
            r"\bprofessional(?:ly)?\b.*\brespectful(?:ly)?\b",
        ),
        "Teach students to replace the stock phrase with the first actual sentence they would say, plus the specific emotion/risk they are responding to.",
    ),
    FailureMode(
        "action_before_reasoning",
        "Action before reasoning",
        "The answer jumps to what the student would do before explaining what is uncertain, who is affected, or why that action is fair.",
        (
            r"\bjump(?:s|ed)? straight\b",
            r"\baction before\b",
            r"\btoo action[- ]?focused\b",
            r"\bneeds? (?:more|clearer) reasoning\b",
            r"\bexplain (?:your|the) reasoning\b",
            r"\bwhy (?:this|that) (?:is|would be) fair\b",
            r"\bnot just what you would do\b",
            r"\bmake (?:your|the) thinking visible\b",
        ),
        "Use a three-part opening: what is at stake, what is uncertain, and what principle guides the first action.",
    ),
    FailureMode(
        "narrow_empathy",
        "Narrow empathy",
        "The answer notices the obvious person but misses quieter stakeholders, power differences, or the emotional reality of others.",
        (
            r"\bmiss(?:es|ed|ing) (?:the )?(?:other|second|quieter) (?:person|stakeholder|perspective)\b",
            r"\bmultiple perspectives?\b",
            r"\bstakeholders?\b",
            r"\bpower (?:dynamic|imbalance|difference)\b",
            r"\bempathy (?:layer|needs|is thin|could be deeper)\b",
            r"\bconsider how (?:they|he|she) might feel\b",
            r"\bvulnerab(?:le|ility)\b",
            r"\btrust\b.*\b(?:risk|damage|protect)\b",
        ),
        "Train a stakeholder scan: obvious person, quieter person, institution/team, and future trust.",
    ),
    FailureMode(
        "vague_specificity",
        "Vague or non-specific answer",
        "The answer is broadly reasonable but lacks concrete words, details, examples, or scenario-specific commitments.",
        (
            r"\btoo vague\b",
            r"\bgeneric\b",
            r"\bspecific(?:ity|ally)?\b",
            r"\bconcrete\b",
            r"\bwhat (?:exactly|specifically) (?:you would say|would you say)\b",
            r"\bexample\b",
            r"\bdoes not show\b",
            r"\bneeds? (?:a )?clearer\b",
        ),
        "Ask for one exact phrase, one specific fact to clarify, and one concrete next step.",
    ),
    FailureMode(
        "missed_uncertainty",
        "Missed uncertainty",
        "The answer sounds too certain, assumes facts, or fails to name what must be clarified before judging.",
        (
            r"\buncertain(?:ty)?\b",
            r"\bclarify\b",
            r"\bwithout assuming\b",
            r"\bassum(?:e|es|ed|ption)\b",
            r"\bneed(?:s)? to find out\b",
            r"\bbefore (?:making|deciding|judging)\b",
            r"\bavoid jumping to conclusions\b",
            r"\bwhat is unclear\b",
        ),
        "Make uncertainty explicit: 'I would not assume X yet; first I would clarify Y because Z.'",
    ),
    FailureMode(
        "weak_reflection",
        "Reflection without consequence",
        "The student reflects on values or experience but does not show how that reflection would change future behaviour.",
        (
            r"\bself[- ]?awareness\b",
            r"\breflect(?:ion|ive)?\b",
            r"\bwhat you learned\b",
            r"\bhow (?:this|that) changed\b",
            r"\bfuture practice\b",
            r"\bconsequence\b",
            r"\binsight\b.*\baction\b",
            r"\bnot just (?:state|describe)\b",
        ),
        "End reflective answers with a behavioural rule: what you now do differently under pressure.",
    ),
    FailureMode(
        "overclinical_register",
        "Over-clinical register",
        "The answer sounds like a management plan or clinical handover rather than a human response to a dilemma.",
        (
            r"\bclinical\b",
            r"\bmanagement plan\b",
            r"\bhandover\b",
            r"\btoo medical\b",
            r"\bhuman\b.*\b(?:layer|texture|tone)\b",
            r"\bdoctor\b.*\b(?:standard|register|voice)\b",
            r"\bcompassion\b.*\b(?:visible|explicit)\b",
        ),
        "Translate the plan into human language: concern, relationship, trust, and safety before process.",
    ),
    FailureMode(
        "poor_structure",
        "Weak structure or focus",
        "The answer is hard to follow, buries the point, or does not answer the prompt directly.",
        (
            r"\bstructure\b",
            r"\bfocus(?:ed)?\b",
            r"\brambling\b",
            r"\bunclear\b",
            r"\bdirect(?:ly)? answer\b",
            r"\bfirst sentence\b",
            r"\borganis(?:e|ation|ed)\b",
            r"\bsignpost\b",
        ),
        "Use a first-sentence answer, then two reasons, then a humane next step.",
    ),
    FailureMode(
        "gamsat_weak_thesis",
        "Weak thesis or argument",
        "A GAMSAT essay lacks a clear controlling argument or develops ideas as a list rather than a position.",
        (
            r"\bthesis\b",
            r"\bcontention\b",
            r"\bargument\b",
            r"\bline of reasoning\b",
            r"\bposition\b",
            r"\bclaim\b",
        ),
        "Force a debatable thesis: 'Although X, I argue Y because Z.'",
    ),
    FailureMode(
        "gamsat_weak_evidence",
        "Weak evidence development",
        "A GAMSAT essay uses examples thinly, generically, or without explaining how they prove the argument.",
        (
            r"\bevidence\b",
            r"\bexample\b",
            r"\billustrat(?:e|ion)\b",
            r"\bdevelopment\b",
            r"\bsupport(?:ing)?\b",
            r"\bmissing evidence\b",
        ),
        "Use fewer examples and spend more lines explaining the mechanism: how the example proves the claim.",
    ),
    FailureMode(
        "gamsat_style_clarity",
        "Language clarity issue",
        "A GAMSAT essay's expression, sentence control, or style interferes with the force of the argument.",
        (
            r"\blanguage\b",
            r"\bstyle\b",
            r"\bsentence\b",
            r"\bclarity\b",
            r"\bexpression\b",
            r"\boverwrit(?:e|ten|ing)\b",
        ),
        "Prioritise plain argumentative sentences over ornate phrasing.",
    ),
]


def iter_input_files(paths: Iterable[Path]) -> list[Path]:
    files: list[Path] = []
    for path in paths:
        if path.is_dir():
            files.extend(sorted(path.rglob("*.jsonl")))
            files.extend(sorted(path.rglob("*.ndjson")))
        elif path.suffix.lower() in {".jsonl", ".ndjson"}:
            files.append(path)
    seen = set()
    out = []
    for file in files:
        key = file.resolve()
        if key in seen:
            continue
        seen.add(key)
        out.append(file)
    return out


def load_rows(files: Iterable[Path]) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for file in files:
        with file.open("r", encoding="utf-8-sig") as handle:
            for line_no, line in enumerate(handle, 1):
                line = line.strip()
                if not line:
                    continue
                try:
                    row = json.loads(line)
                except json.JSONDecodeError as exc:
                    raise SystemExit(f"Could not parse {file}:{line_no}: {exc}") from exc
                row["_input_file"] = file.name
                rows.append(row)
    return rows


def safe_text(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, str):
        return value
    if isinstance(value, list):
        return " ".join(safe_text(v) for v in value)
    if isinstance(value, dict):
        return " ".join(safe_text(v) for v in value.values())
    return str(value)


def normalised_score(row: dict[str, Any]) -> float | None:
    fb = row.get("feedback") or {}
    score = fb.get("score")
    max_score = fb.get("score_max")
    try:
        score_f = float(score)
        max_f = float(max_score) if max_score else 10.0
    except (TypeError, ValueError):
        return None
    if max_f <= 0:
        return None
    return max(0.0, min(1.0, score_f / max_f))


def raw_score(row: dict[str, Any]) -> tuple[float | None, float | None]:
    fb = row.get("feedback") or {}
    try:
        score = float(fb.get("score"))
    except (TypeError, ValueError):
        score = None
    try:
        max_score = float(fb.get("score_max"))
    except (TypeError, ValueError):
        max_score = None
    return score, max_score


def score_band(row: dict[str, Any]) -> str:
    value = normalised_score(row)
    if value is None:
        return "unscored"
    for label, low, high in SCORE_BANDS:
        if low is not None and high is not None and low <= value < high:
            return label
    return "unscored"


def source_label(row: dict[str, Any]) -> str:
    return safe_text(row.get("source") or row.get("tool") or "unknown")


def category_label(row: dict[str, Any]) -> str:
    station = row.get("station") if isinstance(row.get("station"), dict) else {}
    question = row.get("question") if isinstance(row.get("question"), dict) else {}
    return (
        safe_text(station.get("category"))
        or safe_text(question.get("category"))
        or source_label(row)
    ).strip() or "uncategorised"


def response_text(row: dict[str, Any]) -> str:
    response = row.get("response") if isinstance(row.get("response"), dict) else {}
    return safe_text(response.get("text"))


def prompt_text(row: dict[str, Any]) -> str:
    blocks: list[str] = []
    for key in ("question", "station"):
        data = row.get(key) if isinstance(row.get(key), dict) else {}
        blocks.append(safe_text(data.get("scenario")))
        prompts = data.get("prompts") if isinstance(data.get("prompts"), list) else []
        for prompt in prompts:
            blocks.append(safe_text(prompt.get("text") if isinstance(prompt, dict) else prompt))
        blocks.append(safe_text(data.get("context")))
    return "\n".join(x for x in blocks if x)


def feedback_text(row: dict[str, Any]) -> str:
    fb = row.get("feedback") if isinstance(row.get("feedback"), dict) else {}
    fields = [
        "overall_summary",
        "biggest_strength",
        "biggest_improvement",
        "empathy_note",
        "missed_point",
        "excellent_version",
        "polished_auditor_explanation",
        "raw_feedback_text",
    ]
    text = "\n".join(safe_text(fb.get(field)) for field in fields)
    comps = fb.get("competencies") if isinstance(fb.get("competencies"), list) else []
    text += "\n" + "\n".join(
        f"{safe_text(c.get('name'))}: {safe_text(c.get('note'))}" for c in comps if isinstance(c, dict)
    )
    return text


def compact(value: str, limit: int) -> str:
    value = re.sub(r"\s+", " ", value or "").strip()
    if len(value) <= limit:
        return value
    return value[: limit - 1].rstrip() + "..."


def classify_row(row: dict[str, Any]) -> list[str]:
    haystack = "\n".join([feedback_text(row), response_text(row), prompt_text(row)]).lower()
    tool = safe_text(row.get("tool")).lower()
    labels = []
    for mode in FAILURE_MODES:
        if mode.key.startswith("gamsat_") and tool != "gamsat":
            continue
        if tool == "gamsat" and mode.key in {"overclinical_register"}:
            continue
        if any(re.search(pattern, haystack, re.I) for pattern in mode.patterns):
            labels.append(mode.key)
    if not labels and score_band(row) == "weak":
        labels.append("low_score_unspecified")
    return labels[:4]


def source_score_key(row: dict[str, Any]) -> tuple[str, str]:
    return (source_label(row), score_band(row))


def write_csv(path: Path, rows: list[dict[str, Any]], fieldnames: list[str]) -> None:
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)


def pct(n: int, d: int) -> str:
    return f"{(n / d * 100):.1f}%" if d else "0.0%"


def avg(values: Iterable[float | None]) -> float | None:
    clean = [v for v in values if v is not None]
    return mean(clean) if clean else None


def score_display(value: float | None) -> str:
    return "-" if value is None or math.isnan(value) else f"{value:.2f}"


def representative_examples(
    rows: list[dict[str, Any]],
    labels_by_id: dict[str, list[str]],
    max_per_mode: int = 5,
) -> list[dict[str, Any]]:
    by_mode: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in rows:
        record_key = safe_text(row.get("record_key"))
        labels = labels_by_id.get(record_key, [])
        for label in labels:
            by_mode[label].append(row)

    examples: list[dict[str, Any]] = []
    for mode_key, candidates in sorted(by_mode.items()):
        ranked = sorted(
            candidates,
            key=lambda r: (
                normalised_score(r) if normalised_score(r) is not None else 999,
                -len(feedback_text(r)),
            ),
        )
        for row in ranked[:max_per_mode]:
            score, max_score = raw_score(row)
            examples.append(
                {
                    "failure_mode": mode_key,
                    "source": source_label(row),
                    "record_key": row.get("record_key"),
                    "student_key": row.get("student_key"),
                    "score": score,
                    "score_max": max_score,
                    "score_band": score_band(row),
                    "category": category_label(row),
                    "scenario_excerpt": compact(prompt_text(row), 800),
                    "response_excerpt": compact(response_text(row), 1000),
                    "feedback_excerpt": compact(feedback_text(row), 1200),
                }
            )
    return examples


def write_jsonl(path: Path, rows: list[dict[str, Any]]) -> None:
    with path.open("w", encoding="utf-8") as handle:
        for row in rows:
            handle.write(json.dumps(row, ensure_ascii=False) + "\n")


def build_compact_dataset(
    rows: list[dict[str, Any]],
    labels_by_id: dict[str, list[str]],
    max_rows: int = 2500,
) -> list[dict[str, Any]]:
    scored = sorted(
        rows,
        key=lambda r: (
            source_label(r),
            score_band(r),
            normalised_score(r) if normalised_score(r) is not None else 999,
        ),
    )
    if len(scored) > max_rows:
        step = len(scored) / max_rows
        scored = [scored[int(i * step)] for i in range(max_rows)]
    compact_rows = []
    for row in scored:
        fb = row.get("feedback") if isinstance(row.get("feedback"), dict) else {}
        score, max_score = raw_score(row)
        compact_rows.append(
            {
                "source": source_label(row),
                "tool": row.get("tool"),
                "record_key": row.get("record_key"),
                "student_key": row.get("student_key"),
                "month": row.get("created_month"),
                "category": category_label(row),
                "score": score,
                "score_max": max_score,
                "score_band": score_band(row),
                "response_word_count": (row.get("response") or {}).get("word_count") if isinstance(row.get("response"), dict) else None,
                "rule_labels": labels_by_id.get(safe_text(row.get("record_key")), []),
                "biggest_improvement": compact(safe_text(fb.get("biggest_improvement")), 550),
                "missed_point": compact(safe_text(fb.get("missed_point")), 450),
                "empathy_note": compact(safe_text(fb.get("empathy_note")), 450),
                "scenario_excerpt": compact(prompt_text(row), 450),
                "response_excerpt": compact(response_text(row), 550),
            }
        )
    return compact_rows


def build_report(
    rows: list[dict[str, Any]],
    failure_counts: list[dict[str, Any]],
    score_summary: list[dict[str, Any]],
    category_summary: list[dict[str, Any]],
    examples: list[dict[str, Any]],
) -> str:
    total = len(rows)
    scored = [normalised_score(row) for row in rows if normalised_score(row) is not None]
    sources = Counter(source_label(row) for row in rows)
    bands = Counter(score_band(row) for row in rows)

    top_modes = failure_counts[:12]
    weakest_categories = sorted(
        [r for r in category_summary if r.get("avg_norm_score") not in {"", "-"}],
        key=lambda r: float(r["avg_norm_score"]),
    )[:12]

    lines = [
        "# Key2MD AI Review Audit",
        "",
        "## Executive Snapshot",
        "",
        f"- Rows analysed: **{total:,}**",
        f"- Scored rows: **{len(scored):,}**",
        f"- Average normalised score: **{score_display(avg(scored))}**",
        f"- Estimated input tokens in raw export: **~{sum(len(json.dumps(r, ensure_ascii=False)) for r in rows) // 4:,}**",
        "",
        "## Source Mix",
        "",
        "| Source | Rows | Share |",
        "|---|---:|---:|",
    ]
    for source, count in sources.most_common():
        lines.append(f"| {source} | {count:,} | {pct(count, total)} |")

    lines.extend(["", "## Score Bands", "", "| Band | Rows | Share |", "|---|---:|---:|"])
    for band, count in bands.most_common():
        lines.append(f"| {band} | {count:,} | {pct(count, total)} |")

    lines.extend(["", "## Highest-Yield Failure Modes", ""])
    if top_modes:
        lines.extend(["| Failure mode | Rows | Share | Avg score | Teaching fix |", "|---|---:|---:|---:|---|"])
        mode_lookup = {m.key: m for m in FAILURE_MODES}
        for row in top_modes:
            mode = mode_lookup.get(row["failure_mode"])
            fix = mode.teach_fix if mode else ""
            lines.append(
                f"| {row['label']} | {int(row['rows']):,} | {row['share']} | {row['avg_norm_score']} | {fix} |"
            )
    else:
        lines.append("No rule-based failure modes were detected. Check whether the export contains feedback fields.")

    lines.extend(["", "## Weakest Categories", ""])
    if weakest_categories:
        lines.extend(["| Category | Source | Rows | Avg score | Common modes |", "|---|---|---:|---:|---|"])
        for row in weakest_categories:
            lines.append(
                f"| {row['category']} | {row['source']} | {row['rows']} | {row['avg_norm_score']} | {row['top_failure_modes']} |"
            )

    lines.extend(["", "## Representative Examples To Inspect", ""])
    for example in examples[:20]:
        lines.extend(
            [
                f"### {example['failure_mode']} | {example['source']} | {example['score']}/{example['score_max']}",
                "",
                f"**Category:** {example['category']}",
                "",
                f"**Scenario:** {example['scenario_excerpt']}",
                "",
                f"**Response excerpt:** {example['response_excerpt']}",
                "",
                f"**Feedback excerpt:** {example['feedback_excerpt']}",
                "",
            ]
        )

    lines.extend(
        [
            "## Seminar Framing",
            "",
            "Use the CSV tables for defensible counts, then manually inspect the representative examples before quoting or paraphrasing them.",
            "A strong seminar structure is: pitfall, why smart students do it, what it sounds like, why it loses marks, and one drill that fixes it.",
            "",
        ]
    )
    return "\n".join(lines)


def build_claude_prompt() -> str:
    return """# Claude Second-Opinion Prompt

You are reviewing a de-identified, compacted audit of Key2MD medical admissions practice responses. The first-pass labels were generated by deterministic rules, so treat them as useful but imperfect.

Tasks:
1. Identify the 8-12 most teachable recurring pitfalls.
2. Merge overlapping labels where they are really the same educational problem.
3. For each pitfall, give:
   - concise name
   - what it sounds like in a student answer
   - why capable students fall into it
   - why it loses marks
   - one concrete exercise to fix it
   - one short slide title
4. Challenge the audit: what might be over-counted, under-counted, or confounded by the AI feedback style itself?
5. Propose a seminar arc for a 45-60 minute session.

Use `claude-compact-dataset.jsonl`, `failure-mode-counts.csv`, `score-band-summary.csv`, `category-summary.csv`, and `representative-examples.jsonl`. Do not claim a theme is common unless the count tables support it.
"""


def main() -> None:
    parser = argparse.ArgumentParser(description="Audit Key2MD anonymised research export JSONL files.")
    parser.add_argument("inputs", nargs="+", type=Path, help="JSONL files or directories containing JSONL files.")
    parser.add_argument("--out", type=Path, default=Path("reports/research-audit"), help="Output directory.")
    parser.add_argument("--compact-rows", type=int, default=2500, help="Rows to keep in Claude compact dataset.")
    args = parser.parse_args()

    files = iter_input_files(args.inputs)
    if not files:
        raise SystemExit("No .jsonl/.ndjson files found. Download the admin Research export first.")

    rows = load_rows(files)
    if not rows:
        raise SystemExit("Input files were found but contained no JSONL rows.")

    args.out.mkdir(parents=True, exist_ok=True)

    labels_by_id: dict[str, list[str]] = {}
    for row in rows:
        labels_by_id[safe_text(row.get("record_key"))] = classify_row(row)

    mode_lookup = {m.key: m for m in FAILURE_MODES}
    mode_counts: Counter[str] = Counter()
    scores_by_mode: dict[str, list[float | None]] = defaultdict(list)
    source_by_mode: dict[str, Counter[str]] = defaultdict(Counter)
    for row in rows:
        labels = labels_by_id.get(safe_text(row.get("record_key")), [])
        for label in labels:
            mode_counts[label] += 1
            scores_by_mode[label].append(normalised_score(row))
            source_by_mode[label][source_label(row)] += 1

    failure_rows = []
    for key, count in mode_counts.most_common():
        mode = mode_lookup.get(key)
        failure_rows.append(
            {
                "failure_mode": key,
                "label": mode.label if mode else key.replace("_", " ").title(),
                "rows": count,
                "share": pct(count, len(rows)),
                "avg_norm_score": score_display(avg(scores_by_mode[key])),
                "top_sources": "; ".join(f"{k}:{v}" for k, v in source_by_mode[key].most_common(4)),
                "definition": mode.definition if mode else "",
                "teach_fix": mode.teach_fix if mode else "",
            }
        )

    score_counts: dict[tuple[str, str], list[float | None]] = defaultdict(list)
    for row in rows:
        score_counts[source_score_key(row)].append(normalised_score(row))
    score_rows = [
        {
            "source": source,
            "score_band": band,
            "rows": len(values),
            "share_within_export": pct(len(values), len(rows)),
            "avg_norm_score": score_display(avg(values)),
        }
        for (source, band), values in sorted(score_counts.items())
    ]

    category_map: dict[tuple[str, str], list[dict[str, Any]]] = defaultdict(list)
    for row in rows:
        category_map[(source_label(row), category_label(row))].append(row)
    category_rows = []
    for (source, category), grouped in sorted(category_map.items(), key=lambda item: (-len(item[1]), item[0])):
        labels = Counter(label for row in grouped for label in labels_by_id.get(safe_text(row.get("record_key")), []))
        category_rows.append(
            {
                "source": source,
                "category": category,
                "rows": len(grouped),
                "avg_norm_score": score_display(avg(normalised_score(row) for row in grouped)),
                "weak_share": pct(sum(1 for row in grouped if score_band(row) == "weak"), len(grouped)),
                "top_failure_modes": "; ".join(f"{k}:{v}" for k, v in labels.most_common(5)),
            }
        )

    examples = representative_examples(rows, labels_by_id)
    compact_rows = build_compact_dataset(rows, labels_by_id, args.compact_rows)

    write_csv(
        args.out / "failure-mode-counts.csv",
        failure_rows,
        ["failure_mode", "label", "rows", "share", "avg_norm_score", "top_sources", "definition", "teach_fix"],
    )
    write_csv(
        args.out / "score-band-summary.csv",
        score_rows,
        ["source", "score_band", "rows", "share_within_export", "avg_norm_score"],
    )
    write_csv(
        args.out / "category-summary.csv",
        category_rows,
        ["source", "category", "rows", "avg_norm_score", "weak_share", "top_failure_modes"],
    )
    write_jsonl(args.out / "representative-examples.jsonl", examples)
    write_jsonl(args.out / "claude-compact-dataset.jsonl", compact_rows)
    (args.out / "claude-analysis-prompt.md").write_text(build_claude_prompt(), encoding="utf-8")
    (args.out / "research-audit-report.md").write_text(
        build_report(rows, failure_rows, score_rows, category_rows, examples),
        encoding="utf-8",
    )

    print(f"Analysed {len(rows):,} rows from {len(files)} file(s).")
    print(f"Outputs written to {args.out}")
    print(f"Compact Claude dataset rows: {len(compact_rows):,}")


if __name__ == "__main__":
    main()
