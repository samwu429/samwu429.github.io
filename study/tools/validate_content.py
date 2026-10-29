"""Validate study-station course-pack files against the content contract.

Checks JSON validity, required fields, block and question types, widget configs and the
inline-markup rules (only **bold**, `code` and line breaks; no HTML, no emojis).
校验课程包文件是否符合内容契约：JSON 合法性、必填字段、内容块与题型、交互组件配置，以及行内标记规则。

Usage / 用法:
    python study/tools/validate_content.py all --pack study/courses/csc105h5
    python study/tools/validate_content.py lesson lec03 --pack study/courses/csc105h5
Kinds: lesson | questions | glossary | review (unit id = cheatsheet | exam-toolkit | course-overview) | all
Exit code is 0 only when no ERROR is found. 仅当没有 ERROR 时退出码为 0。
"""
import argparse
import json
import re
import sys
from collections import Counter
from pathlib import Path

FOLDERS = {"lesson": "lessons", "questions": "practice", "glossary": "glossary", "review": "review"}

CJK = re.compile(r"[一-鿿]")
HTML_TAG = re.compile(r"<\s*/?\s*[a-zA-Z][^>]*>")
EMOJI = re.compile("[\U0001F300-\U0001FAFF\U00002600-\U000027BF]")
SLIDES = re.compile(r"^\d+(\s*-\s*\d+)?(\s*,\s*\d+(\s*-\s*\d+)?)*$")
SECTION_ID = re.compile(r"^s\d{2}-[a-z0-9]+(-[a-z0-9]+)*$")
TERM_ID = re.compile(r"^[a-z0-9]+(-[a-z0-9]+)*$")

WIDGETS = {
    "turtle-sandbox": ["preset"],
    "tree-growth": ["branching", "depth"],
    "minimax-tree": ["rootPlayer"],
    "heuristic-score": ["title", "players", "features"],
    "decision-boundary": ["xLabel", "yLabel", "classes", "points", "boundary", "positiveClass"],
    "regression-mse": ["points", "start", "xLabel", "yLabel"],
    "confusion-matrix": ["presets"],
    "fairness-groups": ["groups"],
    "dice-max": ["dice", "sides", "rolls"],
    "neuron": ["inputs", "weights", "bias", "activation"],
    "linear-separability": ["dataset"],
    "tokenizer-toy": ["text"],
    "temperature-sampler": ["context", "candidates"],
}
TURTLE_PRESETS = {
    "sequence", "function-call", "function-param", "function-two-params", "loop",
    "loop-robot", "loop-robot-9", "loop-calls-function", "nested-loop",
}
# Limits of the minimax-tree widget (engine/widgets/search/minimax-tree/minimax-logic.js).
# minimax-tree 组件的上限（见 minimax-logic.js）。
MINIMAX_MAX_DEPTH = 4
MINIMAX_MAX_LEAVES = 81

BLOCK_REQUIRED = {
    "text": ["zh"], "analogy": ["zh"], "terms": ["items"], "exam": ["items"],
    "example": ["title", "steps"], "pitfall": ["items"], "list": ["items"],
    "table": ["headers", "rows"], "formula": ["expr", "zh"], "code": ["code", "zh"],
    "flow": ["items"], "tree": ["root"], "check": ["question", "options", "answer", "explain"],
    "discuss": ["prompt", "answer"], "note": ["tone", "zh"], "widget": ["name", "config"],
}

REVIEW_KEYS = {
    "cheatsheet": ["title", "units", "formulaSheet", "confusables"],
    "exam-toolkit": ["verbs", "templates", "phrases", "mistakes", "strategy"],
    "course-overview": ["welcome", "howToUse", "bigPicture", "lessonLinks", "studyPlans"],
}


