const fs = require("fs");
const path = require("path");
const { withAndroidManifest, withDangerousMod } = require("expo/config-plugins");

function addImport(source, importLine) {
  if (source.includes(importLine)) {
    return source;
  }

  return source.replace(
    "import expo.modules.splashscreen.SplashScreenManager\n",
    `import expo.modules.splashscreen.SplashScreenManager\n\n${importLine}\n`
  );
}

function ensureOnCreateCalls(source) {
  if (source.includes("blockAudioPlaybackCapture()\n    super.onCreate(null)")) {
    return source;
  }

  return source.replace(
    "    super.onCreate(null)",
    "    applySecureWindowFlags()\n    blockAudioPlaybackCapture()\n    super.onCreate(null)"
  );
}

function ensureOnResume(source) {
  if (!source.includes("override fun onResume()")) {
    return source.replace(
      "\n  /**\n   * Returns the name of the main component registered from JavaScript.",
      "\n  override fun onResume() {\n    super.onResume()\n    applySecureWindowFlags()\n    blockAudioPlaybackCapture()\n  }\n\n  /**\n   * Returns the name of the main component registered from JavaScript."
    );
  }

  if (/override fun onResume\(\) \{[\s\S]*?blockAudioPlaybackCapture\(\)[\s\S]*?\n  \}/.test(source)) {
    return source;
  }

  return source.replace(
    /override fun onResume\(\) \{\n\s*super\.onResume\(\)\n/,
    "override fun onResume() {\n    super.onResume()\n    applySecureWindowFlags()\n    blockAudioPlaybackCapture()\n"
  );
}

function ensureSecureMethods(source) {
  if (!source.includes("private fun applySecureWindowFlags()")) {
    source = source.replace(
      "\n  /**\n   * Returns the name of the main component registered from JavaScript.",
      "\n  private fun applySecureWindowFlags() {\n    window.setFlags(WindowManager.LayoutParams.FLAG_SECURE, WindowManager.LayoutParams.FLAG_SECURE)\n  }\n\n  /**\n   * Returns the name of the main component registered from JavaScript."
    );
  }

  if (!source.includes("private fun blockAudioPlaybackCapture()")) {
    source = source.replace(
      "\n  /**\n   * Returns the name of the main component registered from JavaScript.",
      "\n  private fun blockAudioPlaybackCapture() {\n    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {\n      getSystemService(AudioManager::class.java)\n        ?.setAllowedCapturePolicy(AudioAttributes.ALLOW_CAPTURE_BY_NONE)\n    }\n  }\n\n  /**\n   * Returns the name of the main component registered from JavaScript."
    );
  }

  return source;
}

function ensureMainActivityCapturePolicy(config) {
  return withDangerousMod(config, [
    "android",
    (config) => {
      const packageName = config.android?.package;

      if (!packageName) {
        return config;
      }

      const mainActivityPath = path.join(
        config.modRequest.platformProjectRoot,
        "app",
        "src",
        "main",
        "java",
        ...packageName.split("."),
        "MainActivity.kt"
      );

      if (!fs.existsSync(mainActivityPath)) {
        return config;
      }

      let source = fs.readFileSync(mainActivityPath, "utf8");

      source = addImport(source, "import android.media.AudioAttributes");
      source = addImport(source, "import android.media.AudioManager");
      source = addImport(source, "import android.view.WindowManager");
      source = ensureOnCreateCalls(source);
      source = ensureOnResume(source);
      source = ensureSecureMethods(source);

      fs.writeFileSync(mainActivityPath, source);

      return config;
    },
  ]);
}

function ensureIOSAppDelegateCaptureAudio(source) {
  if (!source.includes("import AVFoundation")) {
    const firstImport = source.match(/^import .+$/m)?.[0];
    source = firstImport
      ? source.replace(firstImport, `${firstImport}\nimport AVFoundation`)
      : `import AVFoundation\n${source}`;
  }

  const captureAudioProperties =
    "  private var screenCaptureAudioObserver: NSObjectProtocol?\n" +
    "  private var screenCaptureAudioIsBlocked = false\n" +
    "  private var screenCapturePrivacyView: UIView?\n";
  if (!source.includes("private var screenCaptureAudioObserver")) {
    const factoryProperty = "  var reactNativeFactory: RCTReactNativeFactory?\n";
    if (source.includes(factoryProperty)) {
      source = source.replace(factoryProperty, `${factoryProperty}${captureAudioProperties}`);
    }
  }

  if (source.includes("private func installScreenCaptureAudioGuard")) {
    return source;
  }

  const applicationMethod = /(  (?:public )?override func application\([\s\S]*?\n  \) -> Bool \{\n)/;
  if (!applicationMethod.test(source)) {
    return source;
  }

  source = source.replace(applicationMethod, "$1    installScreenCaptureAudioGuard()\n\n");

  const captureAudioMethods = `
  private func installScreenCaptureAudioGuard() {
    guard screenCaptureAudioObserver == nil else {
      return
    }

    screenCaptureAudioObserver = NotificationCenter.default.addObserver(
      forName: UIScreen.capturedDidChangeNotification,
      object: nil,
      queue: .main
    ) { [weak self] _ in
      self?.updateScreenCaptureProtection()
    }

    updateScreenCaptureProtection()
    DispatchQueue.main.async { [weak self] in
      self?.updateScreenCaptureProtection()
    }
  }

  private func updateScreenCaptureProtection() {
    let isCaptured = UIScreen.main.isCaptured
    updateScreenCapturePrivacyOverlay(isCaptured)

    guard isCaptured != screenCaptureAudioIsBlocked else {
      return
    }

    let audioSession = AVAudioSession.sharedInstance()

    do {
      if #available(iOS 26.0, *) {
        _ = try audioSession.setOutputMuted(isCaptured)
      } else if isCaptured {
        try audioSession.setActive(false, options: [.notifyOthersOnDeactivation])
      } else {
        try audioSession.setActive(true)
      }

      screenCaptureAudioIsBlocked = isCaptured
    } catch {
      NSLog("Unable to update screen-capture audio protection: %@", error.localizedDescription)
    }
  }

  private func updateScreenCapturePrivacyOverlay(_ isCaptured: Bool) {
    guard let window else {
      return
    }

    if isCaptured {
      if let screenCapturePrivacyView {
        window.bringSubviewToFront(screenCapturePrivacyView)
        return
      }

      let privacyView = UIView(frame: window.bounds)
      privacyView.backgroundColor = .black
      privacyView.autoresizingMask = [.flexibleWidth, .flexibleHeight]
      privacyView.isUserInteractionEnabled = false
      window.addSubview(privacyView)
      screenCapturePrivacyView = privacyView
    } else {
      screenCapturePrivacyView?.removeFromSuperview()
      screenCapturePrivacyView = nil
    }
  }

  deinit {
    screenCapturePrivacyView?.removeFromSuperview()
    if let screenCaptureAudioObserver {
      NotificationCenter.default.removeObserver(screenCaptureAudioObserver)
    }
  }
`;

  const linkingApiMarker = "\n  // Linking API";
  if (source.includes(linkingApiMarker)) {
    return source.replace(linkingApiMarker, `${captureAudioMethods}${linkingApiMarker}`);
  }

  const delegateBoundary = "\n}\n\nclass ReactNativeDelegate";
  return source.includes(delegateBoundary)
    ? source.replace(delegateBoundary, `${captureAudioMethods}${delegateBoundary}`)
    : source;
}

function ensureIOSSceneLifecycle(source) {
  const appDelegateDeclaration = "class AppDelegate: ExpoAppDelegate {";
  if (source.includes(appDelegateDeclaration)) {
    source = source.replace(
      appDelegateDeclaration,
      "class AppDelegate: ExpoAppDelegate, ExpoReactNativeFactoryProvider {"
    );
  }

  const legacyReactNativeStart = `#if os(iOS) || os(tvOS)
    window = UIWindow(frame: UIScreen.main.bounds)
    factory.startReactNative(
      withModuleName: "main",
      in: window,
      launchOptions: launchOptions)
#endif
`;
  source = source.replace(legacyReactNativeStart, "");

  if (source.includes("configurationForConnecting connectingSceneSession")) {
    return source;
  }

  const sceneConfiguration = `
  public func application(
    _ application: UIApplication,
    configurationForConnecting connectingSceneSession: UISceneSession,
    options: UIScene.ConnectionOptions
  ) -> UISceneConfiguration {
    let configuration = UISceneConfiguration(
      name: "Default Configuration",
      sessionRole: connectingSceneSession.role
    )
    configuration.delegateClass = ExpoAppSceneDelegate.self
    return configuration
  }

`;
  const marker = "  private func installScreenCaptureAudioGuard()";
  return source.includes(marker)
    ? source.replace(marker, `${sceneConfiguration}${marker}`)
    : source;
}

function ensureIOSCaptureAudioPolicy(config) {
  return withDangerousMod(config, [
    "ios",
    (config) => {
      const projectName = config.modRequest.projectName;

      if (!projectName) {
        return config;
      }

      const appDelegatePath = path.join(
        config.modRequest.platformProjectRoot,
        projectName,
        "AppDelegate.swift"
      );

      if (!fs.existsSync(appDelegatePath)) {
        return config;
      }

      const source = fs.readFileSync(appDelegatePath, "utf8");
      const captureReadySource = ensureIOSAppDelegateCaptureAudio(source);
      fs.writeFileSync(appDelegatePath, ensureIOSSceneLifecycle(captureReadySource));

      return config;
    },
  ]);
}

module.exports = function withAndroidSecureCapture(config) {
  config = withAndroidManifest(config, (config) => {
    const application = config.modResults.manifest.application?.[0];

    if (application) {
      application.$["android:allowAudioPlaybackCapture"] = "false";
    }

    return config;
  });

  config = ensureMainActivityCapturePolicy(config);
  return ensureIOSCaptureAudioPolicy(config);
};
