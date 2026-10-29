# Study Station — Course-Pack Content Specification

You are producing study content for one course of the Topphi Study Station (topphi.com/study). Each course is a static web app at `topphi.com/<course-id>` that renders ONLY the JSON formats below; anything outside the schema is dropped or breaks validation.

Read this spec fully, then the course brief `study/tools/course-briefs/<course-id>.md`. The brief gives the course facts, the tests (dates, format, what may and may not be assumed about coverage), the unit ids, the notation that must be kept exactly, the proper names that are not translated, and the size targets. Where the brief is more specific than this spec, the brief wins.

## 0. Who the learner is (read this twice)

- A Chinese international student (Simplified Chinese native). English reading is weak, but **every test and exam is written in English** and answers must be written in English.
- Starts from absolute zero in every course: no background knowledge, no subject vocabulary, no math beyond basic arithmetic. They literally asked: "teach me like I am a fool, from zero, break everything into tiny pieces" (把我当傻子教，从 0 开始，一点点拆碎了揉碎了教).
- Test dates, formats and weights are in the course brief. Do NOT guess which units a test covers.

## 1. Language balance (the most important style rule)

| Where | Language |
|---|---|
| Explanations, analogies, step-by-step teaching, pitfalls | **Simplified Chinese**, plain spoken style (大白话), short sentences |
| Every technical term | Chinese + English in full-width parentheses on its first use in each section: `中位数（**median**）`. Bold the English term. After the first use you may use the English term alone in Chinese sentences so the learner gets used to seeing it. |
| Definitions the instructor gave on slides | Quote the **English definition** (verbatim or near-verbatim from the slide) inside an `exam` block, then explain it in Chinese |
| `exam` blocks ("考试这样写") | **English** sentences the learner can memorize and write on the exam (simple B1-level English, short sentences, exact course terminology), each with a Chinese gloss |
| Practice questions | Question stem and options in **English** (exactly like the real test), with a Chinese translation in the `zh` field; explanations in Chinese with English terms |
| Model answers for short/long answer questions | **English** (what to write on the exam) + Chinese breakdown of scoring points |

Do not translate proper names of tools, games, datasets, organizations or people; the course brief lists the ones that appear in the course.

## 2. Teaching method (how to "chew it up")

For every concept, walk the ladder in this order, each step a separate small block:
1. **是什么 (What)** — one-sentence plain-Chinese idea, no jargon.
2. **生活类比 (Analogy)** — an everyday analogy a Chinese student relates to (外卖、导航、考试、做饭、排队、微信、打游戏…). Mark clearly where the analogy stops working when relevant.
3. **课件原话 (Course definition)** — the slide's English definition in an `exam` block + Chinese gloss.
4. **拆开讲 (Break it down)** — explain every word/part of the definition separately.
5. **例子 (Example)** — prefer the slide's own example (same numbers); walk it step by step (`example` block with numbered steps).
6. **易错点 (Pitfalls)** — typical confusions.
7. **小测验 (Quick check)** — at least one `check` block (English stem, Chinese hint) per core section.

Other rules:
- Never assume prior knowledge. If you use a word like "variable", "function", "probability", "average" or "percentage", explain it first in one line.
- Prefer many short paragraphs over long ones. A `text` block should be <= ~120 Chinese characters when possible.
- Reproduce all worked numbers from slides exactly, and recompute them yourself before writing.
- For every "Discuss:" prompt and every in-class "Activity" on the slides, add a `discuss` block with a model answer — these are likely exam material.
- Mark anything that is NOT from the slides with a `note` block (tone "info") starting with `补充（课件外）：`. Never contradict the slides. Do not invent facts, dates, statistics, names, or test scope.
- Keep the slide notation exactly; the course brief lists the notation of each unit.
- If the slides say something is not required ("You don't need to memorize this formula", "Don't try to memorize this table"), say so explicitly in a `note` (tone "tip").

## 3. Inline markup allowed inside ANY string

- `**bold**` (use for English terms and key words), `` `code` `` (for code, formulas inline, variable names).
- `\n` inside a string becomes a line break.
- NOTHING else. **No HTML tags, no Markdown headings, no links, no emojis.** Use Chinese full-width punctuation in Chinese text and ASCII punctuation in English text. Inside JSON strings, ASCII double quotes must be escaped (`\"`); prefer Chinese quotes “ ” or single quotes in prose.

A "Bi" value below is an object `{"zh": "...", "en": "..."}`. Unless stated otherwise, at least one of `zh`/`en` is required; most places need both.

## 4. File formats

### 4.1 Lesson file (`lessons/<id>.json`) — one per unit (lecture, lab, module, tutorial or workshop)

