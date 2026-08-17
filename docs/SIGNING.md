# Code Signing

Setup and configuration for signing release builds. Windows uses Azure
Artifact Signing; macOS uses the existing Apple Developer membership.

**No secrets in this file, and none should ever be added to it.** Client
secrets, certificates and passwords belong in GitHub repository secrets or
the local keychain, never in the repo.

---

## Windows — Azure Artifact Signing

Formerly called Azure Trusted Signing. Microsoft's managed signing service:
no hardware token, no certificate file to protect, and the private key never
leaves their HSM.

### Portal setup — complete as of 14 Aug 2026

| Item | Value |
|---|---|
| Endpoint URI | `https://wus2.codesigning.azure.net/` |
| Signing account | `t7gt11signing` |
| Certificate profile | `T7GT11SEATTLE` |
| Profile type | Public Trust |
| Resource group | `T7GT11` |
| Region | West US 2 |
| Subscription id | `8af1f14d-9bc5-45bd-a0c9-ca38dd5afa1d` |
| Tenant | `danielspilsgmail.onmicrosoft.com` |
| Pricing tier | Basic, $9.99/month |

Identity validation `20df8a90-eec3-47f7-a9bf-5acd28d6a0a2` — Individual,
Public, **Validation Pass**.

Certificate subject as issued:

```
CN=Daniel Spils, O=Daniel Spils, L=Seattle, S=wa, C=US
```

Street address and postal code were deliberately excluded from the subject,
so the developer's home address is not embedded in every installer. The
lowercase `wa` is inherited from the Azure billing account; correcting it
would require an entirely new identity validation, so it stays.

### Hard constraint: signing must run on Windows

Azure's signing client is `Azure.CodeSigning.Dlib` driving Windows SignTool.
There is no macOS equivalent.

**Windows installers cannot be signed on the Mac.** The signing step has to
run either on the Windows laptop or on a `windows-latest` GitHub Actions
runner. This constrains the release process, not just the build script.

### Provisioning — complete as of 14 Aug 2026

1. **Service principal** — Entra app registration `t7gt11-signing-ci`, whose
   credentials the build uses to authenticate. Only the GitHub Actions path
   needs it; a local Windows build can use `az login` instead and store no
   secret at all.
2. **Role assignment** — `t7gt11-signing-ci` holds **Artifact Signing
   Certificate Profile Signer** on the `t7gt11signing` account, assigned
   through Access control (IAM).
   Note: subscription Owner does **not** imply this role. The same trap
   applied to Identity Verifier during setup — the button simply appears
   dimmed with no explanation.
3. **Repository secrets** — `AZURE_CLIENT_ID`, `AZURE_TENANT_ID` and
   `AZURE_CLIENT_SECRET` are set on the repository whose workflow does the
   signing. Today that is JP Patches; this repo has no remote and no
   workflow yet, so its secrets are still to come.

### Done here as of 2026-08-16

Packaging exists: `electron-builder.yml`, `scripts/win-sign.js`, `build/`
(icon and entitlements) and `.github/workflows/release.yml`. A universal macOS
build has been made and run locally, unsigned. What is still outstanding:

1. **Repository secrets** — Azure's three, plus the Apple set. This repo has
   none yet; JP Patches holds the Azure ones today.
2. **A first signed build**, verified on a clean Windows machine that has
   never seen the app.
3. **A real app icon.** `build/icon.png` is a placeholder.

Deliberately not started yet: the pre-release audit fixes come first. A
signed installer that misreports the owner's instrument is worse than an
unsigned one that doesn't — signing makes a build trustworthy, not correct
(Daniel, 2026-08-14). The signing setup pays off in JP Patches first, which
already has packaging and a Windows workflow.

### electron-builder — NOT `azureSignOptions`

**Do not use `win.azureSignOptions`.** This section used to recommend it. It
deadlocks on GitHub runners: electron-builder's `initialize()` runs
`Install-Module` unconditionally inside a captured-pipe PowerShell, with no
check for whether the module is already present, so pre-installing cannot
prevent the call and the job hangs until it is killed. JP Patches lost three
runs to it — 31864994891, 31887238438, 31888913488 — at 29 to 43 silent
minutes each.

What works, and what this repo does: a custom sign hook that calls
`Invoke-TrustedSigning` directly with stdio inherited. Same certificate, same
signature, visible output, no captured pipe.

```yaml
# electron-builder.yml
win:
  signtoolOptions:
    sign: ./scripts/win-sign.js
    publisherName: Daniel Spils
    signingHashAlgorithms: [sha256]
```

The workflow installs the `TrustedSigning` PowerShell module itself, once,
before the build — fast and visible, unlike the built-in path.

Two details that cost time if you get them wrong:

- `publisherName` lives **inside `signtoolOptions`** in electron-builder 26.
  At the `win` level it fails validation with the unhelpful message
  `configuration.win should be one of these: null`.
- It must match the certificate's CN exactly, or the installer fails
  verification against its own signature.

Authentication uses `DefaultAzureCredential`, which resolves in order:

- **Local Windows build** — an `az login` session. Nothing stored, nothing
  to rotate, no secret anywhere on disk.
- **GitHub Actions** — `AZURE_TENANT_ID`, `AZURE_CLIENT_ID` and
  `AZURE_CLIENT_SECRET` from repository secrets.

### SmartScreen reputation

Artifact Signing issues an OV-equivalent certificate. It does **not** confer
instant SmartScreen trust — reputation accrues as downloads accumulate.

