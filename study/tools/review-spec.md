# Course-level review files (cheat sheet, exam toolkit, course overview)

All language, markup and accuracy rules of content-spec.md apply (Bi = `{"zh": "...", "en": "..."}`, only `**bold**`, `` `code` `` and `\n` markup, no HTML, no emojis). Files live in the course pack folder `review/`. Validate with:
`python study/tools/validate_content.py review <name> --pack study/courses/<course-id>`

The examples below use CSC105H5 unit ids (lectures `lec01`…`lec07`, labs `lab01`…`lab05`). Use your course's unit ids, and read the course brief `study/tools/course-briefs/<course-id>.md`, which says what each file should focus on for that course. Glossary term ids come from the pack's `glossary/*.json`.

## 1. `cheatsheet.json` — "考前速记" one-page-per-unit review

```json
{
  "title": {"zh": "考前速记", "en": "Exam Cheat Sheet"},
  "units": [
    {
      "lessonId": "lec06",
      "title": {"zh": "评估与公平", "en": "Evaluation and Fairness"},
      "points": [{"en": "Exam-ready fact in simple English.", "zh": "中文"}],
      "formulas": [{"expr": "Precision = TP / (TP + FP)", "zh": "预测为正的里面，有多少是真的正"}],
      "mustKnowTerms": ["precision", "recall"]
    }
  ],
  "formulaSheet": [{"expr": "...", "zh": "...", "lessonId": "lec06"}],
  "confusables": [
    {"a": {"en": "Precision", "zh": "精确率"}, "b": {"en": "Recall", "zh": "召回率"},
     "difference": {"en": "One-sentence English contrast.", "zh": "中文区分方法/记忆口诀"}}
  ]
}
```
- One unit per main unit (lecture or module), 10–18 points each, highest-yield first. Labs only where they add exam-relevant facts (3–6 points).
- `formulaSheet`: every formula/calculation rule in the course, in one list.
- `confusables`: 12–25 pairs students mix up (the brief gives course examples).

## 2. `exam-toolkit.json` — "英文答题工具箱" for writing answers in English

```json
{
  "verbs": [{"en": "Explain", "zh": "解释", "meaning": {"zh": "老师想看到什么", "en": "..."}, "howTo": {"zh": "答题步骤", "en": "..."}, "starter": {"en": "Sentence starter ...", "zh": "..."}}],
  "templates": [
    {"id": "compare-two-methods", "title": {"zh": "比较两种方法", "en": "Compare two methods"},
     "whenToUse": {"zh": "...", "en": "..."},
     "skeleton": [{"en": "Sentence frame with ___ blanks.", "zh": "这一句的作用"}],
     "example": {"question": {"en": "Realistic exam question of this course", "zh": "..."},
                 "answer": {"en": "Full model answer 100-180 words", "zh": "中文解析"}}}
  ],
  "phrases": [{"group": {"zh": "因果", "en": "Cause and effect"}, "items": [{"en": "This leads to ...", "zh": "这导致……"}]}],
  "mistakes": [{"wrong": "Common wrong English sentence", "right": "Corrected sentence", "zh": "为什么错（中式英语常见问题）"}],
  "strategy": [{"zh": "考试时间分配/选择题技巧/长答题技巧", "en": "..."}]
}
```
- `verbs`: 10–14 instruction words used in this course's exam questions (explain, describe, define, compare, identify, interpret, calculate, justify...).
- `templates`: 8–12 answer templates mapped to the real kinds of questions of this course (the brief lists them). Every example answer must be correct according to the course slides.
- `phrases`: 6–10 groups (defining, giving examples, comparing, cause/effect, trade-offs, hedging, concluding, referring to the course).
- `mistakes`: 12–20 typical Chinese-speaker English errors in exam writing, using course vocabulary.
- `strategy`: 6–12 tips that fit the real test format.

## 3. `course-overview.json` — course home page text

```json
{
  "welcome": {"zh": "给零基础同学的欢迎语：这门课在讲什么，为什么不用怕", "en": "..."},
  "howToUse": [{"zh": "怎么用这个复习站（按什么顺序学、每个功能干什么）", "en": "..."}],
  "bigPicture": {
    "intro": {"zh": "...", "en": "..."},
    "branches": [{"id": "symbolic", "title": {"zh": "...", "en": "..."}, "lessons": ["lec02", "lec03", "lab02", "lab03"], "summary": {"zh": "...", "en": "..."}}]
  },
  "lessonLinks": [{"from": "lec01", "to": "lec03", "why": {"zh": "...", "en": "..."}}],
  "studyPlans": [
    {"id": "test2", "title": {"zh": "Test 2 冲刺计划（11 月 10 日）", "en": "Test 2 sprint plan (Nov 10)"},
     "note": {"zh": "考试范围以老师在 Quercus/Piazza 公布为准", "en": "..."},
     "days": [{"label": {"zh": "第 1–2 天", "en": "Days 1-2"}, "tasks": [{"zh": "...", "en": "..."}]}]}
  ]
}
```
- `branches`: the big threads of the course (the brief names them). Reuse the ids of `course.json` `branches` for the branches that correspond; an overview branch with no counterpart there (a theme running through the whole course, like ethics in CSC105H5) is shown as a thread across branches.
- `lessonLinks`: 8–15 important connections between units.
- `studyPlans`: one plan per upcoming test (the brief gives dates and length) plus `final` for the final exam. Never claim a scope the instructor has not announced. Tasks should reference concrete pages of this station: lessons, practice, flashcards, cheat sheet, exam toolkit, mock exam.
