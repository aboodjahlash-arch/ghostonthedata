# GHOST IN THE DATA — frontend integration handoff

## 2026-11-14 additive integration update

The user's master autonomous directive supersedes the historical frontend freeze below. Existing Mars payloads and datum conversions remain unchanged. Guided backend-route playback is a frontend-only simulation consumer, not a new backend controller API. Synthetic exploration uses a separate deterministic local sensor/controller module and browser-local checkpoint; it does not send synthetic measurements into the real Mars ML pipeline.

New optional consumer endpoint: `GET /api/discovery/products?keywords=Mars&limit=10`. The backend maps keywords to a verified **registry title wildcard** query with analyzer-dependent token/case behavior (not arbitrary full-text matching or exact body matching). Response: `{hits, count, limit, took_ms, from_cache, query, items, api_base, disclaimer}`. Each item includes `lidvid`, `title`, `description`, `instrument`, `target_name`, `processing_level`, plus optional archival metadata. Hits are upstream registry estimates; indexed coverage is incomplete. Empty lists are valid; malformed/network/upstream responses are errors, not empty successes. The UI uses a 30-second request deadline and never treats metadata as an asset retrieval, model result, or geological analogue. Backend also exposes identifier resolution at `GET /api/discovery/products/{lidvid}`; the current UI search does not call it.

The existing process on port 8000 may still serve pre-discovery code until restarted. Non-disruptive verified development stack uses backend 8001 and frontend 5174 (`VITE_API_BASE_URL=http://127.0.0.1:8001` set on the dev process). Do not infer that a 404 on the old process means the new endpoint is operational there.


## 1. Status and boundary

Frontend handoff finalized against the existing implementation on 2026-11-13. Frontend feature scope is FROZEN; awaiting backend-team acceptance and actual integration. This is the implemented consumer contract, not a claim that the backend already implements or accepts it. No new frontend features or architectural changes are authorized by this handoff.

Canonical payload types and runtime checks: `src/api.ts`. Request orchestration and presentation: `src/main.tsx`. Geospatial rendering: `src/MarsViewer.tsx`.

Verified: production build, TypeScript, API unit tests, and two Edge browser workflows against both dev and production-preview servers. Browser success-path data was intercepted, explicitly simulated test data. Offline handling was tested by aborting API requests. NOT verified: an actual Python backend, actual scientific results, authenticated Cesium Mars tiles, imagery/overlay source correctness, datum alignment, or route safety. See PROGRESS.md for exact recorded results.

## 2. Transport and required endpoints

Base: `VITE_API_BASE_URL`, default `http://localhost:8000`. The frontend appends the complete paths below; configure a base WITHOUT a trailing `/api` unless the deployment intentionally has that extra prefix. One trailing slash is stripped.

| Method/path | Request | Success response | When called |
| --- | --- | --- | --- |
| GET `/api/mission` | No query parameters or body | `MissionResponse` | App mount and manual Sync data |
| POST `/api/routes` | JSON `RouteRequest` | `RouteResponse` | User requests route after setting both endpoints and receiving valid mission data |
| GET `/api/experiments` | No query parameters or body | `ExperimentResponse` | App mount and manual Sync data, independently of mission success |

These are ALL backend API endpoints used. Target imagery/analysis comes inside mission targets; there is no target detail, inference trigger, training trigger, model registry, region-selection, health, upload, or saved-report API call. Mission Reports exports a local JSON snapshot only. Images and tiles are browser asset requests to supplied URLs, not additional predefined backend API routes.

Requests send `Accept: application/json`; POST also sends `Content-Type: application/json`. Return 200 with a JSON object matching the schemas. Empty result arrays are valid. HTTP 204 is not supported because the client parses JSON. All non-2xx statuses are errors; the client reports status but does NOT parse or display a backend error-body schema. Error bodies may be your usual service format. Do not return successful status with an error envelope.

No auth headers or explicit cross-origin cookie credentials are implemented. No authentication scheme is agreed. A backend requiring bearer-token injection or cross-origin cookie sessions is an integration blocker requiring a separate decision; never place private service secrets in VITE variables.

