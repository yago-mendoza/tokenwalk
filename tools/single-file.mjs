// After `vite build`, dist/index.html is already self-contained; publish it under its own name too.
import fs from 'node:fs';
const html = fs.readFileSync('dist/index.html', 'utf8');
if (/<script[^>]+src=|<link[^>]+stylesheet/.test(html)) throw new Error('dist/index.html still references external files');
fs.writeFileSync('dist/tokenwalk.html', html);
console.log(`dist/tokenwalk.html ${(html.length / 1024).toFixed(0)} KB`);
