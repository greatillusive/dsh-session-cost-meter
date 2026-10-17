/**
 * Session cost accounting with DeepSeek peak / off-peak tariffs.
 *
 * Pure, replay-safe folds: every function here is deterministic given its
 * inputs, so projection replay always produces the same state.
 */

const WEEKDAY_INDEX = { Sun: 7, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

/**
 * Peak (high) prices in CNY per million tokens, from the DeepSeek price list
 * (2026-09 adjustment). Off-peak prices are these multiplied by
 * `offPeakFactor`, which the public list sets to 0.5.
 */
export const DEFAULT_PRICES = {
  'deepseek-flash': { cacheHit: 0.04, cacheMiss: 2, output: 8 },
  'deepseek-v4-flash': { cacheHit: 0.04, cacheMiss: 2, output: 8 },
  'deepseek-v4-flash-vision-exp': { cacheHit: 0.04, cacheMiss: 2, output: 8 },
  'deepseek-v4-pro': { cacheHit: 0.3, cacheMiss: 9, output: 27 },
  'deepseek-v4-pro-0813': { cacheHit: 0.3, cacheMiss: 9, output: 27 },
};

/** 2026 Chinese statutory holidays: whole days priced off-peak. */
export const DEFAULT_HOLIDAYS = [
  '2026-01-01', '2026-01-02', '2026-01-03',
  '2026-02-15', '2026-02-16', '2026-02-17', '2026-02-18', '2026-02-19',
  '2026-02-20', '2026-02-21', '2026-02-22', '2026-02-23',
  '2026-04-04', '2026-04-05', '2026-04-06',
  '2026-05-01', '2026-05-02', '2026-05-03', '2026-05-04', '2026-05-05',
  '2026-06-19', '2026-06-20', '2026-06-21',
  '2026-09-25', '2026-09-26', '2026-09-27',
  '2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04', '2026-10-05',
  '2026-10-06', '2026-10-07',
];

const DEFAULT_CONFIG = {
  currency: 'CNY',
  prices: DEFAULT_PRICES,
  offPeakFactor: 0.5,
  fallbackModel: 'deepseek-flash',
  timezone: 'Asia/Shanghai',
  peakWindows: ['09:00-12:00', '14:00-18:00'],
  peakWeekdays: [1, 2, 3, 4, 5],
  holidays: DEFAULT_HOLIDAYS,
};

const formatterCache = new Map();

function formatterFor(timezone) {
  let formatter = formatterCache.get(timezone);
  if (formatter === undefined) {
    formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      weekday: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
    formatterCache.set(timezone, formatter);
  }
  return formatter;
}

function isFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function numberOr(value, fallback) {
  return isFiniteNumber(value) ? value : fallback;
}

function timeToMinutes(text) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(String(text).trim());
  if (match === null) return undefined;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return undefined;
  return hours * 60 + minutes;
}

function parseWindows(input) {
  if (!Array.isArray(input)) return DEFAULT_CONFIG.peakWindows.map((w) => parseWindow(w) ?? [0, 0]);
  const windows = [];
  for (const item of input) {
    const parsed = parseWindow(item);
    if (parsed !== undefined) windows.push(parsed);
  }
  return windows.length > 0 ? windows : DEFAULT_CONFIG.peakWindows.map((w) => parseWindow(w) ?? [0, 0]);
}

function parseWindow(value) {
  if (Array.isArray(value) && value.length === 2) {
    const start = numberOr(value[0], NaN);
    const end = numberOr(value[1], NaN);
    if (Number.isFinite(start) && Number.isFinite(end) && end > start) return [start, end];
    return undefined;
  }
  const match = /^(.+?)\s*-\s*(.+)$/.exec(String(value));
  if (match === null) return undefined;
  const start = timeToMinutes(match[1]);
  const end = timeToMinutes(match[2]);
  if (start === undefined || end === undefined || end <= start) return undefined;
  return [start, end];
}

