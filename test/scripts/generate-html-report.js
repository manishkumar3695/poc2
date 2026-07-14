/* eslint-disable no-console */
'use strict';

/**
 * Regenerate the standalone HTML report from the JUnit XML output.
 * Pulled in as `npm run test:report`. Skipped if the JUnit file is missing.
 */
const fs = require('node:fs');
const path = require('node:path');

const REPORTS_DIR = path.join(__dirname, '..', 'reports');
const HTML_OUT = path.join(REPORTS_DIR, 'cucumber-html-report.html');

function findJUnit(): string | null {
  if (!fs.existsSync(REPORTS_DIR)) return null;
  const entries = fs.readdirSync(REPORTS_DIR);
  const match = entries.find((name) => /cucumber-junit.*\.xml$/i.test(name));
  return match ? path.join(REPORTS_DIR, match) : null;
}

async function main(): Promise<void> {
  const junit = findJUnit();
  if (!junit) {
    console.warn('[generate-html-report] No JUnit XML found in test/reports — run `npm test` first.');
    process.exit(0);
  }
  let reporter;
  try {
    reporter = require('cucumber-html-reporter');
  } catch (err) {
    console.error('[generate-html-report] cucumber-html-reporter not installed:', err);
    process.exit(1);
  }
  reporter.generate({
    jsonFile: junit.replace('cucumber-junit', 'cucumber-json'),
    output: HTML_OUT,
    reportSuiteAsScenarios: true,
    launchReport: false,
  });
  console.log(`[generate-html-report] wrote ${HTML_OUT}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
