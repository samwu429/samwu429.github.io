# Study Station — Course-Pack Content Specification

You are producing study content for **CSC105H5 F (Fall 2026) — Artificial Intelligence Literacy**, University of Toronto Mississauga, instructor Joshua Jung. The content is rendered by a static web app (topphi.com/csc105h5). The app renders ONLY the JSON formats below; anything outside the schema is dropped or breaks validation.

## 0. Who the learner is (read this twice)

- A Chinese international student (Simplified Chinese native). English reading is weak, but **every test and the final exam are written in English** and answers must be written in English.
- Starts from absolute zero: no programming, no math beyond basic arithmetic, no CS vocabulary. They literally asked: "teach me like I am a fool, from zero, break everything into tiny pieces" (把我当傻子教，从 0 开始，一点点拆碎了揉碎了教).
- Tests: "a mix of multiple choice and long-answer questions (no coding)". Test 1 was 2026-10-06; **Test 2 is 2026-11-10** (1 hour, in class, 15%); **Final exam** (2 hours, covers all material, 40%, must get >= 40% on it to pass). Do NOT guess which lectures each test covers.

## 1. Language balance (the most important style rule)

| Where | Language |
|---|---|
| Explanations, analogies, step-by-step teaching, pitfalls | **Simplified Chinese**, plain spoken style (大白话), short sentences |
| Every technical term | Chinese + English in full-width parentheses on its first use in each section: `状态树（**state tree**）`. Bold the English term. After the first use you may use the English term alone in Chinese sentences so the learner gets used to seeing it. |
| Definitions the instructor gave on slides | Quote the **English definition** (verbatim or near-verbatim from the slide) inside an `exam` block, then explain it in Chinese |
| `exam` blocks ("考试这样写") | **English** sentences the learner can memorize and write on the exam (simple B1-level English, short sentences, exact course terminology), each with a Chinese gloss |
| Practice questions | Question stem and options in **English** (exactly like the real test), with a Chinese translation in the `zh` field; explanations in Chinese with English terms |
| Model answers for short/long answer questions | **English** (what to write on the exam) + Chinese breakdown of scoring points |

Do not translate proper names of tools/games/people: Python, PencilCode, Teachable Machine, Sokoban, Connect Four, Hua Rong Dao (华容道 may be added), COMPAS, Russell and Norvig, Turing Test (图灵测试（**Turing Test**）).

## 2. Teaching method (how to "chew it up")

For every concept, walk the ladder in this order, each step a separate small block:
1. **是什么 (What)** — one-sentence plain-Chinese idea, no jargon.
2. **生活类比 (Analogy)** — an everyday analogy a Chinese student relates to (外卖、导航、考试、做饭、排队、微信、打游戏…). Mark clearly where the analogy stops working when relevant.
3. **课件原话 (Course definition)** — the slide's English definition in an `exam` block + Chinese gloss.
4. **拆开讲 (Break it down)** — explain every word/part of the definition separately.
5. **例子 (Example)** — prefer the slide's own example (same numbers); walk it step by step (`example` block with numbered steps).
6. **易错点 (Pitfalls)** — typical confusions (e.g. precision vs recall, validation vs test set).
7. **小测验 (Quick check)** — at least one `check` block (English stem, Chinese hint) per core section.

Other rules:
- Never assume prior knowledge. If you use a word like "variable", "function", "probability", "vector", "average", explain it first in one line.
- Prefer many short paragraphs over long ones. A `text` block should be <= ~120 Chinese characters when possible.
- Reproduce all worked numbers from slides exactly (e.g. MSE example 83.42 / 7 ≈ 11.92; Precision = 28/40 = 70%).
- For every "Discuss:" prompt and every in-class "Activity" on the slides, add a `discuss` block with a model answer — these are likely long-answer exam material.
- Mark anything that is NOT from the slides with a `note` block (tone "info") starting with `补充（课件外）：`. Never contradict the slides. Do not invent facts, dates, statistics, names, or test scope.
- Keep the slide notation exactly: e.g. lec05 uses `y = w0 + w1x1`, target `t`, `error = y − t`; lec06 confusion matrix has PREDICTED rows and ACTUAL columns (TP top-left, FP top-right, FN bottom-left, TN bottom-right); minimax uses ▲ (our turn, maximize) and ▼ (opponent, minimize), rewards win +100 / loss −100 / draw 0.
- If the slides say something is not required ("You don't need to memorize this formula", "Don't try to memorize this table"), say so explicitly in a `note` (tone "tip").

## 3. Inline markup allowed inside ANY string

