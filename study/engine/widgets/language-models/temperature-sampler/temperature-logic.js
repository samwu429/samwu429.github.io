/**
 * Next-token probabilities, temperature reshaping and sampling with an injectable random source.
 * DOM-free so it can be tested with node --test.
 * 下一个 token 的概率、温度对分布的改变，以及可注入随机源的抽样。不依赖 DOM，可用 node --test 测试。
 */

export const MIN_TEMPERATURE = 0.1;
export const MAX_TEMPERATURE = 2;
export const MAX_CANDIDATES = 8;

// The p.52 lunch example (top 6 candidates, rescaled to add up to 1), used when a config has none.
// 课件 p.52 的午餐例子（前 6 个候选，按比例换算成总和为 1），配置缺失时使用。
export const DEFAULT_CONTEXT = "For lunch, let's order";
export const DEFAULT_CANDIDATES = Object.freeze([
  { token: 'sandwiches', prob: 0.2912 },
  { token: 'a', prob: 0.2378 },
  { token: 'some', prob: 0.1763 },
  { token: 'pizza', prob: 0.1183 },
  { token: 'soup', prob: 0.0974 },
  { token: 'tacos', prob: 0.079 },
]);

function validProbability(value) {
  const number = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
  return typeof number === 'number' && Number.isFinite(number) && number >= 0 ? number : null;
}

/**
 * Cleans the configured candidates: drops invalid rows, keeps at most MAX_CANDIDATES, sorts by
 * probability (highest first, ties keep their order) and rescales so the probabilities add up to 1.
 * 清理配置中的候选词：去掉无效项，最多保留 MAX_CANDIDATES 个，按概率从高到低排序（相同则保持原顺序），
 * 再按比例缩放使总和为 1。
 */
export function normalizeCandidates(candidates) {
  const valid = (Array.isArray(candidates) ? candidates : [])
    .map((candidate) => ({
      token: typeof candidate?.token === 'string' ? candidate.token : String(candidate?.token ?? ''),
      prob: validProbability(candidate?.prob),
    }))
    .filter((candidate) => candidate.token.trim() !== '' && candidate.prob !== null)
    .slice(0, MAX_CANDIDATES);
  const items = valid.length ? valid : DEFAULT_CANDIDATES.map((candidate) => ({ ...candidate }));
  const rawSum = items.reduce((total, candidate) => total + candidate.prob, 0);
  const probs = rawSum > 0 ? items.map((candidate) => candidate.prob / rawSum) : items.map(() => 1 / items.length);
  const ranked = items
    .map((candidate, index) => ({ token: candidate.token, prob: probs[index], index }))
    .sort((a, b) => b.prob - a.prob || a.index - b.index)
    .map(({ token, prob }) => ({ token, prob }));
  return { items: ranked, rawSum, rescaled: Math.abs(rawSum - 1) > 0.01, usedDefault: valid.length === 0 };
}

export function clampTemperature(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 1;
  return Math.min(MAX_TEMPERATURE, Math.max(MIN_TEMPERATURE, number));
}

/**
 * Reshapes a distribution: new p_i is proportional to p_i^(1/T), then everything is rescaled to 1.
 * Low T sharpens the distribution toward the top token; high T flattens it. Computed in log space.
 * 改变分布：新的 p_i 与 p_i^(1/T) 成正比，再整体缩放到总和为 1。T 小时分布更集中到第一名，T 大时更平。用对数计算避免溢出。
 */
export function applyTemperature(probs, temperature) {
  const t = clampTemperature(temperature);
  const logs = probs.map((p) => (p > 0 ? Math.log(p) / t : -Infinity));
  const top = Math.max(...logs);
  if (!Number.isFinite(top)) return probs.map(() => 1 / probs.length);
  const weights = logs.map((value) => (Number.isFinite(value) ? Math.exp(value - top) : 0));
  const total = weights.reduce((sum, value) => sum + value, 0);
  return weights.map((value) => value / total);
}

/**
 * Picks one index with probability proportional to probs[i]; `random` returns a number in [0, 1).
 * 按 probs[i] 的比例随机选一个下标；`random` 返回 [0, 1) 内的数。
 */
export function sampleIndex(probs, random = Math.random) {
  const total = probs.reduce((sum, p) => sum + (p > 0 ? p : 0), 0);
  if (!(total > 0)) return -1;
  const target = random() * total;
  let cumulative = 0;
  let last = -1;
  for (let index = 0; index < probs.length; index += 1) {
    if (!(probs[index] > 0)) continue;
    last = index;
    cumulative += probs[index];
    if (target < cumulative) return index;
  }
  return last;
}

export function sampleCounts(probs, count, random = Math.random) {
  const counts = probs.map(() => 0);
  for (let draw = 0; draw < count; draw += 1) {
    const index = sampleIndex(probs, random);
    if (index >= 0) counts[index] += 1;
  }
  return counts;
}

/**
 * Small deterministic random generator (mulberry32) for tests and reproducible demos.
 * 小型可复现随机数生成器（mulberry32），用于测试与可重复的演示。
 */
export function createSeededRandom(seed = 1) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Splits "context + new token" into display parts; punctuation attaches without a space.
 * 把“上下文 + 新 token”拆成显示用的几部分；标点直接贴在后面，不加空格。
 */
export function joinParts(context, token) {
  const base = String(context ?? '').replace(/\s+$/u, '');
  const piece = String(token ?? '');
  if (!base) return { base: '', separator: '', token: piece.trim() };
  if (/^\s/u.test(piece)) return { base, separator: ' ', token: piece.trim() };
  const separator = /^[.,!?;:%)\]}'’]/u.test(piece) ? '' : ' ';
  return { base, separator, token: piece };
}

export function appendToken(context, token) {
  const parts = joinParts(context, token);
  return `${parts.base}${parts.separator}${parts.token}`;
}

export function formatPercent(probability, digits = 1) {
  if (!(probability > 0)) return '0%';
  const value = probability * 100;
  const smallest = 10 ** -digits;
  if (value < smallest) return `<${smallest}%`;
  return `${value.toFixed(digits)}%`;
}

/**
 * Names the temperature zone used for the explanation text. "greedy" means the temperature is low
 * and the top token already takes at least 80%, so sampling almost always returns it.
 * 给温度所在的区间命名，供说明文字使用。"greedy" 表示温度低且第一名已占至少 80%，几乎每次都会抽到它。
 */
export function temperatureRegime(temperature, topShare = 0) {
  const t = clampTemperature(temperature);
  if (t < 0.95) return topShare >= 0.8 ? 'greedy' : 'low';
  if (t <= 1.05) return 'neutral';
  return 'high';
}