CORS: allow the actual frontend origin, GET and POST, and the Accept/Content-Type headers; handle the browser's OPTIONS preflight for JSON POST. Default dev origin is `http://localhost:5173`; default manual preview uses port 4173, while the automated preview tests use 5173. Allow production origins explicitly. HTTPS frontends require HTTPS API/assets to avoid mixed-content blocking. No Vite API proxy is configured.

## 3. Exact JSON payload schemas

The following TypeScript-style schema describes the JSON wire format, including all currently consumed fields. `?` means omit the key when unavailable, NOT send null. Numbers must be finite JSON numbers, not formatted strings. Objects/arrays must not be null. No pagination envelope is supported. Additional fields are not used by this frontend; current runtime guards validate the main shape but are not exhaustive JSON Schema validators, so the backend must honor all field types.

```typescript
type Coordinate = {
  longitude: number;
  latitude: number;
  height?: number;
};

type Provenance = {
  source: string;
  classification: 'real' | 'derived' | 'simulated';
};

type Region = {
  id: string;
  name: string;
  center: Coordinate;
  description: string;
};

type Target = {
  id: string;
  name: string;
  coordinates: Coordinate;
  provenance: Provenance;
  imageUrl?: string;
  context?: string;
  anomalyScore?: number;
  uncertainty?: number;
  priority?: number;
  explanation?: string;
};

type Layer = {
  id: string;
  name: string;
  kind: 'imagery' | 'terrain' | 'geology' | 'rover' | 'targets' | 'risk';
  status: 'available' | 'loading' | 'unavailable' | 'error';
  provenance: Provenance;
  geojson?: object;
  tilesetUrl?: string;
  message?: string;
};

type Route = {
  id: string;
  name: string;
  coordinates: Coordinate[];
  distanceMeters: number;
  difficulty: string;
  simulatedResourceCost: number;
  resourceUnit: string;
  explanation: string;
  provenance: Provenance;
};

type Experiment = {
  id: string;
  name: string;
  modelVersion: string;
  status: string;
  updatedAt: string;
  metrics: Record<string, number>;
  family: 'three-ghosts' | 'false-alarm' | 'other';
};

type MissionResponse = {
  region: Region;
  targets: Target[];
  layers: Layer[];
};

type RouteRequest = {
  regionId: string;
  start: Coordinate;
  destination: Coordinate;
  targetIds: string[];
};

type RouteResponse = { routes: Route[] };
type ExperimentResponse = { experiments: Experiment[] };
```

### Field semantics, constraints, and expected units

