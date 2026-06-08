---
name: subagent-driven-development
metadata:
  internal: true
---

## Project Override: Pre-commit Check

Before any commit step, run:

```bash
nr check
```

Fix any formatting errors before committing. Do not commit with failing checks.

Also run `add-changeset` to add a changeset for the commit.