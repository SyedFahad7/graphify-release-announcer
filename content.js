const config = require('./config');
const { parseReleaseBody } = require('./parse');
const { polishWithLLM } = require('./llm');

/**
 * Turn a release into grouped { intro, sections }.
 * Claude when ANTHROPIC_API_KEY is set, deterministic parser otherwise.
 * @param {object} release normalized release
 * @param {object} opts { noLlm, log } — log(msg) receives status lines (optional)
 */
async function buildContent(release, opts = {}) {
  const { noLlm = false, log = () => {} } = opts;

  if (!noLlm && config.anthropicApiKey) {
    try {
      const content = await polishWithLLM(release);
      const total = Object.values(content.sections).reduce((n, a) => n + a.length, 0);
      if (total > 0 || content.intro) {
        log('notes polished with Claude');
        return { content, source: 'llm' };
      }
      log('LLM returned nothing usable, using parser');
    } catch (err) {
      log(`LLM polish failed (${err.message}); using parser`);
    }
  } else if (!noLlm) {
    log('no ANTHROPIC_API_KEY, using built-in parser');
  } else {
    log('using built-in parser (--no-llm)');
  }

  return { content: parseReleaseBody(release.body), source: 'parser' };
}

module.exports = { buildContent };
