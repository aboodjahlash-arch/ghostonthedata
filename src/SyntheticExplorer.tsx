import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import * as C from 'cesium';
import 'cesium/Build/Cesium/Widgets/widgets.css';
import { createSyntheticMission, restoreSyntheticMission, terrainCoordinates, terrainHeightAt, type ExplorerSnapshot, type SyntheticMission, type SyntheticTerrain, type TerrainCellPosition } from './synthetic';
import SensorEvidence from './SensorEvidence';
import ResearchPanel from './ResearchPanel';
import type { ResearchObservation, ResearchResult } from './research.ts';

const panel: CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 320px), 1fr))', alignItems: 'start', gap: 14, minHeight: 680, color: '#e8f0ee', fontFamily: 'Inter, system-ui, sans-serif' };
const mapWrap: CSSProperties = { position: 'sticky', top: 16, height: 680, minHeight: 680, overflow: 'hidden', borderRadius: 18, border: '1px solid #31413d', background: '#07100f' };
const map: CSSProperties = { position: 'absolute', inset: 0 };
const overlay: CSSProperties = { position: 'absolute', left: 14, top: 14, display: 'flex', gap: 8, flexWrap: 'wrap', pointerEvents: 'none' };
const tag: CSSProperties = { padding: '7px 10px', borderRadius: 999, background: 'rgba(7, 16, 15, 0.78)', border: '1px solid rgba(170, 220, 203, 0.22)', fontSize: 11, letterSpacing: 0.8, fontWeight: 700 };
const controls: CSSProperties = { display: 'grid', gap: 14, alignContent: 'start' };
const card: CSSProperties = { padding: 16, borderRadius: 16, background: '#101917', border: '1px solid #2b3d38', boxShadow: '0 14px 42px rgba(0,0,0,0.2)' };
const input: CSSProperties = { width: '100%', boxSizing: 'border-box', padding: '10px 12px', borderRadius: 10, border: '1px solid #40544e', background: '#07100f', color: '#e8f0ee', outline: 'none' };
const button: CSSProperties = { border: 0, borderRadius: 10, padding: '10px 12px', color: '#07100f', background: '#95cfae', fontWeight: 800, cursor: 'pointer' };
const secondary: CSSProperties = { ...button, color: '#dbe8e4', background: '#263831' };
const disabled: CSSProperties = { opacity: 0.45, cursor: 'not-allowed' };
const metricGrid: CSSProperties = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 };
const metric: CSSProperties = { padding: 11, borderRadius: 12, background: '#0a1211', border: '1px solid #263732' };
const small: CSSProperties = { display: 'block', marginBottom: 4, color: '#8fa9a1', fontSize: 10, letterSpacing: 1.2, textTransform: 'uppercase' };
const eventList: CSSProperties = { display: 'grid', gap: 8, maxHeight: 246, overflowY: 'auto', margin: 0, padding: 0, listStyle: 'none' };
const disclaimer: CSSProperties = { margin: 0, color: '#a9c0b9', fontSize: 12, lineHeight: 1.5 };

function localToWorld(model: C.Matrix4, terrain: SyntheticTerrain, point: TerrainCellPosition, lift = 8): C.Cartesian3 {
  return C.Matrix4.multiplyByPoint(model, new C.Cartesian3(point.x, point.z, terrainHeightAt(terrain, point.x, point.z) + lift), new C.Cartesian3());
}

