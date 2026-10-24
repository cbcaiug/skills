# Motion and feedback rules

| Moment | What happens | Timing |
|---|---|---|
| Hover (mouse only) | background/border shift, no big movement | 120 ms |
| Press | button scales to .96 immediately, ripple, tiny vibration on phones | instant |
| Focus (keyboard) | 2 px blue ring with offset | instant |
| Async button | width locks, spinner replaces label, then green check ("Done") or red shake ("Failed") for 1.4 s | `SoftPaper.asyncButton` |
| Page change | new content rises 12 px + fades; focus moves to the heading; scroll resets | 200 ms, `SoftPaper.transition` |
| List appearing | children rise one after another | 40 ms stagger, `.sp-enter-stagger` |
| Count change (cart) | number pops | 320 ms, `SoftPaper.bump` |
| Tabs / segmented | indicator slides to the new item | 220 ms, `SoftPaper.tabs/segmented` |
| Toast | slides up, shows a shrinking time bar, pauses on hover, duplicates become "x2", max 3 on screen | 3.5 s (6 s for error/warning) |
| Modal | fades and scales from .97 | 220 ms |
| Bottom sheet / drawer | slides from the edge with dimmed backdrop | 260-360 ms |
| Skeleton to content | content fades in over the placeholder | 150 ms, `.sp-fade-in` |

## Honesty rules
1. Never show success before the server confirms. `SoftPaper.status().set('success')` is for YOUR code to call after confirmation.
2. Never fake a progress percentage. Use a spinner unless the real progress is known.
3. Never delay an action to finish an animation. Start the action and animate together.
4. Hover styles only apply on devices that can hover (phones skip them).
5. Reduced motion: every animation switches off automatically when the user asks their device for it.
