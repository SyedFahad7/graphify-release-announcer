const { validateAnnouncement, projectAgeLabel, loadCanon, monthsSinceLaunch } =
  require('../lib/canon');

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

{
  const sample = [
    'hey @everyone',
    '',
    '**Graphify just crossed 90,000 GitHub stars.**',
    '',
    'A year ago this was a side project.',
    'Drop a star and help us keep the momentum going:',
    'https://github.com/Graphify-Labs/graphify',
  ].join('\n');

  const { text: out, warnings } = validateAnnouncement(sample, {
    type: 'milestone',
    url: 'https://github.com/Graphify-Labs/graphify',
  });
  console.log('--- hard-sell sample ---\n', out, '\nwarnings:', warnings);
  assert(!/drop a star/i.test(out), 'still has drop a star');
  assert(!/momentum/i.test(out), 'still has momentum');
  assert(warnings.length, 'expected warnings');
}

{
  const sample = [
    'hey @everyone',
    '',
    '**Graphify just crossed 90,000 GitHub stars. We\'re sitting at 92,230 right now.**',
    '',
    'Three months in. Thank you.',
    '',
    'More coming soon.',
    '',
    'Repo:',
  ].join('\n');

  const { text: out, warnings } = validateAnnouncement(sample, {
    type: 'milestone',
    url: 'https://github.com/Graphify-Labs/graphify',
  });
  console.log('--- empty Repo sample ---\n', out, '\nwarnings:', warnings);
  assert(!/more coming soon/i.test(out), 'still has more coming soon');
  assert(!/^Repo:\s*$/m.test(out), 'empty Repo: left behind');
  assert(/Repo:\s*https:\/\/github\.com\/Graphify-Labs\/graphify/i.test(out), 'expected filled Repo URL');
}

{
  const quiet = [
    'hey @everyone',
    '',
    '**Graphify just crossed 90,000 GitHub stars.**',
    '',
    'Thank you.',
    '',
    'Repo: https://github.com/Graphify-Labs/graphify',
  ].join('\n');
  const { text: out } = validateAnnouncement(quiet, {
    type: 'milestone',
    url: 'https://github.com/Graphify-Labs/graphify',
  });
  console.log('--- quiet Repo kept ---\n', out);
  assert(/Repo:\s*https:\/\/github\.com\/Graphify-Labs\/graphify/i.test(out), 'quiet Repo should stay');
}

const { facts } = loadCanon();
console.log('canon age:', projectAgeLabel(facts), `(${monthsSinceLaunch(facts)} months)`);
console.log('ok');
