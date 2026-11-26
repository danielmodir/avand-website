# Six-theme application design

Approved by the owner on 2026-11-16 after reviewing the five-step implementation proposal. The owner additionally requires removing and replacing all previous application themes.

## Intent and scope
Six independently art-directed palettes, each with Light and Dark, and an independent System appearance. Apply to the existing application and Android WebView without changing the marketing identity, page structure or personal planning data. Preserve exact requested original palette HEX values. Accessibility takes priority over decorative effects.

## Approaches
Extend the existing root CSS-variable system (selected): classic scripts and semantic aliases keep existing components compatible without dependencies, a framework or a build step. A parallel component theme system would duplicate state and leave overlays inconsistent. Automatic color inversion would violate the requested art direction.

## Architecture
`js/core/themes.js` is the application color registry and synchronous pre-paint controller. Explicit light/dark foundation colors feed a common set of 46 semantic tokens, opaque supplementary state colors and existing CSS variable aliases. Shared spacing and radius scales come from `assets/css/tokens.css`. `state.settings.palette` and `.theme` remain the account transport fields; local selectedThemeId and selectedAppearanceMode are independent. The default palette is Sustainable Tangerine; default appearance is System. Legacy IDs migrate to the default while preserving valid appearance. Old palette styles, accent unlocks and the period-specific skin are removed; period phase colors remain semantic data colors.

## Behavior
Settings show six selectable cards, exact original swatches, simultaneous light/dark miniatures, names and short localized descriptions. An independent three-button appearance control applies immediately. Selection uses borders and a check mark. Native focus, reduced motion, storage denial and older media-query listeners are supported. Android bars use the resolved background and luminance mode. A system appearance change updates CSS variables without replacing page state.

## Verification and limits
Calculate real text/surface, action-state/on-action, status/on-status and essential boundary contrast across all twelve configurations. Check actual Chromium at 360 and 1280 in both languages; palette selection, reload, system changes, toolbar override and zero external requests. Keep existing user edits intact. No host deployment or APK publication is authorized. Device-specific Android appearance requires a separate device smoke test.
