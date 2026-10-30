"""Blueprint core: diagram -> validation -> IR -> simulation -> generated code.

Pure Python, standard library only. No web framework imports belong here.
"""
from .model import Diagram, Edge, Issue, Node, DiagramFormatError
from .validate import validate, has_errors
from .ir import SystemIR, compile_ir
from .simulate import simulate
from .generators import generate, write_project, zip_project, TARGETS
from .block_library import library_as_dict
from .templates_loader import list_templates, load_template

__all__ = [
    "Diagram", "Edge", "Issue", "Node", "DiagramFormatError", "validate", "has_errors",
    "SystemIR", "compile_ir", "simulate", "generate", "write_project", "zip_project",
    "TARGETS", "library_as_dict", "list_templates", "load_template",
]
__version__ = "0.1.0"
