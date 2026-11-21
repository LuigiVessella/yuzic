# Upstream release reference

These are the inherited rules and release history of `yuzicapp/yuzic`.
For the personal fork, [fork-releases.md](fork-releases.md) takes precedence.
Read this reference before changing upstream store workflows or Fastlane.

## Branch model

- `dev` is the long-running integration branch. Push work here (directly or via PR) — do not delete it after merging.
- `master` is the stable/release branch. Promote work from `dev` to `master` via a PR (e.g. #137), not by pushing directly.
- **A merge to `master` that changes `package.json`'s `version` ships.** `release-on-version-bump.yml` fires on the push and calls both build workflows, which upload to TestFlight and Play's alpha track. There is no separate "publish" step to forget or to hold back at — opening that PR *is* the release decision, so treat it as one.
- Both branches have GitHub branch protection requiring the `Lint, Typecheck & Test` check (from `.github/workflows/pr-checks.yml`) to pass before a PR can merge. Repo admins can bypass this for direct pushes — it does not block `git push` outright.

## CI

- `.github/workflows/pr-checks.yml`: lint (`npm run lint`), typed routes, typecheck (`npx tsc --noEmit`), tests (`npx jest --ci`) and the architecture gates (`npm run architecture:check`) on every push/PR to `master` and `dev`. Keep this green — it's what branch protection gates on.
- `.github/workflows/android-build.yml` / `ios-build.yml`: build and ship to Play's alpha track / App Store Connect (TestFlight only — `submit_for_review: false`, never public review). **`workflow_call` only** — there is no `workflow_dispatch` on either, so a release is the one thing that can ship. No manual version inputs — see below.
- `.github/workflows/e2e.yml`: the Maestro suites on an iOS simulator, on demand only — not a PR gate and not a nightly, because the flows sign in through a public demo server and each run is forty minutes of a macOS runner. See [`.maestro/README.md`](../.maestro/README.md).
- `.github/workflows/release-on-version-bump.yml`: on push to `master`, if `package.json`'s `version` field changed from the previous commit, automatically calls both build workflows.

## `patches/` must stay in release builds

**`patch-package` belongs in `dependencies`, not `devDependencies`.** Release
builds install with `npm ci --omit=dev` — deliberately, to keep
`expo-dev-launcher` out of the artifact — and `--omit=dev` skips anything in
`devDependencies`, tooling included. `patch-package` was in the wrong list from
2026-09-08, and `postinstall` was guarded on its binary existing:

```
if [ -e node_modules/.bin/patch-package ]; then patch-package --error-on-fail; fi
```

so every release build applied **no patches at all**, exited zero, and said
nothing. It held for seventeen days and three releases because everything works
in development, where dev dependencies are installed. What it cost: the
`expo-router` patch that lets the app mount when a car launches it with no phone
window, so the CarPlay cold-launch fix was absent from the 2.11.0 that shipped
it; and the `react-native-draggable-flatlist` patch for nested-list measurement
on the new architecture, absent since 2.9.0.

`postinstall` is unguarded now, so a missing `patch-package` fails the install
instead of quietly skipping. `tools/verify-patches.sh` runs in both build
workflows after the install and fails unless every patch in `patches/` is
actually present in `node_modules` — it reverse-applies each one, which also
catches a patch left stale by an upstream bump. Don't move `patch-package` back,
and don't re-add a guard that turns a missing tool into a no-op.

## Version numbers — the stores are asked, never told

Android versionCode and iOS build number are **queried from Play and App Store
Connect at build time** and must never be typed in per-run. Both stores require
a number greater than what they already hold, so they are the only things that
know the right answer; anything computed locally is a guess that is wrong the
moment a build is entered a different way.

The mechanism (see `fastlane/Fastfile`):
- `VERSION_LABEL` (e.g. `2.0.0`) is read directly from `package.json` at build time — single source of truth, never passed as a workflow input.
- **Android**: `google_play_track_version_codes` across *all four* tracks (internal, alpha, beta, production), highest + 1. All four, because a code live anywhere is a code Play will not accept again — and production has historically sat *below* alpha here.
- **iOS**: every build upload App Store Connect holds — `Spaceship::ConnectAPI.get_build_uploads`, the 200 most recent — highest + 1 across *all* versions. `latest_testflight_build_number` answers a narrower question and is deliberately not used: sorted by upload date with a limit of one, it returned 10 where the app already had 94, which is how 2.0.0 shipped underneath an existing build.
- There is deliberately **no override and no fallback**. If the store cannot be reached the build fails; it does not invent a number. The old code fell back to `Time.now.to_i`, which would have spent about 1.7 billion of a 2.1 billion version code ceiling in one upload, irreversibly.

**Do not reintroduce a locally-derived number.** The previous mechanism was
`GITHUB_RUN_NUMBER` plus a fixed offset, described here as a per-workflow-file
counter that "never resets or repeats". That is true of a `workflow_dispatch`
and **false of a `workflow_call`**: a reusable workflow sees the *caller's* run
number. So the same build had two counters — the dispatch path reached
versionCode 132 while the release path was still at 118 — and 2.0.0 was refused
by Play with `You cannot rollout this release because it does not allow any
existing users to upgrade to the newly added APKs`, after a fully green Gradle
build. On iOS the same skew was silent and worse: the release uploaded 2.0.0
build **10** underneath the dispatch path's 2.0.0 build **94**, which App Store
Connect *accepted*, leaving testers on the older-numbered build.

**What the stores held at the last release**, as a sanity check rather than a
source of truth — the next run should come out one above these:

- 2.15.0 (2026-09-27): TestFlight build **136**, Play version code **157**.
- 2.14.0 (2026-09-27): TestFlight build **135**, Play version code **156**.
- 2.13.0 (2026-09-26): TestFlight build **134**, Play version code **155**.
- 2.12.0 (2026-09-25): TestFlight build **133**, Play version code **154**.
- 2.11.0 (2026-09-25): TestFlight build **132**, Play version code **153**.
- 2.10.0 (2026-09-24): TestFlight build **131**, Play version code **152**.
- When the mechanism changed (2026-09-07): Play production **1.3.7 / 109**,
  alpha **1.4.0 / 132**; TestFlight **2.0.0 / 94**, plus the release run's
  stranded **2.0.0 / 10**. The rejected 2.0.0 Play attempt was code 118.

A number much below the latest line means something local answered instead of
the store. The release run prints both on its summary — see the `verdict`
job — so this is a cross-check rather than the only record.

That summary said `unknown` for every release up to and including 2.14.0. Both
build workflows declared the number as a *job* output, which a caller cannot
see: a reusable workflow hands back only what `on.workflow_call.outputs`
declares, so `needs.build-ios.outputs.build_number` was always an empty
string. The numbers were only ever in the build logs. Both now re-export, and
2.15.0 confirmed it: the verdict job reported `IOS_BUILD: 136` and
`ANDROID_CODE: 157` rather than `unknown`, matching the build logs. The
summary is worth reading again.

**Play release notes** come from
`fastlane/metadata/android/en-US/changelogs/`. There cannot be a
`<version code>.txt` any more — the code is only known once Play has been asked
— so notes live in `default.txt`, which supply falls back to, and
`skip_upload_changelogs: false` is set explicitly to keep it that way. Update
`default.txt` as part of a release; it is capped at **500 characters** by Play.

## Release tags are `X.Y.Z`

Bare semver, no `v`, in both repos — decided 2026-09-26, because the two had
drifted apart: this repo had 44 bare tags and the engine 21 `v`-prefixed ones.

Bare won on cost rather than taste. It is the same string as `package.json`'s
`version`, so nothing has to add or strip a prefix to get from one to the
other; `release-on-version-bump.yml` tags with `$VERSION` verbatim. It is what
the release notes, the site's changelog headings and the store version strings
already say, and `changelog-current.yml` in `yuzic-web` matches tags with
`^[0-9]+\.[0-9]+\.[0-9]+$` to tell whether the site has fallen behind.

History is not rewritten. The engine's tags up to `v1.2.1` keep their prefix
and its workflow still triggers on `v*` as well as `[0-9]*`, with the version
check relaxed to `^v?[0-9]+\.[0-9]+\.[0-9]+$` so an old tag can still be
re-run. New tags in either repo are bare.

**The release *title* is a different field with a different job**, and it keeps
the product: `Yuzic 2.13.0` here, `yuzic-engine 1.2.1` there. The tag is read
by machines and is `package.json`'s version verbatim; the title is read by
people on a releases page that says nothing else about what the software is.
`release-on-version-bump.yml` creates the draft already titled, because leaving
it to whoever publishes is how 2.12.0 and 2.13.0 went out bare against the
forty before them. Both have been retitled.

## Releasing — check both halves

A release is **two independent jobs**, and one can succeed while the other
fails. That has now happened twice. On 2026-09-04 the 1.4.0 release shipped iOS
to TestFlight and was rejected by Play in the same run. On 2026-09-07 the 2.0.0
release did it again for a different reason (the run-number skew above),
leaving the two platforms on different versions and the GitHub release stuck as
an empty draft both times. Nothing announced this — the workflow simply showed
as failed, and a failed release looks the same whether nothing shipped or half
of it did.

**A succeeded job is not a shipped release either.** 2.0.0's iOS half reported
success while uploading a build number below what TestFlight already had, so
testers never saw it. Check the number that actually landed, not the tick.

So after any release:

1. Open the `release-on-version-bump` run and check **both** `Ship iOS build`
   and `Ship Android build`, not just the run's overall conclusion.
2. Read the `Using Android version code:` / `Using iOS build number:` lines out
   of the logs and confirm each is higher than the last release's. They are
   queried from the stores now, so they should be — this is the check that
   proves the query happened rather than something local answering.
3. Fill in and publish the draft release the run created. It is generated with
   an empty body and stays a draft until someone writes it, which is why the
   public releases page can lag the actual shipped version by months.
4. **Publish the changelog entry to `yuzic-web`** (`_pages/changelog.md`), and
   move the `` ### `Latest` `` marker onto it. `fastlane/metadata/android/en-US/changelogs/default.txt`
   is the source to expand from — it is already written for users, and it is
   overwritten next release, so the site is the only place the note survives.
   This step did not exist until 2026-09-25, and the site had silently fallen
   seven releases behind: it read 2.6.0 while 2.11.0 was on both stores. The
   site is the only release note a user who is not on GitHub will ever read,
   so a release that is not on it did not, as far as they can tell, happen.
   `changelog-current.yml` in `yuzic-web` fails daily while the site is behind.

   **Push it when the release PR merges — do not wait for the builds.** Decided
   2026-09-25. Waiting sounds safer and is not: a release only reaches
   TestFlight and Play's *alpha* track, and promoting either to the public is a
   separate manual act that can be days later, so there is no moment when the
   page and general availability line up. Waiting only adds a step that can be
   forgotten, which is the failure this checklist exists for. The version is
   fixed the moment the PR merges, and a half-failed release is fixed forward
   and re-promoted under the same number, so the entry stays true either way.
   The site being briefly ahead is the cheap direction to be wrong in, and
   `changelog-current.yml` treats it that way: behind fails, ahead only warns.
   Note a *draft* GitHub release creates no tag, so that warning persists until
   step 3 is done.

   `yuzic-web` is worked on **directly on `master`** — no branches, no PRs;
   pushing `master` is what publishes. Fetch first: this file is edited from
   more than one place, and on 2026-09-25 `master` moved fifteen commits under
   a branch that had been cut from it. Match the entries already there: no
   summary line under the heading, `####` sections, bullets that say what the
   old behaviour was.
5. If one platform failed, say so explicitly rather than re-running blind. The
   fix usually belongs on `dev` and has to be promoted before a re-run can
   possibly succeed — which is exactly what did not happen after 1.4.0.

**Play requires `targetSdkVersion` 36** (Android 16) for uploads to any track,
alpha included. Below that, `supply` fails with `Google Api Error: Invalid
request - Target SDK of artifact is too low`, *after* a full successful Gradle
build — so a green build says nothing about whether Play will take it. Set in
`android/gradle.properties` and `app.json`.

## Store listing images ship with the build, and can lose it

Screenshots are generated by `tools/store-screenshots/capture.sh` and copied
into fastlane's tree by its `publish.py`; both upload steps are enabled, so a
version bump replaces the live listings. Two traps cost the whole of **2.2.0**,
which failed on *both* platforms without a byte reaching either store — after a
24-minute Gradle build and a successful Xcode archive:

- **`skip_upload_images` is not the screenshot flag.** It covers the icon,
  feature graphic, promo graphic and TV banner. Setting it false made `supply`
  upload `images/icon.png` — 4167×4167 where Play demands exactly 512×512 — and
  a refused image **aborts the entire edit**, taking the AAB and the track
  update with it. Play had already answered `versionCode 137`; none of it was
  committed. Screenshots alone means `skip_upload_screenshots: false` **with**
  `skip_upload_images: true`.
- **`deliver` asks a question.** Uploading screenshots makes it render a
  `Preview.html` and prompt `Does the Preview ... look okay for you?`. On a
  runner nobody answers and it does **not** fall back to a default — it raises
  `FastlaneCrash: Could not retrieve response as fastlane runs in
  non-interactive mode` *before* uploading the binary. `force: true` is what
  makes screenshot upload survivable; without it, enabling screenshots loses
  the build as well as the screenshots.
- **Fastlane before 2.239.0 duplicates screenshots.** App Store Connect can
  leave a new image in `UPLOAD_COMPLETE` briefly without assigning its checksum.
  Older `deliver` versions treated that in-flight image as missing and uploaded
  it again, so the 2.2.2 Apple listing showed two copies of every screenshot
  while Play's listing was correct. Keep the Gemfile lower bound at 2.239.0 or
  newer; that release waits for the checksum/status and removes failed pending
  uploads before retrying (fastlane #30094/#30150).

**Screenshots upload on a release, and a release is now the only build.**
`ci_ios` reads `YUZIC_UPLOAD_SCREENSHOTS`, which `ios-build.yml` states as a
constant `true`. It is stated rather than deleted because the Fastfile compares
the string exactly, so an unset variable reads as false and skips the upload in
silence — and because the guard still earns its keep for a `fastlane ci_ios`
run from a laptop, which has no business touching the public listing.

The reason it exists is the one above restated: the upload carries the
screenshots *and* the binary, screenshots first, so anything the store refuses
there loses a fully archived build. On 2026-09-19 two dispatched builds off
`dev` died fifteen minutes in with `Failed verification of all screenshots
deleted... 10 screenshot(s) still exist`.

Those dispatches are why the hand-run path is gone (2026-09-19). It existed
mainly to test off `dev`, which is exactly what the store kept refusing, and a
build that reaches TestFlight without a version behind it is one nobody can
point at afterwards. Both platforms lost the trigger together so they cannot
drift into shipping by different routes.

**So a failed half is re-shipped by bumping the version, not by re-running.**
That re-ships the platform that already succeeded, which is the cost of having
one route; the release checklist above already says not to re-run blind, and
the fix belongs on `dev` and has to be promoted either way. Being selective happens
*after* the build: everything lands in TestFlight and Play's alpha, and
promoting to public review stays a deliberate, manual act in each console.

**The binary and the listing are two uploads now, in that order.** They were
one `upload_to_app_store` call doing both with the screenshots first, which is
the mechanism behind every one of the failures above: the store objects to
something about an image and a fully archived build is discarded. Each earlier
fix addressed the particular objection — the oversized icon, the interactive
prompt, the duplicate uploads — and the coupling survived every time and found
a new way to spend a build.

`upload_to_testflight` now ships the binary on its own, and the screenshot
upload runs after it inside a `rescue`: it logs loudly and does not fail the
lane. A listing one release out of date is a far smaller problem than a release
that did not ship.

**A submitted version's screenshots cannot be replaced, and `deliver` asks
anyway.** This is what actually killed those two builds, and the message names
it once you read past the summary line:

```
Failed to delete screenshot en-US APP_IPHONE_65
The request cannot be fulfilled because of the state of another resource.
  - Can't Delete Screenshot After Submit for review appScreenshots
```

`deliver` chooses its target with `get_edit_app_store_version`, and that
filter counts `WAITING_FOR_REVIEW` as editable. Apple does not: once a version
is submitted, its screenshots are frozen. Both builds carried version label
2.6.3 while 2.6.3 sat in review, so `overwrite_screenshots` tried to delete the
live set, got a `409` per set, and — because the delete happens *before* the
upload — took the rest of the step with it. Deliver retries five times, which
cannot help against a state lock; that is why all ten survived every attempt
and why the failure reproduced exactly.

`screenshots_replaceable?` in the `Fastfile` now asks for the version's state
first and skips the listing unless it is one of `PREPARE_FOR_SUBMISSION`,
`DEVELOPER_REJECTED`, `REJECTED`, `METADATA_REJECTED` or `INVALID_BINARY`. It
is an allowlist so an unfamiliar state leaves the listing alone rather than
gambling a release on it.

The practical consequence for a release: **upload screenshots before submitting
for review, not after.** If a listing change is needed for a version already
submitted, it has to go through the next version — no re-run will place it on
the current one.

Run `python3 tools/store-screenshots/publish.py --check` before a release. It
asserts the exact store sizes for the screenshots *and* for Play's icon and
feature graphic, because every one of these rejections lands **after** the
build rather than before it.

**Enabling a new upload path exposes assets nothing has ever validated.** The
oversized icon sat in the repo for the app's whole life and was harmless until
the flag that uploads it was turned on. When switching on a publish step, audit
every file it will now send — not only the ones being added.

