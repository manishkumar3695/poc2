# AI Auto-Remediation Summary

- **Status:** OK
- **Safe fixes applied:** 1 (deterministic: 1, LLM: 0)
- **Files changed:** 14

## Fixed (deterministic)

- [outdated-base-image] `Dockerfile` — Added `apt-get upgrade -y` to runtime stage to remediate image-level OS-package CVEs (26 findings, e.g. bsdutils, libblkid1, libc-bin, libc6, libexpat1)

## Diff stat

```
Dockerfile                     |    1 +
 reports/SONAR_REPORT.md        |    8 +-
 reports/llm-prompt.txt         |  607 ++++++++++-
 reports/llm-response.txt       |   55 -
 reports/security-report.json   |  106 +-
 reports/security-review.json   |  106 +-
 reports/security-review.md     |   94 +-
 reports/security-summary.txt   |   24 +-
 reports/sonar-report.json      |    6 +-
 reports/trivy-image.raw.json   | 2262 +++++++++++-----------------------------
 reports/trivy-image.sarif      | 1466 ++++++--------------------
 reports/trivy-image.sarif.json |  360 +------
 reports/trivy-report.json      |  378 +------
 reports/trivy-report.txt       |   48 +-
 14 files changed, 1761 insertions(+), 3760 deletions(-)
```

## Reviewer checklist

- [ ] Confirm no business logic was changed
- [ ] Run `mvn -B -ntp -Pcoverage verify` locally
- [ ] Review the unified diff in `ai-patch.diff`
- [ ] For LLM fixes, sanity-check the new file content end-to-end
- [ ] Approve the PR if the changes are acceptable
