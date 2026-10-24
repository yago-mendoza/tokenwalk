import { defineConfig, transformWithEsbuild, type Plugin } from 'vite';
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { bakedData } from './tools/baked.mjs';

// The console is one classic script split into ordered parts (src/parts/NN-*.ts) that share a single scope,
// exactly as the original single file did. This plugin joins them, strips the types and inlines the result,
// with the stylesheet, into index.html, so every build is one self-contained page with no runtime dependencies.
// Baked into the page: the build (package version and git commit, which a shared measurement carries) and the
// accepted measurements (data/measurements.json, written by tools/ingest-measurements.mjs), which What fits shows,
// and the machine and model catalogues with the per-family calibration (tools/baked.mjs: data/machines.json, data/calibration.json,
// data/ref-models.json).
function baked() {
  let commit = ''; try { commit = execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); } catch (e) {}
  const version = JSON.parse(fs.readFileSync('package.json', 'utf8')).version;
  let data: any = { measurements: [] }; try { data = JSON.parse(fs.readFileSync('data/measurements.json', 'utf8')); } catch (e) {}
  return `const TW_BUILD = ${JSON.stringify({ version, commit })};
const TW_MEASUREMENTS = ${JSON.stringify(data.measurements || [])};
${bakedData()}`;
}
const parts = () => fs.readdirSync('src/parts').filter(f => f.endsWith('.ts')).sort().map(f => path.join('src/parts', f));

function oneScript(): Plugin {
  return {
    name: 'tokenwalk-one-script',
    async transformIndexHtml(html) {
      const ts = baked() + parts().map(f => `// ---- ${path.basename(f)}\n${fs.readFileSync(f, 'utf8')}`).join('\n');
      const { code } = await transformWithEsbuild(ts, 'tokenwalk.ts', { loader: 'ts', target: 'es2022', format: undefined, minify: false });
      const css = fs.readFileSync('src/styles.css', 'utf8');
      return html.replace('<!-- tokenwalk:style -->', () => `<style>\n${css}</style>`).replace('<!-- tokenwalk:script -->', () => `<script>\n${code}</script>`);
    },
    handleHotUpdate({ file, server }) {
      if (/(src[\/](parts[\/].*\.ts|styles\.css)|data[\/](measurements|machines|calibration|ref-models)\.json)$/.test(file)) { server.ws.send({ type: 'full-reload' }); return []; }
    },
  };
}

export default defineConfig({ plugins: [oneScript()], build: { outDir: 'dist', emptyOutDir: true } });
