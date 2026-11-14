# GHOST IN THE DATA — frontend progress

## Product-gap closure: observation-driven autonomy, 2026-11-14

### Verification continuation checkpoint

Final continuation results: **230 backend tests passed across every one of 13 modules in separate sequential Python processes**, **39 frontend unit tests passed**, TypeScript and final production build passed. Final production browser suite: **7 passed, 2 intentionally skipped live tests**. Separate genuine synthetic/research/PDS browser scenario: **1 passed (21.7 s)**. Restarted backend HTTP elevation/route verified 134x147 retained MOLA, -2907..-787 m; found route 200 in 0.021 s. Actual HTTP analysis without browser returned 200 in 28.782 s. Optional Google Fonts now load after DOM readiness, so unavailable typography cannot block mission startup.

**The final combined Mars browser acceptance test is not green.** Backend logged MemoryError reading the real 152 MB geology JSON while WebGL was open; prewarming analysis passed alone but did not resolve a subsequent browser-startup stall. This is an unresolved constrained-machine integration/resource limitation, not a successful end-to-end Mars check. See `VALIDATION.md` for exact commands, all module counts and failed attempts, and `README.md` for current launch/demo instructions and capability boundaries. Historical working/live results below are not claims about the final combined run.

Intermediate investigation: live Mars first stalled on a nonessential Google Fonts load, then timed out requesting a route. The retained MOLA cache's pixel-snapped edges were incorrectly compared to unsnapped request bounds. Cache validation now checks measured source identity/value parity; targeted cache/routing/API checks passed (56 passed, 2 deselected; separate 2 real-data checks passed). A fresh-process cached route returned 200 in 0.0351 s. Attribution of the entire original timeout to this cache defect is not proven; final live rerun results are stated above.

Before the cache fix, the full backend suite passed 206 tests. Afterwards, a monolithic run stopped at 115 passed with MemoryError in gzip serialization of /api/mission; every module subsequently passed separately. Other user applications remain untouched. Latest source changes are uncommitted on top of preserved e77e3f9/01521da checkpoints. No datasets/weights were deleted. OpenRouter has not had a live model call; demo verification deliberately uses blank OpenRouter key/model to avoid paid requests.

This section supersedes the older synthetic-survey limitations below; historical records are retained.

### Preservation and focused changes

The previously verified work is checkpointed in frontend commit `e77e3f9` and backend commit `01521da`, with `checkpoint/verified-product-baseline-20261114` branches. Frontend commit uses a command-local GHOST Engineering identity because none was configured; no global Git settings or remote history changed. No datasets, weights, Mars endpoints, PDS discovery, datum conversions, renderer dependencies, or security policies were replaced. Original procedural terrain functions and full height arrays are regression-compared with the checkpoint, including original signed noise and Unicode hashing. No cosmetic redesign was undertaken.

### Perception and autonomy architecture

- `synthetic-world.ts` owns terrain, idealized orthographic RGB/depth generation, fixed training-world labels and evaluation-only labels. Active mission labels, slope and hazard truth never cross into controller packets. The sensor takes a private geometry copy; the viewer receives a separate renderable mesh.
- `perception.ts` trains a genuine standardized supervised 5-nearest-neighbor morphology classifier from 1,875 examples across three fixed training seeds. The active mission cannot use a training seed. Features are center height, gradient and local curvature/residual descriptors extracted from depth pixels. RGB is retained/rendered evidence but is deliberately not a classifier feature. No DINOv2 validation on synthetic ground imagery is claimed.
- `InvestigationController` receives only a sensor interface, the frozen learned model, and public grid/mobility configuration. It never receives the mission seed, world height array or generated labels. It estimates local morphology, uncalibrated distance-ratio uncertainty, novelty distance and conservative depth-gradient traversability.
- The actual loop is Discover (capture/infer/map), Understand (rank novelty/uncertainty/class-diversity/frontier candidates), Investigate (known-safe graph route, fresh route-footprint checks, incremental execution, focused capture, repeat analysis, memory update), then another cycle. Counterfactual tests change learned sensor features at identical decision ticks and verify different selected targets.
- Unknown/hazard cells and diagonal corner cuts are excluded. The old hazardous fallback is removed. Route admission includes motion, discrete action, focused-capture and analysis energy while preserving five illustrative energy units. Blocked, sensor-fault, exhausted and complete are separate terminal outcomes. Invalid/duplicate captures and numeric overflow fail closed. A reachable route is not a validated flight-safety certificate.
- Full capture IDs, observations, target decisions, executed actions, failures and investigation evidence are retained in the event/archive state. Repeat captures use the same static depth under different RGB lighting, so `repeatAgreement` means **repeat consistency only**, never independent geological corroboration or a discovery.
- Static repeated pixel buffers are immutable/shared internally; inference still runs for each fresh packet. Snapshot cloning preserves buffer sharing and isolates internal memory. At alpha tick 65, 1,253 captures use 95 distinct depth/RGB buffer pairs (about 13.2 times fewer pixel elements). JSON export expands arrays and is about 3.76 MB at that point; long runs/replay remain expensive. No history is silently truncated.
- The nominal 145 m range limits patch centers, not every pixel. Default 9x9 patches at 10 m/pixel add a 56.57 m corner radius: maximum sampled-distance bound 201.57 m, explicitly recorded in packet/snapshot metadata and UI.
- V2 checkpoints include model/replay version `synthetic-morphology-knn-v2-original-world-2`, full configuration and seed/tick. The browser uses a separate `ghost.synthetic.checkpoint.v2` key; legacy v1 is preserved but rejected rather than silently replayed with changed controller semantics. Restoration reproduces continued decisions, not merely the displayed rover position.

