# Agent instructions for yuzic

## Docs map

Read the doc that covers what you're touching before you touch it — these are
kept current, and a change that contradicts one is a change that needs the doc
updated in the same commit.

| Doc | Read it before |
| --- | --- |
| [`docs/architecture.md`](docs/architecture.md) | Adding a server provider, a player behaviour, a persisted playback field, or a synced library resource. Covers `ApiAdapter`, `playbackSlice`, `contentKind`, `useSync`, and where things live under `src/`. |
| [`docs/integrations.md`](docs/integrations.md) | Adding or changing a server, integration, or downloader, or calling a new endpoint on one. Carries the endpoint tables and the list of endpoints we deliberately don't call. |
| [`CONTRIBUTING.md`](CONTRIBUTING.md) | Setup, the CI gates, E2E. |
| [`.maestro/README.md`](.maestro/README.md) | Adding or changing an E2E flow, or working out why one failed. |
| [`docs/fork-releases.md`](docs/fork-releases.md) | Fork builds, signing, versions, tags, releases and CI. |
| This file, below | Any UI work, and anything under `.github/workflows/` or `fastlane/`. |
| [`docs/studio-ui.md`](docs/studio-ui.md) | Changing Studio layouts or checking the visual implementation against the mockup. |

**Keep them in sync.** A new integration, downloader, or outside endpoint
belongs in `docs/integrations.md`, and a new load-bearing pattern in
`docs/architecture.md` — in the same change, not afterwards. `README.md` is
the concise user-facing product overview and download entry point. Update it
when a headline product promise or supported-server set changes; keep detailed
support boundaries in `docs/`.

## Personal fork: active workflow

This checkout is `LuigiVessella/yuzic`. Read [docs/fork-releases.md](docs/fork-releases.md)
before build, signing, versioning, tag, release, or CI changes. It takes
precedence over the inherited upstream release reference for this fork.

- `develop` is the integration/testing branch; `master` receives tested changes via PR.
- Both branches build the SAME `com.arinora.rawarr.test` / Yuzic Test app with
  the pinned existing test certificate. Never change identity or signing key
  to distinguish branches: updates must preserve installed data.
- Versioned builder: `tools/fork/build-apk.ps1`. The ignored local
  `build/local-test/build.ps1` is only a compatibility wrapper.
- `fork.config.json` owns the separate fork Android code. Prepare releases
  with `tools/fork/prepare-release.ps1 -Version X.Y.Z-lv.N`; it updates package,
  lockfile, Android code and release-note template. No version/tag bump is
  needed for routine develop tests.
- Release from a CLEAN master with completed notes using
  `tools/fork/release-apk.ps1`. Tag equals package version, bare `X.Y.Z-lv.N`.
  Do not overwrite existing tags or release artifacts. A release build must
  contain committed code only; development builds may contain local changes.
- No automatic commit, branch switch, tag, push or publication unless requested.
  Preparing tooling is not authorization to release the user's untested code.
- The fork tag workflow builds verified APKs and creates a GitHub DRAFT.
  Upstream store workflows are repository-gated to `yuzicapp/yuzic`.
- CI runs on `develop`, legacy upstream `dev`, and `master`. Preserve lint,
  typed routes, TypeScript, Jest and architecture gates.
- Keep `patch-package` in production dependencies and verify release patches.
  Standalone APKs must exclude expo-dev-client / expo-dev-launcher. Prefer
  `npm install --include=dev` and `npm prune --omit=dev --ignore-scripts` for
  local checks, preserving expensive native build caches; CI uses npm ci.
- Document every behavior, configuration and workflow change in the same change.
  Keep AGENTS concise, with links to detailed docs; keep CLAUDE/GEMINI pointers
  aligned. Preserve unrelated work in this frequently dirty checkout.

## Upstream store releases

The original store rules, bare semver tags, build-number querying, Fastlane
constraints and release history are retained in
[docs/upstream-release-reference.md](docs/upstream-release-reference.md).
Read them BEFORE changing Fastlane or upstream store workflows. Store version
codes/build numbers still come from stores, never a local counter. The fork's
separate `.test` APK code is NOT a replacement for that mechanism.

