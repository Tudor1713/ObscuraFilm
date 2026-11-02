// writes app/demo/manifest.json: [file, w, h] in shelf order, read from each JPEG's SOF marker
const fs = require('fs'), path = require('path');
const dir = path.join(__dirname, '../app/demo');
const order = fs.readFileSync(path.join(__dirname, 'fetch-demo.sh'), 'utf8').match(/IDS=\(([^)]*)\)/)[1].trim().split(/\s+/);
function size(buf) {
  let i = 2;
  while (i < buf.length) {
    if (buf[i] !== 0xff) { i++; continue; }
    const m = buf[i + 1], len = buf.readUInt16BE(i + 2);
    if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return [buf.readUInt16BE(i + 7), buf.readUInt16BE(i + 5)];
    i += 2 + len;
  }
}
const out = [];
for (const id of order) {
  const f = `p${id}.jpg`, p = path.join(dir, f);
  if (!fs.existsSync(p)) continue;
  const [w, h] = size(fs.readFileSync(p));
  out.push([f, w, h]);
}
fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(out));
console.log(out.length, 'photos', out.filter(r => r[2] > r[1]).length, 'portrait');