### Evaluation: synthetic domain only

Two independent holdout seeds, 1,250 samples, original terrain generator:

| Actual / predicted | Plain | Ridge | Crater | Valley |
|---|---:|---:|---:|---:|
| Plain | 672 | 10 | 2 | 7 |
| Ridge | 11 | 319 | 0 | 2 |
| Crater | 2 | 6 | 29 | 24 |
| Valley | 9 | 6 | 14 | 137 |

Accuracy 92.56%; majority baseline 55.28%; balanced accuracy 80.85%. Crater recall is only 47.54% (29/61), so crater/valley confusion remains substantial. A +500 m depth calibration bias drops accuracy to 26.56%. Dim RGB yields identical predictions because features use depth, **not because learned visual robustness was demonstrated**. These worlds share a procedural family; none of these metrics establishes real Mars, material/composition classification, dust/occlusion robustness, independent geological interpretation or validated safety.

### Optional research integration and scientific-integrity audit

`ResearchPanel` snapshots up to eight actual inference summaries, IDs, local coordinates, method/version, provenance and measurement-versus-model feature labels. `POST /api/research/interpret` is advisory-only, has no tool/movement interface, and is never called by the autonomy controller. Backend OpenRouter credentials/model stay server-side. Provider output is strict-schema validated, unverified hypotheses only, with citation membership checked against submitted observations and retrieved PDS IDs. Frontend also rejects invented citations or changed echoed measurements. ID membership does not prove scientific entailment.

Explicitly requesting PDS context performs a bounded target-LID-filtered registry search even without an LLM key. Returned deterministic comparisons preserve instrument/investigation/processing metadata and explicitly state that resolution, geometry/illumination, spectra/composition and CRS/units were not supplied by the adapter. They are **metadata_context_only**, `measured_properties_compared: false`; no similarity score or shared-origin conclusion is produced. Missing keys, provider outage/timeouts/schema failures or invalid citations yield unavailable with no hypotheses and do not stop rover operation. No live OpenRouter model has been validated or selected; this remains a provider-integration validation gap.

Audit distinctions:
- Real NASA imagery/elevation remain in the existing Mars workflow with source provenance; reference ellipsoid and generated local geometry are not measured Mars terrain.
- Synthetic camera pixels/heights are labeled synthetic observations; morphology/novelty/uncertainty/traversability are predictions or estimates; energy is illustrative simulation.
- Anomaly score is an unbounded standardized feature distance, never a probability, importance score or life detector.
- PDS discovery is registry metadata, not downloaded or processed comparable scientific measurements.
- Assistant statements are unverified hypotheses with supporting/against IDs and missing-information fields. Reports retain actual captures, model metadata, event evidence and optional research at its requested tick.
- Existing Mars route execution remains explicitly guided playback, distinct from the synthetic observation-driven controller. Mars report exports now include this scientific classification legend.

### Launch and demonstration

From `../ml_ghost`: `python scripts/serve.py --port 8001 --reload`.
From this frontend in PowerShell: `$env:VITE_API_BASE_URL='http://127.0.0.1:8001'; npm run dev -- --port 5174 --strictPort`.
Open http://localhost:5174, select **Synthetic Exploration**, Start, and inspect the actual phase, learned morphology, packet image, target route and completed investigation evidence. Seeds `alpha`, `beta`, `gamma` and the default produce different tested decisions. Pause, Save checkpoint, reload the page, return to Synthetic Exploration and Restore checkpoint to continue. Export includes the raw/derived evidence distinction, full archive, versioned checkpoint and optional research response.

Use **Interpret observed evidence** for the advisory request; optionally request Mars PDS metadata context. Without server-side `OPENROUTER_API_KEY` and an explicit `OPENROUTER_MODEL`, no LLM call occurs and autonomy continues. Enabling sends only the selected summaries and bounded metadata to OpenRouter, not ground truth. No model is claimed compatible until actually tested.

