"""Refresh the unit index inside a course pack's course.json from its lesson, practice and glossary files.

The course home and progress bars read titles, one-liners, section ids and counts from course.json,
so pages do not need to download every lesson file just to draw a list.
课程首页与进度条从 course.json 读取标题、一句话简介、小节 id 与数量统计，避免为了画列表而下载全部讲义文件。

Usage / 用法:
    python study/tools/build_course_index.py study/courses/csc105h5
"""
import json
import sys
from pathlib import Path


def read_json(path):
    return json.loads(path.read_text(encoding="utf-8")) if path.exists() else None


def refresh_unit(pack, unit):
    lesson = read_json(pack / unit["lesson"])
    if lesson:
        unit["title"] = lesson["title"]
        unit["oneLiner"] = lesson["oneLiner"]
        unit["number"] = lesson["number"]
        unit["kind"] = lesson["kind"]
        unit["sectionIds"] = [section["id"] for section in lesson["sections"]]
        if "estimatedMinutes" in lesson:
            unit["estimatedMinutes"] = lesson["estimatedMinutes"]
    practice = read_json(pack / unit["practice"]) if unit.get("practice") else None
    unit["questionCount"] = len(practice["questions"]) if practice else 0
    glossary = read_json(pack / unit["glossary"]) if unit.get("glossary") else None
    unit["termCount"] = len(glossary["terms"]) if glossary else 0
    return unit


def main():
    if len(sys.argv) != 2:
        print(__doc__)
        sys.exit(2)
    pack = Path(sys.argv[1])
    course_path = pack / "course.json"
    course = read_json(course_path)
    course["units"] = [refresh_unit(pack, unit) for unit in course["units"]]
    # LF line endings on every platform, so the file is identical whichever system rebuilt it.
    # 在所有平台上都写 LF 换行，无论在哪个系统上重建，文件都完全一致。
    with open(course_path, "w", encoding="utf-8", newline="\n") as handle:
        handle.write(json.dumps(course, ensure_ascii=False, indent=2) + "\n")
    for unit in course["units"]:
        print(f"{unit['id']}: {len(unit['sectionIds'])} sections, {unit['questionCount']} questions, {unit['termCount']} terms")


if __name__ == "__main__":
    main()
