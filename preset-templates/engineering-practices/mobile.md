---
title: Mobile practices
roles: [mobile-engineer]
---
## Lifecycle
- Android: save state in onPause or onSaveInstanceState; onDestroy may never run, because the OS can kill a background process at any time.
- iOS: viewDidLoad runs once and viewWillAppear runs every time; don't swap one-time and per-appearance setup.
- Flutter and React Native: know which native event your "went to background" hook maps to, and test backgrounding and foregrounding explicitly.

## Permissions
- Ask at the point of use, not at launch.
- Denied and permanently denied are real states with real UI. Check on every use, because users revoke permissions in Settings.

## Offline first
- Design for a failed or slow network first: show cached content, use timeouts, queue writes and sync later.
- Invalidate caches deliberately (a version or timestamp), not by always refetching.

## Battery and resources
- No timers or polling while in the background; batch network and sensor reads.
- Release camera sessions, location listeners, Bluetooth connections and large images explicitly on teardown.

## Cross-platform
- A prop wired only in Dart or JavaScript with no native handler compiles and silently does nothing; confirm the native side exists on both platforms.
- Gestures, keyboard handling, safe areas and permission dialogs differ between iOS and Android; check both.

## Store rules
- iOS forbids downloading and running native code at runtime; digital goods sold inside the app need in-app purchase.
- Both stores reject apps that crash on launch, request permissions no feature uses, or show broken demo content. Test the reviewer's path: a fresh install with no prior data.
