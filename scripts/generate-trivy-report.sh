#!/usr/bin/env bash
#
# generate-trivy-report.sh
#
# Thin wrapper around the `trivy` CLI that produces the three files the
# pipeline expects from a filesystem scan:
#   <out-dir>/trivy-report.json  - normalised, structured findings
#   <out-dir>/trivy-report.txt   - human-readable summary
#   <out-dir>/trivy-fs.sarif     - SARIF for GitHub Security tab upload
#
# Usage:
#   generate-trivy-report.sh <out-dir> [<scan-path>]
#
# Env (optional):
#   TRIVY_SEVERITY  - default: CRITICAL,HIGH,MEDIUM,LOW
#   TRIVY_VERSION   - default: 0.72.0
#   SKIP_INSTALL    - if set, do not attempt to install the Trivy CLI
#
# Exit code: 0 always — Trivy findings are informational, not gating
# (matches the policy used elsewhere in the pipeline).
set -euo pipefail

OUT_DIR="${1:-reports}"
SCAN_PATH="${2:-.}"
SEVERITY="${TRIVY_SEVERITY:-CRITICAL,HIGH,MEDIUM,LOW}"
TRIVY_VERSION="${TRIVY_VERSION:-0.72.0}"

mkdir -p "$OUT_DIR"

# ---------------------------------------------------------------------
# Install Trivy if not present.
#
# Primary path: download the Linux-64bit tarball directly from the GitHub
# release, verify it against the published checksums.txt (defence against
# CDN tampering / redirect hijinks), and untar trivy into /usr/local/bin.
#
# Fallback: use Trivy's upstream install.sh (which fetches from get.trivy.dev).
# ---------------------------------------------------------------------
if ! command -v trivy >/dev/null 2>&1; then
  if [ -n "${SKIP_INSTALL:-}" ]; then
    echo "::error::Trivy not on PATH and SKIP_INSTALL is set; cannot scan."
    exit 1
  fi

  echo "Installing trivy ${TRIVY_VERSION}..."
  tmpdir="$(mktemp -d)"
  trap 'rm -rf "$tmpdir"' EXIT
  installed=0

  # ---- Primary: direct GitHub release with checksum verification ----
  base="https://github.com/aquasecurity/trivy/releases/download/v${TRIVY_VERSION}"
  asset="trivy_${TRIVY_VERSION}_Linux-64bit.tar.gz"
  if curl -fsSL -o "${tmpdir}/trivy.tar.gz" "${base}/${asset}" \
     && curl -fsSL -o "${tmpdir}/trivy_checksums.txt" "${base}/trivy_${TRIVY_VERSION}_checksums.txt"; then
    expected="$(awk -v a="${asset}" '$2 == a || $2 == "./"a {print $1; exit}' "${tmpdir}/trivy_checksums.txt" || true)"
    if [ -n "${expected:-}" ]; then
      actual="$(sha256sum "${tmpdir}/trivy.tar.gz" | awk '{print $1}')"
      if [ "${expected}" = "${actual}" ]; then
        tar -xz -C /usr/local/bin trivy -f "${tmpdir}/trivy.tar.gz"
        installed=1
        echo "  installed from ${asset} (sha256 verified)"
      else
        echo "::warning::sha256 mismatch for ${asset} (expected=${expected:0:12}.. actual=${actual:0:12}..)"
      fi
    else
      echo "::warning::No checksum entry for ${asset} in checksums.txt; skipping verification."
      tar -xz -C /usr/local/bin trivy -f "${tmpdir}/trivy.tar.gz"
      installed=1
      echo "  installed from ${asset} (checksum unavailable)"
    fi
  else
    echo "::warning::Direct download of ${asset} failed."
  fi

  # ---- Fallback: upstream install.sh (get.trivy.dev) ----
  if [ "${installed}" -eq 0 ]; then
    echo "::warning::Direct install failed; trying upstream install.sh..."
    if curl -fsSL "https://raw.githubusercontent.com/aquasecurity/trivy/main/contrib/install.sh" \
         | sh -s -- -b /usr/local/bin "v${TRIVY_VERSION}"; then
      installed=1
    else
      echo "::warning::Upstream install.sh also failed."
    fi
  fi

  if [ "${installed}" -eq 0 ] || ! command -v trivy >/dev/null 2>&1; then
    echo "::error::Failed to install trivy ${TRIVY_VERSION}. Try pinning a different TRIVY_VERSION, or pre-install trivy in the runner image and set SKIP_INSTALL=1."
    exit 1
  fi
  trivy --version
