#!/usr/bin/env python3
"""
ai-generate-playwright-tests.py

Generate Playwright + Cucumber test code from structured security testcase JSON using an NVIDIA-powered agent.

Usage:
  python3 scripts/ai-generate-playwright-tests.py \
    --agent .claude/agents/security-vuln-automation.md \
    --input test/testcaseInJson/security_testcases_generated.json
"""

import argparse
import json
import os
import re
import sys
import urllib.error
import urllib.request
from pathlib import Path


def _read_agent_prompt(agent_path: Path) -> str:
    text = agent_path.read_text(encoding="utf-8", errors="replace")
    if text.startswith("---"):
        parts = text.split("\n---\n", 1)
        if len(parts) == 2:
            return parts[1].strip()
    return text.strip()


def _safe_read(path: Path) -> str:
    if not path.exists():
        return ""
    return path.read_text(encoding="utf-8", errors="replace")


def _build_user_prompt(testcase_json: str) -> str:
    return (
        "Read the security testcase JSON below and return ONLY a single valid JSON object with this structure:\n"
        "{\n  \"files\": [\n    {\"path\": \"test/features/my.feature\", \"content\": \"...\"},\n    ...\n  ]\n}\n"
        "Each file path must be repo-relative and each content string must contain the full UTF-8 source for that file. "
        "Do not include markdown fences, explanations, or any extra text.\n\n"
        "Input JSON:\n"
        "===== BEGIN TESTCASE JSON =====\n"
        f"{testcase_json}\n"
        "===== END TESTCASE JSON =====\n"
    )


def _call_nvidia(system_prompt: str, user_prompt: str, model: str, base_url: str, max_tokens: int) -> str:
    api_key = os.environ.get("NVIDIA_API_KEY", "").strip()
    if not api_key:
        print("ERROR: NVIDIA_API_KEY is not set.", file=sys.stderr)
        sys.exit(1)
    payload = {
        "model": model,
        "max_tokens": max_tokens,
        "temperature": 0.1,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
    }
    req = urllib.request.Request(
        f"{base_url.rstrip('/')}/chat/completions",
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {api_key}",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=180) as resp:
            data = json.load(resp)
    except (urllib.error.URLError, urllib.error.HTTPError, json.JSONDecodeError, TimeoutError) as exc:
        print(f"ERROR: NVIDIA API call failed: {exc}", file=sys.stderr)
        sys.exit(1)
    try:
        return data["choices"][0]["message"]["content"]
    except (KeyError, IndexError, TypeError):
        print("ERROR: NVIDIA response did not contain assistant content.", file=sys.stderr)
        sys.exit(1)


def _extract_json(text: str) -> dict | None:
    if not text:
        return None
    cleaned = re.sub(r"^```(?:json)?\s*", "", text.strip())
    cleaned = re.sub(r"```$", "", cleaned.strip())
    try:
        return json.loads(cleaned)
    except json.JSONDecodeError:
        match = re.search(r"\{[\s\S]*\}", cleaned)
        if match:
            try:
                return json.loads(match.group(0))
            except json.JSONDecodeError:
                return None
    return None


def _write_files(files: list[dict], base_dir: Path) -> list[Path]:
    created = []
    for item in files:
        if not isinstance(item, dict):
            continue
        rel_path = item.get("path")
        content = item.get("content")
        if not rel_path or content is None:
            continue
        if ".." in rel_path.replace("\\", "/"):
            raise ValueError(f"Invalid relative path: {rel_path}")
        target = base_dir / rel_path
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(content, encoding="utf-8")
        created.append(target)
    return created


def main() -> int:
    p = argparse.ArgumentParser(description="Generate Playwright + Cucumber test files from structured testcase JSON.")
    p.add_argument("--agent", type=Path, required=True)
    p.add_argument("--input", type=Path, required=True)
    p.add_argument("--base-dir", type=Path, default=Path("."))
    p.add_argument("--reports", type=Path, default=Path("reports"))
    p.add_argument("--model", default=os.environ.get("NVIDIA_MODEL", "meta/llama-3.1-70b-instruct"))
    p.add_argument("--base-url", default=os.environ.get("NVIDIA_BASE_URL", "https://integrate.api.nvidia.com/v1"))
    p.add_argument("--max-tokens", type=int, default=int(os.environ.get("NVIDIA_MAX_TOKENS", "8000")))
    args = p.parse_args()

    system_prompt = _read_agent_prompt(args.agent)
    testcase_text = _safe_read(args.input)
    if not testcase_text:
        print(f"ERROR: Input file not found or empty: {args.input}", file=sys.stderr)
        sys.exit(1)

    args.reports.mkdir(parents=True, exist_ok=True)
    prompt = _build_user_prompt(testcase_text)
    (args.reports / "llm-prompt.txt").write_text(prompt, encoding="utf-8")

    response = _call_nvidia(system_prompt, prompt, args.model, args.base_url, args.max_tokens)
    (args.reports / "llm-response.txt").write_text(response, encoding="utf-8")

    parsed = _extract_json(response)
    if parsed is None or not isinstance(parsed, dict):
        print("ERROR: Failed to parse JSON from NVIDIA response. See reports/llm-response.txt.", file=sys.stderr)
        return 1

    files = parsed.get("files")
    if not isinstance(files, list):
        print("ERROR: Parsed JSON did not contain a 'files' array.", file=sys.stderr)
        return 1

    created = _write_files(files, args.base_dir)
    if not created:
        print("ERROR: No files were created from the agent output.", file=sys.stderr)
        return 1

    print("Generated files:")
    for path in created:
        print(f"- {path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
