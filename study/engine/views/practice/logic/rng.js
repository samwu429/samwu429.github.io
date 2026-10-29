/**
 * Seeded pseudo-random numbers, so a practice set or mock paper can be reproduced from its seed.
 * 可设种子的伪随机数，让一组练习或一份模拟卷可以凭种子重现。
 */

/**
 * mulberry32 generator returning floats in [0, 1); small and plenty for shuffling question lists.
 * mulberry32 生成器，返回 [0, 1) 的浮点数；体积小，用来打乱题目顺序足够。
 */
export function createRng(seed = randomSeed()) {
  let state = Number(seed) >>> 0;
  return function next() {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function randomSeed() {
  return Math.floor(Math.random() * 4294967296) >>> 0;
}