function makeTerrainPrimitive(terrain: SyntheticTerrain, model: C.Matrix4): C.Primitive {
  const positions = new Float64Array(terrain.heights.length * 3);
  const textureCoordinates = new Float32Array(terrain.heights.length * 2);
  for (let index = 0; index < terrain.heights.length; index++) {
    const point = terrainCoordinates(terrain, index);
    positions[index * 3] = point.x;
    positions[index * 3 + 1] = point.z;
    positions[index * 3 + 2] = terrain.heights[index];
    textureCoordinates[index * 2] = point.x / terrain.sizeMeters + 0.5;
    textureCoordinates[index * 2 + 1] = point.z / terrain.sizeMeters + 0.5;
  }
  const indices = new Uint32Array((terrain.resolution - 1) * (terrain.resolution - 1) * 6);
  let cursor = 0;
  for (let row = 0; row < terrain.resolution - 1; row++) {
    for (let column = 0; column < terrain.resolution - 1; column++) {
      const a = row * terrain.resolution + column;
      const b = a + 1;
      const c = a + terrain.resolution;
      const d = c + 1;
      indices[cursor++] = a;
      indices[cursor++] = c;
      indices[cursor++] = b;
      indices[cursor++] = b;
      indices[cursor++] = c;
      indices[cursor++] = d;
    }
  }
  const attributes = new C.GeometryAttributes();
  attributes.position = new C.GeometryAttribute({ componentDatatype: C.ComponentDatatype.DOUBLE, componentsPerAttribute: 3, values: positions });
  attributes.st = new C.GeometryAttribute({ componentDatatype: C.ComponentDatatype.FLOAT, componentsPerAttribute: 2, values: textureCoordinates });
  let geometry = new C.Geometry({ attributes, indices, primitiveType: C.PrimitiveType.TRIANGLES, boundingSphere: new C.BoundingSphere(new C.Cartesian3(0, 0, (terrain.minHeight + terrain.maxHeight) / 2), terrain.sizeMeters) });
  geometry = C.GeometryPipeline.computeNormal(geometry);
  const material = new C.Material({ fabric: { type: 'GhostSyntheticSurface', source: `
    czm_material czm_getMaterial(czm_materialInput inputData) {
      czm_material surface = czm_getDefaultMaterial(inputData);
      vec2 uv = inputData.st;
      float grain = fract(sin(dot(floor(uv * 1800.0), vec2(12.9898, 78.233))) * 43758.5453);
      float bands = 0.5 + 0.5 * sin(uv.x * 40.0 + sin(uv.y * 16.0) * 3.0);
      float sand = smoothstep(0.25, 0.8, sin(uv.x * 8.0) * cos(uv.y * 9.0));
      surface.diffuse = mix(vec3(0.31, 0.20, 0.15), vec3(0.61, 0.40, 0.26), bands * 0.45 + sand * 0.4) * (0.85 + grain * 0.25);
      surface.specular = 0.0;
      surface.alpha = 1.0;
      return surface;
    }` } });
  return new C.Primitive({ geometryInstances: new C.GeometryInstance({ geometry }), appearance: new C.MaterialAppearance({ material, materialSupport: C.MaterialAppearance.MaterialSupport.TEXTURED, translucent: false, closed: false, faceForward: true }), modelMatrix: model, allowPicking: false, asynchronous: false });
}

function colorMaterial(hex: string, alpha = 1): C.Material {
  const material = C.Material.fromType('Color');
  material.uniforms.color = C.Color.fromCssColorString(hex).withAlpha(alpha);
  return material;
}

