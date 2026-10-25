#!/usr/bin/env node
// PreToolUse guard for the Enterprise-licensed paths listed in AGENTS.md.
// Exit 2 blocks the tool call and feeds stderr back to the model.

import { readFileSync } from 'node:fs';

const PROTECTED = [
  /apps\/server\/src\/ee(\/|\b)/,
  /apps\/client\/src\/ee(\/|\b)/,
  /packages\/ee(\/|\b)/,
  /packages\/base-formula(\/|\b)/,
  /docmost\/ee\b/, // the private GitHub repo
  /submodule\s+(update|init)/,
];

// Recursive sweeps over these roots descend into the protected paths.
const SWEEP_ROOTS = /(^|[\s'"=])(\.\/?|apps\/?|packages\/?|apps\/(server|client)(\/src)?\/?|\.\/(apps|packages)\/?)($|[\s'"])/;
const SWEEP_TOOLS = /(\bgrep\s+(-[a-zA-Z]*[rR]|--recursive)|\b(rg|ag|ack|find|fd|tree)\b|\bls\s+-[a-zA-Z]*R)/;
const EXCLUDES_EE = /(--exclude-dir[= ]\S*\bee\b|!\S*\bee\b|--glob[= ]'?!\S*ee|-not\s+-path\s+\S*\/ee|-path\s+\S*\/ee\S*\s+-prune|-E\s+\S*ee|--exclude[= ]\S*\bee\b)/;

function block(reason) {
  process.stderr.write(
    `Blocked: ${reason}\n` +
      'The Enterprise-licensed paths (apps/server/src/ee, apps/client/src/ee, ' +
      'packages/ee, packages/base-formula) are off-limits per AGENTS.md. ' +
      'Work from public specs and CE/AGPL code only. If you believe you need ' +
      'to look inside them, stop and ask the user instead.\n',
  );
  process.exit(2);
}

let input;
try {
  input = JSON.parse(readFileSync(0, 'utf8'));
} catch {
  process.exit(0);
}

const tool = input.tool_name ?? '';
const ti = input.tool_input ?? {};
const text = JSON.stringify(ti);

for (const re of PROTECTED) {
  if (re.test(text)) block(`${tool} input references a protected path (${re}).`);
}

if (tool === 'Bash') {
  const cmd = String(ti.command ?? '');
  if (SWEEP_TOOLS.test(cmd) && SWEEP_ROOTS.test(cmd) && !EXCLUDES_EE.test(cmd)) {
    block(
      'recursive search/list over apps/ or packages/ would descend into ee. ' +
        'Add an exclude (e.g. --exclude-dir=ee, --glob "!**/ee/**", -not -path "*/ee/*") and exclude packages/base-formula.',
    );
  }
}

if (tool === 'Agent') {
  const prompt = String(ti.prompt ?? '');
  if (!/AGENTS\.md|off-limits|\bee\b/i.test(prompt)) {
    block(
      'subagent prompt does not carry the ee restriction. Include: "Never read, search or reference ' +
        'apps/server/src/ee, apps/client/src/ee, packages/ee, packages/base-formula; exclude them from any recursive search."',
    );
  }
}

process.exit(0);