class Report:
    """Collects errors and warnings for one file. 收集单个文件的错误与警告。"""

    def __init__(self):
        self.errors, self.warnings = [], []

    def err(self, where, message):
        self.errors.append(f"ERROR {where}: {message}")

    def warn(self, where, message):
        self.warnings.append(f"WARN  {where}: {message}")

    def string(self, where, value, expect_cjk=None):
        if not isinstance(value, str) or not value.strip():
            self.err(where, "must be a non-empty string")
            return
        tag = HTML_TAG.search(value)
        if tag:
            self.err(where, f"contains an HTML tag: {tag.group(0)!r}")
        if EMOJI.search(value):
            self.err(where, "contains an emoji or pictographic symbol")
        if value.count("**") % 2:
            self.err(where, "unbalanced ** bold markers")
        if value.count("`") % 2:
            self.err(where, "unbalanced ` code markers")
        if expect_cjk is True and not CJK.search(value):
            self.warn(where, "zh text contains no Chinese characters")
        if expect_cjk is False and len(CJK.findall(value)) > 6:
            self.warn(where, "en text contains Chinese characters")

    def bi(self, where, value, need=("zh", "en")):
        if not isinstance(value, dict):
            self.err(where, "must be an object with zh/en")
            return
        unknown = set(value) - {"zh", "en"}
        if unknown:
            self.err(where, f"unknown keys {sorted(unknown)}")
        if not any(key in value for key in ("zh", "en")):
            self.err(where, "needs zh and/or en")
        for key in need:
            if key not in value:
                self.err(where, f"missing '{key}'")
        if "zh" in value:
            self.string(f"{where}.zh", value["zh"], expect_cjk=True)
        if "en" in value:
            self.string(f"{where}.en", value["en"], expect_cjk=False)

    def items(self, where, items, need):
        if not isinstance(items, list) or not items:
            self.err(where, "items must be a non-empty list")
            return
        for index, item in enumerate(items):
            self.bi(f"{where}[{index}]", item, need=need)


def check_tree(report, where, node, counter):
    if not isinstance(node, dict):
        report.err(where, "tree node must be an object")
        return
    counter[0] += 1
    report.string(f"{where}.label", node.get("label", ""))
    if node.get("shape") not in (None, "max", "min", "node", "leaf"):
        report.err(where, f"bad shape {node.get('shape')!r}")
    for index, child in enumerate(node.get("children", []) or []):
        check_tree(report, f"{where}.children[{index}]", child, counter)


def nested_minimax_depth(tree):
    """Depth of a nested minimax `tree` (numbers are leaves, lists hold children) whose leaves all
    sit on the bottom level, or None when the widget would reject it.
    嵌套 minimax `tree` 的深度（数字是叶子，列表装孩子）；叶子不在同一底层或超出组件上限时返回 None。"""
    level, depth = [tree], 0
    while all(isinstance(node, list) for node in level):
        if any(not node for node in level) or depth >= MINIMAX_MAX_DEPTH:
            return None
        depth += 1
        level = [child for node in level for child in node]
        if len(level) > MINIMAX_MAX_LEAVES:
            return None
    numbers = all(isinstance(value, (int, float)) and not isinstance(value, bool) for value in level)
    return depth if depth and numbers else None


