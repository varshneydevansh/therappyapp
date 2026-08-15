const fs = require('node:fs');
const path = require('node:path');

const packageJsonPath = require.resolve('expo-modules-jsi/package.json');
const packageDirectory = path.dirname(packageJsonPath);
const { version } = require(packageJsonPath);

// expo-modules-jsi 57.0.4 leaves abs() ambiguous when Xcode 26.2 compiles
// the Swift source. Remove this workaround after upgrading to a fixed release.
if (version !== '57.0.4') {
  console.log(`[patch-expo-modules-jsi] Skipped expo-modules-jsi ${version}.`);
  process.exit(0);
}

const sourcePath = path.join(
  packageDirectory,
  'apple/Sources/ExpoModulesJSI/Coding/JavaScriptCodable+Date.swift'
);
const original =
  'guard milliseconds.isFinite, abs(milliseconds) <= maxJavaScriptDateMilliseconds else {';
const replacement =
  'guard milliseconds.isFinite, Swift.abs(milliseconds) <= maxJavaScriptDateMilliseconds else {';
const source = fs.readFileSync(sourcePath, 'utf8');

if (source.includes(replacement)) {
  console.log('[patch-expo-modules-jsi] Xcode 26.2 workaround is already applied.');
  process.exit(0);
}

if (!source.includes(original)) {
  throw new Error(
    `[patch-expo-modules-jsi] Expected source was not found in ${sourcePath}.`
  );
}

fs.writeFileSync(sourcePath, source.replace(original, replacement));
console.log('[patch-expo-modules-jsi] Applied Xcode 26.2 workaround.');