- `**bold**` (use for English terms and key words), `` `code` `` (for code, formulas inline, variable names).
- `\n` inside a string becomes a line break.
- NOTHING else. **No HTML tags, no Markdown headings, no links, no emojis.** Use Chinese full-width punctuation in Chinese text and ASCII punctuation in English text. Inside JSON strings, ASCII double quotes must be escaped (`\"`); prefer Chinese quotes “ ” or single quotes in prose.

A "Bi" value below is an object `{"zh": "...", "en": "..."}`. Unless stated otherwise, at least one of `zh`/`en` is required; most places need both.

## 4. File formats

### 4.1 Lesson file (`content/lessons/<id>.json`) — used for lectures (`lec01`…`lec07`) AND labs (`lab01`…`lab05`)

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

- `kind`: `"lecture"` or `"lab"`. Labs use the same structure; their first section should explain the lab's goal, then what you did step by step, then the concepts it practiced (with links in words to the lecture, e.g. "对应 Lecture 3 的 minimax"), then takeaways.
- Section `id`: `sNN-kebab-case` (NN = 01, 02…), unique in the file.
- `slides`: page range(s) in the PDF, e.g. `"17-22"` or `"9, 12-14"`. For labs use the handout page numbers.
- `level`: `"core"` (must know), `"exam"` (high-probability exam point — use for the most testable sections), `"extra"` (background/context, lower priority; e.g. course logistics).
- Typical size: lectures 10–18 sections, labs 4–8 sections; each section 4–14 blocks.

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
| `formula` | `expr` (string), `zh` | `expr` in plain text/Unicode, e.g. `Precision = TP / (TP + FP)`. Optional `en`, optional `where: [{symbol, zh, en?}]`. |
| `code` | `code` (string), `zh` | Optional `language` (e.g. `"pencilcode"`, `"python"`, `"text"`). |
| `flow` | `items: [{en, zh}]` | A sequence of steps drawn with arrows (pipelines, algorithms). Optional `title` (Bi). |
| `tree` | `root` (TreeNode) | Static tree diagram. TreeNode = `{label: string, shape?: "max"|"min"|"node"|"leaf", value?: string, edge?: string, children?: [TreeNode]}`. `edge` is the label of the edge from the parent (e.g. an action "up"). Optional `caption` (Bi). Keep trees small (<= 20 nodes). |
| `check` | `question` (Bi), `options: [Bi]`, `answer` (0-based index), `explain` (Bi) | Inline multiple-choice quick check. `question.en` and every `options[i].en` required; `zh` translations strongly recommended. 3–4 options. |
| `discuss` | `prompt` (Bi), `answer` (Bi) | For slide "Discuss:" prompts/activities. `answer.en` = a model answer the learner could write (2–5 sentences), `answer.zh` = Chinese explanation. |
| `note` | `tone`: `"info"`/`"tip"`/`"warn"`, `zh` | Callouts. Optional `en`. Use `info` + `补充（课件外）：` for outside knowledge, `tip` for study advice, `warn` for traps. |
| `widget` | `name`, `config` | Interactive demo, see catalog §5. Optional `caption` (Bi) explaining what to try. |

### 4.3 Practice question file (`content/questions/<id>.json`)

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

- `id` format: `<lessonId>-qNN` (two digits, sequential, unique).
- Per lecture aim for **28–40 questions**: ~14–18 `mcq`, ~4–6 `tf`, ~2–5 `multi`, `calc` wherever numbers appear in the lecture (minimax values, accuracy/error, MSE, precision/recall/F1, rates…), ~4–6 `short`, ~2–4 `long`. Labs: 8–14 questions.
- Write like the real test: clear English, one unambiguous correct answer, plausible distractors built from real confusions, no trick wording, no "all of the above" unless truly natural.
- Every explanation must say why the right answer is right AND why tempting wrong answers are wrong.

### 4.4 Glossary file (`content/glossary/<id>.json`)

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

- `id`: lowercase kebab-case, globally meaningful (the same concept in different lectures must use the same id, e.g. `overfitting`, `accuracy`, `heuristic`, `supervised-learning`).
- Include every term a test could use (aim 20–45 per lecture, 6–20 per lab).

## 5. Widget catalog (interactive demos the app implements)

Use a widget wherever it makes a concept click. Only these names exist. Keep configs small and exactly in this shape.