function normalizeRates(raw) {
  if (raw === null || typeof raw !== 'object') return undefined;
  return {
    cacheHit: numberOr(raw.cacheHit, 0),
    cacheMiss: numberOr(raw.cacheMiss, 0),
    output: numberOr(raw.output, 0),
  };
}

function normalizePrices(input) {
  const prices = {};
  for (const [model, rates] of Object.entries(DEFAULT_PRICES)) prices[model] = { ...rates };
  if (input !== null && typeof input === 'object') {
    for (const [model, rates] of Object.entries(input)) {
      const normalized = normalizeRates(rates);
      if (normalized !== undefined && model.length > 0) prices[model] = normalized;
    }
  }
  return prices;
}

/** Build the effective tariff from a plugin row config, tolerating a missing config. */
export function resolveTariff(config) {
  const raw = config !== null && typeof config === 'object' ? config : {};
  const timezone = typeof raw.timezone === 'string' && raw.timezone.length > 0 ? raw.timezone : DEFAULT_CONFIG.timezone;
  let timezoneValid = true;
  try {
    formatterFor(timezone);
  } catch {
    timezoneValid = false;
  }
  const effectiveTimezone = timezoneValid ? timezone : DEFAULT_CONFIG.timezone;
  const holidays = Array.isArray(raw.holidays)
    ? raw.holidays.filter((value) => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value))
    : DEFAULT_HOLIDAYS;
  const weekdays = Array.isArray(raw.peakWeekdays)
    ? raw.peakWeekdays.filter((value) => Number.isInteger(value) && value >= 1 && value <= 7)
    : DEFAULT_CONFIG.peakWeekdays;
  return {
    currency: typeof raw.currency === 'string' && raw.currency.length > 0 ? raw.currency : DEFAULT_CONFIG.currency,
    prices: normalizePrices(raw.prices),
    offPeakFactor: numberOr(raw.offPeakFactor, DEFAULT_CONFIG.offPeakFactor),
    fallbackModel: raw.fallbackModel === null
      ? null
      : (typeof raw.fallbackModel === 'string' && raw.fallbackModel.length > 0 ? raw.fallbackModel : DEFAULT_CONFIG.fallbackModel),
    timezone: effectiveTimezone,
    peakWindows: parseWindows(raw.peakWindows),
    peakWeekdays: weekdays.length > 0 ? weekdays : DEFAULT_CONFIG.peakWeekdays,
    holidays,
    holidaySet: new Set(holidays),
  };
}

/** True when `at` (epoch ms) falls inside a configured peak window. */
export function isPeakAt(at, tariff) {
  if (!Number.isFinite(at)) return false;
  const parts = formatterFor(tariff.timezone).formatToParts(new Date(at));
  const valueOf = (type) => parts.find((part) => part.type === type)?.value;
  const weekday = WEEKDAY_INDEX[valueOf('weekday')];
  if (weekday === undefined || !tariff.peakWeekdays.includes(weekday)) return false;
  const date = `${valueOf('year')}-${valueOf('month')}-${valueOf('day')}`;
  if (tariff.holidaySet.has(date)) return false;
  const minutes = Number(valueOf('hour')) * 60 + Number(valueOf('minute'));
  return tariff.peakWindows.some(([start, end]) => minutes >= start && minutes < end);
}

function emptyBand() {
  return { cacheMiss: 0, cacheHit: 0, output: 0, requests: 0 };
}

function emptyBucket() {
  return { peak: emptyBand(), off: emptyBand() };
}

function cloneBucket(bucket) {
  if (bucket === undefined) return emptyBucket();
  return {
    peak: { ...emptyBand(), ...bucket.peak },
    off: { ...emptyBand(), ...bucket.off },
  };
}

function addSample(band, sample, requests) {
  band.cacheMiss += sample.cacheMiss;
  band.cacheHit += sample.cacheHit;
  band.output += sample.output;
  band.requests += requests;
}

