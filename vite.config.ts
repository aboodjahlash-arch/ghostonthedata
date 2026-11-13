import { defineConfig } from 'vite';
import { viteStaticCopy } from 'vite-plugin-static-copy';
export default defineConfig({ plugins: [viteStaticCopy({ targets: ['Workers', 'ThirdParty', 'Assets', 'Widgets'].map(name => ({ src: `node_modules/cesium/Build/Cesium/${name}`, dest: 'cesium' })) })], define: { CESIUM_BASE_URL: JSON.stringify('/cesium') } });