- IDs are nonempty strings. Target IDs, layer IDs, route IDs, and experiment IDs must each be unique within their returned collection. Target IDs `route-start` and `route-end` are reserved for the map's endpoint entities. Avoid layer ID `scientific-targets`, reserved for the catalog toggle.
- `region.id` is sent back as `RouteRequest.regionId`. Mission supplies exactly one initial region. A successful mission response replaces the provisional region. Keep the region ID stable for the same region; camera recentering is keyed to that ID.
- `source` identifies the actual dataset/product/model or derivation, including revision/model and attribution where appropriate. Classification is descriptive, not automatic validation: real = source observations; derived = processed/inferred output; simulated = modeled or illustrative values. Do not label model output as a raw observation.
- `imageUrl`: absolute HTTP(S) browser-loadable URL. Omit if absent; other schemes are rejected for display. Source attribution is the target's provenance. The app does not proxy images or add private headers. A failed image is hidden; there is no rich image-retry UI.
- `anomalyScore` and `uncertainty`: raw dimensionless numeric values on a BACKEND-DEFINED scale; no [0,1] normalization or calibration is enforced. Backend must state scale, uncertainty meaning, and limitations in `context`/`explanation`. These values are not scientific proof or a probability unless the backend justifies that interpretation. Omit absent results; do not substitute zero.
- `priority`: backend ranking; convention 1 = highest priority, increasing positive integers. Catalog sorts ascending; omitted values sort last. Current client only enforces finite numeric values, not integer/range rules. No priority recomputation is performed.
- `difficulty`: backend-defined human-readable terrain category; no frontend numeric interpretation or units.
- `distanceMeters`: finite nonnegative meters, computed by backend. UI converts to kilometers and formats to at most three decimal places. Do not return kilometers in this field.
- `simulatedResourceCost`: finite nonnegative value, explicitly a simulation, with its unit in `resourceUnit` (for example, a backend-agreed energy unit). There is no frontend unit conversion or assumed currency/energy model. Explain assumptions in route `explanation`. Route provenance must not conceal that this cost is simulated even if geometry is derived from real data.
- `Route.coordinates`: >=2 points, ordered start to destination, including endpoints. Return alternatives in preferred order; first is initially selected. `routes: []` means no feasible route. The UI currently sends either `targetIds: []` or the one selected target ID; it is not a multi-target selection workflow. Backend owns waypoint selection, distance, feasibility, target prioritization, and resource modeling.
- `Experiment.status`: free text for training/evaluation state, displayed verbatim; not an instruction for frontend polling. `modelVersion` is a display identifier, not a download URL. `updatedAt` should be an ISO 8601 timestamp with timezone (prefer UTC); the client displays it as supplied and only validates it as a string.
- `metrics`: metric-name to finite numeric raw value. Include units/meaning in human-readable metric keys where needed (for example a name indicating milliseconds), and use consistent scales across compared experiments. Graphics clip to a labeled 0–1 display scale, but show raw numbers; this is NOT automatic normalization. Missing metrics are omitted, not invented. There is no structured experiment-provenance field in the frozen schema; backend must provide traceable experiment IDs/model versions and retain the underlying evidence externally.

## 4. Coordinate reference system and map geometry

All `Coordinate` objects and inline overlay coordinates use this explicit frontend convention:

| Item | Required convention |
| --- | --- |
| Body | Mars, never Earth/WGS84 |
| Ellipsoid | CesiumJS 1.146.0 `Ellipsoid.MARS`: radii X/Y/Z = 3,396,190 / 3,396,190 / 3,376,200 meters |
| Latitude | Planetographic/geodetic degrees, north-positive, [-90,90] |
| Longitude | East-positive degrees, [-180,180]; backend converts any 0–360 input |
| Height | Meters above this ellipsoid, NOT MOLA areoid elevation |
| JSON objects | Named longitude/latitude keys; not an unnamed lat/lon array |
| Inline GeoJSON positions | [longitude, latitude, optional ellipsoidHeightMeters] |
| 3D Tiles | Mars-centered Cartesian coordinates/transforms consistent with the ellipsoid and source asset frame; do not deliver Earth-centered tiles |

This is a Mars-specific GeoJSON-like transport convention, NOT a declaration that Mars coordinates are RFC 7946 Earth WGS84. Send a FeatureCollection, Feature, or supported geometry with the stated Mars coordinates and no conflicting Earth/custom `crs` declaration. Do not attach EPSG:4326 to imply Earth data. Cesium's default ellipsoid is set to Mars before loading the objects. Backend must explicitly transform planetocentric latitudes, source projections, longitudes, and vertical datums before delivery. Do not simply relabel planetocentric latitude or areoid elevations. No verified source-data transformation pipeline has been exercised here.

Cesium's advertised Mars source dataset CRS is IAU_2015:49901. That source label alone does not establish that its input coordinates match this frontend's planetographic/ellipsoid-height contract. Backend/data team must validate the source-to-client transforms and alignment against control points on the authenticated asset before scientific signoff.

Omitted height is rendered as zero; that is a geometric default, not a measured elevation. Markers receive a 30 m visual offset and disable depth occlusion; route waypoints receive a 40 m visual offset, and the route is NOT ground-clamped. Those are visualization choices, not safe-clearance estimates. Backend must supply adequate heights and verify alignment; visible markers do not prove correct surface registration. Map picks use tile depth where available, otherwise the reference ellipsoid. Picking in fallback mode does not measure terrain or traversability. UI formatting to three decimals does not change the full coordinates sent in requests.

## 5. Layer delivery and limitations

