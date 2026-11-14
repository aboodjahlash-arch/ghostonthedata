import { useEffect, useRef } from 'react';
import { validPatch, type CameraPatch } from './perception.ts';

export default function SensorEvidence({ capture }: { capture?: CameraPatch }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (!capture || !validPatch(capture)) return;
    const context = canvas.current?.getContext('2d');
    if (!context) return;
    const image = context.createImageData(capture.width, capture.width);
    for (let i = 0; i < capture.depth.length; i++) {
      image.data[i * 4] = capture.rgb[i * 3];
      image.data[i * 4 + 1] = capture.rgb[i * 3 + 1];
      image.data[i * 4 + 2] = capture.rgb[i * 3 + 2];
      image.data[i * 4 + 3] = 255;
    }
    context.putImageData(image, 0, 0);
  }, [capture]);
  if (!capture) return <p>No sensor capture received.</p>;
  return <section aria-label="Captured synthetic sensor evidence">
    <h3>Actual sensor packet</h3>
    <canvas ref={canvas} width={capture.width} height={capture.width} aria-label="Synthetic orthographic RGB capture"
      style={{ width: 144, height: 144, imageRendering: 'pixelated', border: '1px solid #40544e' }}/>
    <p style={{ overflowWrap: 'anywhere' }}>Capture {capture.id} / tick {capture.tick}</p>
    <p>{capture.width} x {capture.width} pixels · {capture.metersPerPixel.toFixed(2)} m/pixel</p>
    <p>Depth range: {Math.min(...capture.depth).toFixed(2)} to {Math.max(...capture.depth).toFixed(2)} local meters.</p>
    <small>Idealized synthetic orthographic RGB + calibrated depth, not a Cesium framebuffer or real planetary camera. The morphology model uses depth descriptors; RGB is visual evidence, not a learned terrain-color shortcut.</small>
  </section>;
}