```json
{
  "id": "lec03",
  "kind": "lecture",
  "number": 3,
  "title": {"en": "Search", "zh": "搜索"},
  "sources": [{"file": "lec03_search.pdf", "pages": 71}],
  "estimatedMinutes": 70,
  "oneLiner": {"zh": "一句大白话说清这一课", "en": "One simple English sentence."},
  "outcomes": [{"en": "slide learning outcome (verbatim if the slide lists them)", "zh": "中文意思"}],
  "sections": [
    {
      "id": "s01-symbolic-ai",
      "title": {"zh": "符号 AI 是什么", "en": "What is Symbolic AI"},
      "slides": "4-7",
      "level": "core",
      "blocks": [ { "type": "text", "zh": "..." } ]
    }
  ],
  "summary": [{"en": "Exam-ready English summary sentence", "zh": "中文"}],
  "examFocus": [{"en": "What could be asked", "zh": "为什么重要/怎么考", "sectionId": "s01-symbolic-ai"}]
}
```

- `kind`: `"lecture"`, `"lab"`, `"module"`, `"tutorial"` or `"workshop"`; the course brief says which kinds and ids the course uses. Labs and other hands-on units use the same structure; the brief describes their section order.
- Section `id`: `sNN-kebab-case` (NN = 01, 02…), unique in the file.
- `slides`: page range(s) in the PDF, e.g. `"17-22"` or `"9, 12-14"`. For handouts use the handout page numbers. Leave it out only for a section that has no slide source at all (for example a topic taught only from official solutions); then say in the section's first text block where the content comes from.
- `level`: `"core"` (must know), `"exam"` (high-probability exam point — use for the most testable sections only), `"extra"` (background/context, lower priority; e.g. course logistics).
- Size: see the course brief; each section has 4–14 blocks.

### 4.2 Block types (inside `sections[].blocks`)

| type | required fields | notes |
|---|---|---|
| `text` | `zh` | Main Chinese teaching paragraph. Optional `en`. |
| `analogy` | `zh` | 生活类比. Optional `limit` (zh) = where the analogy breaks. |
| `terms` | `items: [{en, zh, hint}]` | Key vocabulary card. `hint` = one-line Chinese explanation. |
| `exam` | `items: [{en, zh}]` | "考试这样写" — English sentences to memorize + Chinese gloss. Optional `label` (Bi) e.g. `{"zh":"课件原话定义","en":"Course definition"}`. |
| `example` | `title` (Bi), `steps: [{zh, en?}]` | Worked example, numbered steps. Optional `answer` (Bi). |
| `pitfall` | `items: [{zh, en?}]` | 易错点 / common confusions. |
| `list` | `items: [{zh?, en?}]` | Optional `style`: `"bullet"` (default) or `"number"`. Optional `title` (Bi). |
| `table` | `headers: [string]`, `rows: [[string]]` | Every row must have the same length as headers. Optional `caption` (Bi). Cells may mix zh/en. |
| `formula` | `expr` (string), `zh` | `expr` in plain text/Unicode, e.g. `Precision = TP / (TP + FP)` or `x̄ = Σx / n`. Optional `en`, optional `where: [{symbol, zh, en?}]`. |
| `code` | `code` (string), `zh` | Optional `language` (e.g. `"python"`, `"r"`, `"text"`). |
| `flow` | `items: [{en, zh}]` | A sequence of steps drawn with arrows (pipelines, procedures). Optional `title` (Bi). |
| `tree` | `root` (TreeNode) | Static tree diagram. TreeNode = `{label: string, shape?: "max"|"min"|"node"|"leaf", value?: string, edge?: string, children?: [TreeNode]}`. `edge` is the label of the edge from the parent. Optional `caption` (Bi). Keep trees small (<= 20 nodes). |
| `check` | `question` (Bi), `options: [Bi]`, `answer` (0-based index), `explain` (Bi) | Inline multiple-choice quick check. `question.en` and every `options[i].en` required; `zh` translations strongly recommended. 2–5 options. |
| `discuss` | `prompt` (Bi), `answer` (Bi) | For slide "Discuss:" prompts/activities. `answer.en` = a model answer the learner could write (2–5 sentences), `answer.zh` = Chinese explanation. |
| `note` | `tone`: `"info"`/`"tip"`/`"warn"`, `zh` | Callouts. Optional `en`. Use `info` + `补充（课件外）：` for outside knowledge, `tip` for study advice, `warn` for traps. |
| `widget` | `name`, `config` | Interactive demo, see catalog §5. Optional `caption` (Bi) explaining what to try. |