function subtractSample(band, sample) {
  band.cacheMiss = Math.max(0, band.cacheMiss - sample.cacheMiss);
  band.cacheHit = Math.max(0, band.cacheHit - sample.cacheHit);
  band.output = Math.max(0, band.output - sample.output);
  band.requests = Math.max(0, band.requests - 1);
}

function bucketIsEmpty(bucket) {
  return bucket.peak.cacheMiss === 0 && bucket.peak.cacheHit === 0 && bucket.peak.output === 0
    && bucket.off.cacheMiss === 0 && bucket.off.cacheHit === 0 && bucket.off.output === 0
    && bucket.peak.requests === 0 && bucket.off.requests === 0;
}

function lastUsageInStream(stream) {
  if (!Array.isArray(stream)) return undefined;
  let usage;
  for (const record of stream) {
    if (record !== null && typeof record === 'object' && record.type === 'chunk' && record.chunk?.type === 'usage' && record.chunk.usage !== undefined) {
      usage = record.chunk.usage;
    }
  }
  return usage;
}

function usageOf(event) {
  if (event.type === 'assistant/message') {
    if (event.data.usage !== undefined) return { usage: event.data.usage, message: event.data.message };
    return { usage: lastUsageInStream(event.data.stream), message: event.data.message };
  }
  if (event.type === 'assistant/attempt') {
    return { usage: lastUsageInStream(event.data.stream), message: undefined };
  }
  return undefined;
}

function normalizeUsage(usage) {
  if (usage === null || typeof usage !== 'object') return undefined;
  const cacheMiss = numberOr(usage.inputTokens, 0) + numberOr(usage.cacheWriteTokens, 0);
  const cacheHit = numberOr(usage.cacheReadTokens, 0);
  const output = numberOr(usage.outputTokens, 0);
  if (cacheMiss === 0 && cacheHit === 0 && output === 0) return undefined;
  return { cacheMiss, cacheHit, output };
}

function modelKeyOf(message, header) {
  const source = message !== undefined ? message.source : undefined;
  const provider = source?.provider ?? header?.provider;
  const model = source?.model ?? header?.model;
  if (typeof model === 'string' && model.length > 0) {
    return `${typeof provider === 'string' && provider.length > 0 ? provider : 'unknown'}/${model}`;
  }
  return 'unknown/unknown';
}

function splitModelKey(key) {
  const index = key.indexOf('/');
  if (index < 0) return { provider: '', model: key };
  return { provider: key.slice(0, index), model: key.slice(index + 1) };
}

/** Fold one session event into the cost state; returns the same reference when ignored. */
export function foldEvent(state, event, tariff) {
  if (event.type === 'llm/retry-started') {
    const last = state.last;
    if (last === null) return state;
    if (last.turn === event.data.turn && last.step === event.data.step) return { ...state, last: null };
    return state;
  }
  if (event.type === 'request/header') {
    const config = event.data.header?.config;
    const provider = config?.provider;
    const model = config?.model;
    if (typeof model !== 'string' || model.length === 0) return state;
    const header = { provider: typeof provider === 'string' ? provider : 'unknown', model };
    if (state.header !== null && state.header.provider === header.provider && state.header.model === header.model) return state;
    return { ...state, header };
  }
  const sampled = usageOf(event);
  if (sampled === undefined) return state;
  const sample = normalizeUsage(sampled.usage);
  if (sample === undefined) return state;

  const { turn, step } = event.data;
  const modelKey = modelKeyOf(sampled.message, state.header);
  const band = isPeakAt(event.time, tariff) ? 'peak' : 'off';
  const previous = state.last !== null && state.last.turn === turn && state.last.step === step ? state.last : null;

  if (previous !== null
    && previous.modelKey === modelKey
    && previous.band === band
    && previous.cacheMiss === sample.cacheMiss
    && previous.cacheHit === sample.cacheHit
    && previous.output === sample.output) {
    return state;
  }

  const models = { ...state.models };
  if (previous !== null) {
    const bucket = cloneBucket(models[previous.modelKey]);
    subtractSample(bucket[previous.band], previous);
    models[previous.modelKey] = bucket;
  }
  const target = cloneBucket(models[modelKey]);
  addSample(target[band], sample, 1);
  models[modelKey] = target;
  for (const [key, bucket] of Object.entries(models)) {
    if (bucketIsEmpty(bucket)) delete models[key];
  }

  return {
    models,
    header: state.header,
    last: { turn, step, modelKey, band, cacheMiss: sample.cacheMiss, cacheHit: sample.cacheHit, output: sample.output },
    startedAt: state.startedAt ?? event.time,
    updatedAt: event.time,
  };
}

