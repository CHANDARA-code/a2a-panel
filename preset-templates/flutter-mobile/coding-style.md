---
title: Coding style
---
- In an existing codebase, its conventions win over this file where they differ; mention the difference in your report instead of rewriting code to match this file.
- Follow Effective Dart. Run `dart format` on the files you touch; `flutter analyze` must report no issues (`flutter_lints` or stricter).
- `snake_case` file names, `UpperCamelCase` types, `lowerCamelCase` members.
- Prefer `const` constructors and immutable models (`freezed` + `json_serializable`).
- Keep widgets small: extract a widget class instead of writing a long `build` method or a helper method that returns widgets.
- Conventional Commit messages when the task asks you to commit; keep changes focused.
