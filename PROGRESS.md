# GHOST IN THE DATA — frontend progress

## Current status — FEATURE SCOPE FROZEN / WAITING FOR BACKEND

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