## Native/player notes

- Audio playback goes through **`PlayerBackend`** (`src/features/player/backend.ts`), not through a player package directly. yuzic-engine implements it; `@rntp/player` was removed. One difference between the platforms is declared in the engine's `Tools/parity.py`: `configureCache` has no Android implementation (deliberately *absent* rather than stubbed, so it rejects by name at the bridge). Derive that from `parity.py` rather than trusting this sentence: it has been wrong before. `docs/architecture.md` explains the seam and the three non-obvious things about it; read that before changing playback.
- Adding a player call means adding it to `PlayerBackend` **and to both platforms of the engine**. A method implemented on iOS and not on Android is the failure this seam exists to surface — it has already happened. Ask `Tools/parity.py` in the engine repo how many are outstanding rather than reading a count here: this file has carried a stale one twice, and the tool compares signatures as well as names. They reject by name (`setSpeed() is not implemented on android`) rather than throwing `is not a function`, so the gap is legible from a log; that is not the same as being fixed.
- `@rntp/player` used to be the player and has been removed entirely. Do not reintroduce it, and do not read its source: it is the npm-scoped continuation of `react-native-track-player` and went to a commercial, non-compete licence at v5, which is a probable GPL-3 conflict for yuzic and a definite F-Droid blocker — and which is part of why the engine exists. react-native-track-player **v4** is Apache-2.0 and may be referenced with attribution.
- `src/features/playback/PlayingContext.tsx` is the central playback state/controls context — most player-related work touches this file.
- The engine lives in its own repo (github.com/yuzicapp/yuzic-engine) and is consumed from npm at an exact version (`yuzic-engine` in `package.json`). **The pin drifts.** Bumping it once and then making further engine commits leaves the app building an engine older than the one you are reading, and it has caused two wrong conclusions already. Check `package.json` against the engine's HEAD before trusting that a fix is in the build. An engine release is pushing the bare `X.Y.Z` tag, and nothing else: the tag's workflow publishes to npm itself, using trusted publishing, and then creates the GitHub release. No npm credential is involved on either side — it mints a short-lived one from the run's OIDC identity — so a release needs no logged-in machine and can be cut from anywhere. Make sure `package.json` already carries the version; the workflow fails if the tag and the file disagree.

## Native config that `app.json` cannot express

`expo-build-properties` covers most of it, but not everything, and the pieces
it does not cover live in `plugins/` as local config plugins registered in
`app.json`'s `plugins` array. There is one so far:

- **`withUserCaTrust.js`** writes `res/xml/network_security_config.xml` and
  points the manifest at it, so Android trusts the user's own CAs. Without it
  the platform ignores a user-installed root from API 24 up, and a server
  behind a private CA — Caddy's `tls internal`, typically — is unreachable on
  Android while iOS and every browser accept it.

Two traps here, both of which cost a real build if missed:

- **A network security config replaces `usesCleartextTraffic`, it does not add
  to it.** Omitting `cleartextTrafficPermitted` from the config turns `http://`
  servers off on API 28+, which is most of a LAN install.
- **The generated file is checked in, because nothing runs `expo prebuild` in
  CI.** The checked-in copy under `android/` is what ships; the plugin is what
  makes a prebuild reproduce it instead of dropping it. Change the plugin and
  regenerate, never the checked-in file alone — the same double-entry rule the
  orientation note under UI conventions describes.

## UI conventions

These were made consistent across the app in one pass; they drift back easily
because both halves of each pair look reasonable in isolation.

- **Loading**: skeletons (`components/Skeleton*`, or a screen's own
  `Loading.tsx`) when a list is loading, so the placeholder holds the shape the
  list is about to take. `components/SpinningLoaderCircle` everywhere else —
  inside a control at size 18, for a whole sheet or screen at 26. React
  Native's `ActivityIndicator` is deliberately unused: it renders differently
  per platform and doesn't match the lucide icon set the rest of the UI uses.
  A skeleton is only worth using when it predicts the real layout; an options
  sheet is a header and a stack of actions, so it keeps a spinner.
