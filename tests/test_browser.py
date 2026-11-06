"""Compatibility entry point for the portable Route Notebook browser suite."""
import runpy
from pathlib import Path

if __name__ == "__main__":
    runpy.run_path(str(Path(__file__).with_name("test_revision.py")), run_name="__main__")
