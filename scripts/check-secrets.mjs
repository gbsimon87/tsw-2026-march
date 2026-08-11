import { execFileSync } from 'node:child_process';
import fs from 'node:fs';

const MAX_FILE_BYTES = 5 * 1024 * 1024;

const RULES = [
  ['Stripe secret or restricted key', /\b(?:sk|rk)_(?:live|test)_[A-Za-z0-9]{16,}\b/g],
  ['Stripe webhook secret', /\bwhsec_[A-Za-z0-9]{16,}\b/g],
  ['OpenAI API key', /\bsk-(?:proj-|svcacct-)?[A-Za-z0-9_-]{20,}\b/g],
  ['AWS access key', /\bAKIA[0-9A-Z]{16}\b/g],
  ['Google API key', /\bAIza[0-9A-Za-z_-]{30,}\b/g],
  ['GitHub token', /\bgh[pousr]_[A-Za-z0-9_]{20,}\b/g],
  ['Slack token', /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g],
  ['Private key', /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/g],
  [
    'Credential-bearing connection URI',
    /\b(?:mongodb(?:\+srv)?|postgres(?:ql)?|redis):\/\/[^\s"'<>]+:[^\s"'<>]+@/g,
  ],
];

function git(args, options = {}) {
  return execFileSync('git', args, {
    encoding: Object.hasOwn(options, 'encoding') ? options.encoding : 'utf8',
    maxBuffer: 20 * 1024 * 1024,
  });
}

function splitNull(value) {
  return value.split('\0').filter(Boolean);
}

function trackedFiles() {
  return splitNull(git(['ls-files', '-z']));
}

function stagedFiles() {
  return splitNull(git(['diff', '--cached', '--name-only', '--diff-filter=ACMR', '-z']));
}

function readWorkingFile(file) {
  try {
    return fs.readFileSync(file);
  } catch {
    return null;
  }
}

function readStagedFile(file) {
  try {
    return git(['show', `:${file}`], { encoding: null });
  } catch {
    return null;
  }
}

function lineNumberAt(text, index) {
  let line = 1;
  for (let i = 0; i < index; i += 1) {
    if (text.charCodeAt(i) === 10) line += 1;
  }
  return line;
}

function scan(name, buffer) {
  if (!buffer || buffer.length > MAX_FILE_BYTES || buffer.includes(0)) return [];

  const text = buffer.toString('utf8');
  const findings = [];

  for (const [rule, pattern] of RULES) {
    pattern.lastIndex = 0;
    for (const match of text.matchAll(pattern)) {
      findings.push({ rule, name, line: lineNumberAt(text, match.index) });
    }
  }

  return findings;
}

function main() {
  const scanAll = process.argv.includes('--all');
  const scanStdin = process.argv.includes('--stdin');
  const inputs = scanStdin
    ? [['stdin', fs.readFileSync(0)]]
    : (scanAll ? trackedFiles() : stagedFiles()).map((file) => [
        file,
        scanAll ? readWorkingFile(file) : readStagedFile(file),
      ]);

  const findings = inputs.flatMap(([name, content]) => scan(name, content));

  if (findings.length > 0) {
    console.error('Potential secrets detected:');
    for (const finding of findings) {
      console.error(`- ${finding.rule}: ${finding.name}:${finding.line}`);
    }
    console.error('Remove the value and rotate it if it was real.');
    process.exit(1);
  }

  console.log(`Secret scan passed (${inputs.length} file${inputs.length === 1 ? '' : 's'}).`);
}

main();
