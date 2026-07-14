import importlib.util
spec = importlib.util.spec_from_file_location("ai_rem", "scripts/ai-remediation.py")
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)

import json, shutil
from pathlib import Path

# Backup
shutil.copy("pom.xml", "pom.xml.bak.test")
shutil.copy("Dockerfile", "Dockerfile.bak.test")

# Run each fixer
trivy = json.load(open("reports/trivy-report.json"))
print("--- fix_bump_dependencies ---")
fixes = mod.fix_bump_dependencies(Path("."), trivy)
print("  fixes:", len(fixes))
for f in fixes:
    print("   -", f["description"][:120])

print()
print("--- fix_bump_dockerfile_base ---")
fixes2 = mod.fix_bump_dockerfile_base(Path("."), trivy)
print("  fixes:", len(fixes2))
for f in fixes2:
    print("   -", f["description"][:120])

# Show resulting state
print()
print("--- pom.xml parent version after fixers ---")
for line in open("pom.xml", encoding="utf-8"):
    if "spring-boot-starter-parent" in line or "<version>" in line:
        print("   ", line.rstrip())

print()
print("--- Dockerfile runtime stage after fixers ---")
for line in open("Dockerfile", encoding="utf-8").readlines()[36:48]:
    print("   ", line.rstrip())

# Restore
shutil.move("pom.xml.bak.test", "pom.xml")
shutil.move("Dockerfile.bak.test", "Dockerfile")
print()
print("Restored.")
