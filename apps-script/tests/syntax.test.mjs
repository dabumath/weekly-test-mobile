import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const directory = fileURLToPath(new URL('..', import.meta.url));
const files = readdirSync(directory).filter((name) => name.endsWith('.gs')).sort();

test('every Apps Script source file parses as JavaScript', () => {
  assert.ok(files.length >= 8);
  for (const file of files) {
    assert.doesNotThrow(
      () => new vm.Script(readFileSync(path.join(directory, file), 'utf8'), { filename: file }),
      file,
    );
  }
});

test('server exposes only the intended API action names', () => {
  const code = readFileSync(path.join(directory, 'Code.gs'), 'utf8');
  const actions = [...code.matchAll(/^\s{2}([A-Z_]+):/gm)].map((match) => match[1]).sort();
  assert.deepEqual(actions, [
    'GET_EXAM',
    'GET_RESULT',
    'GET_STUDENT_EXAM_STATE',
    'LOGIN',
    'SUBMIT_ANSWERS',
    'SUBMIT_REFLECTION',
  ]);
});
