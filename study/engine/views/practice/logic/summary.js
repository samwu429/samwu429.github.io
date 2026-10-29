/**
 * Score summaries for a finished session or mock exam, and per-unit accuracy from stored attempts.
 * 练习或模拟考结束后的成绩汇总，以及根据答题记录计算的各单元正确率。
 *
 * Marks: objective questions are worth 1; written questions 1 per scoring point, earned per point covered.
 * 分值：客观题 1 分；主观题每个评分要点 1 分，写到几个得几分。
 */
import { isWrittenType, questionMarks } from './question-types.js';

function blankBucket() {
  return {
    questions: 0,
    answered: 0,
    correct: 0,
    earned: 0,
    possible: 0,
    objectiveQuestions: 0,
    objectiveCorrect: 0,
    writtenQuestions: 0,
    writtenEarned: 0,
    writtenPossible: 0,
  };
}

function finishBucket(bucket) {
  return {
    ...bucket,
    percent: bucket.possible ? (100 * bucket.earned) / bucket.possible : null,
    accuracy: bucket.answered ? bucket.correct / bucket.answered : null,
  };
}

/** Marks earned and possible for one question; a missing result earns nothing. 单题得分与满分。 */
export function marksFor(question, result) {
  const possible = questionMarks(question);
  if (!result) return { earned: 0, possible };
  if (isWrittenType(question?.type)) {
    const covered = Number.isFinite(result.coveredCount) ? result.coveredCount : 0;
    return { earned: Math.max(0, Math.min(possible, covered)), possible };
  }
  return { earned: result.correct ? 1 : 0, possible };
}

/**
 * Summarises [{ question, result }] entries (result null = unanswered).
 * Returns totals, per-unit rows in `unitOrder`, per-type rows and the ids of right / wrong / unanswered questions.
 * 汇总 [{ question, result }]（result 为 null 表示未作答）。返回总计、按 unitOrder 排列的单元统计、
 * 按题型统计，以及答对 / 答错 / 未作答题目的题号。
 */
export function summarizeResults(entries, { unitOrder = [] } = {}) {
  const totals = blankBucket();
  const units = new Map(unitOrder.map((id) => [id, blankBucket()]));
  const types = new Map();
  const correctIds = [];
  const wrongIds = [];
  const unansweredIds = [];

  for (const entry of Array.isArray(entries) ? entries : []) {
    const question = entry?.question;
    if (!question) continue;
    const result = entry.result || null;
    const { earned, possible } = marksFor(question, result);
    const answered = Boolean(result?.answered);
    const correct = Boolean(result?.correct);
    const written = isWrittenType(question.type);
    if (!units.has(question.unitId)) units.set(question.unitId, blankBucket());
    if (!types.has(question.type)) types.set(question.type, blankBucket());

    for (const bucket of [totals, units.get(question.unitId), types.get(question.type)]) {
      bucket.questions += 1;
      bucket.answered += answered ? 1 : 0;
      bucket.correct += correct ? 1 : 0;
      bucket.earned += earned;
      bucket.possible += possible;
      if (written) {
        bucket.writtenQuestions += 1;
        bucket.writtenEarned += earned;
        bucket.writtenPossible += possible;
      } else {
        bucket.objectiveQuestions += 1;
        bucket.objectiveCorrect += correct ? 1 : 0;
      }
    }

    if (correct) correctIds.push(question.id);
    else if (answered) wrongIds.push(question.id);
    else unansweredIds.push(question.id);
  }

  return {
    totals: finishBucket(totals),
    byUnit: [...units].filter(([, bucket]) => bucket.questions > 0).map(([unitId, bucket]) => ({ unitId, ...finishBucket(bucket) })),
    byType: Object.fromEntries([...types].map(([type, bucket]) => [type, finishBucket(bucket)])),
    correctIds,
    wrongIds,
    unansweredIds,
  };
}

/**
 * Per-unit practice statistics from progress attempts ({ id: { tries, correct, last } }) and the mistake list.
 * accuracy = correct answers / all tries; null until the unit has been tried.
 * 根据答题记录与错题本计算每个单元的统计；accuracy = 答对次数 / 总作答次数，没做过时为 null。
 */
export function unitPracticeStats(questions, attempts = {}, mistakes = []) {
  const record = attempts && typeof attempts === 'object' ? attempts : {};
  const mistakeSet = new Set(Array.isArray(mistakes) ? mistakes : []);
  const stats = new Map();
  for (const question of Array.isArray(questions) ? questions : []) {
    if (!question) continue;
    if (!stats.has(question.unitId)) {
      stats.set(question.unitId, { total: 0, byType: {}, attempted: 0, tries: 0, correct: 0, lastRight: 0, mistakes: 0 });
    }
    const entry = stats.get(question.unitId);
    entry.total += 1;
    entry.byType[question.type] = (entry.byType[question.type] || 0) + 1;
    const attempt = Object.hasOwn(record, question.id) ? record[question.id] : null;
    const tries = Math.max(0, Math.floor(Number(attempt?.tries) || 0));
    if (tries > 0) {
      entry.attempted += 1;
      entry.tries += tries;
      entry.correct += Math.min(tries, Math.max(0, Math.floor(Number(attempt.correct) || 0)));
      if (attempt.last === 'right') entry.lastRight += 1;
    }
    if (mistakeSet.has(question.id)) entry.mistakes += 1;
  }
  for (const entry of stats.values()) entry.accuracy = entry.tries ? entry.correct / entry.tries : null;
  return stats;
}

/** Sums unitPracticeStats() rows into one overall row. 把各单元统计合并为总计。 */
export function combineStats(statsMap) {
  const total = { total: 0, attempted: 0, tries: 0, correct: 0, lastRight: 0, mistakes: 0 };
  for (const entry of statsMap.values()) {
    for (const key of Object.keys(total)) total[key] += entry[key] || 0;
  }
  total.accuracy = total.tries ? total.correct / total.tries : null;
  return total;
}
