# Topphi Study Station — Architecture

A static, dependency-free, multi-course review station served by GitHub Pages under topphi.com.
一个静态、零依赖、可容纳多门课程的复习工作站，由 GitHub Pages 托管在 topphi.com 下。

- `topphi.com/study/` — station hub listing every course / 工作站总入口，列出全部课程
- `topphi.com/<course-id>/` — one course site, e.g. `topphi.com/csc105h5/` / 单门课程站点

## 1. Directory layout / 目录结构

```
<course-id>/index.html          Thin entry page of a course (declares data-course)  课程入口页
study/
  index.html                    Station hub entry                                    工作站总入口
  ARCHITECTURE.md               This document                                        本文档
  engine/                       Shared code for every course                         所有课程共用的引擎
    app/                        Boot, shell, router, route table                     启动、外壳、路由
    core/                       Non-visual infrastructure                            非界面基础设施
      dom/                      h()/s() element builders, icons, stylesheet loader,  DOM 构建、图标、样式加载、
                                keyboard helpers                                     键盘工具
      text/                     Inline markup, bilingual helpers, script runs,       行内标记、双语工具、中英分段、
                                unit labels, course channels, speech                 单元命名、公告渠道、朗读
      data/                     JSON fetching, course repository                     数据获取、课程仓库
      state/                    localStorage wrapper, progress, preferences          本地存储、进度、偏好
      util/                     Formatting, ids and randomness                       格式化、id 与随机工具
    components/                 Reusable UI pieces (buttons, segmented, tab strip,   可复用界面组件（按钮、分段、分页条、
                                unit filter, theme toggle, badges, states...)        单元筛选、主题、徽章、状态…）
    views/<feature>/            One folder per page type; JS + co-located CSS        每类页面一个文件夹
    widgets/<domain>/<widget>/  Interactive demos; JS + co-located CSS               交互演示组件
    styles/                     Shared CSS (tokens, base, layout, components)        共享样式
  courses/
    registry.json               List of courses shown on the hub                     课程登记表
    <course-id>/                One course pack (data only, no code)                 课程包（只有数据）
      course.json               Meta, assessments, unit index, review file paths,    课程元数据、单元索引、
                                optional mock exam settings                          可选的模拟考设置
      lessons/<unit>.json       One lesson per unit (lecture, module, lab...)        每个单元一份讲义（讲课、模块、实验…）
      practice/<unit>.json      Practice question banks                              练习题库
      glossary/<unit>.json      Glossary terms                                       术语表
      review/*.json             Cheat sheet, exam toolkit, course overview           速记、答题工具箱、课程总览
  tools/                        Authoring tools (content validator, index builder)   内容校验与索引生成工具
    content-spec.md             Course-neutral content contract                      通用内容契约
    review-spec.md              Review files contract                                复习文件契约
    course-briefs/<course>.md   Per-course facts, tests, notation, targets           每门课的事实、考试、记号与数量目标
  tests/                        node --test unit tests for pure logic                纯逻辑单元测试
```

Dependency direction: `app -> views -> components -> core`; `views/lesson -> widgets -> components -> core`. Nothing in `core` imports from `components`, `views` or `widgets`.
依赖方向：app -> views -> components -> core；widgets 只依赖 components 与 core；core 不反向依赖任何上层。

## 2. Runtime flow / 运行流程

1. `<course-id>/index.html` sets `<body data-course="..." data-study-root="../study/">` and loads `engine/app/boot.js`.
2. Boot applies preferences, loads `courses/<id>/course.json`, renders the shell and starts the hash router.
3. Each route lazily imports a view module and calls `render(container, context, params, query)`.
4. A view may return a cleanup function; the router calls it before the next route renders.

The `context` object passed to every view:

| field | meaning |
|---|---|
| `courseId`, `course` | course id and parsed `course.json` |
| `repo` | `lesson(id)`, `questions(id)`, `glossary(id)`, `allQuestions()`, `allTerms()`, `review(name)`, `course()`, `unitMeta(id)`. The two `all*()` lists carry `failedUnits` (ids whose file did not load), which views show with `partialLoadNotice()` from `components/feedback/states.js` |
| `progress` | progress store (sections, attempts, mistakes, flashcards, last visited, export/import, `replaceAll`) |
| `preferences` | language mode and theme |
| `setTitle(text)` | sets `document.title` |
| `navigate(path)` | navigates to `#<path>` |
| `refresh()` | renders the current route again (Retry buttons) |
| `studyRoot`, `courseBase` | absolute URLs of `study/` and the course pack |

The query parameters each route reads are listed at the top of `engine/app/routes.js`.
各路由读取的查询参数列在 `engine/app/routes.js` 开头。

## 3. Conventions / 约定

- Vanilla ES modules, no build step, no third-party dependencies.
- Build DOM only through `h()` / `s()` from `core/dom/element.js`. Never use `innerHTML`, `outerHTML`, `insertAdjacentHTML`, `document.write`, `eval` or `new Function`. Content strings go through `renderInline()` or the bilingual helpers.
- Bilingual values `{zh, en}` are rendered with `core/text/bilingual.js`; Chinese nodes carry a role class (`zh-teach`, `zh-gloss`, `zh-assist`, `zh-label`) so the three language modes work everywhere. Text whose language is not declared (table cells, for example) goes through `scriptText()`, which marks each Chinese and English run separately. In English practice mode blurred Chinese is revealed by a tap, by Alt+Z for the focused block, or by the header toggle (`app/language-reveal.js`).
- Colors, spacing, radii and shadows come from `styles/foundation/tokens.css` variables only; dark mode must work without extra rules.
- View and widget CSS sits next to its JS module and is loaded with `await ensureStylesheet(new URL('./x.css', import.meta.url))` before rendering. Class names are prefixed by the module (`lesson-section__title`, `minimax__node`).
- Layout must work from 360 px wide with no horizontal page scroll; wide content scrolls inside its own container.
- Accessibility: real `<button>`/`<a>`, labelled inputs, `aria-live` for feedback, keyboard support, visible focus.
- Comments explain intent, English first then Chinese; no emojis anywhere in code, content or UI.
- Storage access only through `core/state/*` (all reads/writes are guarded and degrade gracefully).
- Pure logic (math, interpreters, scoring) lives in DOM-free modules with tests under `study/tests/`, run from `study/` with `npm test` (or `node --test "tests/**/*.test.mjs"`).

## 4. Content contract / 内容契约

Content files follow the course-pack schema (lesson blocks, question types, glossary terms, review files). The authoritative descriptions are `study/tools/content-spec.md` (lessons, practice, glossary, widget catalog; sections 0-2 describe the bilingual teaching style for the learner of every course) and `study/tools/review-spec.md` (cheat sheet, exam toolkit, course overview). Each course adds a brief, `study/tools/course-briefs/<course-id>.md`, with what only that course has: units, tests and their format, notation and methods to keep exactly, proper names, size targets and review-file focus. The brief wins where it is more specific. Tools:

- `python study/tools/validate_content.py <lesson|questions|glossary|review|all> [unit-id] --pack study/courses/<course-id>`
- `python study/tools/build_course_index.py study/courses/<course-id>` refreshes the unit index in `course.json` (titles, section ids, counts) from the lesson files.

### Unit kinds / 单元类型