- **Scales**: sizes come from `typography`, corner radii from `radius`, padding
  and margin from `spacing`, all in `constants/design`, everywhere — `eslint.config.js` fails the build on a
  literal `fontSize` or `borderRadius` outside that file. A role carries a size
  and a line height; a weight may be overridden at the call site
  (`{ ...typography.rowSubtitle, fontWeight: '500' }`), since weight was never
  the thing that drifted. Adding a role is fine; adding one that differs from an
  existing role only in size is how the app got to thirteen font sizes and
  twelve corner radii in the first place. `0` stays a literal — it is the
  absence of spacing rather than an amount of it. Any scrolling list ends with
  `spacing.scrollClearance`, which is what keeps its last row clear of the
  playing bar; four different numbers were doing that job and the short ones
  didn't.
- **Spacing gaps**: `gap`, `rowGap`, and `columnGap` use the existing `spacing` scale; near-misses fold to adjacent steps, and ESLint rejects nonzero literals.
- **Motion and effects**: animation durations use `motion`; shadows/elevation use `shadow`; disabled and pressed opacity uses `stateLayer`. ESLint rejects raw values outside `constants/design`.
- **Over the background image, nothing ends opaque.** A screen may be drawn on
  a photo the user chose (`ScreenBackground`, `useScreenBackground`), and any
  surface that fades into "the page" has to ask first: a gradient that ends at
  the theme colour closes the screen off and draws a hard line where the image
  resumes underneath it. The artist hero was exactly that — `coverFade.onDark`
  ends at `rgba(0,0,0,1)` — and over an image it uses `coverFade.onImage` and
  masks its own artwork out with `coverFade.heroMask` instead. A gradient laid
  over a picture can only tint it, so fading *out* an image needs a mask
  (`@react-native-masked-view/masked-view`), not a darker gradient. A stand-in
  slab for missing artwork is the same hard edge, so it steps aside too.
- **Tap targets**: a control may be drawn smaller than `controlSize.minimumTarget`
  — a 34pt toggle beside a 34pt pill is the right drawing — but what the finger
  has to hit never is. `hitSlopFor(size)` makes up the difference; it returns
  undefined when none is needed, so it can be spread unconditionally. Seven
  controls were between 32 and 40pt with nothing padding them out.
- **Naming controls**: a pressable that draws no text carries an
  `accessibilityLabel`, from the `a11y.*` namespace in `locales` like any other
  string — `eslint-rules/touchable-needs-label` fails the build otherwise. One
  that *does* draw text does not: a screen reader reads the text already, and a
  label repeating it is a second copy to keep in sync. So the rule looks for
  readable content in the subtree and only asks where it finds none. 32 controls
  were silent, including every transport control on the player, and the labels
  that did exist were hardcoded English — a French UI read aloud in English.
  A role says what a thing is, never which one, so it is never a substitute for
  a label: add both. A control with two states says the second through
  `accessibilityState`, one with more than two through `accessibilityValue` —
  shuffle cycles through three, and a label that changed with the mode would
  read as a different button each time.
- **Text size**: `typography` scales its own leading by the system text size
  (`withScaledLeading`), because React Native scales `fontSize` and leaves
  `lineHeight` where it was written — at the accessibility sizes a 20pt role
  renders at 60pt in a 25pt box and every title in the app is sliced in half.
  Text inside a control whose height is structural — the playing bar, an avatar
  disc — takes a `maxFontSizeMultiplier` from `fontScaleCap` **and** its role
  from the matching `cappedTypography` set. One without the other is the
  mismatch that turns the bar into half a screen: the cap holds the glyphs but
  not the line box they sit in. `allowFontScaling={false}` is not the answer to
  either — it ignores the user's setting outright.