def check_widget(report, where, block):
    name, config = block.get("name"), block.get("config")
    if name not in WIDGETS:
        report.err(where, f"unknown widget {name!r}")
        return
    if not isinstance(config, dict):
        report.err(where, "config must be an object")
        return
    for key in WIDGETS[name]:
        if key not in config:
            report.err(where, f"widget {name} config missing '{key}'")
    if name == "turtle-sandbox" and config.get("preset") not in TURTLE_PRESETS:
        report.err(where, f"unknown turtle preset {config.get('preset')!r}")
    if name == "minimax-tree" and "tree" in config:
        if nested_minimax_depth(config["tree"]) is None:
            report.err(where, "minimax tree must nest lists of numbers with every leaf on the bottom level, depth 1-4 and at most 81 leaves")
    elif name == "minimax-tree":
        if "leaves" not in config or "branching" not in config:
            report.err(where, "minimax-tree config needs either 'tree' or both 'leaves' and 'branching'")
        leaves, branching = config.get("leaves", []), config.get("branching", 2)
        depth, size = 0, 1
        while size < len(leaves) and branching > 1:
            size *= branching
            depth += 1
        if size != len(leaves) or not 1 <= depth <= MINIMAX_MAX_DEPTH:
            report.err(where, "minimax leaves must equal branching^depth with depth 1-4")
    if name == "minimax-tree":
        if config.get("rootPlayer") not in ("max", "min"):
            report.err(where, "rootPlayer must be max or min")
    if name == "neuron":
        if len(config.get("inputs", [])) != len(config.get("weights", [])):
            report.err(where, "neuron inputs and weights must have the same length")
        if config.get("activation") not in ("sigmoid", "relu", "step"):
            report.err(where, "activation must be sigmoid, relu or step")
    if name == "linear-separability" and config.get("dataset") not in ("and", "or", "xor"):
        report.err(where, "dataset must be and, or or xor")
    if name == "temperature-sampler":
        total = sum(candidate.get("prob", 0) for candidate in config.get("candidates", []))
        if abs(total - 1) > 0.05:
            report.warn(where, f"candidate probabilities sum to {total:.2f}, expected ~1")
    if name == "decision-boundary":
        class_ids = {item.get("id") for item in config.get("classes", [])}
        if config.get("positiveClass") not in class_ids:
            report.err(where, "positiveClass must be one of classes[].id")
        for index, point in enumerate(config.get("points", [])):
            if point.get("class") not in class_ids:
                report.err(f"{where}.points[{index}]", "class must be one of classes[].id")
    if "caption" in block:
        report.bi(f"{where}.caption", block["caption"], need=("zh",))


def check_block(report, where, block, stats):
    if not isinstance(block, dict) or "type" not in block:
        report.err(where, "block must be an object with a type")
        return
    kind = block["type"]
    if kind not in BLOCK_REQUIRED:
        report.err(where, f"unknown block type {kind!r}")
        return
    stats[kind] += 1
    missing = [key for key in BLOCK_REQUIRED[kind] if key not in block]
    if missing:
        report.err(where, f"{kind} block missing {missing}")
        return
    if kind in ("text", "analogy"):
        report.string(f"{where}.zh", block["zh"], expect_cjk=True)
        if "en" in block:
            report.string(f"{where}.en", block["en"], expect_cjk=False)
    elif kind == "terms":
        for index, item in enumerate(block["items"]):
            for key in ("en", "zh", "hint"):
                if key not in item:
                    report.err(f"{where}.items[{index}]", f"missing '{key}'")
                else:
                    report.string(f"{where}.items[{index}].{key}", item[key], expect_cjk=(key != "en"))
    elif kind == "exam":
        report.items(f"{where}.items", block["items"], need=("en", "zh"))
    elif kind == "example":
        report.bi(f"{where}.title", block["title"], need=("zh",))
        report.items(f"{where}.steps", block["steps"], need=("zh",))
    elif kind == "pitfall":
        report.items(f"{where}.items", block["items"], need=("zh",))
    elif kind == "list":
        report.items(f"{where}.items", block["items"], need=())
    elif kind == "table":
        headers = block["headers"]
        for row_index, row in enumerate(block["rows"]):
            if not isinstance(row, list) or len(row) != len(headers):
                report.err(f"{where}.rows[{row_index}]", "row length must equal header length")
    elif kind == "formula":
        report.string(f"{where}.expr", block["expr"])
    elif kind == "flow":
        report.items(f"{where}.items", block["items"], need=("en", "zh"))
    elif kind == "tree":
        check_tree(report, f"{where}.root", block["root"], [0])
    elif kind == "check":
        report.bi(f"{where}.question", block["question"], need=("en",))
        options = block["options"]
        if not isinstance(options, list) or not 2 <= len(options) <= 5:
            report.err(where, "check needs 2-5 options")
        elif not isinstance(block["answer"], int) or not 0 <= block["answer"] < len(options):
            report.err(where, "answer must be a valid 0-based option index")
        report.bi(f"{where}.explain", block["explain"], need=("zh",))
    elif kind == "discuss":
        report.bi(f"{where}.prompt", block["prompt"], need=("en",))
        report.bi(f"{where}.answer", block["answer"], need=("en", "zh"))
    elif kind == "note":
        if block["tone"] not in ("info", "tip", "warn"):
            report.err(where, "tone must be info, tip or warn")
    elif kind == "widget":
        check_widget(report, where, block)