- One visible overlay toggle per kind imagery, terrain, geology, rover, risk: the UI uses the FIRST returned layer of each kind. Supply at most one entry per displayed kind for this frozen integration. `kind: 'targets'` is accepted by the type but has no independent layer toggle; deliver scientific markers through `targets[]`, not a targets layer.
- Status `available` enables a checkbox only if `geojson` or `tilesetUrl` is supplied. `loading`, `unavailable`, and `error` are disabled and displayed with provenance and optional `message`. There is no layer-status polling; Sync data reloads mission state.
- `geojson`: inline object, loaded as Mars-coordinate geometry, with generic orange styles and no ground clamping. This is suitable for vector footprints/units/estimates, not a raster image. `tilesetUrl`: absolute HTTP(S) tileset root, loaded as Cesium 3D Tiles. If both fields are supplied both are loaded. Prefer one format per layer.
- All remote tiles, linked binary resources, textures, and nested tilesets must be browser-accessible with correct CORS and MIME types. No private authorization headers, frontend asset proxy, WMTS/raster adapter, rover image gallery, or geological legend schema exists.
- Backend-provided overlays are initially disabled. The scientific-target catalog toggle is enabled by default even if its catalog is empty.
- Cesium Mars orbital imagery and elevation are bundled in ONE base 3D Tiles asset. It loads automatically when an ion token is set. The extra backend imagery/terrain controls are overlay controls, not independent switches for the bundled Cesium surface.
- Overlay load failures have a map error label. Later streaming/tile failures, unknown source conventions, absent waypoint heights, or mismatched units still require actual integration validation; do not treat object creation or a visible tile as scientific verification.

## 6. Environment and Cesium ion requirements

Template: `.env.example`; local values go in ignored `.env.local`. No secret values are included in this handoff.

| Variable/config | Default | Required behavior |
| --- | --- | --- |
| `VITE_API_BASE_URL` | `http://localhost:8000` | Actual Python API origin/base prefix; paths from section 2 are appended |
| `VITE_CESIUM_ION_TOKEN` | Empty | Public browser token with least-privilege/read-only asset access; empty intentionally uses reference geometry |
| `VITE_CESIUM_MARS_ASSET_ID` | `3644333` | Numeric Cesium Mars 3D Tiles asset ID, or an explicitly approved equivalent Mars asset |
| `PLAYWRIGHT_PREVIEW` | Unset | Test-runner-only; `1` runs browser tests against built dist via preview, otherwise dev server. Not an app or backend setting |
| `CESIUM_BASE_URL` | `/cesium` in vite.config.ts | Build constant, NOT an environment variable. Static-copy plugin serves Workers, ThirdParty, Assets, Widgets under this root |

VITE variables are embedded into public browser code at build time. Restart dev server after changing them; rebuild/redeploy production assets after changing them. A deployed default localhost API points at the end user's machine, not the deployment's backend. Do not place private keys, admin/service-role tokens, or backend secrets in VITE settings. No other backend environment variables are read by the frontend.

Cesium setup: obtain ion account/asset access, grant the browser token access to the selected Mars asset, restrict the token to allowed origins using the account's supported controls, and retain Cesium/source attribution. Token and asset requests must work from the browser's actual origin. Serve copied `/cesium` assets alongside the bundle at the site root; subpath deployment has not been configured/verified. Do not hide the Cesium credit display.

Provider documentation reviewed: https://cesium.com/platform/cesium-ion/content/cesium-mars/ . Provider describes Viking imagery, NASA MOLA / ESA HRSC terrain, and regional Jezero/Gale products. This description is not evidence that our app fetched or scientifically validated those products. Alternate asset provenance must be checked separately; the frozen map's base-asset status text assumes Cesium Mars.

Without a token, or when initial asset creation fails, the app presents a rust-colored Mars reference ellipsoid plus mathematical grid, explicitly labeled as reference geometry/no measured elevation. It is not NASA imagery or synthetic NASA terrain. Authenticated tile streaming has NOT been tested.

## 7. Complete fixture and placeholder inventory

