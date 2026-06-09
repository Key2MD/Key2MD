# Key2MD Research Audit Workflow

1. Open the admin dashboard.
2. Go to CASPer Reviews.
3. Click **Research export**.
4. Keep the downloaded summary and dictionary for reference, but the audit needs the `.jsonl` data files:

   - `key2md-casper_reviews-...page-001.jsonl`
   - `key2md-gamsat_s2_reviews-...page-001.jsonl`
   - `key2md-mmi_spoken_reviews-...page-001.jsonl`
   - `key2md-casper_mock_stations-...page-001.jsonl`
   - plus any later page files if the export splits them

5. Put the downloaded `.jsonl` files into a folder, for example:

   `reports/research-audit/input`

6. Run:

   ```powershell
   & 'C:\Users\Dan\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe' scripts\audit_research_export.py reports\research-audit\input --out reports\research-audit\output
   ```

The auditor writes:

- `research-audit-report.md`
- `failure-mode-counts.csv`
- `score-band-summary.csv`
- `category-summary.csv`
- `representative-examples.jsonl`
- `claude-compact-dataset.jsonl`
- `claude-analysis-prompt.md`

Use the compact dataset plus the count tables for a Claude second opinion. Use the full research export only when you need to manually inspect source examples.
