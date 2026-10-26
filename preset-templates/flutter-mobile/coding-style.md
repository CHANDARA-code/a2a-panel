---
title: Coding style
---
- Follow *Effective Dart*; `flutter analyze` must report no issues (`flutter_lints` or stricter).
- `snake_case` file names, `UpperCamelCase` types, `lowerCamelCase` members.
- Prefer `const` constructors and immutable models (`freezed` + `json_serializable`).
- Small widgets: extract a widget instead of a long `build` method.
- Conventional Commit messages; keep changes focused.