| Location | Data/behavior | Used where |
| --- | --- | --- |
| `src/api.ts`, `provisionalRegion` | ID provisional-jezero, name Jezero crater, longitude 77.58, latitude 18.44, description awaiting data-team confirmation | Runtime initial navigation reference in `src/main.tsx`; replaced on successful mission response. These are approximate navigation values, not a source-datum-validated center or data-team choice |
| `src/main.tsx`, initial mission/experiments/routes state | Empty arrays, no generated targets, routes, scores, or training results | Runtime loading/offline/empty state; not sample science |
| `src/MarsViewer.tsx`, GridImageryProvider and base color | Mathematical coordinate grid and colored reference ellipsoid; marker/route visual offsets described above | Runtime fallback renderer; not real imagery, DEM, or scientific inference |
| `src/main.tsx`, layerKinds and display placeholders | Static expected layer names/source hints and messages such as unavailable/not available | Runtime interface labels only; not proof that those datasets are connected |
| `tests/workspace.spec.ts`, offline test | Aborts all matching /api/ requests | Playwright ONLY; checks offline labeling, route disabling, empty lab, local report download |
| `tests/workspace.spec.ts`, fixture test mission handler | Region test / TEST FIXTURE Jezero at 18.44,77.58; target test-target / SIMULATED TEST TARGET; score 0.42, uncertainty 0.9, rank 1, simulated provenance, no overlays | Playwright ONLY via page.route interception of GET /api/mission; not a runtime fallback |
| `tests/workspace.spec.ts`, fixture experiment handler | SIMULATED TEST EXPERIMENT, model test-only, status test fixture, timestamp 2026-01-01, false-alarm family, testMetric 0.2 | Playwright ONLY interception of GET /api/experiments; no actual training/evaluation |
| `tests/workspace.spec.ts`, fixture route handler | TEST A/B, points 18.44,77.58 to 18.45,77.59, distances 100/101 m, difficulty TEST ONLY, cost 2 test-units, simulated provenance | Playwright ONLY interception of POST /api/routes; no optimization/safety validation |
| `src/api.test.ts` | Coordinate/range examples, example.org URL-safety string, stubbed fetch responses for HTTP 503, invalid mission/route/experiment payloads, empty routes, SIMULATED TEST REGION, and AbortError | Node unit tests ONLY; original fetch restored after test. No external image fetched by the URL test |

There is no runtime mock-server switch, fixture JSON dataset, hardcoded successful AI analysis, real target catalog, or successful training history in the application. Test modules are not imported by the app entry point. Automated Playwright success tests WILL intercept requests even if a real backend is running; they are not a backend acceptance test. The fresh application makes actual fetch requests and shows explicit absence/failure when services are not available.

## 8. Unavailable-service behavior and known boundaries

- Mission and experiment requests start in parallel on mount and Sync data, sharing a 15-second abort deadline. Failure of one endpoint does not by itself reject the other's result. Network/CORS failures, non-2xx responses, invalid JSON, and rejected payloads are handled as error states. No automatic retry, polling, or backoff; user can Sync data.
- On initial mission failure: reference mode banner, provisional region, empty catalog, no fabricated analysis, route submission disabled. Map navigation and reference coordinate picking remain available if WebGL works. The global service indicator describes mission connectivity, not proof of healthy experiments/imagery.
- On initial experiment failure: no invented records, lab shows unavailable/error details. Mission/map can still function if the mission endpoint succeeded.
- Route requests have a 30-second deadline, disable duplicate submission, show errors, and accept empty alternatives as no feasible route. Changing endpoints/selected target or syncing cancels the current request and invalidates its route. No local route optimizer substitutes an answer.
- If a previously successful mission or experiment refresh fails, prior mission/experiment records are RETAINED in memory; the connection/error state changes but those records are not individually timestamped or labeled stale. Do not interpret retained records as refreshed/verified. Reloading the page resets the in-memory state. This is a documented existing limitation, not a new persistence feature.
- Invalid/missing scientific optional values should be omitted, not null; frontend missing-value handling is not a complete defense against arbitrary malformed payloads. Backend remains responsible for the exact schema.
- Offline behavior was verified in Edge against aborted API calls on both dev and production-preview servers. Unit tests cover HTTP 503, rejected payloads, and abort propagation. Live-service timeout/CORS/recovery scenarios and every failure branch have not all been browser-tested.

