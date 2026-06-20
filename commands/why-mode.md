---
description: Toggle inline WHY-why mode on/off for all file edits
---

Switch why mode $ARGUMENTS.

- "on": WHY mode is now active. For every file edit add an inline code comment on each changed line explaining: (1) WHY this change was made, (2) how it helps, and (3) if a radically different approach exists, why that approach was not taken instead. Use language-appropriate comment syntax.
- "off": WHY mode is now off. No comment requirement on edits. When removing code, also remove any WHY comments that were added for that code.
