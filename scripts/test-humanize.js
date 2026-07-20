const { humanizeAnnouncement } = require('../announce-llm');

const sample = [
  'hey @everyone',
  '',
  '**Graphify just crossed 90,000 GitHub stars.**',
  '',
  'A year ago this was a side project.',
  'Drop a star and help us keep the momentum going:',
  'https://github.com/Graphify-Labs/graphify',
].join('\n');

const out = humanizeAnnouncement(sample, { type: 'milestone' });
console.log(out);
if (/year ago/i.test(out)) throw new Error('still has year ago');
if (/drop a star/i.test(out)) throw new Error('still has drop a star');
if (/momentum/i.test(out)) throw new Error('still has momentum');
console.log('ok');