## 9. Exact backend integration and acceptance sequence

1. Backend team acknowledges this frozen contract and supplies actual service origin, CORS origins, any auth requirements, initial region ID/name, source datasets, transformations/datum documentation, score/uncertainty meanings, resource units, and representative real experiment records. Raise mismatches before changing frontend scope.
2. Implement the three paths and exact envelopes in sections 2–3. Return empty arrays/unavailable layer states honestly while science results do not exist. Confirm API GETs work independently and JSON POST/preflight are allowed. Do not expose fake success results to make the UI look populated.
3. Convert source coordinates to section 4's Mars convention; validate known control points, not just latitude/longitude ranges. Return source provenance and ensure derived/simulated products are correctly labeled. Supply waypoint heights rather than relying on zero-height defaults.
4. Publish source images and supported overlays with usable HTTP(S) URLs, CORS, correct content types, and attribution. Provide one overlay per visible kind, explicit availability statuses, and no private-browser header requirement. Keep targets in the catalog response.
5. Configure `.env.local` from `.env.example` only if it does not already exist; set API origin and approved public ion token/asset. Never overwrite an existing local environment file blindly. Do not send token values in handoff messages.
6. Keep the verified dependency lock and WASM/Cesium overrides unchanged. Run `npm install` (or the team's locked install procedure), `npm test`, `npm run typecheck`, `npm run build`. Start `npm run dev`; for the actual production integration, rebuild with intended VITE values and run `npm run preview` locally or deploy the built assets including `/cesium`.
7. Use a NORMAL browser session without Playwright interception. Verify network requests hit the actual backend origin and return the real region/targets/layers. Record service revision, response IDs, source product revisions, coordinate/height alignment, browser/origin, and timestamps; do not record secrets. Confirm it is no longer the provisional or simulated test region.
8. With a valid ion token, verify real tiles/textures load and attribution appears. Compare source control points, target imagery, surface registration, overlays, and waypoint heights to the underlying data. Have the science team sign off on datum and provenance. A tile-loader status string alone is insufficient.
9. Select an actual target, inspect returned imagery/context/raw scores/rank, set start/destination, request a route, inspect POST body and backend response, select alternatives if supplied, and compare distance/resource units/rationale with backend outputs. No traversal safety claim without science/backend review.
10. Inspect real Three Ghosts / False Alarm records against model/evaluation evidence. If no experiments exist, verify empty states instead of assuming success. Export a local mission JSON snapshot and confirm it reflects current source identities, not a server archive.
11. In a controlled integration session, test service unavailable/503, invalid contract response, slow request timeout, CORS misconfiguration, empty routes/experiments, and recovery through Sync data. Check the retained-data limitation after refresh failure. These are acceptance steps to perform, not claims already verified against the real service.
12. Record exact actual-backend/source results and remaining issues in PROGRESS.md. Keep existing fixture tests as regression tests (`npm run test:e2e`, then PLAYWRIGHT_PREVIEW=1 against a fresh build), explicitly separate from live acceptance. Stop and agree a narrowly scoped compatibility change if the service cannot meet the frozen schema; no feature expansion is implied.

## 10. Remaining integration blockers / deferred scope

Awaiting backend acceptance/service access, initial real-region confirmation, valid browser ion token/asset access, datum/control-point alignment, real source imagery/overlays/targets/routes/experiments, and agreement on auth/score/resource semantics. None is satisfied by fixture tests. Native Rollup remains blocked by Windows policy but the verified official WASM configuration removes that frontend build blocker; do not alter policy.

Frozen limitations: no raster/WMTS adapters, no independently switchable imagery/elevation inside Cesium Mars, no backend mission-report persistence, no multi-target selection UI, no structured experiment provenance schema or universal metric normalization, no stale-record timestamps, and no verified mobile/other-browser support. The non-fatal large Cesium JS bundle warning remains. These are not tasks to implement now. Frontend is paused pending backend integration.
