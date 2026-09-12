import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const context = vm.createContext({});
for (const file of ['Core.gs', 'Security.gs', 'Reflection.gs']) {
  const source = readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
  vm.runInContext(source, context, { filename: file });
}

test('overall reflection accepts an empty optional next action', () => {
  const result = context.validateOverallReflection_({
    strengths: [],
    regrets: [],
    nextAction: '',
    freeNote: '',
  });

  assert.equal(result.nextAction, '');
});

test('overall reflection still limits next action length', () => {
  assert.throws(
    () => context.validateOverallReflection_({
      strengths: [],
      regrets: [],
      nextAction: '가'.repeat(201),
      freeNote: '',
    }),
    /너무 깁니다/,
  );
});
