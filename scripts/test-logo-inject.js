const { injectOfficialLogos } = require('../announce-image');

const svg =
  '<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024">' +
  '<rect width="1024" height="1024" fill="#062a22"/>' +
  '<!--GRAPHIFY_LOGO_PRIMARY-->' +
  '<text>90K</text></svg>';

const out = injectOfficialLogos(svg, {
  logoPrimary: 'icon',
  logoSecondary: 'wordmark',
  logoTreatment: 'white-on-dark',
  format: { width: 1024, height: 1024 },
});

const checks = {
  icon: out.includes('graphify-official-icon'),
  wordmark: out.includes('graphify-official-wordmark'),
  dataUri: out.includes('data:image/png;base64,'),
  noSlot: !out.includes('GRAPHIFY_LOGO'),
};
console.log(checks);
if (!Object.values(checks).every(Boolean)) process.exit(1);
