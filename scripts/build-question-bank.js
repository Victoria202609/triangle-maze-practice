const fs = require("node:fs");
const path = require("node:path");
const { analyze, encode, canonical } = require("../generator.js");
let seed = 20261030;
function random() { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; }
const bank = {};
for (let rows = 5; rows <= 25; rows++) {
  const candidates = new Map();
  if (rows === 5) {
    for (let mask = 0; mask < 32768; mask++) {
      let bit = 0;
      const bits = Array.from({ length: rows }, (_, r) => Array.from({ length: r + 1 }, () => (mask >>> bit++) & 1));
      const metrics = analyze(bits);
      if (metrics) candidates.set(rows === 5 ? encode(bits) : canonical(bits), {bits, metrics});
    }
  } else {
    for (let attempt = 0; candidates.size < 250 && attempt < 3000000; attempt++) {
      const density = .13 + random() * .22;
      const bits = Array.from({ length: rows }, (_, r) => Array.from({ length: r + 1 }, () => +(random() < density)));
      const metrics = analyze(bits);
      if (metrics) candidates.set(rows === 5 ? encode(bits) : canonical(bits), {bits, metrics});
    }
  }
  if (candidates.size < 50) throw new Error(`Not enough qualified boards: ${rows}, ${candidates.size}`);
  const entries = [...candidates.values()].sort((a,b) => a.metrics.difficultyScore - b.metrics.difficultyScore);
  bank[rows] = entries.map(entry => encode(entry.bits));
  console.log(JSON.stringify({rows, count: entries.length, min: entries[0].metrics.difficultyScore, max: entries.at(-1).metrics.difficultyScore}));
}
fs.writeFileSync(path.join(__dirname, "../question-bank.js"),
  "// Reproducibly built by scripts/build-question-bank.js; every board is validated at runtime.\n" +
  "(function(root){const bank=" + JSON.stringify(bank) + ";if(typeof module==='object'&&module.exports)module.exports=bank;else root.TriangleMazeQuestionBank=bank;})(globalThis);\n");
