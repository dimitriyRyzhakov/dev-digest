import { MockLLMProvider } from '../../src/adapters/mocks.js';

/** A valid `PrIntentClassification` the M3 intent pre-step accepts. */
export const INTENT_CLASSIFICATION = {
  category: 'feat',
  summary: 'Adds rate limiting to the public API.',
  in_scope: ['public endpoints'],
  out_of_scope: ['admin endpoints'],
  breaking: false,
  confidence: 0.8,
  signals: [{ source: 'description', note: 'states the goal' }],
  risk_areas: [],
};

/**
 * The `openrouter` mock for the review_intent feature model (default
 * openrouter/deepseek-v4-flash). Injecting it keeps IT tests hermetic: without
 * it, a dev key in ~/.devdigest/secrets.json would make real model calls.
 */
export function mockIntentLlm(classification: unknown = INTENT_CLASSIFICATION): MockLLMProvider {
  return new MockLLMProvider('openai', { structuredBySchema: { PrIntentClassification: classification } });
}