### 4.3 Practice question file (`practice/<id>.json`)

```json
{
  "lessonId": "lec03",
  "questions": [
    {
      "id": "lec03-q01",
      "type": "mcq",
      "difficulty": 1,
      "sectionId": "s03-state-tree",
      "prompt": {"en": "Which of the following ...?", "zh": "以下哪个……？"},
      "options": [{"en": "...", "zh": "..."}],
      "answer": 2,
      "explain": {"zh": "为什么选这个、其他为什么错", "en": "optional short English reason"}
    }
  ]
}
```

| type | fields beyond the common ones (`id`, `type`, `difficulty` 1–3, `sectionId`, `prompt`, `explain`) |
|---|---|
| `mcq` | `options` (3–5 Bi), `answer` = index |
| `multi` | `options` (4–6 Bi), `answer` = sorted array of indices ("select all that apply") |
| `tf` | `answer` = `true`/`false` (prompt is a statement in English) |
| `calc` | `answer` = number, `tolerance` = number (absolute), optional `unit` (string, e.g. `"%"`). If the answer is a percentage, store it as a percentage number (e.g. 70 with unit "%"). Steps go in `explain`. |
| `short` | `modelAnswer` (Bi; `en` = 1–3 sentences to write), `points: [Bi]` (2–4 scoring points) |
| `long` | `modelAnswer` (Bi; `en` = a full exam-quality paragraph, 80–180 words), `points: [Bi]` (3–6 scoring points) |

- Optional `table` on any question type: `{"headers": ["Member", "Yes", "No", "Total"], "rows": [["Yes", 30, 66, 96], ["No", 88, 933, 1021], ["Total", 118, 999, 1117]], "caption": Bi}`. It is printed under the prompt (in practice and in the mock exam) like a table on a real test paper: use it for two-way tables, frequency tables and R output values instead of squeezing them into the prompt. Cells are strings or numbers in English, like the real test; every row has as many cells as `headers` (or as the first row when there are no headers); at most 30 rows and 12 columns.
- `id` format: `<lessonId>-qNN` (two digits, sequential, unique).
- How many questions of each type: see the course brief, which follows the format of the real tests.
- Write like the real test: clear English, one unambiguous correct answer, plausible distractors built from real confusions, no trick wording, no "all of the above" unless truly natural.
- Every explanation must say why the right answer is right AND why tempting wrong answers are wrong.

### 4.4 Glossary file (`glossary/<id>.json`)

```json
{
  "lessonId": "lec03",
  "terms": [
    {
      "id": "state-tree",
      "en": "State tree (game tree)",
      "zh": "状态树（游戏树）",
      "def": {"en": "Exam-ready English definition (course wording).", "zh": "大白话中文解释"},
      "example": {"zh": "例子", "en": "optional"},
      "slides": "19-22",
      "related": ["node", "edge"]
    }
  ]
}
```

- `id`: lowercase kebab-case, globally meaningful (the same concept in different units must use the same id, e.g. `overfitting`, `median`, `standard-deviation`). The course brief may list canonical ids.
- Include every term a test could use (see the brief for targets).

## 5. Widget catalog (interactive demos the app implements)

Use a widget wherever it makes a concept click. Only these names exist. Keep configs small and exactly in this shape.

### 5.1 Programming and search