Every unit in `course.json` has a `kind`. `core/text/unit-labels.js` is the only place that names kinds and orders their groups: `lecture` (第 3 讲 / Lecture 3 / Lec 3), `module` (模块 3 / Module 3 / Mod 3), `lab` (实验 3 / Lab 3), `tutorial` (辅导 3 / Tutorial 3) and `workshop` (工作坊 3 / Workshop 3), shown in that order; units of any other kind come last, under 其他 / Other. Lectures and modules are the main units: the mock exam ticks them by default, newcomers start with the first one, and their cards share one style. Views take unit names, group titles and order from that module (`KIND_ORDER`, `groupByKind`, `kindGroupTitle`, `isMainKind`) instead of naming kinds themselves. Study-plan tasks link "Lecture 5", "Module 2", "Lab 3", "第 4 讲", "模块 1–3", "第 3 模块" and "实验 2" to their units.
course.json 中每个单元都有 kind。core/text/unit-labels.js 是命名单元类型、决定分组顺序的唯一位置：lecture（第 3 讲）、module（模块 3）、lab（实验 3）、tutorial（辅导 3）、workshop（工作坊 3），按此顺序显示；其他类型的单元排在最后，归入“其他 Other”。讲课与模块是主要单元：模拟考默认勾选它们，新同学从第一个主要单元开始，两者的卡片样式相同。各视图的单元名称、分组标题与顺序都取自该模块（KIND_ORDER、groupByKind、kindGroupTitle、isMainKind），不自行命名。学习计划中的“Lecture 5”“Module 2”“Lab 3”“第 4 讲”“模块 1–3”“第 3 模块”“实验 2”会链接到对应单元。

### Mock exam settings / 模拟考设置

`course.json` may describe the real test in an optional `mockExam` object, read by `views/practice/logic/mock-config.js`. Every field is optional; a missing field keeps the station default.
course.json 可以用可选的 mockExam 对象描述真实考试，由 views/practice/logic/mock-config.js 读取。每个字段都可以省略，省略时沿用全站默认值。

| field | meaning |
|---|---|
| `objectiveCount`, `writtenCount`, `minutes` | builder defaults, clamped by `MOCK_LIMITS` (at most 60, 10 and 180); `minutes: 0` means no limit. Station defaults: 20, 3 and 60. With `writtenCount: 0` the builder describes an objective-only paper |
| `objectiveTypes` | objective question types the paper and the availability counts use, a subset of `mcq`, `multi`, `tf`, `calc`; default all four |
| `note` | `{zh, en}`: one line about the real test, shown on the builder above the question counts |

Example: `"mockExam": { "objectiveCount": 25, "writtenCount": 0, "minutes": 90, "objectiveTypes": ["mcq"], "note": { "zh": "...", "en": "..." } }`. Settings the learner chose earlier while the page stayed open still win over these defaults.
页面打开期间学习者之前选过的设置，仍然优先于这些默认值。

### Announcement channels / 公告渠道

`course.json` `announcements` lists where the course announces test details, e.g. `["Quercus", "Piazza"]`. `core/text/course-channels.js` turns it into the wording of the footer and the mock-exam scope note ("Quercus / Piazza", "Quercus and Piazza"); without it they say "the course's official channels".
course.json 的 announcements 列出课程公布考试信息的渠道，例如 ["Quercus", "Piazza"]。core/text/course-channels.js 据此生成页脚与模拟考范围提示中的说法；没有该字段时使用“课程官方通知”。

## 5. Adding a new course / 新增一门课程

1. Write the course brief `study/tools/course-briefs/<course-id>.md` from the syllabus and the course files.
2. Create `study/courses/<course-id>/` with `course.json`, `lessons/`, `practice/`, `glossary/`, `review/`. Give every unit one of the kinds above, list the `announcements` channels, and add `mockExam` when the real test differs from the default paper.
3. Validate every file with the validator, then run the index builder.
4. Add the course to `study/courses/registry.json`.
5. Copy `csc105h5/index.html` to `<course-id>/index.html` and change `data-course`, `<title>`, description and canonical URL.
6. If the course needs a new interactive demo, add it under `study/engine/widgets/<domain>/<name>/`, register it in `widgets/widget-registry.js`, document its config in content-spec section 5 and teach `validate_content.py` its shape.
