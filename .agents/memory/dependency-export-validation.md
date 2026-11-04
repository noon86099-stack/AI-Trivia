---
name: Dependency export validation
description: Why server dependency changes need a real bundle check in addition to TypeScript.
---

Validate the API production bundle after changing server dependencies; typechecking alone is not sufficient.

**Why:** The HTML-entity library's runtime moved to named ESM exports while its separately installed type declarations still accepted a default import. TypeScript passed, but the API bundler rejected it.

**How to apply:** When upgrading packages with separate `@types` declarations, check the actual runtime export surface if bundling disagrees with TypeScript. Do not suppress the bundler error with a cast.