Verification commands: `npm test`; `npm run typecheck`; `npm run build`; `npm run test:e2e`. `PLAYWRIGHT_PREVIEW=1` tests a current production build; `PLAYWRIGHT_PORT` selects an unused port; `PLAYWRIGHT_REUSE_SERVER=1` deliberately reuses a dev server; `GHOST_LIVE=1` enables genuine backend/PDS checks. Run heavyweight suites sequentially. Baseline terrain regression requires Git and checkpoint commit `e77e3f9`.

## Autonomous execution log — 2026-11-14

### Baseline and preservation

Actual repositories: frontend `Desktop/ghost3d` (React 19, TypeScript, Vite, Cesium; not Next.js) and backend `Desktop/ml_ghost`. Frontend started clean at `9db3664` on `feature/backend-compatibility`; checkpoint `checkpoint/pre-autonomous-20261114` preserves it; work branch `feature/rover-execution`. No datasets, weights, history, or existing processes were deleted. Frontend baseline: 12 unit tests passed; production build passed. Existing services were listening on 5173/8000. Live health reported 409 targets and ready DINOv2-Small + Isolation Forest, which is a readiness report, not a new accuracy evaluation.

### Implemented architecture

- Existing Mars API adapter, datum transform, scientific target analysis, experiments, and Cesium viewer are preserved.
- `rover.ts` executes supplied backend route coordinates incrementally with Mars-distance interpolation, heading, exact endpoint arrival, bounded timesteps, and illustrative energy depletion. `RoutePlayback.tsx` provides start/pause/reset and actual event records. This is **guided route playback**, not closed-loop autonomous driving. Speed is accelerated 10 m/s; battery budget is an illustrative 0.002%/m, not engineering validation. Mars viewport reflects playback position and offers rover focus. Target text labels are distance-gated to reduce overlap; point markers remain available.
- `synthetic.ts` generates deterministic ridge/crater/valley height fields. The controller obtains bounded numeric sensor samples through a local-sensor interface, not the full hidden map. A known-cell graph planner selects frontiers, avoids sensed slope hazards, moves incrementally, updates observations, and accounts for simulated energy. The renderer separately receives the generated mesh. This is **algorithmic exploration with idealized numeric sensing**, not DINOv2 classification, camera-based perception, geological inference, or validated rover physics. Locally sampled morphology classes come from the simulator and are not learned predictions.
- `SyntheticExplorer.tsx` renders the actual height mesh, route, observations, hazards, heading, and a simplified procedural chassis/mast/six-wheel schematic using the existing Cesium engine. No second renderer, external model asset, or model dependency was introduced. Seed, start, pause, reset, rover focus, and evidence export are functional. Rounded schematic wheels do not implement suspension or validated contact dynamics.
- `KnowledgeSearch.tsx` calls the backend PDS discovery endpoint through the typed API client; validates metadata structure; shows identifiers, source, missing metadata, cache status, empty coverage, and errors. Search metadata is not represented as downloaded/processed data or a proven geological analogue. No arbitrary frontend fetch tools or LLM movement controller were added.

### Run and demonstration

1. Backend: follow `../ml_ghost/README.md`; keep server-side keys there, never in VITE values.
2. Frontend: `npm install`, then `npm run dev`; open the printed local URL. Existing env keys remain in `.env.example`.
3. **Synthetic Exploration**: runs without backend/OpenRouter. Start survey, pause to inspect numeric samples and timeline, focus rover, export synthetic survey. Change seed and Reset to generate another world. Save checkpoint stores a versioned seed/tick checkpoint in this browser; Restore checkpoint reconstructs the paused controller by bounded deterministic replay, including its observation memory and next decisions. Save before navigating away; checkpoints are not synchronized to backend storage.
4. **Scientific Targets**: select actual backend evidence; use target as destination; **Mission Planner**: use backend landing site and request route, then Execute simulated route. This route execution is explicitly guided, not claimed as ML autonomy.
5. **Scientific Knowledge**: submit PDS keywords; inspect returned metadata or the visible upstream error. Registry indexing is incomplete.
6. Verification: `npm test`, `npm run typecheck`, `npm run build`, `npm run test:e2e`. If intentionally testing the already-running local frontend, set `PLAYWRIGHT_REUSE_SERVER=1`. Otherwise the managed runner correctly refuses an occupied port. Production verification uses a current build and `PLAYWRIGHT_PREVIEW=1` on a free port.

### Research and reuse decision record