function ratesFor(tariff, model) {
  const rates = tariff.prices[model];
  if (rates !== undefined) return { rates, estimated: false };
  if (tariff.fallbackModel !== null) {
    const fallback = tariff.prices[tariff.fallbackModel];
    if (fallback !== undefined) return { rates: fallback, estimated: true };
  }
  return undefined;
}

function costOf(band, rates, factor) {
  return (band.cacheMiss * rates.cacheMiss + band.cacheHit * rates.cacheHit + band.output * rates.output) / 1e6 * factor;
}

function bandView(band, pricing, factor) {
  return {
    cacheMiss: band.cacheMiss,
    cacheHit: band.cacheHit,
    output: band.output,
    requests: band.requests,
    cost: pricing === undefined ? 0 : costOf(band, pricing.rates, factor),
  };
}

function tariffView(tariff) {
  return {
    timezone: tariff.timezone,
    peakWindows: tariff.peakWindows.map(([start, end]) => [start, end]),
    peakWeekdays: [...tariff.peakWeekdays],
    holidays: [...tariff.holidays],
    offPeakFactor: tariff.offPeakFactor,
  };
}

const viewCache = new WeakMap();

/** Client-visible view of one state; cached per immutable state reference. */
export function viewOf(state, tariff, at = Date.now()) {
  let cached = viewCache.get(state);
  if (cached !== undefined) return cached;

  const peak = { ...emptyBand(), cost: 0 };
  const offPeak = { ...emptyBand(), cost: 0 };
  const models = [];
  let unpricedTokens = 0;
  let totalCost = 0;

  for (const [key, bucket] of Object.entries(state.models)) {
    const { provider, model } = splitModelKey(key);
    const pricing = ratesFor(tariff, model);
    const modelPeak = bandView(bucket.peak, pricing, 1);
    const modelOff = bandView(bucket.off, pricing, tariff.offPeakFactor);
    const cost = modelPeak.cost + modelOff.cost;
    if (pricing === undefined) {
      unpricedTokens += bucket.peak.cacheMiss + bucket.peak.cacheHit + bucket.peak.output
        + bucket.off.cacheMiss + bucket.off.cacheHit + bucket.off.output;
    }
    for (const field of ['cacheMiss', 'cacheHit', 'output', 'requests']) {
      peak[field] += modelPeak[field];
      offPeak[field] += modelOff[field];
    }
    peak.cost += modelPeak.cost;
    offPeak.cost += modelOff.cost;
    totalCost += cost;
    models.push({
      key,
      provider,
      model,
      priced: pricing !== undefined,
      estimated: pricing?.estimated === true,
      rates: pricing === undefined ? null : { ...pricing.rates },
      peak: modelPeak,
      offPeak: modelOff,
      cost,
    });
  }

  models.sort((left, right) => right.cost - left.cost);

  const view = {
    currency: tariff.currency,
    totalCost,
    requests: peak.requests + offPeak.requests,
    startedAt: state.startedAt,
    updatedAt: state.updatedAt,
    peak,
    offPeak,
    models,
    unpricedTokens,
    tariff: tariffView(tariff),
    band: isPeakAt(at, tariff) ? 'peak' : 'off',
  };
  viewCache.set(state, view);
  return view;
}
