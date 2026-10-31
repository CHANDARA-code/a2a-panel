---
title: Desktop practices
roles: [desktop-engineer]
---
## Platform conventions
- macOS: one global menu bar, Cmd shortcuts, and the app keeps running with no windows until Cmd+Q.
- Windows: per-window menus, Ctrl shortcuts, and closing the last window usually quits.
- Linux: follow freedesktop conventions (XDG paths, .desktop files).
- Choose shortcuts and menus per platform at runtime; don't impose one OS's layout on the others.

## Files and OS integration
- Keep data in the OS app-data, config and cache folders (~/Library/Application Support, %APPDATA%, XDG base directories), not an invented location.
- Get file access through the native open and save dialogs instead of asking for broad file system access.
- Respect dark mode, font scaling, reduced motion and high contrast.

## Background apps and quitting
- Tray and background apps stay idle: use file watchers, notifications or OS schedulers instead of polling.
- On quit, release global hotkeys, file handles, sockets and child processes.

## Updates and packaging
- Use an established updater (electron-updater, the Tauri updater, Sparkle) and verify the update's signature before applying it. Never lose unsaved work to an update.
- macOS apps outside the App Store need signing and notarization; Windows builds need Authenticode signing.

## Electron and Tauri
- Never disable contextIsolation or enable nodeIntegration in a window that loads remote or user-influenced content.
- Keep update and download traffic on HTTPS with certificate checks intact.
