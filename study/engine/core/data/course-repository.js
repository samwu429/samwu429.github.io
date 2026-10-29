/**
 * Read access to one course pack (course.json plus per-unit lesson, practice and glossary files).
 * 读取单个课程包（course.json 及每个单元的讲义、练习与术语文件）。
 *
 * The repository is the only module that knows the course-pack file layout.
 * 只有本模块了解课程包的文件布局，视图层不直接拼接路径。
 */
import { fetchJson } from './fetch-json.js';

// Lists from allQuestions() / allTerms() carry the ids of units whose file failed to load, so a page
// can say that it is incomplete instead of silently showing fewer items. The property is not
// enumerable and is lost when the array is copied, so read it from the returned list itself.
// allQuestions() / allTerms() 返回的列表带有加载失败的单元 id，页面据此提示内容不完整，而不是悄悄少显示一部分。
// 该属性不可枚举，复制数组后就会丢失，因此要从返回的列表本身读取。
function withFailures(list, failedUnits) {
  return Object.defineProperty(list, 'failedUnits', { value: Object.freeze([...failedUnits]) });
}

export function createCourseRepository(courseBaseUrl) {
  const resolve = (path) => new URL(path, courseBaseUrl);
  const loadCourse = () => fetchJson(resolve('course.json'));

  async function findUnit(unitId) {
    const course = await loadCourse();
    const unit = course.units.find((candidate) => candidate.id === unitId);
    if (!unit) throw new Error(`Unknown unit: ${unitId}`);
    return unit;
  }

  async function loadUnitFile(unitId, field) {
    const unit = await findUnit(unitId);
    return unit[field] ? fetchJson(resolve(unit[field])) : null;
  }

  // Fetches one file per unit in parallel; a file that fails (network, HTTP or JSON error, or a
  // file without the expected list) is reported in failedUnits instead of failing the batch.
  // 并行获取每个单元的同类文件；失败的文件（网络、HTTP 或 JSON 错误，或缺少应有的列表）记入 failedUnits，不拖垮整批请求。
  async function loadAll(field, listKey) {
    const course = await loadCourse();
    const units = course.units.filter((unit) => unit[field]);
    const results = await Promise.all(units.map((unit) => fetchJson(resolve(unit[field]))
      .then((data) => (Array.isArray(data?.[listKey]) ? data : null))
      .catch(() => null)));
    const entries = [];
    const failedUnits = [];
    units.forEach((unit, index) => {
      if (results[index]) entries.push({ unit, data: results[index] });
      else failedUnits.push(unit.id);
    });
    return { entries, failedUnits };
  }

  return {
    course: loadCourse,
    unitMeta: findUnit,
    lesson: (unitId) => loadUnitFile(unitId, 'lesson'),
    questions: (unitId) => loadUnitFile(unitId, 'practice'),
    glossary: (unitId) => loadUnitFile(unitId, 'glossary'),

    async allQuestions() {
      const { entries, failedUnits } = await loadAll('practice', 'questions');
      const list = entries.flatMap(({ unit, data }) => data.questions.map((question) => ({ ...question, unitId: unit.id })));
      return withFailures(list, failedUnits);
    },

    // Merges glossaries; a term defined in several units keeps its first definition and lists every unit.
    // 合并术语表；同一术语出现在多个单元时保留首个定义，并记录所有出处单元。
    async allTerms() {
      const { entries, failedUnits } = await loadAll('glossary', 'terms');
      const byId = new Map();
      for (const { unit, data } of entries) {
        for (const term of data.terms) {
          if (!term || typeof term !== 'object') continue;
          const existing = byId.get(term.id);
          if (existing) {
            existing.units.push(unit.id);
          } else {
            byId.set(term.id, { ...term, units: [unit.id] });
          }
        }
      }
      return withFailures([...byId.values()], failedUnits);
    },

    async review(name) {
      const course = await loadCourse();
      const path = course.review?.[name];
      return path ? fetchJson(resolve(path)) : null;
    },
  };
}
