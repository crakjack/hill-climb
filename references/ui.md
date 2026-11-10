# Evidence for UI work

Judges compare screenshots, so the screenshots have to show the same thing on both sides.

## Pick the states

A state is a screen, a window size, and a data condition. A typical set:

- the main screen on desktop, 1440x900
- the main screen on mobile, 390x844
- the empty state
- an error state
- one state per interaction a check depends on, such as a confirm dialog open or a save message showing

Name files by state, like `main-desktop.png` and `delete-confirm.png`. Every check in the rubric must be visible in at least one of them.

## Keep captures comparable

Decide these once and use them for both sides in every round.

- Window size and device scale factor.
- Full page or just the visible part.
- Fonts loaded and animations finished or switched off.
- Fixed demo data. If the app shows live or personal data, screenshots change between rounds for reasons the judges can't know about, and private data ends up in front of the judges.

## Capture

- For a web app, use a browser tool such as the Playwright MCP. Start the dev server, set the window size, open the state, and take the screenshot.
- For a reference behind a login, or one that needs real clicking, use computer use, or ask the user for screenshots.
- For a native app, ask the user for screenshots at the agreed sizes.
- Crop or blur the reference's logo where that's easy. Hiding which side is A or B doesn't hide a brand name.

## What screenshots can't show

A screenshot proves how something looks, not that it works. Put "it works" into gates, such as an end-to-end test, and keep the rubric for what a person can see.
