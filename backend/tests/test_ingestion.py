"""
CodePilot RAG — Ingestion Parsing Tests
Verifies file parsing extension maps and symbol extractors.
"""
from pathlib import Path
from app.utils.file_parser import get_language, is_excluded, extract_symbols


def test_language_detection():
    """Verify that file extension mapping resolves to correct programming languages."""
    assert get_language(Path("main.py")) == "python"
    assert get_language(Path("src/App.tsx")) == "typescript"
    assert get_language(Path("Dockerfile")) == "dockerfile"
    assert get_language(Path("index.html")) == "html"
    assert get_language(Path("styles.css")) == "css"
    assert get_language(Path("config.json")) == "json"


def test_file_exclusion():
    """Verify that node_modules, .git, and binary file types are correctly ignored."""
    assert is_excluded(Path("node_modules/lodash/index.js")) is True
    assert is_excluded(Path(".git/config")) is True
    assert is_excluded(Path("src/logo.png")) is True
    assert is_excluded(Path("src/components/Button.tsx")) is False


def test_symbol_extraction():
    """Verify code symbols extraction detects function scopes."""
    code = """
def calculate_metrics(data):
    \"\"\"Calculate basic averages.\"\"\"
    return sum(data) / len(data)

class MetricTracker:
    def __init__(self):
        self.history = []
"""
    symbols = extract_symbols(code, "python")
    assert len(symbols) == 3
    assert symbols[0]["name"] == "calculate_metrics"
    assert symbols[0]["type"] == "function"
    assert symbols[1]["name"] == "MetricTracker"
    assert symbols[1]["type"] == "class"
    assert symbols[2]["name"] == "__init__"
    assert symbols[2]["type"] == "function"




