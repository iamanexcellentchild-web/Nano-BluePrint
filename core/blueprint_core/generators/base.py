from dataclasses import dataclass


@dataclass
class GeneratedFile:
    path: str
    content: str
    overwrite: bool = True  # False = write once, then it belongs to the developer