fi

echo "Running Trivy filesystem scan (${SCAN_PATH}) severities=${SEVERITY}"

# We always want all four output files to exist (so the artifact upload step
# has something to upload and the AI agent has something to consume). Track
# whether Trivy actually ran, and synthesise a placeholder report if not.
trivy_succeeded=0

# 1) SARIF for the GitHub Security tab
if trivy fs \
     --quiet \
     --format sarif \
     --output "${OUT_DIR}/trivy-fs.sarif" \
     --severity "${SEVERITY}" \
     --no-progress \
     "${SCAN_PATH}"; then
  trivy_succeeded=1
else
  echo "::warning::Trivy SARIF scan failed; writing empty SARIF placeholder."
  # Minimal valid SARIF 2.1.0 document so downstream tooling doesn't choke.
  cat > "${OUT_DIR}/trivy-fs.sarif" <<'EOF'
{
  "$schema": "https://json.schemastore.org/sarif-2.1.0.json",
  "version": "2.1.0",
  "runs": [
    {
      "tool": {
        "driver": {
          "name": "trivy",
          "version": "unknown",
          "informationUri": "https://github.com/aquasecurity/trivy"
        }
      },
      "results": []
    }
  ]
}
EOF
fi

# 2) Structured JSON — Trivy's own JSON output is richer than SARIF for diffing.
if trivy fs \
     --quiet \
     --format json \
     --output "${OUT_DIR}/trivy-report.raw.json" \
     --severity "${SEVERITY}" \
     --no-progress \
     "${SCAN_PATH}"; then
  : # success; raw JSON is in place
else
  echo "::warning::Trivy JSON scan failed; writing empty raw JSON placeholder."
  echo '{"Results":[]}' > "${OUT_DIR}/trivy-report.raw.json"
fi

# 3) Normalise the SARIF into a flatter shape (used by the AI agents and
#    the diff script). Always produces trivy-report.json, even on failure.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [ -f "${OUT_DIR}/trivy-fs.sarif" ] && command -v python3 >/dev/null 2>&1; then
  if ! python3 "${SCRIPT_DIR}/parse-sarif.py" "${OUT_DIR}/trivy-fs.sarif" --tool trivy \
       > "${OUT_DIR}/trivy-report.json" 2>"${OUT_DIR}/trivy-parse.log"; then
    echo "::warning::parse-sarif.py failed; writing empty trivy-report.json. See trivy-parse.log."
    echo "[]" > "${OUT_DIR}/trivy-report.json"
  fi
else
  echo "[]" > "${OUT_DIR}/trivy-report.json"
fi

# 4) Plain-text summary for the artifact — always produced, even on failure.
if command -v python3 >/dev/null 2>&1; then
  if ! python3 - "${OUT_DIR}/trivy-report.json" "${OUT_DIR}/trivy-report.txt" <<'PYEOF'
import json, sys
from collections import Counter
from pathlib import Path

src = Path(sys.argv[1])
dst = Path(sys.argv[2])
try:
    findings = json.loads(src.read_text(encoding="utf-8"))
except Exception:
    findings = []

sev_counts = Counter(f.get("severity", "UNKNOWN") for f in findings)
cat_counts = Counter(f.get("category", "vulnerability") for f in findings)