def validate_lesson(report, data, unit_id):
    for key in ("id", "kind", "number", "title", "sources", "oneLiner", "outcomes", "sections", "summary", "examFocus"):
        if key not in data:
            report.err("lesson", f"missing '{key}'")
    if data.get("id") != unit_id:
        report.err("lesson.id", f"expected {unit_id!r}")
    if data.get("kind") not in ("lecture", "lab"):
        report.err("lesson.kind", "must be lecture or lab")
    report.bi("lesson.title", data.get("title"))
    report.bi("lesson.oneLiner", data.get("oneLiner"))
    report.items("lesson.outcomes", data.get("outcomes"), need=("en", "zh"))
    report.items("lesson.summary", data.get("summary"), need=("en", "zh"))
    section_ids, stats = set(), Counter()
    for s_index, section in enumerate(data.get("sections", [])):
        where = f"sections[{s_index}]"
        section_id = section.get("id", "")
        if not SECTION_ID.match(section_id):
            report.err(where, f"bad section id {section_id!r}")
        if section_id in section_ids:
            report.err(where, f"duplicate section id {section_id!r}")
        section_ids.add(section_id)
        report.bi(f"{where}.title", section.get("title"))
        if not SLIDES.match(str(section.get("slides", ""))):
            report.err(where, f"bad slides value {section.get('slides')!r}")
        if section.get("level") not in ("core", "exam", "extra"):
            report.err(where, "level must be core, exam or extra")
        if not section.get("blocks"):
            report.err(where, "no blocks")
        for b_index, block in enumerate(section.get("blocks", [])):
            check_block(report, f"{where}.blocks[{b_index}]", block, stats)
    for f_index, focus in enumerate(data.get("examFocus", [])):
        if focus.get("sectionId") not in section_ids:
            report.err(f"examFocus[{f_index}]", f"sectionId {focus.get('sectionId')!r} not found")
    return f"sections={len(section_ids)} blocks={sum(stats.values())}", section_ids


def validate_questions(report, data, unit_id, section_ids):
    if data.get("lessonId") != unit_id:
        report.err("questions.lessonId", f"expected {unit_id!r}")
    seen, types = set(), Counter()
    for index, question in enumerate(data.get("questions", [])):
        question_id = question.get("id", "")
        where = f"questions[{index}] {question_id}"
        if not re.match(rf"^{re.escape(unit_id)}-q\d{{2,3}}$", question_id):
            report.err(where, "id must look like <unitId>-qNN")
        if question_id in seen:
            report.err(where, "duplicate id")
        seen.add(question_id)
        kind = question.get("type")
        types[kind] += 1
        if kind not in ("mcq", "multi", "tf", "calc", "short", "long"):
            report.err(where, f"bad type {kind!r}")
            continue
        if section_ids is not None and question.get("sectionId") not in section_ids:
            report.err(where, f"sectionId {question.get('sectionId')!r} not in lesson")
        report.bi(f"{where}.prompt", question.get("prompt"), need=("en", "zh"))
        report.bi(f"{where}.explain", question.get("explain"), need=("zh",))
        answer, options = question.get("answer"), question.get("options", [])
        if kind == "mcq" and not (isinstance(answer, int) and not isinstance(answer, bool) and 0 <= answer < len(options)):
            report.err(where, "mcq answer must be a valid index")
        if kind == "multi" and not (isinstance(answer, list) and answer and answer == sorted(set(answer)) and all(0 <= a < len(options) for a in answer)):
            report.err(where, "multi answer must be a sorted list of valid indices")
        if kind == "tf" and not isinstance(answer, bool):
            report.err(where, "tf answer must be true or false")
        if kind == "calc" and (not isinstance(answer, (int, float)) or isinstance(answer, bool) or not isinstance(question.get("tolerance"), (int, float))):
            report.err(where, "calc needs a numeric answer and tolerance")
        if kind in ("short", "long"):
            report.bi(f"{where}.modelAnswer", question.get("modelAnswer"), need=("en", "zh"))
            if not question.get("points"):
                report.err(where, "needs scoring points")
    return f"questions={len(seen)} {dict(types)}"