| name | config | what it shows |
|---|---|---|
| `turtle-sandbox` | `{"preset": one of "sequence", "function-call", "function-param", "function-two-params", "loop", "loop-robot", "loop-robot-9", "loop-calls-function", "nested-loop"}` | PencilCode-style turtle program, the drawing, and how many times each instruction runs (computation time). `loop-robot` is the CSC105H5 Lecture 2 p.27 "Loop 3 times" robot program; `loop-robot-9` is the p.28 nine-robot version. |
| `tree-growth` | `{"branching": 3, "depth": 4}` | How fast the number of states explodes as depth grows (the difficulty with search). |
| `minimax-tree` | `{"leaves": [2,3,5,-9,7,5,0,-1], "branching": 2, "rootPlayer": "max"}`, or for trees whose nodes have different numbers of children `{"tree": [[[[4,3],[0,6]],[[1,5]]],[[[5,6],[7,9]]]], "rootPlayer": "max"}` (a number is a leaf, a list holds a node's children) | Step-by-step minimax with ▲/▼ triangles. With `leaves`, the count must equal branching^depth (depth 1–4); with `tree`, every leaf must sit on the bottom level (depth 1–4, at most 81 leaves). Practice mode generates new leaves. |
| `heuristic-score` | `{"title": Bi, "players": [Bi, Bi], "features": [{"name": Bi, "weight": 1, "counts": [8, 7]}]}` | Weighted-feature heuristic, e.g. chess material advantage = Σ weight × (countA − countB). |

### 5.2 Machine learning and evaluation

| name | config | what it shows |
|---|---|---|
| `decision-boundary` | `{"xLabel": Bi, "yLabel": Bi, "classes": [{"id": "oak", "label": Bi}, {"id": "maple", "label": Bi}], "points": [{"x": 10, "y": 18, "class": "oak"}], "boundary": {"w0": -12, "w1": 1, "w2": 0.3}, "positiveClass": "oak"}` | Linear decision boundary w0 + w1x1 + w2x2 = 0 in a 2-D data space; points where the expression > 0 are predicted `positiveClass`. Shows accuracy and classification error live as the learner moves the line. Use your own small, clearly separable example data (6–12 points) unless the slide gives exact data. |
| `regression-mse` | `{"points": [[3, 12], [6, 15.5]], "start": {"w0": 19, "w1": -0.8}, "xLabel": Bi, "yLabel": Bi}` | Machine-learning notation: line y = w0 + w1x1, residuals (y − t), live MSE, and a "gradient descent step" button. 5–10 points. (Statistics courses use `least-squares-line` instead.) |
| `confusion-matrix` | `{"presets": [{"name": Bi, "tp": 28, "fp": 12, "fn": 2, "tn": 18}]}` | Editable confusion matrix (PREDICTED rows × ACTUAL columns, like the CSC105H5 slides) with accuracy, precision, recall, F1 and the substituted formulas. |
| `fairness-groups` | `{"groups": [{"name": Bi, "tp": 30, "fp": 10, "fn": 10, "tn": 50}, {"name": Bi, "tp": 10, "fp": 5, "fn": 15, "tn": 70}]}` | Per-group selection rate (demographic parity), precision (predictive parity), TPR and FPR (equalized odds), with which criteria hold. |
| `dice-max` | `{"dice": 8, "sides": 6, "rolls": 10}` | "Consequences of choosing the maximum": the max of many noisy measurements over-estimates the typical value (why validation accuracy over-reports). |

### 5.3 Neural networks and language models

| name | config | what it shows |
|---|---|---|
| `neuron` | `{"inputs": [{"name": "x1", "value": 1}, {"name": "x2", "value": 0}], "weights": [0.6, -0.4], "bias": 0, "activation": "sigmoid"}` | Artificial neuron: weighted sum then activation (`"sigmoid"`, `"relu"` or `"step"`). |
| `linear-separability` | `{"dataset": "and"}` (`"and"`, `"or"`, `"xor"`) | Try to separate two classes with one straight line; XOR is impossible without hidden layers. |
| `tokenizer-toy` | `{"text": "The student daydreamed in class."}` | Toy subword tokenization (day/dream/ed), clearly labelled as a simplified demo. |
| `temperature-sampler` | `{"context": "The cat sat on the", "candidates": [{"token": "mat", "prob": 0.55}, {"token": "floor", "prob": 0.2}]}` | Next-token probability distribution and how temperature reshapes it; sample tokens. Probabilities should sum to ~1 (3–6 candidates). |

### 5.4 Statistics

Labels (`title`, `variable`, `cases`, `rowVariable`, `columnVariable`, `xLabel`, `yLabel`, `xName`, `yName`, row/column/category/group names) are Bi with both `zh` and `en`. `unit` is a short plain string such as `"kcal"` or `"$"`. The one-variable widgets write the data as y with mean ȳ and standard deviation S, like the STA220 slides; the two-variable widgets use x, y, x̄, ȳ, s_x, s_y. Use the slide's own data whenever the slide gives it (same numbers), otherwise small invented data that shows the idea clearly. `quartiles` is `"hand"` (median of each half, the slides' hand method; default) or `"r7"` (R's default `quantile()`, which the slides say may differ from hand results).

| name | config | what it shows |
|---|---|---|
| `two-way-table` | `{"title": Bi, "rowVariable": Bi, "columnVariable": Bi, "rows": [Bi, Bi], "columns": [Bi, Bi], "counts": [[30, 66], [88, 933]], "decimals": 3, "start": "counts"}` | Contingency table with totals; switch between counts, total (joint and marginal), row and column percentages; selecting a cell explains its fraction and denominator; segmented bar chart of the conditional distributions; practice mode "what proportion of A are B?". 2–6 rows and columns, non-negative integer counts. `start`: `"counts"`, `"total"`, `"row"` or `"column"`. `decimals`: a whole number from 2 to 6 (default 3). |
| `category-chart` | `{"title": Bi, "variable": Bi, "categories": [{"label": Bi, "count": 12}, {"label": Bi, "count": 8}], "display": "both"}` | Frequency table (count, relative frequency) with a bar chart and/or pie chart (`display`: `"bar"`, `"pie"` or `"both"`). 2–10 categories. |
| `histogram` | `{"title": Bi, "variable": Bi, "unit": "kcal", "data": [150, 180, 210], "binWidth": 50, "start": 100, "closed": "right", "views": ["histogram", "dotplot", "stemleaf"], "leafUnit": 1}` | Histogram with adjustable bin width and start, the bin frequency table, mean and median markers, and dotplot / stem-and-leaf views. `closed`: `"right"` = bins (a, b] like R's `hist()`, which the STA220 slides use; `"left"` = bins [a, b). 5–200 values; `binWidth` must give 2–60 bars; `leafUnit` is a power of ten. |
| `center-spread` | `{"title": Bi, "variable": Bi, "cases": Bi, "unit": "", "data": [2, 4, 4, 5, 7], "quartiles": "hand", "transform": true}` (`cases`, optional, names what the data describe, e.g. Tim Hortons donuts, and fills the instructor's sentences "On average, <cases> have ...") | Step-by-step mean, median (position 0.5(n + 1)), mode, range, quartiles and IQR, and the standard-deviation table (x − x̄, (x − x̄)², s² = Σ/(n − 1)). Editable values and an "add an outlier" button show which measures are resistant; `transform` adds "add c" / "multiply by k" controls. 3–30 values. |
| `boxplot` | `{"title": Bi, "variable": Bi, "unit": "kcal", "quartiles": "hand", "groups": [{"name": Bi, "data": [150, 180, 210, 250, 400]}]}`, or from a given summary `{"groups": [{"name": Bi, "summary": {"min": 150, "q1": 210, "median": 250, "q3": 277.5, "max": 400}, "whiskers": [150, 340], "outliers": [400]}]}` | Construction steps (five-number summary, IQR, 1.5 × IQR, inner fences, outer fences, suspect and highly suspect outliers, whiskers) and side-by-side boxplots on a shared axis. 1–4 groups; raw data needs at least 4 values. |
| `z-score` | `{"title": Bi, "variable": Bi, "unit": "", "mean": 250, "sd": 50, "values": [400, 150]}`, or `{"title": Bi, "compare": [{"name": Bi, "mean": 70, "sd": 8, "value": 82}, {"name": Bi, "mean": 60, "sd": 5, "value": 68}]}` | z = (x − x̄)/s with the numbers substituted, a number line at x̄ ± 1, 2, 3 SD and the interpretation sentence; `compare` shows which score is relatively higher. 1–6 values or 2–4 comparisons. |
| `scatter-correlation` | `{"title": Bi, "xLabel": Bi, "yLabel": Bi, "xName": Bi, "yName": Bi, "points": [[1, 2], [2, 3], [3, 5], [4, 4]]}` (`xName`/`yName` optional: short variable names for the sentences) | Scatterplot with movable, addable and removable points; live r with the z-score product table r = Σ z_x z_y / (n − 1); direction and strength wording; outlier and change-of-units demos. 4–30 points. |
| `least-squares-line` | `{"title": Bi, "xLabel": Bi, "yLabel": Bi, "xName": Bi, "yName": Bi, "points": [[60, 55], [70, 62]]}`, or from summary statistics `{"title": Bi, "xName": Bi, "yName": Bi, "summary": {"xbar": 70, "sx": 10, "ybar": 62, "sy": 8, "r": 0.77}}` | b1 = r·s_y/s_x and b0 = ȳ − b1·x̄ substituted, ŷ = b0 + b1x, residuals e = y − ŷ, residual plot, R² = r², slope/intercept/R² interpretation sentences in context, prediction with an extrapolation warning, and a "try your own line" mode. 3–30 points. |

## 6. Process requirements for every author

1. Read this spec and the course brief fully before writing.
2. Base everything on the course files (PDF slides/handouts). Read the text AND look at the slide images (they carry diagrams, tables, charts, numbers and handwritten notes).
3. Write valid UTF-8 JSON. After writing, run the validator and fix every ERROR (and every WARN you reasonably can) until it reports OK:
   `python study/tools/validate_content.py <kind> <unit-id> --pack study/courses/<course-id>`
   where `<kind>` is `lesson`, `questions` or `glossary` (or `all` for the whole pack).
4. Files live in the course pack: `lessons/`, `practice/` (question banks), `glossary/`, `review/`. After adding or renaming sections, run `python study/tools/build_course_index.py study/courses/<course-id>`.
