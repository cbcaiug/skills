# Acceptance checklist (run before saying a screen is done)

1. Every button/link/row has: default, hover, pressed, keyboard focus, disabled, loading.
2. Run `python3 scripts/audit.py`: 0 contrast failures in light AND dark.
3. Status is never colour alone: warnings, errors and success always carry an icon and a title.
4. No `alert()`/`confirm()`/`prompt()` anywhere (search the code).
5. Every async action has a loading, success, and failure state. Failures say what happened AND what to do next ("Payment was not completed. Check your number and try again.").
6. Modals trap focus, close on Escape, and return focus to the button that opened them. Page behind does not scroll.
7. Every icon-only button has `aria-label`; decorative icons are `aria-hidden`.
8. Empty, offline and error states exist for every list or page that loads data.
9. Phone check at 390 px wide: nothing scrolls sideways, tap targets are at least 44 px.
10. Switching the theme off (`SoftPaper.disable()`) leaves the page usable.

# Copy rules
- Say the outcome first, then the next step. Pending states use waiting words, never success words.
- Buttons: verb + object ("Add to cart", "Pay UGX 5,000", "Retry payment").
- No raw technical errors or IDs shown to ordinary users.
- No invented urgency, and no claims of endorsement you cannot prove.

# Handoff rules for the AI agent
- Use tokens only; do not paste hex codes into components.
- Build reusable components; do not restyle the same thing per screen.
- Model async flows (payment, download, upload) with `SoftPaper.status`, not scattered true/false flags.
- Test every state, not just the happy one.