Expect early users to still see "Windows protected your PC" on a signed
installer. This is normal and improves over time. Only an EV certificate
avoids it outright, at substantially higher cost and vetting.

Reputation attaches to the certificate rather than to any one application, so
signing JP Patches with the same certificate builds shared reputation and
clears its existing unsigned warning at the same time.

### Certificate rotation

Artifact Signing rotates the underlying certificate roughly every three days
by design; nothing in the build has to track this. What matters is that the
**profile** stays active and the subscription stays in good standing —
signing stops if the Azure subscription lapses.

---

## macOS — Apple Developer Program

The existing membership covers this app; nothing new to purchase. One
membership signs and notarizes unlimited applications, so the same
credentials already used for JP Patches apply here.

Requirements for a distributable build:

- **Developer ID Application** certificate — for distribution outside the Mac
  App Store.
- **Hardened runtime** enabled.
- **Notarization** through Apple's service, then stapling the ticket to the
  artifact so first launch works offline.
- **`electron-rebuild`** for `@julusian/midi` before packaging. It is a native
  module and will not load in a packaged app otherwise.
- Electron pinned to **43**. Older majors get flagged by macOS XProtect.

An app-specific password or an App Store Connect API key is needed for
notarization; both belong in the keychain or CI secrets, never in the repo.

### Universal builds and the native module

macOS warns **"includes a component that will not work with a future release
of macOS"** for any x86_64-only Mach-O inside a bundle — even one nothing
loads. `@julusian/midi` ships several: `bin/darwin-<arch>-<abi>/midi.node`
from electron-rebuild, and `prebuilds/midi-darwin-<arch>/`. Each is one
architecture by construction, so a universal app containing them is flagged.

The fix is not to lipo them. **Nothing loads them.** `pkg-prebuilds` resolves
`build/Debug` → `build/Release` → `prebuilds/`, and never looks in `bin/` at
all. electron-builder rebuilds the module once per target architecture while
packaging, so `build/Release/midi.node` genuinely differs between the two
halves and `@electron/universal` lipos it into a universal binary — which is
the one the app loads. So the single-architecture copies are excluded from the
package in `mac.files`, and every Mach-O that ships is universal.

Verify after any change to the native module or its version:

```sh
find dist/mac-universal/*.app -type f -name '*.node' -o -name '*.dylib' \
  | while read f; do echo "$(lipo -archs "$f") $f"; done
```

Every line must read `x86_64 arm64`. Then confirm the module actually loads in
both slices — `arch -x86_64 env ELECTRON_RUN_AS_NODE=1 <app binary> probe.js`
against the native run — because "universal" and "loads" are different claims.

### `x64ArchFiles` is a trap here

`@electron/universal` refuses an identical Mach-O found in both halves unless
a `x64ArchFiles` pattern names it. Adding that pattern makes the build pass
and ships a single-architecture binary — the very thing macOS warns about.
Exclude the file instead.

---

## Annual cost

| Item | Cost |
|---|---|
| Apple Developer Program | $99/year |
| Azure Artifact Signing (Basic) | $9.99/month, ~$120/year |

The Azure subscription is pay-as-you-go. Artifact Signing is **not available
on free, trial, or sponsored subscriptions** — account creation fails
outright with that error. A budget alert is worth setting, since a stray
resource on a pay-as-you-go subscription bills without warning.

---

## What ships inside the bundle

The `files` list in `electron-builder.yml` is **derived from what the app
reads at runtime**, not assumed. `src/`, `schema/` (three JSON files, all read
through preload), `data/expansions.json`, `assets/` (fonts, instrument art,
the panel SVG) — and `fixtures/sample-library.json`, which is the one that
looks like test data and is not: `main.js` reads it to seed a new user's
library. A build without it installs and then fails on first launch for
exactly the people a release is for.

Left out deliberately: `test/`, `tools/`, `docs/`, `fixtures/generate*.js` and
`fixtures/library-roundtrip.json`. The only runtime reference into `test/` is
`test/ui/harness.js`, behind the `SEVEN_UI_TEST` development flag.

## One release per version

Mac and Windows assets go on the **same** GitHub release, always.
`.github/workflows/release.yml` enforces it: both platform jobs publish into a
draft, and a final job — gated on both succeeding, and checking that
`latest.yml`, `latest-mac.yml`, the `.dmg`, the `-mac.zip` and the `.exe` are
all present — is what makes the release public.

The failure this prevents: JP Patches published Mac and Windows as separate
releases per version, so the Windows updater looked for `latest.yml` on a
release carrying only Mac assets and 404'd silently for months.

## The app's name and its data folder

The bundle is **This Seven Goes to Eleven**, and `productName` in
`package.json` matches it — which is what Electron reads for
`app.getPath('userData')`. That moved the library folder out of
`Crumar Seven Editor`, so `migrateLegacyLibrary()` in `main.js` copies an
existing library across on first run. It copies, never moves: if any of it is
wrong the original is still there. Verified on the real library, 62 files.

## Release checklist

- [ ] `electron-rebuild` run for the target platform
- [ ] macOS build signed with Developer ID and notarized, ticket stapled
- [ ] Windows build signed on Windows (laptop or Actions runner)
- [ ] Signature verified on a clean machine of each OS that has never run
      the app
- [ ] First-run state checked with an empty library folder
- [ ] Download page states that the app is free and open source, with the
      Ko-fi link visible but not prompted
