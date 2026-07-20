const { validateAnnouncement, projectAgeLabel, loadCanon, monthsSinceLaunch } =
  require('../lib/canon');

const sample = [
  'hey @everyone',
  '',
  '**Graphify just crossed 90,000 GitHub stars.**',
  '',
  'A year ago this was a side project.',
  'Drop a star and help us keep the momentum going:',
  'https://github.com/Graphify-Labs/graphify',
].join('\n');

const { text: out, warnings } = validateAnnouncement(sample, { type: 'milestone' });
console.log(out);
console.log('warnings:', warnings);

const { facts } = loadCanon();
const months = monthsSinceLaunch(facts);
const age = projectAgeLabel(facts);
console.log('canon age:', age, `(${months} months)`);

if (months < 12 && /year ago/i.test(out) && !/few months/i.test(out)) {
  throw new Error('still has year ago without rewrite');
}
if (/drop a star/i.test(out)) throw new Error('still has drop a star');
if (/momentum/i.test(out)) throw new Error('still has momentum');
if (!warnings.length) throw new Error('expected warnings');
console.log('ok');
