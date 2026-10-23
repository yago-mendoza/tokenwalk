import { defineConfig, transformWithEsbuild, type Plugin } from 'vite';
import fs from 'node:fs';
import path from 'node:path';

// The console is one classic script split into ordered parts (src/parts/NN-*.ts) that share a single scope,
// exactly as the original single file did. This plugin joins them, strips the types and inlines the result,
// with the stylesheet, into index.html, so every build is one self-contained page with no runtime dependencies.
const parts = () => fs.readdirSync('src/parts').filter(f => f.endsWith('.ts')).sort().map(f => path.join('src/parts', f));

function oneScript(): Plugin {
  return {
    name: 'tokenwalk-one-script',
    async transformIndexHtml(html) {
      const ts = parts().map(f => `// ---- ${path.basename(f)}\n${fs.readFileSync(f, 'utf8')}`).join('\n');
      const { code } = await transformWithEsbuild(ts, 'tokenwalk.ts', { loader: 'ts', target: 'es2022', format: undefined, minify: false });
      const css = fs.readFileSync('src/styles.css', 'utf8');
      return html.replace('<!-- tokenwalk:style -->', () => `<style>\n${css}</style>`).replace('<!-- tokenwalk:script -->', () => `<script>\n${code}</script>`);
    },
    handleHotUpdate({ file, server }) {
      if (/src[\/](parts[\/].*\.ts|styles\.css)$/.test(file)) { server.ws.send({ type: 'full-reload' }); return []; }
    },
  };
}

export default defineConfig({ plugins: [oneScript()], build: { outDir: 'dist', emptyOutDir: true } });
