# GHOST Scientific Exploration

React 19, TypeScript, Vite and Cesium frontend for the companion `../ml_ghost`
FastAPI backend. This preserves the existing Mars imagery/analysis/route
workflow and adds a separate, observation-driven synthetic rover investigation
system. It is a research prototype, not validated planetary flight software.

## Launch

Use two terminals. Keep existing local environment files; do not overwrite
credentials. Python dependencies and retained datasets belong to the backend;
see its README for first-time installation/acquisition.

```powershell
# Terminal 1: from ../ml_ghost
python scripts/serve.py --port 8001

# Terminal 2: from ghost3d
$env:VITE_API_BASE_URL = 'http://127.0.0.1:8001'
npm run dev -- --port 5184 --strictPort
```

Open http://localhost:5184. If occupied, choose an unused port rather than
stopping another application. A WebGL-capable browser is required. Install
frontend packages with `npm install` if absent; Node >=22.6 is needed for the
native TypeScript unit-test runner. Preserve the official Rollup WASM and
Cesium engine dependency overrides.

For production preview, set the API URL BEFORE `npm run build`, then run
`npm run preview -- --port 5184 --strictPort`. VITE configuration is baked
into the build. The API fallback remains port 8000.

## Demonstrate

1. Select **Synthetic Exploration**, then **Start**. Observe Discover ->
   Understand -> Investigate, target reasoning, a known-safe planned path,
   incremental movement, focused captures and actual investigation records.
2. Inspect the raw idealized RGB/depth evidence and the separate morphology
   prediction, novelty distance and uncalibrated uncertainty. Try `alpha`,
   `beta`, `gamma`; reset between seeds. Unsafe initial sites stop honestly.
3. Pause, save a checkpoint, reload, return to the sandbox and restore.
   Version-2 checkpoints replay decisions deterministically; old v1 data is
   rejected, not silently migrated. Export preserves the evidence archive.
4. Request **Interpret observed evidence**, optionally enabling PDS context.
   With no configured provider, metadata context can still be retrieved and
   interpretation is explicitly unavailable. The rover continues independently.
5. In the Mars workflow, select a real target, inspect backend analysis, use
   it as destination, use the backend landing site, request a route and execute
   its explicitly labeled guided simulation. This is NOT autonomous Mars driving.
6. **Scientific Knowledge** searches genuine NASA PDS registry metadata,
   not downloaded/processed archive measurements. **Mission Reports** exports
   a local Mars snapshot; synthetic evidence has its own export.

## Architecture And Scientific Boundaries

- `synthetic-world.ts`: seeded original terrain, local idealized RGB/depth
  sensor, separate training/evaluation hosts. Hidden active-world labels are
  never supplied to the controller.
- `perception.ts`: independently trained, fixed depth-morphology 5-NN.
  Features use calibrated depth; RGB is evidence, not a learned image feature.
  This is genuine supervised inference, not the orbital DINOv2 pipeline.
- `synthetic.ts`: sensor-only controller, observed traversability, scientific
  target ranking, safe graph routing, focused evidence, memory and event records.
  Unknown/hazard cells and diagonal corner cuts are excluded. Failures do not
  invoke an unsafe fallback or fabricate successful movement.
- `ResearchPanel.tsx` / `research.ts`: optional advisory consumer. The backend
  alone owns OpenRouter credentials, bounded PDS retrieval and strict response
  validation. No movement tools, generated observations or unchecked citations.
- `rover.ts` / `RoutePlayback.tsx`: guided playback of a backend-planned Mars
  route, separate from autonomous synthetic exploration.

Synthetic evaluation: 1,250 held-out samples, 92.56% accuracy, 80.85% balanced
accuracy, but only 47.54% crater recall. A +500 m depth bias reduces accuracy
to 26.56%. These are same-family synthetic morphology metrics, NOT real Mars
geology/camera validation. Repeat captures use static depth and are not
independent geological corroboration. Energy and mobility are illustrative.
Anomaly distance is not a probability or evidence of a discovery.

Real NASA imagery/elevation, generated terrain, synthetic observations,
model predictions, simulated costs and unverified hypotheses remain distinct.
The reference ellipsoid is not measured terrain. Existing real-data sources,
trained weights, datum conversion and NASA/USGS provenance are preserved.
Cesium attribution must remain visible.

## Optional Research Configuration

Set `OPENROUTER_API_KEY` and an explicit `OPENROUTER_MODEL` only on the
backend. Neither has a browser-side equivalent; never put private keys in
`VITE_*`. No default or live-validated provider model is claimed.
`GHOST_OFFLINE=1` disables remote research. Provider errors, missing keys,
invalid citations/schema and timeouts return honest unavailable responses.

PDS comparisons are metadata context only, with
`measured_properties_compared: false`. No spectra, composition, quantitative
similarity or shared geological origin is inferred. Citation ID validation
does not establish scientific entailment.

## Validation And Remaining Work

See [VALIDATION.md](VALIDATION.md) for exact commands, final counts and failed
live attempts. Final checks: 39 frontend unit tests, 230 backend tests across
all modules in separate sequential processes, TypeScript/build, 7 production
fixture/offline browser scenarios, and 1 real synthetic/research/PDS scenario.

The combined final live Mars browser workflow is NOT verified green: low
system memory caused real geology-cache allocation failure and browser stalls.
Real backend analysis and real cached elevation/routing passed separately.
The 152 MB geology JSON and WebGL must fit alongside other user applications;
prewarming analysis alone did not resolve the combined browser run. Do not
close user applications automatically or claim the end-to-end check passed.

Still incomplete: live OpenRouter model/schema/science-quality evaluation;
quantitative archive-measurement comparisons; realistic image-based mineral/
object perception, dust/occlusion and sensor-domain validation; validated
vehicle physics; backend-persisted synthetic mission archives; broad mobile/
browser validation. Long mission archives and deterministic replay can be
expensive. Existing large Cesium bundle and Starlette warning remain.

Reused components include React, Vite, CesiumJS, Lucide, FastAPI, NumPy,
PyTorch, DINOv2-Small, scikit-learn Isolation Forest and the existing A* planner.
This iteration copied no external candidate weights/assets. Source/model
licenses and Cesium/NASA/USGS attribution still apply; see the backend source
registry/README. Checkpoint commits are `e77e3f9` (frontend), `01521da`
(backend); subsequent focused work remains uncommitted and unpushed.

[PROGRESS.md](PROGRESS.md) contains detailed architecture, evaluation,
historical execution records and recovered failures.
[INTEGRATION_CONTRACT.md](INTEGRATION_CONTRACT.md) records the research and
provenance contract; its older frozen sections are historical.
