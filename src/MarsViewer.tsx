import { useEffect, useRef, useState } from 'react';
import * as C from 'cesium';
import 'cesium/Build/Cesium/Widgets/widgets.css';
import type { Coordinate, Layer, Region, Route, Target } from './api';

C.Ellipsoid.default = C.Ellipsoid.MARS;
type Props = { region: Region; targets: Target[]; layers: Layer[]; enabled: string[]; route?: Route; start?: Coordinate; destination?: Coordinate; pickMode: 'start' | 'destination' | null; onPick: (point: Coordinate) => void; onTarget: (target: Target) => void };
export default function MarsViewer(props: Props) {
  const container = useRef<HTMLDivElement>(null);
  const viewer = useRef<C.Viewer | null>(null);
  const current = useRef(props); current.current = props;
  const [status, setStatus] = useState('Initializing Mars reference globe');
  const [ready, setReady] = useState(false);
  const [terrain, setTerrain] = useState(false);
  const [layerErrors, setLayerErrors] = useState<string[]>([]);
  const home = () => { const r = current.current.region; viewer.current?.camera.flyToBoundingSphere(new C.BoundingSphere(C.Cartesian3.fromDegrees(r.center.longitude, r.center.latitude, r.center.height || 0), 15000), { offset: new C.HeadingPitchRange(0, C.Math.toRadians(-55), 85000), duration: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 1.2 }); };
  useEffect(() => {
    if (!container.current) return;
    let disposed = false;
    let v: C.Viewer;
    try { v = new C.Viewer(container.current, { globe: new C.Globe(C.Ellipsoid.MARS), baseLayer: false, baseLayerPicker: false, geocoder: false, sceneModePicker: false, animation: false, timeline: false, homeButton: false, navigationHelpButton: false, fullscreenButton: false, selectionIndicator: false, infoBox: false, requestRenderMode: true }); }
    catch { setStatus('3D renderer unavailable. Enable WebGL or try a supported browser. Science panels remain accessible.'); return; }
    viewer.current = v;
    v.scene.globe.baseColor = C.Color.fromCssColorString('#775044');
    v.scene.globe.showGroundAtmosphere = false;
    if (v.scene.skyAtmosphere) v.scene.skyAtmosphere.show = false;
    v.scene.backgroundColor = C.Color.fromCssColorString('#101313');
    v.scene.globe.enableLighting = false;
    v.camera.setView({ destination: C.Cartesian3.fromDegrees(current.current.region.center.longitude, current.current.region.center.latitude, 85000), orientation: { heading: 0, pitch: C.Math.toRadians(-55), roll: 0 } });
    const grid = new C.GridImageryProvider({ ellipsoid: C.Ellipsoid.MARS, cells: 8, color: C.Color.fromCssColorString('#c89873').withAlpha(0.18), glowColor: C.Color.TRANSPARENT, backgroundColor: C.Color.fromCssColorString('#65473b') });
    v.imageryLayers.addImageryProvider(grid);
    setReady(true);
    const token = import.meta.env.VITE_CESIUM_ION_TOKEN;
    if (token) {
      C.Ion.defaultAccessToken = token;
      setStatus('Loading NASA / USGS / ESA Mars tiles');
      C.Cesium3DTileset.fromIonAssetId(Number(import.meta.env.VITE_CESIUM_MARS_ASSET_ID || 3644333)).then(tiles => {
        if (disposed) { tiles.destroy(); return; }
        v.scene.primitives.add(tiles); v.scene.globe.show = false; setTerrain(true); setStatus('Cesium Mars · NASA / USGS / ESA · real terrain'); v.scene.requestRender();
      }).catch(() => { if (!disposed) setStatus('Mars tiles unavailable · reference ellipsoid only, no measured elevation'); });
    } else setStatus('Reference ellipsoid · ion token required for real imagery and elevation');
    const handler = new C.ScreenSpaceEventHandler(v.scene.canvas);
    handler.setInputAction((event: { position: C.Cartesian2 }) => {
      const selected = v.scene.pick(event.position);
      const target = current.current.targets.find(t => t.id === selected?.id?.id);
      if (target && !current.current.pickMode) { current.current.onTarget(target); return; }
      if (!current.current.pickMode) return;
      const point = v.scene.pickPositionSupported && !v.scene.globe.show ? v.scene.pickPosition(event.position) : v.camera.pickEllipsoid(event.position, C.Ellipsoid.MARS);
      if (point) { const cart = C.Ellipsoid.MARS.cartesianToCartographic(point); current.current.onPick({ longitude: C.Math.toDegrees(cart.longitude), latitude: C.Math.toDegrees(cart.latitude), height: cart.height }); }
    }, C.ScreenSpaceEventType.LEFT_CLICK);
    return () => { disposed = true; handler.destroy(); v.destroy(); viewer.current = null; };
  }, []);
  useEffect(() => { if (ready) home(); }, [props.region.id, ready]);
  useEffect(() => {
    const v = viewer.current; if (!v || !ready) return;
    v.entities.removeAll();
    const point = (id: string, name: string, coordinates: Coordinate, color: string) => v.entities.add({ id, position: C.Cartesian3.fromDegrees(coordinates.longitude, coordinates.latitude, (coordinates.height || 0) + 30), point: { pixelSize: 10, color: C.Color.fromCssColorString(color), outlineColor: C.Color.BLACK, outlineWidth: 2, disableDepthTestDistance: Number.POSITIVE_INFINITY }, label: { text: name, font: '12px sans-serif', fillColor: C.Color.WHITE, pixelOffset: new C.Cartesian2(0, -24), showBackground: true, backgroundColor: C.Color.BLACK.withAlpha(0.7), disableDepthTestDistance: Number.POSITIVE_INFINITY } });
    if (props.enabled.includes('scientific-targets')) props.targets.forEach(t => point(t.id, t.name, t.coordinates, '#efaa58'));
    if (props.start) point('route-start', 'START', props.start, '#90bca3');
    if (props.destination) point('route-end', 'DESTINATION', props.destination, '#eb895f');
    if (props.route) v.entities.add({ polyline: { positions: props.route.coordinates.map(p => C.Cartesian3.fromDegrees(p.longitude, p.latitude, (p.height || 0) + 40)), width: 4, material: C.Color.fromCssColorString('#efaa58'), clampToGround: false } });
    v.scene.requestRender();
  }, [props.targets, props.enabled, props.route, props.start, props.destination, ready]);
  useEffect(() => {
    const v = viewer.current; if (!v || !ready) return;
    let disposed = false;
    const sources: C.GeoJsonDataSource[] = [];
    const tilesets: C.Cesium3DTileset[] = [];
    setLayerErrors([]);
    props.layers.filter(l => props.enabled.includes(l.id) && l.status === 'available').forEach(async layer => {
      try {
        if (layer.geojson) { const source = await C.GeoJsonDataSource.load(layer.geojson, { stroke: C.Color.ORANGE, fill: C.Color.ORANGE.withAlpha(0.2), clampToGround: false }); if (disposed) return; sources.push(source); await v.dataSources.add(source); }
        if (layer.tilesetUrl) { const tiles = await C.Cesium3DTileset.fromUrl(layer.tilesetUrl); if (disposed) { tiles.destroy(); return; } tilesets.push(tiles); v.scene.primitives.add(tiles); }
        v.scene.requestRender();
      } catch { if (!disposed) setLayerErrors(old => [...old, `${layer.name} failed to load`]); }
    });
    return () => { disposed = true; if (!v.isDestroyed()) { sources.forEach(s => v.dataSources.remove(s, true)); tilesets.forEach(t => v.scene.primitives.remove(t)); } };
  }, [props.layers, props.enabled, ready]);
  return <div className="map-wrap"><div ref={container} className="cesium-map" aria-label="Interactive three-dimensional Mars map"/><div className="map-top"><span className="tag">MARS / {props.region.name.toUpperCase()}</span><span className="tag">{terrain ? 'MEASURED TERRAIN' : 'REFERENCE GLOBE'}</span></div><div className="map-tools"><button onClick={home} title="Return to region">⌂</button><button onClick={() => viewer.current?.camera.zoomIn(10000)} aria-label="Zoom in">+</button><button onClick={() => viewer.current?.camera.zoomOut(10000)} aria-label="Zoom out">−</button></div>{props.pickMode && <div className="pick-hint">Click the surface to set {props.pickMode}. <span>Coordinates only; traversability is not verified.</span></div>}<div className="map-caption"><span className={terrain ? 'live-dot' : 'amber-dot'}/>{status}{layerErrors.length > 0 && <span role="alert">{layerErrors.join(' · ')}</span>}</div><div className="map-scale">Drag to orbit · Scroll to zoom · Ctrl + drag to tilt</div></div>;
}
