---
name: api-design
description: REST/IPC API naming, versioning, errors, and consistency
license: MIT
---

# API Design

- Nouns for resources; verbs for actions.
- Consistent error shape { code, message, details }.
- Version breaking changes; deprecate with timeline.
- Idempotent mutations where appropriate.