'use strict';
const fs = require('node:fs');
const path = require('node:path');
const compiler = require('logostype');
const root = path.join(__dirname, '..');
fs.mkdirSync(path.join(root, 'dist'), {recursive:true});
for (const file of fs.readdirSync(path.join(root, 'src')).filter(f => f.endsWith('.type')).sort()) {
  const source = fs.readFileSync(path.join(root,'src', file), 'utf8');
  const result = compiler.compile(source, {bare:true, filename:file});
  fs.writeFileSync(path.join(root,'dist',file.replace(/\.type$/, '.cjs')), result);
}