- **Waiting is not an accent**: a spinner, a skeleton or a pull-to-refresh tint
  takes a text colour, never `colors.themeColor`. The accent says *this is
  chosen* or *this is yours*; a loader says *nothing has happened yet*, and
  colouring it like a selection makes every list that is merely slow look like
  it is doing something on purpose. `colors.secondary` where the loader stands
  in for content or for an action under way, `colors.subtext` where it stands
  in for something quiet — a status dot, a block that has not arrived. Home is
  the reference: its refresh tint and its skeletons are neutral, and the accent
  is spent on the source badges and the banner discs, which are identity.

- **Pressing**: `components/Touchable`, never `TouchableOpacity` — the whole app
  was swapped over in one pass and there is no reason for a second answer to a
  press to exist. Android gets a ripple bounded to the component, every other
  platform an opacity dip, from one file so they can't drift apart per screen.
  `feedback="control"` for a bare icon whose target is bigger than the glyph,
  `"none"` for a wrapper handling a press on something else's behalf. There is
  deliberately no `activeOpacity`: seven different values were in use, which is
  seven answers to a question nobody was asking.
- **Cover colour**: `features/theme` extracts one accent from a piece of cover
  art and darkens it. `useCoverAccent` is the hook; `pickAccent` and `darken`
  are pure and tested, because the extraction library returns a different shape
  per platform and that choice is the part worth checking. The accent is null
  until it arrives, so a screen fades it in rather than flashing a placeholder.
  Do not re-extract colours locally — the cache is shared and bounded. Null is
  also what the hook returns when the user has turned cover tinting off, so no
  call site needs a branch for the setting.