lines = [
    "Trivy Filesystem Scan Summary",
    "=============================",
    "",
    f"Total findings: {len(findings)}",
    "",
    "By severity:",
]
for sev in ("CRITICAL", "HIGH", "MEDIUM", "LOW", "UNKNOWN"):
    lines.append(f"  {sev:9s} {sev_counts.get(sev, 0)}")
lines.append("")
lines.append("By category:")
for cat, n in cat_counts.most_common():
    lines.append(f"  {cat:15s} {n}")
lines.append("")
lines.append("Top 30 findings (sorted by severity, then by file):")
lines.append("-------------------------------------------------")
rank = {"CRITICAL": 4, "HIGH": 3, "MEDIUM": 2, "LOW": 1, "UNKNOWN": 0}
for f in sorted(findings, key=lambda x: (-rank.get(x.get("severity", "UNKNOWN"), 0), x.get("file", "")))[:30]:
    where = f.get("file") or "(no file)"
    if f.get("line"):
        where = f"{where}:{f['line']}"
    line = f"[{f.get('severity','UNKNOWN'):8s}] {f.get('category','vuln'):10s} "
    if f.get("cve"):
        line += f"{f['cve']:18s} "
    if f.get("pkgName"):
        line += f"{f['pkgName']}"
        if f.get("installedVersion"):
            line += f"@{f['installedVersion']}"
        if f.get("fixedVersion"):
            line += f" -> {f['fixedVersion']}"
    else:
        line += f"{f.get('ruleId','')}"
    line += f"  -- {where}"
    lines.append(line)
if len(findings) > 30:
    lines.append("")
    lines.append(f"... and {len(findings) - 30} more (see trivy-report.json)")
dst.write_text("\n".join(lines) + "\n", encoding="utf-8")
PYEOF
  then
    :
  else
    echo "::warning::Failed to render trivy-report.txt; writing placeholder."
    cat > "${OUT_DIR}/trivy-report.txt" <<'TXT'
Trivy Filesystem Scan Summary
=============================

Total findings: 0
(summary rendering failed — see trivy-parse.log)
TXT
  fi
else
  echo "Trivy scan produced no output (python3 not available to render summary)" > "${OUT_DIR}/trivy-report.txt"
fi

# 5) Always print a short summary to the run log
echo "Trivy scan complete. Findings:"
if [ -f "${OUT_DIR}/trivy-report.json" ]; then
  python3 -c "import json,sys; d=json.load(open('${OUT_DIR}/trivy-report.json')); s={}; [s.update({x.get('severity','UNKNOWN'):s.get(x.get('severity','UNKNOWN'),0)+1}) for x in d]; print('  CRITICAL=%d HIGH=%d MEDIUM=%d LOW=%d UNKNOWN=%d TOTAL=%d' % (s.get('CRITICAL',0),s.get('HIGH',0),s.get('MEDIUM',0),s.get('LOW',0),s.get('UNKNOWN',0),len(d)))" 2>/dev/null || echo "  (summary unavailable)"
fi

# 6) Final safety net: assert all four expected output files exist. If any
#    are missing for any reason, create empty placeholders so the upload
#    step never reports "No files were found".
for f in trivy-report.json trivy-report.txt trivy-fs.sarif trivy-report.raw.json; do
  if [ ! -s "${OUT_DIR}/${f}" ]; then
    echo "::warning::${f} missing or empty; writing placeholder."
    case "${f}" in
      *.sarif)    echo '{"$schema":"https://json.schemastore.org/sarif-2.1.0.json","version":"2.1.0","runs":[{"tool":{"driver":{"name":"trivy"}},"results":[]}]}' > "${OUT_DIR}/${f}" ;;
      *.json)     echo '[]' > "${OUT_DIR}/${f}" ;;
      *.txt)      echo "Trivy scan produced no output (${f} is a placeholder)." > "${OUT_DIR}/${f}" ;;
    esac
  fi
done
echo "Trivy outputs in ${OUT_DIR}:"
ls -la "${OUT_DIR}/trivy-"* 2>/dev/null || true
