# Verification Record - 2026-11-14 (final session, supersedes the record below)

Run ID `GHOST-final-20261114-115902`; artifacts in `D:\ghost\GHOST-final-20261114-115902`
(copy under `artifacts/` of the published repository). Approximately 8 GB RAM machine,
~0.75 GB free at start; suites ran sequentially. No user application was stopped.

| Check | Command / configuration | Result | Live or mocked |
| --- | --- | --- | --- |
| Streaming geology parity | `python scripts/verify_geology_memory.py --compare-reference` | Exact distance and wording-rule parity for all 409 targets; peak working set 63 MiB streamed vs 238 MiB reference | Real 151,932,240-byte SIM 3464 cache |
| Production build | `npm run build`, `VITE_API_BASE_URL=http://127.0.0.1:8001` | Passed, 54.5 s; existing Cesium chunk-size warning | - |
| Frontend units | `npm test` | 39 passed, 0 failed, 0 skipped | Local |
| Backend, every module in its own process | loop in previous record, `OPENROUTER_API_KEY`/`MODEL` blank | 248 passed, 0 failed, 0 skipped across 15 modules (after fixing the mock-only CLI test below) | `test_api_live` uses the real dataset/model |
| **Full integrated Mars browser workflow** | `GHOST_LIVE=1 PLAYWRIGHT_PREVIEW=1 PLAYWRIGHT_PORT=5184 npx playwright test tests/live.spec.ts --grep "Mars analysis"` | **1 passed, 1.3 min**: real targets, `/api/analyze` 200, `/api/plan-route` 200 found (50 points, 25,932.6 m), guided playback, live PDS search 200, no page errors | Live, no interception |
| Synthetic -> research -> PDS browser flow | same settings, `--grep "synthetic observations"` | 1 passed, 1.1 min; PDS returned 3 datasets / 24 metadata-only comparisons; OpenRouter returned `unavailable/provider_error` inside the browser flow and the rover kept running | Live |
| Controlled OpenRouter request | `python scripts/verify_research_live.py --allow-one-request` with the browser's recorded request | `available`, HTTP 200, model `openai/gpt-4o-mini`, 1 attempt, 3,668 prompt + 104 completion tokens, provider-reported cost USD 0.0006126; schema and citation-ID checks passed; 0 hypotheses returned (only missing-information and follow-ups) | Live, paid |

Total OpenRouter traffic this session: two completion requests (one in the browser flow, one
controlled). The browser-flow failure reason is not exposed by design (no raw provider errors are
returned); its cause was not diagnosed to avoid further paid calls. The key was held only in the
backend's gitignored `.env`; it should now be revoked.

Fix: `backend/tests/test_research_cli.py` replaced `httpx.AsyncClient` with a lambda, which breaks
the OpenAI SDK's `isinstance` check, so the three mocked request cases failed before any request.
It now uses a subclass. No product code changed for this.

Model evaluation plots (`model-evaluation/*.svg`) come from `scripts/export_evaluation_plots.py`
over the retained per-sample scores of `three-ghosts-iforest-0005`; it reconstructs the held-out
test split and refuses to plot unless the recomputed AUROC equals the recorded value (0.9373).
Labels are planted anomalies in real CTX tiles, not natural Mars anomalies.

Still not validated: RGB image-based perception; quantitative archive-measurement comparison;
vehicle physics; backend-persistent synthetic missions (checkpoints are browser-local
`localStorage` v2 only); scientific quality of LLM output beyond schema/citation membership.

# Earlier Verification Record - 2026-11-14

This is the latest record; it supersedes earlier counts in historical progress
sections. Heavy suites ran sequentially on an approximately 8 GB Windows
machine. No unrelated application/service was terminated; no datasets,
weights or source history were deleted.

## Final Passing Checks

| Check | Exact command / configuration | Result |
| --- | --- | --- |
| Frontend units | `npm test` | 39 passed, 0 failed, 17.80 s |
| TypeScript | `npm run typecheck` | Passed |
| Final production build | `npm run build`, `VITE_API_BASE_URL=http://127.0.0.1:8001` | Passed, 39.59 s; existing Cesium chunk warning |
| Backend, every module | PowerShell loop below, from `ml_ghost/backend` | 230 passed, 0 failed, 0 skipped across 13 modules |
| Production offline/fixture browser suite | `npm run test:e2e -- --max-failures=1`; `PLAYWRIGHT_PREVIEW=1`, `PLAYWRIGHT_PORT=5184` | 7 passed, 2 intentionally skipped live tests, 1.3 min |
| Real synthetic -> research/PDS browser flow | `npm run test:e2e -- tests/live.spec.ts --grep "synthetic observations" --max-failures=1`; same preview settings plus `GHOST_LIVE=1` | 1 passed, 21.7 s; no intercepted responses, backend 8001 |
| Actual HTTP elevation/route | Python urllib requests against restarted backend 8001 | MOLA 134x147, -2907..-787 m, 0.410 s; route 200/found, 27 points, 16207.845 m, 0.021 s |
| Actual HTTP analysis without browser | `POST /api/analyze`, `{"top_k":1,"strategy":"ghost","include_heatmaps":false}` | 200, 1 selected, 28.782 s |