- **Appearance settings**: the scales a user can move — corner radius
  (`useRadius`) and list density (`useListDensity`) — are read through a hook,
  never imported statically, or the surface silently opts out of the setting
  and the preset reads as half-applied. Those hooks, `useTheme` and cover
  tinting all read one object, the theme (`features/theme/theme.ts`, read
  through `useActiveTheme`): palettes for both schemes, accent, shape, surface
  and component choices. There is one theme, stored in `settingsAppearance`
  and edited in place by every appearance setting; there are no presets to
  pick between. Its colours come from three picks per scheme through
  `derivePalette` (`features/theme/presets.ts`, the only file allowed to spell
  a theme colour out), which also pushes text until it reads. Home can be
  drawn over a photo or the playing cover (`features/theme/ScreenBackground`):
  a screen that draws it makes its own containers transparent, and the veil
  over the image is the theme's background colour, so text keeps reading.
  Nothing reads
  the settings that make up the theme except `useActiveTheme` and the
  appearance editors; `theme.test.ts` fails on a component that does.
  A round control is the trap here:
  `radius.pill` is for the things whose roundness is what they *are* (an
  avatar, a status dot, a radio fill, a progress track, an artist's photo) and
  stays round at every preset, while a **control** merely drawn as a pill or a
  circle — a play button, a button on a detail bar — uses `rad.pillFor(height)`
  and squares off with the cards under `sharp`. `size / 2` written out as a
  literal is the same mistake in a second spelling. Every one of them falls back in its
  selector rather than reading straight off the persisted settings blob: a user
  upgrading has one written before the key existed, and `undefined` reaches the
  style as a broken layout rather than as a default. Under the `default` option
  each hook returns exactly the number the app used before the setting existed,
  so adding one moves nothing until the user asks it to.
- **Landscape is a tablet shape, not a phone one.** A phone is portrait-locked:
  `app.json`'s `orientation` is `portrait`, which governs the iPhone array in
  `Info.plist`, while `supportsTablet` writes all four into
  `UISupportedInterfaceOrientations~ipad` whatever it says — so the two halves
  differ by design rather than by oversight. On Android the manifest says
  `screenOrientation="portrait"` and **Android 16 ignores that above 600dp**,
  which is not a bug working against us here: it is what leaves tablets and
  unfolded foldables free to rotate while phones stay put. Both native files are
  checked in and nothing runs `expo prebuild` in CI, so `app.json` alone changes
  nothing — edit all three or the change is cosmetic.

  None of this retires the layout work below. Split View, a half-open foldable
  and an Android window over 600dp are all still windows the app does not
  choose, and a phone still has a keyboard that takes half the screen.
- **The window, not the device**: every size that used to come from
  `useWindowDimensions` now comes from `features/layout` —
  `useWindowLayout` for the window itself, `useGridColumns` for a grid,
  `shelfItemWidth` for a horizontal shelf of covers (Home's and the album
  screen's alike; `getSectionItemWidth` is the same function under the name
  Home's shelves already called it), `useContentInset` for a list of rows,
  `libraryGutter` for the library-shaped lists that spell the same cap as
  padding, `playerLayout` for the player. None of
  them asks what device it is on: a phone on its side, an iPad in Split View
  at a third of the screen and a half-open foldable are each a *window*, and
  `Platform.isPad` answers none of them. Two rules keep the results honest.
  **A cap, not a stretch** — a row is the one shape that gets worse as it gets
  wider, so a column of them stops at `contentWidth.readable` and the leftover
  room becomes the padding that centres it (`centringInset`; a `FlashList`
  takes padding in `contentContainerStyle` and rejects everything else, which
  is why the cap is spelled that way). Anything full-bleed above or below the
  rows — a hero and its colour wash, a shelf of covers — gives the padding
  back with a negative margin, exactly as the library gutter already did.
  **More artwork, not bigger** — a grid or a shelf answers a wider window with
  more tiles, sized by `artworkScaleFor`, which grows with the square root of
  the window and stops at half again. Every one of these returns *exactly* the
  number the app drew before it existed at or below `REFERENCE_WIDTH`, which
  is the widest phone rather than the typical one, so no phone moved. A square
  is bounded by the window's height as well as its width (`squareArtSize`):
  sizing artwork off width alone is correct in portrait and asks for an 800pt
  cover in a 390pt-tall window the moment the phone is turned, which is what
  pushed the player's transport off the screen. The player has two shapes
  rather than one that stretches — see `playerLayout`, where landscape decides
  it, not the size class.
- **Home vs Library**: Home is what changes, Library is what's complete. A view
  that moves on its own — recently added, most played, what you were listening
  to — is a Home shelf; the stable, exhaustive, sortable list is a Library
  collection. The same data may appear in both, but never as the same thing
  twice: Home shows the first handful and its heading leads to Library's full
  version (`SectionShelfHeader`'s `onSeeAll`), landing on the entity list with
  the matching sort already applied.
- **Library entry vs sort order**: an entry row is one of the two things —
  a kind of thing the library holds (playlists, albums, artists, tracks) or a
  cross-cutting cut over them that a sort order can't express (genres, which
  is a hierarchy; downloaded, which is a filter). A time-ordered or play-ordered
  view of albums is not a row: it is the Albums row with a sort. "Recently
  added" would have been a row for the same reason "Most played" would be —
  neither is; both live in the sort sheet, and the changing view of each is
  the Home shelf.
- **Library navigation**: the library tab is an index, each row opening its own
  screen (`features/library/LibraryCollectionScreen`) — nothing else lives on it.
  It used to be a row of filter pills, which could only ever show the types it
  had room for — that is why genres had no way in for so long. Adding a way to
  browse means adding an entry row, not a pill and not a section. Deep pushes
  from a library row (a genre, a collection screen, an album from one of them)
  keep the Library tab lit — `_layout.tsx` remembers the last tab root you
  visited and holds it until you visit another, so the icon does not jump to
  Home the moment you leave `/library`.
- **Library gutter**: horizontal insets in the library come from
  `features/library/layout`, never from a literal. A list row and a grid cell
  each carry an inset of their own, so the list's padding is the difference
  that lands artwork exactly `spacing.page` from the screen edge in both modes.
  Anything drawn above the items — a header, the sort row — cancels that
  padding with a negative margin and keeps `spacing.page`, so all of it lines
  up on one edge.
- **A row is one accessibility element, so nothing tappable goes inside one**:
  `OptionSheetRow` wraps its whole contents — the `trailing` slot included —
  in a single `Touchable`, and React Native's `Pressable` is an accessibility
  element unless told otherwise. Five stars in a row's trailing slot would be
  five controls a screen reader can see and never reach, which is why the only
  other `trailing` in the app is inert text. Rating therefore has the sleep
  timer's shape: an ordinary registry row showing the current value
  (`RatingValue`, deliberately not pressable) that opens `RatingSheet`, where
  the stars are direct children of the sheet and are five radios again. It
  sits next to Favourite, which is the pair those two rows are meant to be —
  a favourite says "keep this where I can find it" (it builds the Favourites
  playlist and the CarPlay category, and it survives being offline), a rating
  says how much you like it. Everything about ratings is presence-gated on the
  adapter's `ratings` surface rather than on a provider name — row, player
  stars, Appearance switch and the "Rating" sort order all disappear together
  on a server without them; `docs/integrations.md` says which servers those
  are and why Plex is one of them.
- **Options live behind a `⋯`**: every detail-style screen — album, artist
  (browsed as well as owned), playlist, genre, radio, podcasts, shares, wants —
  puts its actions in an options sheet opened from a `⋯` on the right of
  `DetailHeader`/`DetailHeaderBar`, and every row or tile puts its own behind a
  `⋯` (a tile, having no room for one, answers a long press —
  `features/home/OptionsTile`). Sheets are built on `EntityOptionsSheet` and
  `OptionSheetPrimitives`; an entity kind's rows come from
  `features/entity-actions/registry`, and a screen-level list (radio stations,
  podcasts) builds `ResolvedAction`s directly, since a station is not a domain
  entity. Bare icon buttons on a row are how this drifts back: radio drew a
  pencil and a bin, shares three icons, podcasts a bin — one stray tap from the
  row you press to play, and each screen answering "what can I do with this"
  differently. A primary action may stay on the row (play an episode, download
  one); everything else, and anything destructive, goes in the sheet.
- **Sheets are one sheet**: anything that comes up from the bottom is a
  `BottomSheetModal` wearing the shared scaffold — `useOptionSheetBackground`
  for the surface (which is what makes its corners follow the user's radius
  preset), `renderBackdrop` (which is also what gives it Android's back
  button), a handle, `stackBehavior="push"`, and `useOptionSheetContentStyle`
  for padding that clears the home indicator. Height comes from the content:
  `enableDynamicSizing` for a fixed stack of rows, snap points only for a list
  whose length the sheet cannot know (an options sheet over a long info
  section, lyrics, the output picker while it scans). A percentage like `'40%'`
  on a sheet of five rows is the caller guessing at a height it does not lay
  out, and `sheetConventions.test.ts` fails on any sheet that skips the
  scaffold. Three are deliberately their own design and named in that test:
  `PlaylistList`, `SelectionBottomSheet`, and onboarding's scheme sheet, which
  is dark because the flow around it is.
- **Collection actions**: a screen led by artwork uses `DetailHeader`'s centred
  circle-and-pill pair. A screen without artwork uses
  `features/library/CollectionActions` — two square-shouldered halves of the
  content width, which have to carry the top of the screen on their own.
- **Translations**: every key added to `locales/en.json` is added to all four
  locales in the same change; `locales/locales.test.ts` fails otherwise. A
  missing key falls back to English mid-sentence, so it reads as a bug rather
  than as an untranslated string. The same test checks the other direction —
  every literal key the code passes to `t()` exists in `en.json` — because a
  string can also go missing by never arriving: seven surfaces (the tab bar,
  the Downloads screen, the display sheet, both Home banners) shipped their
  English inline as a `defaultValue` and were never translated into anything,
  in any locale, which the one-directional check could not see. Put the English
  in `en.json`, not in a `defaultValue`; keep the latter only for a key built at
  runtime, where there is nothing static to check.
- **Home**: sections are grouped into tiers by `features/home/homeLayout` —
  resume first and unlabelled, then your own library, then external discovery
  behind its source header. A new section belongs to exactly one tier, and the
  library tier stays short: it carries what changes on its own, not everything
  that could be shown. Discovery is off by default (each source's `homeShelves` use in `settingsSources`)
  and absent offline, so the local tiers are all a fresh install has — Home
  cannot be emptied out on the assumption that discovery will fill it.
