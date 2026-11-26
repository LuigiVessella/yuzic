# Studio UI

The `feature/studio-ui` branch applies the visual direction reviewed in
`outputs/ui-prototypes/yuzic-studio.html` to the existing React Native UI.
The prototype remains a design reference, not app code or sample data.

## Presentation

- Home retains its sections, ordering, pagination and settings. Quick Picks
  renders the same four-song pages as two-column tiles; narrow windows use
  a single column. Playback and the options button retain their handlers.
  Artwork falls back to the library album and resolves missing album-cover
  subjects; recovery of a failed image is shared with other mounted views.
- The Home header uses the existing fork logo. Other tab titles and account
  controls retain their current content and actions.
- Artist pages use a compact, unblurred portrait with the shared `MediaImage`
  artwork resolution and error fallback. Names and metadata align left;
  a library label makes provenance visible. Wallpaper still suppresses the
  backdrop and leaves the artist's circular photo visible.
- Album and playlist heroes use smaller covers and left-aligned titles and
  metadata. Album headers label library versus external content using the
  existing translated strings. Shuffle, play, download and request actions
  retain their original availability and behavior.
- Shared tiles, rows and shelf headings have a consistent title weight and
  spacing. Artist grid captions are centered beneath circular portraits.
  Lists continue to respect density settings and scroll clearance.
- The mini player is an inset surface in the existing dock. Its artwork,
  expansion gestures, progress source and configurable action are preserved.
  The full player uses clearer title hierarchy and spacing; transport and
  queue operations are unchanged.
- Downloads, requests, search results, settings and option sheets inherit
  the shared row typography, spacing and surfaces. Download queues gain
  subtle separators; search retains its current filters and results.

## Boundaries

The visual restyling introduces no provider, query, catalogue matcher,
persistence field, endpoint, playback backend, navigation destination or
request/download workflow. The subsequent artwork correction retains an
independent album-cover reference and observes image recovery, as documented
in `architecture.md` and `integrations.md`.
The prototype's simulated statuses, content, switches and local
search behaviors are not copied into production. The existing source gates,
offline states, disabled actions and loading/error views remain in place.

Colors, corners, density, backgrounds and text scaling use the existing theme
hooks and design tokens. This change does not reset appearance preferences
or replace a user's palette with the colors shown in the prototype. No
external mockup images or new icon packages are bundled with the app.

Validate with typed routes, TypeScript, lint, Jest and architecture checks.
On a test APK, check Quick Picks, album and artist headers, missing cover art
and the mini player with a narrow window, large system text and a custom
background. Verify TalkBack focus, button labels and clearance below the last
scrollable item.
