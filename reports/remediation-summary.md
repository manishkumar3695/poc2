# AI Auto-Remediation Summary

- **Status:** OK
- **Safe fixes applied:** 1 (deterministic: 0, LLM: 1)
- **Files changed:** 1

## Fixed (deterministic)

- (none)

## Fixed (LLM-generated)

- [CVE-2026-41293] `pom.xml` — Upgrade org.apache.tomcat.embed:tomcat-embed-core to 11.0.22

## Diff stat

```
pom.xml | 203 ++--------------------------------------------------------------
 1 file changed, 6 insertions(+), 197 deletions(-)
```

## Reviewer checklist

- [ ] Confirm no business logic was changed
- [ ] Run `mvn -B -ntp -Pcoverage verify` locally
- [ ] Review the unified diff in `ai-patch.diff`
- [ ] For LLM fixes, sanity-check the new file content end-to-end
- [ ] Approve the PR if the changes are acceptable
