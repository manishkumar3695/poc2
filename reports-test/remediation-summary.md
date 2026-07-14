# AI Auto-Remediation Summary

- **Status:** OK
- **Safe fixes applied:** 2 (deterministic: 2, LLM: 0)
- **Files changed:** 7

## Fixed (deterministic)

- [outdated-dependency] `pom.xml` — Bumped spring-boot-starter-parent from 3.3.13 to 3.5.14 (transitive fix for com.fasterxml.jackson.core:jackson-databind)
- [outdated-base-image] `Dockerfile` — Added `apt-get upgrade -y` to runtime stage to remediate image-level OS-package CVEs (30 findings, e.g. bsdutils, gzip, libblkid1, libc-bin, libc6)

## Diff stat

```
Dockerfile                                         |   1 +
 pom.xml                                            |   2 +-
 reports-test/ai-patch.diff                         | 821 ---------------------
 reports-test/changed-files.txt                     |   7 -
 reports-test/git-diff-stat.txt                     |   8 -
 reports-test/remediation-summary.md                |  31 -
 scripts/__pycache__/ai-remediation.cpython-312.pyc | Bin 74790 -> 75154 bytes
 7 files changed, 2 insertions(+), 868 deletions(-)
```

## Reviewer checklist

- [ ] Confirm no business logic was changed
- [ ] Run `mvn -B -ntp -Pcoverage verify` locally
- [ ] Review the unified diff in `ai-patch.diff`
- [ ] For LLM fixes, sanity-check the new file content end-to-end
- [ ] Approve the PR if the changes are acceptable