No new third-party code, weights, or assets were copied. Existing Cesium, React, DINOv2, and Isolation Forest remain the foundations. Read-only public-source research identified SPOC's input-domain distinction (orbital HiRISE versus rover NAVCAM), Regolith's ROS/Gazebo integration burden, DERT's desktop Java runtime, TIG's offline/container processing role, Access Mars' archived WebVR architecture, PatchCore's industrial-image domain, and ATHENA's procedural browser reference. None was integration-tested or adopted; ATHENA's reuse license was not verified, so no code/assets were copied. Relevant supplied sources: https://github.com/nasa-jpl/SPOC ; https://github.com/Regolith-Project/regolith ; https://david-j-young.com/project-athena.html ; https://github.com/nasa/dert ; https://github.com/NASA-AMMOS/tig ; https://github.com/googlecreativelab/access-mars ; https://github.com/facebookresearch/dinov2 ; https://github.com/amazon-science/patchcore-inspection . This is suitability screening, not complete license/weights/activity due diligence.

### Verification and recovered failures

- Frontend unit suite: 21 passed, including route traversal/arrival, energy exhaustion, invalid inputs, deterministic terrain, local sensor range, hazard/frontier decisions, survey termination, checkpoint replay parity, PDS encoding/schema/error handling, and existing Mars wire/datum captures.
- Browser development checks: six fixture/offline scenarios passed before the final tracking-control polish; focused synthetic checks also passed after checkpoint save/restore, camera correction, and procedural shader changes. Final rerun results are recorded below when complete.
- Real, non-intercepted browser workflow passed on frontend 5174/backend 8001: connected mission, actual target analysis 200, actual A* planning 200, visible moving route playback, real PDS metadata 200. The live test is opt-in (`GHOST_LIVE=1`); normal test runs skip it intentionally.
- Live PDS testing exposed that raw `keywords` is silently ignored by the upstream registry. The backend now issues `title LIKE "Mars*"` with analyzer-dependent token/case matching. An initial browser assertion incorrectly required every returned title to start with literal `Mars`; real results included `MARSIS…` and `Archive Information Package for mars2020…`. That unsupported assertion and the misleading documentation were corrected. Nonsense-title queries returned zero. Mars target-LID filtering and identifier resolution were also tested by the backend task. No assets or complete archives were downloaded by discovery.
- A concurrent final build + Python suite + two browser workers exhausted system memory (Node allocation failures; NumPy 5.11 MiB allocation failure in a 669,905-segment geology proximity reduction). Browser workers are now limited to one, suites run sequentially, and backend distance calculation now uses exact 8,192-segment chunks with scaling inside each chunk. Targeted numerical parity, chunk-boundary, empty/degenerate tests passed, and the previously failing analysis test passed. The user-owned original services were not stopped; only the additional backend started by this session was temporarily stopped for sequential verification.
- Production builds pass; Vite retains a large Cesium bundle warning (approximately 4.5 MB minified / 1.23 MB gzip). No security controls or native-binary workarounds were changed.

### Final verified handoff

- `npm test`: **21 passed**.
- `npm run build`: **passed**, including TypeScript; built with `VITE_API_BASE_URL=http://127.0.0.1:8001` for the non-disruptive demo stack.
- Backend `python -m pytest tests -x -q`: **131 passed**, one existing Starlette deprecation warning, after exact chunked geology optimization.
- Built production-preview browser run (`PLAYWRIGHT_PREVIEW=1`, `PLAYWRIGHT_PORT=5175`): **6 passed, 1 intentionally skipped** (live test is opt-in).
- Final development browser run (`PLAYWRIGHT_REUSE_SERVER=1`, `PLAYWRIGHT_PORT=5174`, `GHOST_LIVE=1`): **7 passed**, including real ML/backend/PDS workflow plus all fixture/failure scenarios. No remaining failing tests in these final runs.
- `git diff --check`: passed in both repositories; Windows LF/CRLF notices are not test failures. Source changes remain uncommitted and unpushed; baseline checkpoint branches are preserved in both repositories.
- Additional updated services left running: frontend **http://localhost:5174**, backend **http://127.0.0.1:8001**. Original user services on 5173/8000 were untouched. Browser preview was opened for 5174. Test-managed preview server exits after its suite.
- Open **Synthetic Exploration** and Start for the offline-capable survey demonstration; Focus rover / Track rover / Overview change the actual Cesium camera. Save/Restore checkpoint persists and resumes this browser's mission; Export synthetic survey includes provenance and evidence. Open **Scientific Knowledge** to run actual PDS metadata discovery. Use **Mission Planner** after target selection for explicitly guided playback of a real backend route.

### Remaining delivery boundaries

Not a completed master directive. Synthetic survey is not yet connected to the orbital-image ML pipeline or backend persistent mission storage. No synthetic camera-image model evaluation, rock detector, compositional sensor, validated physics, full DISCOVER/UNDERSTAND/INVESTIGATE loop, OpenRouter model comparison/inference, controlled assistant, cross-world scientific comparison, or comprehensive mission report has been implemented in the frontend. Real Mars terrain still requires the existing ion configuration; nonstandard raster/geology rendering limitations below remain. Browser JSON exports preserve evidence snapshots; separate versioned localStorage checkpoints reconstruct the controller by deterministic replay, but are not a backend mission database. No claim of life, model accuracy, scientific discovery, flight-grade safety, or geological equivalence is made. Backend work and live archive verification are recorded separately in its existing README/PROGRESS.


