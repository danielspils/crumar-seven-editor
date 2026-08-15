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

### Not yet done, here

1. **Packaging at all.** This repo has no electron-builder dependency, no
   `build` block, no icons and no `.github/`. The config below is the target,
   not an edit to something that exists.
2. **electron-builder configuration** — see below.
3. **A first signed build**, verified on a clean Windows machine that has
   never seen the app.

Deliberately not started yet: the pre-release audit fixes come first. A
signed installer that misreports the owner's instrument is worse than an
unsigned one that doesn't — signing makes a build trustworthy, not correct
(Daniel, 2026-08-14). The signing setup pays off in JP Patches first, which
already has packaging and a Windows workflow.

### electron-builder

Signing is configured under `win.azureSignOptions`. The three values above go
in the config; credentials come from the environment.

```jsonc
"win": {
  "azureSignOptions": {
    "endpoint": "https://wus2.codesigning.azure.net/",
    "codeSigningAccountName": "t7gt11signing",
    "certificateProfileName": "T7GT11SEATTLE",
    "publisherName": "Daniel Spils"
  }
}
```

`publisherName` must match the certificate's CN exactly, or the installer
will fail verification against its own signature.

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

## Release checklist

- [ ] `electron-rebuild` run for the target platform
- [ ] macOS build signed with Developer ID and notarized, ticket stapled
- [ ] Windows build signed on Windows (laptop or Actions runner)
- [ ] Signature verified on a clean machine of each OS that has never run
      the app
- [ ] First-run state checked with an empty library folder
- [ ] Download page states that the app is free and open source, with the
      Ko-fi link visible but not prompted
