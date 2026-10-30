"""Name normalisation shared by validator, compiler and generators."""
import keyword
import re

IDENT_RE = re.compile(r"^[A-Za-z][A-Za-z0-9_ ]*$")


def snake(s: str) -> str:
    s = re.sub(r"[\s\-]+", "_", str(s).strip())
    s = re.sub(r"(?<=[a-z0-9])(?=[A-Z])", "_", s)
    return re.sub(r"_+", "_", s).lower()


def pascal(s: str) -> str:
    return "".join(p[:1].upper() + p[1:] for p in snake(s).split("_") if p)


def is_valid_name(s: object) -> bool:
    return isinstance(s, str) and bool(IDENT_RE.match(s)) and not keyword.iskeyword(snake(s))