## Latest status — DATUM RESOLVED, LIVE INTEGRATION VERIFIED (feature/backend-compatibility)

Backend commit `959d44106d2e938499f351029d355c3ae3c52acc` (includes datum work from `893b231`) provided the missing evidence:

- `scripts/validate_datum.py` executed live: PASS. (1) NASA's published Mars 2020 touchdown coordinate falls inside the USGS SIM 3464 landing ellipse with latitude unchanged; (2) MOLA elevation at touchdown is -2571 m vs NASA's published -2570 m; (3) 99.3% of 271 mapped units' median MOLA elevations fall inside their published ranges with latitude unchanged.
- `scripts/validate_crs.py`: backend's MTM 77.5E inverse matches ArcGIS's own reprojection vertex-by-vertex (763 vertices, <50 m, reported 0.00 m max).
- Vertical transform (backend `ghost/coords.py:106`): `h_ellipsoid = 3396190 + elevation_areoid - R_ellipsoid(lat)`, where `R_ellipsoid` is the geocentric radius of the IAU 2000 ellipsoid (a=3396190, b=3376200) at the areographic latitude. Control: -2571 m @18.4448 deg -> -596.4 m.
- Horizontal: backend areographic/planetographic degrees == Cesium geodetic convention; longitude/latitude pass through unchanged. No arbitrary offsets used.

Frontend changes (minimal, frozen shell preserved): `heightAboveEllipsoidM`/`marsEllipsoidRadiusM` replicate the backend equation; `ellipsoidCoordinate` converts native `elevation_m` while keeping raw areoid values in `elevationMeters`; `SPATIAL_ALIGNMENT_VERIFIED` lifted to true; route coordinates render as converted geometry (`spatialRendering: 'enabled'`, raw path/GeoJSON retained); destination map-pick enabled (Cesium geodetic pick shares the areographic convention); mission region now drives the viewer instead of the provisional constant; footnotes updated. Raster/elevation/geology overlay layers remain unavailable (nonstandard tile grid, ~33 MB GeoJSON, no verified render path) — only markers and route lines render.

### Verification — live backend at http://127.0.0.1:8000

