"""
CodePilot RAG — Diff / Patch Generation Utilities
"""
import difflib
from typing import NamedTuple


class FilePatch(NamedTuple):
    file_path: str
    original: str
    modified: str
    unified_diff: str


def generate_unified_diff(
    original: str,
    modified: str,
    file_path: str,
    context_lines: int = 3,
) -> str:
    """Generate a unified diff string from two text versions."""
    original_lines = original.splitlines(keepends=True)
    modified_lines = modified.splitlines(keepends=True)

    diff = difflib.unified_diff(
        original_lines,
        modified_lines,
        fromfile=f"a/{file_path}",
        tofile=f"b/{file_path}",
        n=context_lines,
    )
    return "".join(diff)


def parse_llm_patch(patch_text: str) -> list[FilePatch]:
    """
    Parse a patch block from LLM output.
    Expects blocks like:
    ```diff
    --- a/path/to/file.py
    +++ b/path/to/file.py
    @@ ... @@
    ...
    ```
    Returns list of FilePatch objects.
    """
    patches: list[FilePatch] = []

    # Extract code blocks
    import re
    blocks = re.findall(r"```(?:diff)?\n(.*?)```", patch_text, re.DOTALL)

    for block in blocks:
        block = block.strip()
        if not block.startswith("---"):
            continue

        lines = block.splitlines()
        file_path = None
        for line in lines:
            if line.startswith("+++ b/"):
                file_path = line[6:].strip()
                break
            elif line.startswith("+++ "):
                file_path = line[4:].strip()
                break

        if file_path:
            patches.append(FilePatch(
                file_path=file_path,
                original="",
                modified="",
                unified_diff=block,
            ))

    return patches


def extract_affected_files(patch_text: str) -> list[str]:
    """Extract list of file paths affected by a patch."""
    import re
    files = []
    for match in re.finditer(r"\+\+\+ b/(.+)", patch_text):
        files.append(match.group(1).strip())
    return list(dict.fromkeys(files))  # deduplicate preserving order


def apply_patch_to_content(original: str, patch: str) -> str:
    """
    Attempt to apply a unified diff patch to original file content.
    Returns the patched content or raises ValueError on failure.
    """
    import subprocess
    import tempfile
    import os

    with tempfile.NamedTemporaryFile(mode="w", suffix=".orig", delete=False) as orig_f:
        orig_f.write(original)
        orig_path = orig_f.name

    with tempfile.NamedTemporaryFile(mode="w", suffix=".patch", delete=False) as patch_f:
        patch_f.write(patch)
        patch_path = patch_f.name

    try:
        result = subprocess.run(
            ["patch", "-o", "-", orig_path, patch_path],
            capture_output=True,
            text=True,
            timeout=10,
        )
        if result.returncode == 0:
            return result.stdout
        raise ValueError(f"Patch failed: {result.stderr}")
    finally:
        os.unlink(orig_path)
        os.unlink(patch_path)