export default function SyntheticExplorer() {
  const container = useRef<HTMLDivElement>(null);
  const viewer = useRef<C.Viewer | null>(null);
  const points = useRef<C.PointPrimitiveCollection | null>(null);
  const lines = useRef<C.PolylineCollection | null>(null);
  const model = useRef(C.Matrix4.IDENTITY.clone());
  const [mission, setMission] = useState<SyntheticMission>(() => createSyntheticMission('ghost-synthetic'));
  const [snapshot, setSnapshot] = useState<ExplorerSnapshot>(() => mission.snapshot());
  const [seed, setSeed] = useState('ghost-synthetic');
  const [running, setRunning] = useState(false);
  const [tracking, setTracking] = useState(false);
  const [researchResult, setResearchResult] = useState<ResearchResult>();
  const [storageStatus, setStorageStatus] = useState('Checkpoints are browser-local and versioned; no backend database sync.');
  const [rendererStatus, setRendererStatus] = useState('Initializing synthetic 3D renderer');
  const [rendererReady, setRendererReady] = useState(false);
  const completed = !['ready', 'exploring'].includes(snapshot.status);
  const latestObservation = snapshot.observations.find(o => o.captureId === snapshot.captures.at(-1)?.id);
  const featureCounts = useMemo(() => snapshot.observations.reduce<Record<string, number>>((counts, observation) => { counts[observation.feature] = (counts[observation.feature] || 0) + 1; return counts; }, {}), [snapshot.observations]);
  const researchObservations = useMemo<ResearchObservation[]>(() => [...snapshot.observations]
    .sort((a, b) => b.observedAt - a.observedAt || b.novelty - a.novelty).slice(0, 8).map(o => ({
      observation_id: o.captureId, source: 'synthetic',
      summary: `Model-predicted ${o.feature} morphology at local (${o.x}, ${o.z}) m; tick ${o.observedAt}. Not a geological identification.`,
      model_method: `${snapshot.model.version} / ${snapshot.model.method}`,
      provenance: `World ${snapshot.seed}; idealized synthetic orthographic depth observation; not NASA data.`,
      uncertainty: `Uncalibrated distance-ratio heuristic ${o.uncertainty.toFixed(4)}. ${snapshot.model.limits}`,
      features: [
        { name: 'center_depth_height', value: o.height, unit: 'local meters', kind: 'measurement' },
        { name: 'conservative_depth_gradient', value: o.slope, unit: 'rise/run', kind: 'model_prediction' },
        { name: 'anomaly_score', value: o.anomalyScore, unit: 'standardized feature distance, not probability', kind: 'model_prediction' }
      ]
    })), [snapshot.observations, snapshot.model, snapshot.seed]);

  useEffect(() => {
    if (!container.current) return;
    let created: C.Viewer;
    try {
      created = new C.Viewer(container.current, { globe: new C.Globe(C.Ellipsoid.MARS), baseLayer: false, baseLayerPicker: false, geocoder: false, sceneModePicker: false, animation: false, timeline: false, homeButton: false, navigationHelpButton: false, fullscreenButton: false, selectionIndicator: false, infoBox: false, requestRenderMode: true });
    } catch {
      setRendererStatus('WebGL renderer unavailable. Controls and deterministic telemetry remain available.');
      return;
    }
    viewer.current = created;
    created.scene.globe.show = false;
    created.scene.backgroundColor = C.Color.fromCssColorString('#06100f');
    created.scene.screenSpaceCameraController.enableTilt = true;
    if (created.scene.skyAtmosphere) created.scene.skyAtmosphere.show = false;
    if (created.scene.skyBox) created.scene.skyBox.show = false;
    if (created.scene.sun) created.scene.sun.show = false;
    if (created.scene.moon) created.scene.moon.show = false;
    model.current = C.Transforms.eastNorthUpToFixedFrame(C.Cartesian3.fromDegrees(0, 0, 0, C.Ellipsoid.MARS));
    points.current = created.scene.primitives.add(new C.PointPrimitiveCollection());
    lines.current = created.scene.primitives.add(new C.PolylineCollection());
    created.camera.lookAtTransform(model.current, new C.HeadingPitchRange(0, C.Math.toRadians(-55), 1900));
    created.camera.lookAtTransform(C.Matrix4.IDENTITY);
    setRendererReady(true);
    setRendererStatus('Cesium mesh active · deterministic synthetic terrain only');
    return () => {
      points.current = null;
      lines.current = null;
      viewer.current = null;
      if (!created.isDestroyed()) created.destroy();
    };
  }, []);

  useEffect(() => {
    const activeViewer = viewer.current;
    if (!activeViewer || !rendererReady) return;
    const primitive = makeTerrainPrimitive(mission.terrain, model.current);
    activeViewer.scene.primitives.add(primitive);
    activeViewer.scene.requestRender();
    return () => { if (!activeViewer.isDestroyed()) activeViewer.scene.primitives.remove(primitive); };
  }, [mission, rendererReady]);

  useEffect(() => {
    if (!running || completed) return;
    const timer = window.setInterval(() => setSnapshot(mission.step()), 90);
    return () => window.clearInterval(timer);
  }, [mission, running, completed]);

  useEffect(() => {
    const activePoints = points.current;
    const activeLines = lines.current;
    const activeViewer = viewer.current;
    if (!activeViewer || !activePoints || !activeLines || !rendererReady) return;
    activePoints.removeAll();
    activeLines.removeAll();
    const toWorld = (point: TerrainCellPosition, lift = 10) => localToWorld(model.current, mission.terrain, point, lift);
    const maxObservationMarkers = 900;
    const observationStride = Math.max(1, Math.ceil(snapshot.observations.length / maxObservationMarkers));
    snapshot.observations.forEach((observation, index) => {
      if (index % observationStride !== 0) return;
      activePoints.add({ position: toWorld(observation, 7), pixelSize: observation.hazard ? 6 : 3, color: observation.hazard ? C.Color.fromCssColorString('#ff685e') : C.Color.fromCssColorString('#5bd5bc').withAlpha(0.42), disableDepthTestDistance: Number.POSITIVE_INFINITY });
    });
    if (snapshot.path.length > 1) activeLines.add({ positions: snapshot.path.map(point => toWorld(point, 18)), width: 4, material: colorMaterial('#ffb36b') });
    if (snapshot.plannedRoute.length > 1) activeLines.add({ positions: snapshot.plannedRoute.map(point => toWorld(point, 24)), width: 2, material: colorMaterial('#8ac7ff', 0.85) });
    if (snapshot.frontier) activePoints.add({ position: toWorld(snapshot.frontier, 30), pixelSize: 12, color: C.Color.fromCssColorString('#f6df5f'), outlineColor: C.Color.BLACK, outlineWidth: 2, disableDepthTestDistance: Number.POSITIVE_INFINITY });
    activePoints.add({ position: toWorld(snapshot.pose, 34), pixelSize: 17, color: C.Color.fromCssColorString('#ffffff'), outlineColor: C.Color.fromCssColorString('#65e0bd'), outlineWidth: 4, disableDepthTestDistance: Number.POSITIVE_INFINITY });
    const nose = { x: snapshot.pose.x + Math.cos(snapshot.pose.headingRadians) * 30, z: snapshot.pose.z + Math.sin(snapshot.pose.headingRadians) * 30 };
    activeLines.add({ positions: [toWorld(snapshot.pose, 34), toWorld(nose, 34)], width: 3, material: colorMaterial('#ffffff') });
    const roverHeight = terrainHeightAt(mission.terrain, snapshot.pose.x, snapshot.pose.z);
    const place = (id: string, forward: number, sideways: number, height: number, dimensions: C.Cartesian3, color: C.Color) => {
      const a = snapshot.pose.headingRadians;
      const local = new C.Cartesian3(snapshot.pose.x + Math.cos(a) * forward - Math.sin(a) * sideways, snapshot.pose.z + Math.sin(a) * forward + Math.cos(a) * sideways, roverHeight + height);
      const position = C.Matrix4.multiplyByPoint(model.current, local, new C.Cartesian3());
      const entity = activeViewer.entities.getById(id) || activeViewer.entities.add({ id, ...(id.startsWith('wheel-') ? { ellipsoid: { radii: new C.Cartesian3(0.8, 0.4, 0.8), material: color } } : { box: { dimensions, material: color } }) });
      entity.position = new C.ConstantPositionProperty(position);
      entity.orientation = new C.ConstantProperty(C.Transforms.headingPitchRollQuaternion(position, new C.HeadingPitchRoll(-a, 0, 0), C.Ellipsoid.MARS));
    };
    place('synthetic-rover', 0, 0, 2.5, new C.Cartesian3(5, 3.5, 1.5), C.Color.LIGHTGRAY);
    place('synthetic-mast', 1.2, 0, 4.5, new C.Cartesian3(0.3, 0.3, 3), C.Color.SILVER);
    place('synthetic-camera', 1.2, 0, 6, new C.Cartesian3(1.1, 0.6, 0.5), C.Color.DARKSLATEGRAY);
    for (const x of [-1.8, 0, 1.8]) for (const y of [-2, 2]) place(`wheel-${x}-${y}`, x, y, 1, new C.Cartesian3(1.3, 0.8, 1.6), C.Color.fromCssColorString('#242828'));
    activeViewer.scene.requestRender();
  }, [snapshot, mission, rendererReady]);

  const reset = (nextSeed = seed) => {
    try {
      const next = createSyntheticMission(nextSeed || 'ghost-synthetic');
      setMission(next);
      setSnapshot(next.snapshot());
      setRunning(false);
      setTracking(false);
      if (viewer.current) viewer.current.trackedEntity = undefined;
    } catch (e) { setStorageStatus(e instanceof Error ? e.message : 'World reset failed'); }
  };

  return <section style={panel} aria-label="Deterministic synthetic exploration sandbox">
    <div style={mapWrap}>
      <div ref={container} style={map} aria-label="Cesium rendering of algorithmically generated synthetic terrain" />
      <div style={overlay}>
        <span style={tag}>SYNTHETIC TERRAIN · NOT MEASURED MARS DATA</span>
        <span style={tag}>{snapshot.status.toUpperCase()}</span>
        <span style={tag}>AUTONOMOUS / {snapshot.phase.toUpperCase()}</span>
        <span style={tag}>{rendererStatus.toUpperCase()}</span>
      </div>
    </div>
    <aside style={controls}>
      <div style={card}>
        <span style={small}>Deterministic seed</span>
        <input aria-label="Synthetic terrain seed" maxLength={200} style={input} value={seed} onChange={event => setSeed(event.currentTarget.value)} />
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
          <button style={{ ...button, ...(running || completed ? disabled : {}) }} disabled={running || completed} onClick={() => setRunning(true)}>Start</button>
          <button style={{ ...secondary, ...(!running ? disabled : {}) }} disabled={!running} onClick={() => setRunning(false)}>Pause</button>
          <button style={secondary} onClick={() => reset()}>Reset</button>
          <button style={secondary} onClick={() => { const entity = viewer.current?.entities.getById('synthetic-rover'); if (entity) void viewer.current?.flyTo(entity, { offset: new C.HeadingPitchRange(0, -0.5, 80) }); }}>Focus rover</button>
          <button style={secondary} onClick={() => { const v = viewer.current; if (!v) return; v.trackedEntity = tracking ? undefined : v.entities.getById('synthetic-rover'); setTracking(!tracking); }}> {tracking ? 'Free camera' : 'Track rover'}</button>
          <button style={secondary} onClick={() => { const v = viewer.current; if (!v) return; v.trackedEntity = undefined; setTracking(false); v.camera.lookAtTransform(model.current, new C.HeadingPitchRange(0, C.Math.toRadians(-55), 1900)); v.camera.lookAtTransform(C.Matrix4.IDENTITY); v.scene.requestRender(); }}>Overview</button>
        </div>
      </div>
      <div style={card}>
        <span style={small}>Autonomous perception and investigation</span>
        <p>{snapshot.phase} / {snapshot.stopReason || 'Decisions from observed depth, learned morphology, target ranking and safe graph search.'}</p>
        <div style={metricGrid}>
          <div style={metric}><span style={small}>Coverage</span><strong>{(snapshot.coverage * 100).toFixed(1)}%</strong></div>
          <div style={metric}><span style={small}>Simulated energy units</span><strong>{snapshot.energy.toFixed(0)} / {snapshot.energyMax}</strong></div>
          <div style={metric}><span style={small}>Distance</span><strong>{snapshot.distanceMeters.toFixed(0)} m</strong></div>
          <div style={metric}><span style={small}>Tick</span><strong>{snapshot.tick}</strong></div>
          <div style={metric}><span style={small}>Known cells</span><strong>{snapshot.knownCells} / {snapshot.totalCells}</strong></div>
          <div style={metric}><span style={small}>Hazards</span><strong>{snapshot.hazards.length}</strong></div>
          <div style={metric}><span style={small}>Completed investigations</span><strong>{snapshot.investigations.filter(i => i.status === 'completed').length}</strong></div>
          <div style={metric}><span style={small}>Failed investigations</span><strong>{snapshot.investigations.filter(i => i.status === 'failed').length}</strong></div>
        </div>
      </div>
      <div style={card}>
        <span style={small}>ML-predicted morphology, not ground truth</span>
        <p>{snapshot.model.version} · {snapshot.model.trainingSamples} independent synthetic training samples</p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {['ridge', 'crater', 'valley', 'plain'].map(name => <span key={name} style={tag}>{name.toUpperCase()} {featureCounts[name] || 0}</span>)}
        </div>
      </div>
      <div style={card}>
        <SensorEvidence capture={snapshot.captures.at(-1)}/>
        {latestObservation && <p>Predicted morphology: {latestObservation.feature}.
          Anomaly score: {latestObservation.anomalyScore.toFixed(4)} standardized feature distance (not probability).
          Uncertainty: {latestObservation.uncertainty.toFixed(4)} uncalibrated distance ratio.
          Estimated depth gradient: {latestObservation.slope.toFixed(3)} rise/run; excluded as hazard: {String(latestObservation.hazard)}.</p>}
        <p>Maximum observed patch-center range: {snapshot.sensorRangeMeters} m. Pixel footprint extends up to {snapshot.sensorSampling.maximumSampleRangeMeters.toFixed(2)} m from the rover.</p>
        <p>Conservative traversability cutoff: {snapshot.traversability.slopeLimit.toFixed(3)} rise/run. Simulated energy reserve: {snapshot.energyReserve} units.</p>
        <p>{snapshot.model.limits}</p>
      </div>
      <div style={card}>
        <ResearchPanel observations={researchObservations} session={mission} tick={snapshot.tick} onResult={setResearchResult}/>
      </div>
      <div style={card}>
        <h3>Investigation evidence</h3>
        {snapshot.investigations.slice(-5).map((i, n) => <p key={n}>
          Cell {i.target}: {i.status}{i.reason ? ` / ${i.reason}` : ''}.
          {i.status === 'completed' && <> Survey {i.surveyCaptureId}; repeat {i.focusedCaptureId}.
            Predicted {i.predictedClass}; repeat consistency: {String(i.repeatAgreement)}.
            Static-depth repeat, not independent geological corroboration.</>}
        </p>)}
      </div>
      <div style={card}>
        <span style={small}>Event timeline</span>
        <p>{snapshot.events.length} recorded events. Showing latest 10; export retains the full action and decision history.</p>
        <ol style={eventList} aria-label="Autonomy decision timeline">
          {snapshot.events.slice(-10).reverse().map((event, index) => <li key={`${event.tick}-${index}`} style={{ padding: 9, borderRadius: 10, background: event.kind === 'hazard' ? '#38221f' : '#0a1211', color: event.kind === 'hazard' ? '#ffc0b8' : '#c6d8d2', fontSize: 12, lineHeight: 1.4 }}><strong style={{ color: '#95cfae' }}>T{event.tick}</strong> · {event.message}</li>)}
        </ol>
      </div>
      <div style={card}>
        <button style={secondary} onClick={() => { const blob = new Blob([JSON.stringify({ generatedAt: new Date().toISOString(), provenance: 'Synthetic orthographic depth observations, learned morphology predictions, geometric traversability estimates and unverified advisory hypotheses; not real planetary measurements', snapshot, optionalResearch: researchResult, checkpoint: mission.checkpoint() }, null, 2)], { type: 'application/json' }); const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = 'ghost-synthetic-survey.json'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }}>Export synthetic survey</button>
        <div style={{ display: 'flex', gap: 8, margin: '12px 0' }}><button style={secondary} onClick={() => { try { localStorage.setItem('ghost.synthetic.checkpoint.v2', JSON.stringify(mission.checkpoint())); setStorageStatus('Checkpoint saved in this browser.'); } catch { setStorageStatus('Checkpoint save failed: browser storage unavailable.'); } }}>Save checkpoint</button><button style={secondary} onClick={() => { try { const value = localStorage.getItem('ghost.synthetic.checkpoint.v2'); if (!value) throw new Error('No saved v2 checkpoint in this browser; legacy v1 is preserved but cannot replay changed controller semantics.'); const restored = restoreSyntheticMission(JSON.parse(value)); setRunning(false); setMission(restored); setSnapshot(restored.snapshot()); setSeed(restored.terrain.seed); setStorageStatus('Checkpoint restored paused by deterministic replay.'); } catch (e) { setStorageStatus(e instanceof Error ? e.message : 'Checkpoint restore failed'); } }}>Restore checkpoint</button></div>
        <p role="status" style={disclaimer}>{storageStatus}</p>
        <span style={small}>Integrity</span>
        <p style={disclaimer}>Raw synthetic RGB/depth packets contain no generated class or hazard labels. Fixed independently trained 5-NN predicts morphology from depth descriptors. Geometric gradients determine conservative traversability; novelty and uncalibrated uncertainty rank follow-up targets, not discoveries. RGB is visual evidence; neither ideal depth nor repeat consistency validates real-world rover safety or geological origin. Synthetic energy is an illustrative estimate. NASA metadata and optional hypotheses retain separate provenance.</p>
      </div>
    </aside>
  </section>;
}
