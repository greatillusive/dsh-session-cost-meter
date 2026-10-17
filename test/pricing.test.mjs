import assert from 'node:assert/strict';
import { foldEvent, resolveTariff, viewOf, isPeakAt } from '../pricing.js';

const tariff = resolveTariff(undefined);
const at = (iso) => Date.parse(iso);

function state() {
  return { models: {}, header: null, last: null, startedAt: null, updatedAt: null };
}

function usageEvent(time, turn, step, usage, provider = 'deepseek-account', model = 'deepseek-flash') {
  return {
    type: 'assistant/message',
    time,
    data: { turn, step, message: { source: { kind: 'model', provider, model } }, stream: [], usage },
  };
}

const usages = { inputTokens: 100000, cacheReadTokens: 900000, outputTokens: 10000 };

// 1. Saturday 20:00 Beijing time is off-peak.
assert.equal(isPeakAt(at('2026-10-17T20:00:00+08:00'), tariff), false);
let s = foldEvent(state(), usageEvent(at('2026-10-17T20:00:00+08:00'), 1, 1, usages), tariff);
let v = viewOf(s, tariff);
assert.equal(v.offPeak.requests, 1);
assert.equal(v.peak.requests, 0);
assert.ok(Math.abs(v.totalCost - (0.1 * 1 + 0.9 * 0.02 + 0.01 * 4)) < 1e-9, `off-peak cost ${v.totalCost}`);
assert.ok(Math.abs(v.peak.cost) < 1e-12, `peak cost must be 0, got ${v.peak.cost}`);
assert.ok(Math.abs(v.offPeak.cost - v.totalCost) < 1e-12, 'band costs must add up to the total');
assert.ok(JSON.stringify(v).includes('0.'), 'the view must be JSON-serializable');

function assertFiniteNumbers(value, path = 'view') {
  if (typeof value === 'number') {
    assert.ok(Number.isFinite(value), `${path} must be finite, got ${value}`);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertFiniteNumbers(item, `${path}[${index}]`));
    return;
  }
  if (value !== null && typeof value === 'object') {
    for (const [key, item] of Object.entries(value)) assertFiniteNumbers(item, `${path}.${key}`);
  }
}
assertFiniteNumbers(v);

// 2. Friday 10:00 Beijing time is peak (double price).
assert.equal(isPeakAt(at('2026-10-16T10:00:00+08:00'), tariff), true);
s = foldEvent(state(), usageEvent(at('2026-10-16T10:00:00+08:00'), 1, 1, usages), tariff);
v = viewOf(s, tariff);
assert.equal(v.peak.requests, 1);
assert.ok(Math.abs(v.totalCost - 2 * (0.1 * 1 + 0.9 * 0.02 + 0.01 * 4)) < 1e-9, `peak cost ${v.totalCost}`);

// 3. A weekday in a statutory holiday is off-peak all day.
assert.equal(isPeakAt(at('2026-10-07T10:00:00+08:00'), tariff), false);
assert.equal(isPeakAt(at('2026-10-08T10:00:00+08:00'), tariff), true);

// 4. A retried attempt replaces the earlier sample for the same turn/step.
s = foldEvent(s, usageEvent(at('2026-10-16T10:01:00+08:00'), 2, 1, { inputTokens: 500000, outputTokens: 1000 }), tariff);
s = foldEvent(s, usageEvent(at('2026-10-16T10:02:00+08:00'), 2, 1, { inputTokens: 600000, outputTokens: 2000 }), tariff);
v = viewOf(s, tariff);
assert.equal(v.requests, 2, 'a replacement must not add a request');

// 5. llm/retry-started closes the replacement scope, so the next attempt adds.
const before = v.peak.cacheMiss;
s = foldEvent(s, { type: 'llm/retry-started', time: at('2026-10-16T10:03:00+08:00'), data: { turn: 3, step: 1 } }, tariff);
s = foldEvent(s, usageEvent(at('2026-10-16T10:04:00+08:00'), 3, 1, { inputTokens: 300000, outputTokens: 1000 }), tariff);
v = viewOf(s, tariff);
assert.equal(v.peak.cacheMiss, before + 300000);
assert.equal(v.requests, 3);

// 6. An unknown model is priced with the fallback tariff and marked estimated.
s = foldEvent(state(), usageEvent(at('2026-10-17T20:00:00+08:00'), 1, 1, usages, 'qwen', 'glm-5.2'), tariff);
v = viewOf(s, tariff);
assert.equal(v.models[0].priced, true);
assert.equal(v.models[0].estimated, true);

// 7. A projection state that ignores an event keeps its reference.
const ignored = foldEvent(s, { type: 'turn/start', time: Date.now(), data: { turn: 9 } }, tariff);
assert.equal(ignored, s);

// 8. Custom windows: 10:00 becomes off-peak when the window is moved.
const shifted = resolveTariff({ peakWindows: ['00:00-01:00'] });
assert.equal(isPeakAt(at('2026-10-16T10:00:00+08:00'), shifted), false);
assert.equal(isPeakAt(at('2026-10-16T00:30:00+08:00'), shifted), true);

console.log('pricing tests passed');