| name | config | what it shows |
|---|---|---|
| `turtle-sandbox` | `{"preset": one of "sequence", "function-call", "function-param", "function-two-params", "loop", "loop-robot", "loop-robot-9", "loop-calls-function", "nested-loop"}` | PencilCode-style turtle program, the drawing, and how many times each instruction runs (computation time). `loop-robot` is the Lecture 2 p.27 "Loop 3 times" robot program; `loop-robot-9` is the p.28 nine-robot version. |
| `tree-growth` | `{"branching": 3, "depth": 4}` | How fast the number of states explodes as depth grows (the difficulty with search). |
| `minimax-tree` | `{"leaves": [2,3,5,-9,7,5,0,-1], "branching": 2, "rootPlayer": "max"}`, or for trees whose nodes have different numbers of children `{"tree": [[[[4,3],[0,6]],[[1,5]]],[[[5,6],[7,9]]]], "rootPlayer": "max"}` (a number is a leaf, a list holds a node's children) | Step-by-step minimax with ▲/▼ triangles. With `leaves`, the count must equal branching^depth (depth 1–4); with `tree`, every leaf must sit on the bottom level (depth 1–4, at most 81 leaves). Practice mode generates new leaves. |
| `heuristic-score` | `{"title": Bi, "players": [Bi, Bi], "features": [{"name": Bi, "weight": 1, "counts": [8, 7]}]}` | Weighted-feature heuristic, e.g. chess material advantage = Σ weight × (countA − countB). |
| `decision-boundary` | `{"xLabel": Bi, "yLabel": Bi, "classes": [{"id": "oak", "label": Bi}, {"id": "maple", "label": Bi}], "points": [{"x": 10, "y": 18, "class": "oak"}], "boundary": {"w0": -12, "w1": 1, "w2": 0.3}, "positiveClass": "oak"}` | Linear decision boundary w0 + w1x1 + w2x2 = 0 in a 2-D data space; points where the expression > 0 are predicted `positiveClass`. Shows accuracy and classification error live as the learner moves the line. Use your own small, clearly separable example data (6–12 points) unless the slide gives exact data. |
| `regression-mse` | `{"points": [[3, 12], [6, 15.5]], "start": {"w0": 19, "w1": -0.8}, "xLabel": Bi, "yLabel": Bi}` | Line y = w0 + w1x1, residuals (y − t), live MSE, and a "gradient descent step" button. 5–10 points. |
| `confusion-matrix` | `{"presets": [{"name": Bi, "tp": 28, "fp": 12, "fn": 2, "tn": 18}]}` | Editable confusion matrix (PREDICTED rows × ACTUAL columns, like the slides) with accuracy, precision, recall, F1 and the substituted formulas. |
| `fairness-groups` | `{"groups": [{"name": Bi, "tp": 30, "fp": 10, "fn": 10, "tn": 50}, {"name": Bi, "tp": 10, "fp": 5, "fn": 15, "tn": 70}]}` | Per-group selection rate (demographic parity), precision (predictive parity), TPR and FPR (equalized odds), with which criteria hold. |
| `dice-max` | `{"dice": 8, "sides": 6, "rolls": 10}` | "Consequences of choosing the maximum": the max of many noisy measurements over-estimates the typical value (why validation accuracy over-reports). |
| `neuron` | `{"inputs": [{"name": "x1", "value": 1}, {"name": "x2", "value": 0}], "weights": [0.6, -0.4], "bias": 0, "activation": "sigmoid"}` | Artificial neuron: weighted sum then activation (`"sigmoid"`, `"relu"` or `"step"`). |
| `linear-separability` | `{"dataset": "and"}` (`"and"`, `"or"`, `"xor"`) | Try to separate two classes with one straight line; XOR is impossible without hidden layers. |
| `tokenizer-toy` | `{"text": "The student daydreamed in class."}` | Toy subword tokenization (day/dream/ed), clearly labelled as a simplified demo. |
| `temperature-sampler` | `{"context": "The cat sat on the", "candidates": [{"token": "mat", "prob": 0.55}, {"token": "floor", "prob": 0.2}]}` | Next-token probability distribution and how temperature reshapes it; sample tokens. Probabilities should sum to ~1 (3–6 candidates). |

## 6. Process requirements for every author

1. Read this spec fully before writing.
2. Base everything on the course files (PDF slides/handouts). Read the text AND look at the slide images (they carry diagrams, tables, trees, numbers).
3. Write valid UTF-8 JSON. After writing, run the validator and fix every ERROR (and every WARN you reasonably can) until it reports OK:
   `python study/tools/validate_content.py <kind> <unit-id> --pack study/courses/<course-id>`
   where `<kind>` is `lesson`, `questions` or `glossary` (or `all` for the whole pack).
4. Files live in the course pack: `lessons/`, `practice/` (question banks), `glossary/`, `review/`. After adding or renaming sections, run `python study/tools/build_course_index.py study/courses/<course-id>`.
