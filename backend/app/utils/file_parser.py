"""
CodePilot RAG — File Parser Utility
Language-aware file reading with metadata extraction
"""
import ast
import re
from pathlib import Path
from typing import Iterator

import chardet

# ── Supported Languages ───────────────────────────────────────────────────────

EXTENSION_MAP: dict[str, str] = {
    ".py": "python",
    ".js": "javascript",
    ".ts": "typescript",
    ".tsx": "typescript",
    ".jsx": "javascript",
    ".java": "java",
    ".go": "go",
    ".rs": "rust",
    ".cpp": "cpp",
    ".cc": "cpp",
    ".cxx": "cpp",
    ".c": "c",
    ".h": "c",
    ".hpp": "cpp",
    ".cs": "csharp",
    ".rb": "ruby",
    ".php": "php",
    ".swift": "swift",
    ".kt": "kotlin",
    ".scala": "scala",
    ".md": "markdown",
    ".txt": "text",
    ".json": "json",
    ".yaml": "yaml",
    ".yml": "yaml",
    ".toml": "toml",
    ".ini": "ini",
    ".cfg": "ini",
    ".env": "env",
    ".sh": "bash",
    ".bash": "bash",
    ".zsh": "bash",
    ".sql": "sql",
    ".html": "html",
    ".css": "css",
    ".scss": "css",
    ".xml": "xml",
    ".dockerfile": "dockerfile",
}

# Directories and files to skip during ingestion
EXCLUDED_DIRS: set[str] = {
    "node_modules", ".git", "dist", "build", "out", ".next", "__pycache__",
    ".venv", "venv", "env", ".env", "vendor", "target", ".gradle", ".mvn",
    "coverage", ".pytest_cache", ".mypy_cache", ".ruff_cache", "eggs",
    ".eggs", "site-packages", "lib64", ".idea", ".vscode",
}

EXCLUDED_EXTENSIONS: set[str] = {
    ".pyc", ".pyo", ".pyd", ".so", ".dll", ".dylib", ".exe", ".bin",
    ".png", ".jpg", ".jpeg", ".gif", ".svg", ".ico", ".webp", ".bmp",
    ".mp4", ".mp3", ".wav", ".avi", ".mov", ".zip", ".tar", ".gz",
    ".rar", ".7z", ".lock", ".sum", ".whl", ".egg",
}

MAX_FILE_SIZE_BYTES = 500_000  # 500 KB per file


def get_language(path: Path) -> str:
    """Detect language from file extension."""
    suffix = path.suffix.lower()
    if path.name.lower() == "dockerfile":
        return "dockerfile"
    return EXTENSION_MAP.get(suffix, "unknown")


def is_excluded(path: Path) -> bool:
    """Return True if this file/directory should be skipped."""
    # Check excluded directories in path parts
    for part in path.parts:
        if part in EXCLUDED_DIRS:
            return True
    # Check extension
    if path.suffix.lower() in EXCLUDED_EXTENSIONS:
        return True
    # Check file size
    if path.is_file() and path.stat().st_size > MAX_FILE_SIZE_BYTES:
        return True
    return False


def read_file_safe(path: Path) -> str | None:
    """Read a file, auto-detecting encoding. Returns None on error."""
    try:
        raw = path.read_bytes()
        # Detect encoding
        result = chardet.detect(raw[:10_000])
        encoding = result.get("encoding") or "utf-8"
        text = raw.decode(encoding, errors="replace")
        return text
    except Exception:
        return None


def iter_repo_files(root: Path) -> Iterator[tuple[Path, str, str]]:
    """
    Yield (file_path, language, content) for all supported files in a repo.
    Skips excluded dirs, extensions, and oversized files.
    """
    for path in sorted(root.rglob("*")):
        if not path.is_file():
            continue
        relative = path.relative_to(root)
        if is_excluded(relative):
            continue
        language = get_language(path)
        if language == "unknown":
            continue
        content = read_file_safe(path)
        if content is None or not content.strip():
            continue
        yield path, language, content


# ── Python AST Analysis ───────────────────────────────────────────────────────

def extract_python_symbols(content: str) -> list[dict]:
    """Extract function and class definitions from Python source."""
    symbols = []
    try:
        tree = ast.parse(content)
        for node in ast.walk(tree):
            if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
                symbols.append({
                    "type": "function",
                    "name": node.name,
                    "line": node.lineno,
                    "docstring": ast.get_docstring(node) or "",
                })
            elif isinstance(node, ast.ClassDef):
                symbols.append({
                    "type": "class",
                    "name": node.name,
                    "line": node.lineno,
                    "docstring": ast.get_docstring(node) or "",
                })
    except SyntaxError:
        pass
    return symbols


# ── Generic Symbol Extraction (regex-based for non-Python) ───────────────────

FUNCTION_PATTERNS: dict[str, re.Pattern] = {
    "javascript": re.compile(r"(?:function\s+(\w+)|(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s+)?(?:function|\(.*?\)\s*=>))", re.M),
    "typescript": re.compile(r"(?:function\s+(\w+)|(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s+)?(?:function|\(.*?\)\s*=>)|(?:async\s+)?(\w+)\s*\(.*?\)\s*(?::\s*\w+)?\s*\{)", re.M),
    "java": re.compile(r"(?:public|private|protected|static|\s)+[\w<>\[\]]+\s+(\w+)\s*\(", re.M),
    "go": re.compile(r"^func\s+(?:\(\w+\s+\*?\w+\)\s+)?(\w+)\s*\(", re.M),
}


def extract_symbols_generic(content: str, language: str) -> list[dict]:
    """Extract function/method names using regex for supported languages."""
    pattern = FUNCTION_PATTERNS.get(language)
    if not pattern:
        return []
    symbols = []
    for i, line in enumerate(content.splitlines(), 1):
        match = pattern.search(line)
        if match:
            name = next((g for g in match.groups() if g), None)
            if name:
                symbols.append({"type": "function", "name": name, "line": i, "docstring": ""})
    return symbols


def extract_symbols(content: str, language: str) -> list[dict]:
    """Extract code symbols (functions, classes) from source."""
    if language == "python":
        return extract_python_symbols(content)
    return extract_symbols_generic(content, language)
