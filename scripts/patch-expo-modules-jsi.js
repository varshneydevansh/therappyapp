const fs = require('node:fs');
const path = require('node:path');

const packageJsonPath = require.resolve('expo-modules-jsi/package.json');
const packageDirectory = path.dirname(packageJsonPath);
const { version } = require(packageJsonPath);

if (version === '57.0.4') {
  // Xcode 26.2 makes the unqualified abs() call ambiguous in this release.
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
    console.log('[patch-expo-modules-jsi] Xcode 26.2 abs() workaround is already applied.');
    process.exit(0);
  }

  if (!source.includes(original)) {
    throw new Error(
      `[patch-expo-modules-jsi] Expected source was not found in ${sourcePath}.`
    );
  }

  fs.writeFileSync(sourcePath, source.replace(original, replacement));
  console.log('[patch-expo-modules-jsi] Applied Xcode 26.2 abs() workaround.');
  process.exit(0);
}

if (version === '57.1.0') {
  // Swift 6.2 rejects returns_retained on C++ constructors. Constructors of a
  // SWIFT_SHARED_REFERENCE type are already imported as owned values.
  const sourcePath = path.join(
    packageDirectory,
    'apple/Sources/ExpoModulesJSI-Cxx/include/RuntimeScheduler.h'
  );
  const annotations = [
    'SWIFT_RETURNS_RETAINED RuntimeScheduler(void *scheduler, ScheduleFn fn) noexcept',
    'SWIFT_RETURNS_RETAINED RuntimeScheduler() {}',
  ];
  let source = fs.readFileSync(sourcePath, 'utf8');
  let changed = false;

  for (const annotation of annotations) {
    if (source.includes(annotation)) {
      source = source.replace(annotation, annotation.replace('SWIFT_RETURNS_RETAINED ', ''));
      changed = true;
    }
  }

  if (changed) {
    fs.writeFileSync(sourcePath, source);
    console.log('[patch-expo-modules-jsi] Applied Swift 6.2 constructor workaround.');
  } else if (annotations.every((annotation) => source.includes(annotation.replace('SWIFT_RETURNS_RETAINED ', '')))) {
    console.log('[patch-expo-modules-jsi] Swift 6.2 constructor workaround is already applied.');
  } else {
    throw new Error(
      `[patch-expo-modules-jsi] Expected constructors were not found in ${sourcePath}.`
    );
  }
  process.exit(0);
}

console.log(`[patch-expo-modules-jsi] Skipped expo-modules-jsi ${version}.`);
