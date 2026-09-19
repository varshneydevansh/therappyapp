const fs = require('node:fs');
const path = require('node:path');

const packageJsonPath = require.resolve('expo-modules-core/package.json');
const packageDirectory = path.dirname(packageJsonPath);
const { version } = require(packageJsonPath);

// Swift 6.2 does not accept a non-Sendable weak local crossing into the
// JavaScript actor. ExpoModulesCore already provides a weak @unchecked
// Sendable wrapper for this purpose, so use it for both event paths.
if (version !== '57.0.18') {
  console.log(`[patch-expo-modules-core] Skipped expo-modules-core ${version}.`);
  process.exit(0);
}

const sourcePath = path.join(
  packageDirectory,
  'ios/Core/Events/EventEmitter.swift'
);
const replacements = [
  {
    original: 'nonisolated(unsafe) weak let emitter = self',
    replacement: 'let emitter = NonisolatedUnsafeWeakVar(self)',
    expectedCount: 2,
  },
  {
    original: 'guard let emitter else {',
    replacement: 'guard let emitter = emitter.value else {',
    expectedCount: 1,
  },
  {
    original: 'guard let emitter, let appContext else {',
    replacement: 'guard let emitter = emitter.value, let appContext else {',
    expectedCount: 1,
  },
];

let source = fs.readFileSync(sourcePath, 'utf8');
let changed = false;

for (const { original, replacement, expectedCount } of replacements) {
  const originalCount = source.split(original).length - 1;
  const replacementCount = source.split(replacement).length - 1;

  if (originalCount === expectedCount) {
    source = source.split(original).join(replacement);
    changed = true;
    continue;
  }

  if (originalCount === 0 && replacementCount === expectedCount) {
    continue;
  }

  throw new Error(
    `[patch-expo-modules-core] Expected ${expectedCount} occurrence(s) of "${original}" in ${sourcePath}, found ${originalCount}.`
  );
}

if (changed) {
  fs.writeFileSync(sourcePath, source);
  console.log('[patch-expo-modules-core] Applied Swift 6.2 event-emitter workaround.');
} else {
  console.log('[patch-expo-modules-core] Swift 6.2 event-emitter workaround is already applied.');
}