def validate_glossary(report, data, unit_id):
    if data.get("lessonId") != unit_id:
        report.err("glossary.lessonId", f"expected {unit_id!r}")
    seen = set()
    for index, term in enumerate(data.get("terms", [])):
        term_id = term.get("id", "")
        where = f"terms[{index}] {term_id}"
        if not TERM_ID.match(term_id):
            report.err(where, "id must be lowercase kebab-case")
        if term_id in seen:
            report.err(where, "duplicate id")
        seen.add(term_id)
        report.string(f"{where}.en", term.get("en", ""), expect_cjk=False)
        report.string(f"{where}.zh", term.get("zh", ""), expect_cjk=True)
        report.bi(f"{where}.def", term.get("def"), need=("en", "zh"))
    return f"terms={len(seen)}"


def walk_strings(report, where, value):
    if isinstance(value, dict):
        for key, child in value.items():
            if key in ("zh", "en") and isinstance(child, str):
                report.string(f"{where}.{key}", child, expect_cjk=(key == "zh"))
            else:
                walk_strings(report, f"{where}.{key}", child)
    elif isinstance(value, list):
        for index, child in enumerate(value):
            walk_strings(report, f"{where}[{index}]", child)
    elif isinstance(value, str):
        report.string(where, value)


def load(pack, kind, unit_id):
    with open(pack / FOLDERS[kind] / f"{unit_id}.json", encoding="utf-8") as handle:
        return json.load(handle)


def validate_one(pack, kind, unit_id):
    report = Report()
    try:
        data = load(pack, kind, unit_id)
    except FileNotFoundError:
        report.err(f"{kind} {unit_id}", "file not found")
        return report, ""
    except json.JSONDecodeError as exc:
        report.err(f"{kind} {unit_id}", f"invalid JSON: {exc}")
        return report, ""
    if kind == "lesson":
        summary, _ = validate_lesson(report, data, unit_id)
    elif kind == "questions":
        try:
            section_ids = {section["id"] for section in load(pack, "lesson", unit_id)["sections"]}
        except (OSError, ValueError, KeyError):
            section_ids = None
        summary = validate_questions(report, data, unit_id, section_ids)
    elif kind == "glossary":
        summary = validate_glossary(report, data, unit_id)
    else:
        for key in REVIEW_KEYS.get(unit_id, []):
            if key not in data:
                report.err(unit_id, f"missing '{key}'")
        walk_strings(report, unit_id, data)
        summary = f"keys={sorted(data)}"
    return report, summary


def main():
    parser = argparse.ArgumentParser(description="Validate study-station course-pack content.")
    parser.add_argument("kind", choices=[*FOLDERS, "all"])
    parser.add_argument("unit_id", nargs="?", default="")
    parser.add_argument("--pack", required=True, help="course pack folder, e.g. study/courses/csc105h5")
    parser.add_argument("--quiet", action="store_true", help="hide warnings")
    args = parser.parse_args()
    pack = Path(args.pack)

    if args.kind == "all":
        course = json.loads((pack / "course.json").read_text(encoding="utf-8"))
        targets = [(kind, unit["id"]) for unit in course["units"] for kind in ("lesson", "questions", "glossary")]
        targets += [("review", name) for name in REVIEW_KEYS]
    else:
        targets = [(args.kind, args.unit_id)]

    failed = 0
    for kind, unit_id in targets:
        report, summary = validate_one(pack, kind, unit_id)
        status = "OK" if not report.errors else "FAILED"
        failed += bool(report.errors)
        print(f"[{status}] {kind} {unit_id} {summary} ({len(report.errors)} errors, {len(report.warnings)} warnings)")
        for line in report.errors + ([] if args.quiet else report.warnings):
            print(f"    {line}")
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()
