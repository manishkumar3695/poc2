#!/usr/bin/env python3
"""
ai-generate-testcases.py

Generate security test case JSON from a remediation report using an NVIDIA-powered agent.

Usage:
  python3 scripts/ai-generate-testcases.py \
    --agent .claude/agents/security-vuln-testcase-generator.md \
    --input reports/remediation-report.json \
    --output test/testcaseInJson/security_testcases_generated.json
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


def _build_user_prompt(input_path: Path, input_text: str) -> str:
    return (
        f"Read the remediation report below and return ONLY a single valid JSON object. "
        f"Do not include markdown fences, explanations, or any extra text. "
        f"The caller will save the JSON exactly as returned.\n\n"
        f"Input file: {input_path}\n"
        "===== BEGIN INPUT =====\n"
        f"{input_text}\n"
        "===== END INPUT =====\n"
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


def main() -> int:
    p = argparse.ArgumentParser(description="Generate security testcases JSON from a remediation report.")
    p.add_argument("--agent", type=Path, required=True)
    p.add_argument("--input", type=Path, required=True)
    p.add_argument("--output", type=Path, default=Path("test/testcaseInJson/security_testcases_generated.json"))
    p.add_argument("--reports", type=Path, default=Path("reports"))
    p.add_argument("--model", default=os.environ.get("NVIDIA_MODEL", "meta/llama-3.1-70b-instruct"))
    p.add_argument("--base-url", default=os.environ.get("NVIDIA_BASE_URL", "https://integrate.api.nvidia.com/v1"))
    p.add_argument("--max-tokens", type=int, default=int(os.environ.get("NVIDIA_MAX_TOKENS", "8000")))
    args = p.parse_args()

    system_prompt = _read_agent_prompt(args.agent)
    input_text = _safe_read(args.input)
    if not input_text:
        print(f"ERROR: Input file not found or empty: {args.input}", file=sys.stderr)
        sys.exit(1)

    args.reports.mkdir(parents=True, exist_ok=True)
    prompt = _build_user_prompt(args.input, input_text)
    (args.reports / "llm-prompt.txt").write_text(prompt, encoding="utf-8")

    response = _call_nvidia(system_prompt, prompt, args.model, args.base_url, args.max_tokens)
    (args.reports / "llm-response.txt").write_text(response, encoding="utf-8")

    parsed = _extract_json(response)
    if parsed is None:
        print("ERROR: Failed to parse JSON from NVIDIA response. See reports/llm-response.txt.", file=sys.stderr)
        return 1

    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(parsed, indent=2), encoding="utf-8")
    print(f"Generated security testcase JSON: {args.output}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
