"""
Strip `Co-authored-by: Cursor ...` from commit messages.
- stdin -> stdout: for `git filter-branch --msg-filter`
- argv[1] = path: rewrite file in place (for commit-msg hook)
"""
import re
import sys

_PATTERN = re.compile(r"(?m)^Co-authored-by: Cursor[^\r\n]*(?:\r?\n|$)")


def strip_trailer(text: str) -> str:
    return _PATTERN.sub("", text)


def main() -> None:
    if len(sys.argv) > 1:
        path = sys.argv[1]
        with open(path, encoding="utf-8", errors="replace") as f:
            data = f.read()
        out = strip_trailer(data).rstrip("\n") + "\n"
        with open(path, "w", encoding="utf-8", newline="\n") as f:
            f.write(out)
        return
    data = sys.stdin.read()
    sys.stdout.write(strip_trailer(data).rstrip("\n") + "\n")


if __name__ == "__main__":
    main()
