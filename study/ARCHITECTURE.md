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
                                unit labels, speech                                  单元命名、朗读
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
      course.json               Meta, assessments, unit index, review file paths     课程元数据与单元索引
      lessons/<unit>.json       Lecture and lab lessons                              讲课与实验讲义
      practice/<unit>.json      Practice question banks                              练习题库
      glossary/<unit>.json      Glossary terms                                       术语表
      review/*.json             Cheat sheet, exam toolkit, course overview           速记、答题工具箱、课程总览
  tools/                        Authoring tools (content validator, index builder)   内容校验与索引生成工具
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

Content files follow the course-pack schema (lesson blocks, question types, glossary terms, review files). The authoritative descriptions are `study/tools/content-spec.md` (lessons, practice, glossary; section 0-2 describe the bilingual teaching style, with CSC105H5 as the worked example) and `study/tools/review-spec.md` (cheat sheet, exam toolkit, course overview). Tools:

- `python study/tools/validate_content.py <lesson|questions|glossary|review|all> [unit-id] --pack study/courses/<course-id>`
- `python study/tools/build_course_index.py study/courses/<course-id>` refreshes the unit index in `course.json` (titles, section ids, counts) from the lesson files.

## 5. Adding a new course / 新增一门课程

1. Create `study/courses/<course-id>/` with `course.json`, `lessons/`, `practice/`, `glossary/`, `review/`.
2. Validate every file with the validator, then run the index builder.
3. Add the course to `study/courses/registry.json`.
4. Copy `csc105h5/index.html` to `<course-id>/index.html` and change `data-course`, `<title>`, description and canonical URL.
5. If the course needs a new interactive demo, add it under `study/engine/widgets/<domain>/<name>/` and register it in `widgets/widget-registry.js`.
