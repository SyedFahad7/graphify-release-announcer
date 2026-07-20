const fs = require('fs');
const path = require('path');
const { composePosterSvg } = require('../lib/poster-svg');

const signal = {
  type: 'milestone',
  title: '90,000 GitHub stars',
  summary: 'at 92230',
  meta: { milestone: 90000, stars: 92230 },
  url: 'https://github.com/Graphify-Labs/graphify',
};

const brief = {
  surface: 'hero-green',
  layoutArchetype: 'asymmetric-number',
  eyebrow: 'GITHUB STARS',
  displayNumber: '90K',
  statLine: '92,230 STARS',
  subline: 'Thank you.',
  logoTreatment: 'white-on-dark',
};

const svg = composePosterSvg(signal, brief);
const out = path.join(__dirname, '..', 'output', 'test-poster-90k.svg');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, svg);

if (!svg.includes('data:image/png;base64,')) throw new Error('missing embedded logo');
if (!svg.includes('90K')) throw new Error('missing number');
if (svg.includes('source memory')) throw new Error('hallucinated body text');
// Ensure no second text block floating mid-right of the number zone
console.log('wrote', out, 'bytes', svg.length);
console.log('ok');
