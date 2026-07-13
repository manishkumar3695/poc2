# AI Auto-Remediation Summary

- **Status:** NO_CHANGES
- **Safe fixes applied:** 0 (deterministic: 0, LLM: 0)
- **Files changed:** 4

## Fixed (deterministic)

- (none)
- No safe automated fixes were applicable.

## Diff stat

```
reports/SONAR_REPORT.md      |   4 +-
 reports/sonar-report.json    |   4 +-
 reports/trivy-image.raw.json | 358 +++++++++++++++++++++----------------------
 reports/trivy-image.sarif    |   2 +-
 4 files changed, 184 insertions(+), 184 deletions(-)
```

## Reviewer checklist

- [ ] Confirm no business logic was changed
- [ ] Run `mvn -B -ntp -Pcoverage verify` locally
- [ ] Review the unified diff in `ai-patch.diff`
- [ ] For LLM fixes, sanity-check the new file content end-to-end
- [ ] Approve the PR if the changes are acceptable