- `npm test`: PASS, 12/12 (new control-point + round-trip tests pin the transform; route capture now asserts converted heights + enabled rendering).
- `npm run typecheck`: PASS, exit 0.
- `npm run test:e2e`: PASS, 4/4 fixture tests, 39.4 s (regression only; still intercepted fixtures).
- Live `POST /api/analyze` for `ctx_mosaic:z12:r1620:c5860`: priority 0.4340, score 1.0, uncertainty 0.828, 5 caveats — real result, not fixture.
- Live `POST /api/plan-route` + `POST /api/routes`: found 12.04 km over 25 DEM cells; compat route heights already ellipsoid-converted by the backend (-597.34 m at start).
- Backend `scripts/verify_frontend_contract.mjs` (drives this frontend's own `api.ts` module live): all checks PASS except its own outdated assertion that spatial rendering must remain 'blocked' — expected failure caused by the authorized datum sign-off.
- Live browser smoke (Edge, dev server, NO interception): connected, 409 target rows, real analyze for one target, live route request produced 25.93 km / 50 DEM cells rendered on the globe, Cesium error panel count 0.

### Stabilization pass (post live-integration milestone)

- `npm run build`: PASS, 22.36 s; JS 4,478.32 kB (gzip 1,216.60 kB); same non-fatal chunk warning.
- `PLAYWRIGHT_PREVIEW=1 npm run test:e2e` (production bundle via Vite preview, Edge): PASS, 4/4, 23.4 s.
- `npm test`: PASS, 12/12 (~450 ms).
- Route parity, identical endpoints start (77.45, 18.44) -> goal (77.60, 18.50): frontend module vs direct `POST /api/plan-route` — distance identical (12040.155170450478 m), cell count identical (25), transformed first height identical (-597.0534091913141 m from areoid -2571 m). PASS.
- Analysis labels verified: "Anomaly score", "Uncertainty", "BACKEND PRIORITY SCORE"; persistent caution "An anomaly is a signal to investigate, not proof of scientific importance." No probability language anywhere in src/. Caveats pass backend text through verbatim (backend itself states scores are NOT probabilities).
- Held-out demo target confirmed live: `ctx_mosaic:z12:r1629:c5872` (split=test, 18.3911 N, 78.0688 E, areoid -2444 m). 97 test-split targets exist per health.dataset.splits.
- Disabled layers verified labeled unavailable with accurate reason ("no verified overlay render path (raster/geology)"); previous "pending datum alignment" wording corrected since the datum is now resolved.
- Backend coordination item (NOT changed by frontend): `ml_ghost/scripts/verify_frontend_contract.mjs` still asserts `spatialRendering === 'blocked'`; it should expect `'enabled'` per the approved datum alignment. Backend owner to apply; frontend did not modify backend files.

### Still NOT verified / blocked

- Geology polygons, elevation grid, and raster tile layers (CTX/HiRISE tiles use a nonstandard origin/resolution scheme — no verified render path). Targets + route lines only.
- Cesium ion token still unconfigured: globe shows reference ellipsoid, not measured terrain. Converted heights are correct relative to the Mars ellipsoid but the visual surface is still the ellipsoid.
- Mobile layouts and non-Edge browsers not verified.
- Backend verify script needs its `spatialRendering` expectation updated (backend-side file, coordinated — not modified).

## Previous status — BACKEND COMPATIBILITY BRANCH (feature/backend-compatibility)

Minimal compatibility patch implemented against the backend's normative contract (ml_ghost, branch feature/ai-data-backend, contract v1.0.0). New `src/wire.ts` provides typed wire schemas and narrow adapters for the backend's actual endpoints (`/api/mission/region`, `/api/targets` pagination, `/api/analyze`, `/api/plan-route`, `/api/experiments`, `/api/map/layers`, `/api/health`), composed into the frontend's existing internal view models. Typed errors preserve `dataset_missing`, `model_missing`, `empty_selection` and other backend error codes. Relative image URLs resolve against the API origin; colon-containing target IDs are preserved and URL-encoded. Failed refreshes now clear prior records/selections/routes instead of showing stale success.

Spatial safeguards (datum unresolved — pending backend/data-team clarification): raw backend route GeoJSON and areoid elevations are preserved for inspection but are NOT rendered as Cesium geometry; backend geology/elevation raster layers are surfaced as available metadata but never drawn as aligned overlays; map-picked coordinates are not sent to routing. No coordinate transformation was guessed; Mars CRS metadata is retained on payloads.

### Verification — compatibility patch (dev server, Microsoft Edge)

- `npm test`: PASS, 11 tests, 0 failures (~560 ms). Adds adapter tests built from captured backend fixtures: mission composition/metadata, paginated targets preserving CRS, 503 dataset_missing, model_missing, empty analysis selection, non-JSON errors, relative image resolution, analysis score/uncertainty/reasons/caveats, raw route elevations + GeoJSON without unsafe rendering, nested experiment metrics with missing model versions, empty lists, duplicate-page-ID rejection, and invalid scientific-number rejection.
- `npm run typecheck`: PASS, exit 0.
- `npm audit`: PASS, 0 vulnerabilities.
- `npm run build`: PASS, exit 0 — 3,211 modules, 4 Cesium asset groups copied, 26.22 s; JS 4,463.23 kB (gzip 1,211.31 kB); same non-fatal >500 kB chunk warning. One earlier attempt died with a Node heap OOM; a retry passed unmodified, so treat occasional OOM as environmental — rerun or raise `--max-old-space-size` if it recurs.
- `npm run test:e2e`: PASS, 4/4 tests, 57.6 s: (1) offline reference globe + unavailable science, (2) backend-capture fixtures: target evidence, single route result, research history, spatial safeguards, (3) dataset_missing/model_missing stay unavailable while metadata survives, (4) failed refresh clears prior records/selections/routes. Cesium error-panel count zero in all tests.
- NOT verified: live backend (127.0.0.1:8000 refused connection at last check), authenticated Cesium Mars terrain, real datum-aligned overlays, production-preview e2e after these changes, mobile/other browsers.

## Previous status — FEATURE SCOPE FROZEN / WAITING FOR BACKEND

Integration handoff finalized on 2026-11-13. No new frontend features or broad architectural changes are planned. This handoff pass changes documentation only; application code, dependency pins, API behavior, and build/test configuration remain frozen. Backend acceptance and actual source-data integration are still pending.

`INTEGRATION_CONTRACT.md` is the finalized frontend consumer contract, not a claim of backend agreement. It now includes:

- Every consumed API: GET /api/mission, POST /api/routes, GET /api/experiments; exact request/response types, optional-field semantics, errors, CORS/auth boundaries, and expected units.
- Mars planetographic coordinate convention, ellipsoid radii, longitude range, ellipsoid-relative heights, GeoJSON/3D Tiles requirements, and required source-datum validation.
- Complete runtime-reference and test-fixture inventory, with exact source locations and test-only values; no fixtures substitute for real science in the running app.
- All three VITE settings, public Cesium ion token/asset requirements, static runtime-asset serving, and test-only preview mode.
- Ordered backend setup and live acceptance procedure, existing frontend limitations, and clear separation between intercepted regression tests and actual-backend/source validation.

Backend team next supplies/accepts: API origin and schema, CORS/auth decisions, confirmed initial region, source/datum/control points, score/uncertainty semantics, resource units, public ion access, and actual target/layer/route/experiment records. Then perform the contract's normal-browser acceptance procedure without Playwright interception and record evidence here. Until that integration is available, frontend work is paused.

### Handoff-pass rechecks (documentation-only change)

- `npm test`: PASS, 3/3 tests, 0 failures, 326.9 ms.
- `npm run typecheck`: PASS, exit 0.
- `PLAYWRIGHT_PREVIEW=1` with `npm run test:e2e -- --grep "offline workspace"`: PASS, 1/1 selected test, 0 failures, 42.0 seconds, installed Microsoft Edge against the existing verified production bundle. API calls were deliberately aborted by the test; no actual backend was contacted. Test runner stopped its preview server.
- Production build and the two complete dev/preview suites were not rerun for this documentation-only handoff; their earlier exact verified results remain recorded below. No runtime/build inputs were changed.

### Unavailable services and verification boundary

The frontend gracefully handles initial unavailable backend services: it shows reference/offline state and empty scientific content, disables route submission without mission data, and keeps navigation and local report export available. API clients handle service errors and cancellation. This behavior was verified using aborted requests in Edge, not an actual unavailable Python deployment. Manual Sync data is the recovery action; no polling or automatic retry is implemented.

Known limitation from handoff review: failed refreshes retain previously loaded mission/experiment records in memory. The service/error state updates but retained records do not have individual stale timestamps. A fresh reload clears them. Actual CORS, timeout/recovery, authenticated tile-streaming, and scientific source correctness still require live acceptance; these are not claimed verified. Initial source-image failures simply hide the image. See the contract for all frozen limitations.

## Repository audit

Workspace initially empty, with no framework, components, backend files, integration contract, or Git repository. Node 24.18.0 / npm 11.16.0 available. Created isolated React / TypeScript / Vite frontend using CesiumJS 1.146.0, which includes the Mars ellipsoid. No backend implementation or optimization logic added.

## Completed implementation

- Mission Control shell with responsive dark scientific interface and seven navigation destinations.
- Cesium Mars ion 3D Tiles integration, region camera focus, zoom/home/orbit controls, target markers and labels, coordinate picking, reference-ellipsoid fallback, WebGL failure state.
- Data-team region override via mission endpoint; provisional Jezero reference while offline.
- Source-aware overlay controls, inline Mars GeoJSON and remote 3D Tiles support, loading/unavailable/error states.
- Start/destination mission workflow, selectable target destination, asynchronous route requests, alternatives, route lines, distance/difficulty, explicitly simulated resource costs, recommendation rationale.
- GHOST evidence panel with backend imagery, raw anomaly/uncertainty, priorities, source classification, context, and scientific caution.
- Backend-driven Research Lab experiment history, model versions/statuses, Three Ghosts / False Alarm groups, metric graphics with labeled scales. No invented results.
- Local JSON mission snapshot export; no backend archive claims.
- Typed configurable API client, payload validation, request cancellation/timeouts, endpoint error states, finalized frontend integration contract awaiting backend acceptance.
- API unit tests and authored Playwright smoke/integration tests with explicitly simulated test-only fixtures (not runtime demo data).

## Verification — 2026-11-13, official Rollup WASM fallback

- `npm test`: PASS, 3 tests, 0 failures (325.6 ms). Covers coordinate validation, URL safety, service errors, malformed mission/route/experiment payloads, successful empty missions, POST body transport, and abort propagation.
- `npm run typecheck`: PASS standalone after all code/configuration changes, exit 0. TypeScript also passed as the first phase of the final production build, including application and Playwright test sources.
- `npm audit`: PASS, zero reported vulnerabilities after the dependency changes.
- `npm run build`: PASS, exit 0. Final run transformed 3,211 modules, copied all four Cesium runtime asset directories, and completed in 33.72 seconds. Output: dist/index.html 0.42 kB; CSS 37.11 kB; JS 4,470.05 kB (gzip 1,213.62 kB). Non-fatal warning: the JS chunk exceeds 500 kB. No chunk-warning suppression or unrelated bundle optimization added.
- `npm run test:e2e`: PASS, 2/2 tests, 0 failures, 34.7 seconds against Vite's development server in installed Microsoft Edge with software WebGL flags.
- `$env:PLAYWRIGHT_PREVIEW='1'; npm run test:e2e`: PASS, 2/2 tests, 0 failures, 20.1 seconds against the final dist production bundle via Vite preview, also in Microsoft Edge.
- Both browser runs verified offline reference-globe labeling, unavailable science, disabled route requests while offline, Research Lab empty states, report download, explicitly simulated test-only target analysis, destination selection, actual WebGL canvas start-point picking, route requests/alternative selection and distance display, and experiment records. The fixture workflow also asserts no Cesium rendering-error panel exists. Test responses are intercepted; these passes are not live-backend or authenticated-terrain verification.
- Test processes shut down their servers; no preview/dev server was left running. Mobile layouts and other browser engines were not verified.

### Compatibility issues observed and resolved

1. Original native build was blocked by Windows Application Control rejecting rollup.win32-x64-msvc.node. With user approval, package.json now overrides `rollup` with the official npm alias `npm:@rollup/wasm-node@4.68.3`. Version 4.68.3 deliberately matches the previously resolved native version, avoiding a simultaneous Rollup version change. `npm ls rollup` confirms Vite uses the alias. A direct in-memory Rollup bundling smoke test also passed. No Windows policies, npm security settings, approval controls, or node_modules source patches were changed. Existing Vite configuration and application source remain unchanged.
2. Initial browser attempt failed before tests: Cesium 1.146.0's dependency range resolved engine 26.5.0, whose removed exports caused 25 optimizer errors. Added a separate engine override to its declared baseline 26.4.0. The first install produced two engine copies and a Cesium renderState.lineWidth error due to split renderer state; `npm dedupe` unified the tree, and the resulting deduplicated resolution is recorded in package-lock.json. This was a pre-existing Cesium dependency compatibility issue exposed by running the previously blocked browser workflow, not a WASM API incompatibility.
3. A route assertion expected Western numerals while the browser used the machine's Arabic number formatting. The assertion now computes its expected value using the browser's own Intl formatting. Added a 15-second assertion budget for cold startup and failure screenshot/trace retention. Playwright config supports production-preview mode without changing the default dev workflow. No retries or ignored failing assertions were introduced.

### Native Rollup fallback (documented, not activated)

Original toolchain: Vite 6.4.6, native Rollup 4.68.3, no special Vite Rollup configuration. To restore that exact native Rollup version on a machine where the binary is approved through the normal security process, change only `overrides.rollup` in package.json from `npm:@rollup/wasm-node@4.68.3` to `4.68.3`, then run `npm install`, `npm dedupe`, `npm ls rollup`, and the build/browser checks below. Keep the independent Cesium engine override. Removing only the Rollup override entirely restores Vite's original native semver resolution instead of pinning the former version. Do not alter Windows security policy to make either option work. The native option remains unverified/blocked on this machine; the working default is WASM.

## Blockers and remaining work

1. Native Rollup remains blocked by Windows Application Control, but no longer blocks the app: the official WASM default passed build and desktop browser workflows. Native restoration is optional. Mobile layouts and browser engines other than Microsoft Edge still need verification.
2. Data team must confirm the real region and agree to INTEGRATION_CONTRACT.md, including planetographic coordinate convention, ellipsoid-height datum, CORS, and endpoint paths.
3. Configure valid, public read-only/origin-restricted Cesium ion token and asset access; verify actual terrain streaming and attribution in browser. Without it the visible surface is reference geometry, not measured terrain.
4. Supply real targets, geology/risk layers, imagery, route responses, and experiments. These currently display explicit empty/offline states.
5. Verify route waypoint heights against terrain. Routes are displayed at supplied heights, not independently validated or terrain-clamped.
6. Raster/WMTS-specific layer adapters and persisted backend mission reports are not implemented. Orbital imagery/elevation inside Cesium Mars are bundled, not independently switchable.

## Startup instructions (PowerShell)

The workspace lockfile uses official Rollup WASM; native-binary approval is not needed for this configuration:

```powershell
npm install
Copy-Item .env.example .env.local
```

Edit `.env.local`: set `VITE_API_BASE_URL` to the Python service; set `VITE_CESIUM_ION_TOKEN` to an approved public browser token. Never use a private administrative token. Default Mars asset ID is 3644333. Backend must allow the actual frontend origin via CORS.

```powershell
npm run dev
```

Open the local address Vite prints (normally http://localhost:5173). A modern WebGL-capable browser is required.

```powershell
npm test
npm run typecheck
npm run build
npm run test:e2e
$env:PLAYWRIGHT_PREVIEW = '1'
npm run test:e2e
Remove-Item Env:PLAYWRIGHT_PREVIEW
```

E2E configuration uses installed Microsoft Edge, starts an isolated Vite dev server (or production preview with PLAYWRIGHT_PREVIEW=1) on port 5173, and intercepts only test API responses. Ensure that port is free. Failure screenshots/traces go into ignored test-results/. Production-preview mode requires a current successful build; the test runner does not rebuild automatically. For manual inspection run `npm run preview` after a successful build. Do not treat preview as a production hosting server.