The final build includes the startup reliability fix that loads optional Google
Fonts only after DOM readiness. Its TypeScript compilation and final browser
suite passed. No cosmetic redesign was made.

Backend command, retaining test failures as nonzero exit codes:

```powershell
foreach ($f in (Get-ChildItem tests/test_*.py | Sort-Object Name)) {
    python -m pytest $f.FullName -q
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}
```

All 13 collected test modules are `test_*.py` directly under `backend/tests`:

| Module | Passed | Seconds |
| --- | ---: | ---: |
| test_api | 11 | 28.12 |
| test_api_live | 12 | 38.45 |
| test_astar | 7 | 0.31 |
| test_contract | 18 | 15.04 |
| test_coords | 16 | 0.25 |
| test_dem_cache | 24 | 2.02 |
| test_detectors | 7 | 10.28 |
| test_discovery | 18 | 1.53 |
| test_frontend_adapter | 8 | 46.74 |
| test_geology | 17 | 0.35 |
| test_research | 75 | 4.48 |
| test_scoring | 12 | 0.28 |
| test_synthetic | 5 | 0.30 |

One existing Starlette/httpx deprecation warning appears in API modules.
Module isolation releases cross-module ML/geology allocations; it does not
skip tests or mock the dataset. The actual-data API module passed, not skipped.
Its retained NASA products may come from cache; this does not prove every
upstream archive was freshly contacted.

## Covered Behaviors

- Original terrain parity against checkpoint, fixed independent model training,
  held-out confusion matrix and depth-bias counterexample; no mission truth in
  controller packets; RGB is not a classifier feature.
- Multiple seeds (`alpha`, `beta`, `gamma`), all four generated morphology
  classes, observation-driven counterfactual target changes, survey -> safe
  route -> focused capture -> analysis -> next investigation.
- Unknown/hazard rejection, diagonal corner-cut rejection, unreachable targets,
  unsafe deployment sites, energy exhaustion, incremental travel distance,
  empty/malformed/throwing sensors, duplicate IDs and numeric overflow.
- Interrupted missions, deterministic v2 checkpoint continuation, invalid/old
  checkpoint rejection, immutable/shared evidence and archive export.
- Dataset/model missing, offline, stale-refresh clearing, failed routes, PDS
  empty/upstream failures, research provider timeout/schema/citation failures
  and no-key fallback without stopping autonomous investigation.
- Final live research check sent actual synthetic observations, retrieved real
  PDS metadata, returned metadata-only comparisons and unavailable model
  interpretation, then verified the rover remained running.

## Failed Attempts And Remaining Validation Gaps

1. After the MOLA fix, `python -m pytest tests -x -q` stopped at 115 passed
   with `MemoryError` while gzip-compressing `/api/mission`. Every module
   subsequently passed in its own process (230 total).
2. Reusing port 5174 did not start a fresh frontend because an existing process
   already owned it. The browser stalled before DOM readiness, and a later
   worker reported JavaScript allocation failure. No assertion pass is claimed.
   Final runs used an isolated production-preview server on 5184.
3. Final live Mars browser run, `GHOST_LIVE=1 PLAYWRIGHT_PREVIEW=1
   PLAYWRIGHT_PORT=5184 npm run test:e2e -- tests/live.spec.ts
   --max-failures=1`, failed waiting for analysis: backend logs show
   `MemoryError` reading the real 151,932,240-byte geology cache.
4. Prewarming backend analysis succeeded, but another combined browser attempt
   stalled at page startup/connection binding. Therefore prewarming is NOT a
   validated workaround, and the combined final Mars browser check is NOT green.
5. The genuine synthetic/research/PDS browser test passed separately against a
   freshly restarted backend. The cache fix passed actual HTTP elevation/route
   requests separately. These narrower results do NOT replace the failed
   combined Mars browser acceptance check.
6. No live OpenRouter model call, provider-model selection or scientific-quality
   validation occurred. Test processes explicitly used blank provider key/model
   to avoid paid side effects. Mocked success/failure contract tests passed.

No anomaly is reported as a discovery/probability. Model predictions,
synthetic sensor measurements, real NASA products and simulated costs retain
separate provenance. PDS context is metadata only, not a quantitative
cross-world measurement comparison. Synthetic accuracy is not Mars validation.
