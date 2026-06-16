# Releasing

skillshelf ships **two independent artifacts** that release on **different tags**.
Do not confuse them — using the wrong tag prefix triggers the wrong pipeline.

| Artifact          | Tag prefix | Pipeline                          | Output                          | Versioned by            |
| ----------------- | ---------- | --------------------------------- | ------------------------------- | ----------------------- |
| npm CLI (`skl`)   | `v*`       | `npm publish` (manual / existing) | package on npm                  | root `package.json`     |
| Desktop app       | `app-v*`   | `.github/workflows/release-app.yml` | GitHub Release with installers | `app/package.json` + `app/src-tauri/tauri.conf.json` |

The desktop app versions **independently** of the CLI. The CLI is currently at
`0.4.0`; the desktop app starts at `0.1.0`. Bumping one does not bump the other.

---

## npm CLI release (tag `v*`)

This is the existing track for the `skl` command-line tool.

```sh
# bump the version in the ROOT package.json, then:
git tag vX.Y.Z
git push origin vX.Y.Z
npm publish        # (or bun publish) — publishes the skillshelf CLI package
```

Never use a `v*` tag for the desktop app.

---

## Desktop app release (tag `app-v*`)

The desktop release is fully automated by
[`.github/workflows/release-app.yml`](../.github/workflows/release-app.yml).
On an `app-v*` tag it builds installers for macOS (Apple Silicon + Intel),
Linux, and Windows via [`tauri-apps/tauri-action`](https://github.com/tauri-apps/tauri-action),
then publishes them to a **draft** GitHub Release.

### Cut a release

1. Bump the desktop version in **both** files so they match:
   - `app/package.json` → `"version"`
   - `app/src-tauri/tauri.conf.json` → `"version"`
2. Tag and push:

   ```sh
   git tag app-vX.Y.Z
   git push origin app-vX.Y.Z
   ```

3. Watch the run in the Actions tab. When it finishes, go to **Releases**,
   review the auto-created **draft**, and **Publish** it.

You can also run it manually (no tag) via **Actions → Release App →
Run workflow** (`workflow_dispatch`).

### Unsigned downloads (default)

Out of the box the macOS app is **unsigned and un-notarized**. Gatekeeper will
refuse to open it on first launch with a double-click. Until macOS signing is
added (below), tell users to:

> **Right-click the app → Open → Open** (the one-time override), or run
> `xattr -dr com.apple.quarantine /Applications/skillshelf.app`.

Windows will show a SmartScreen warning until a code-signing cert is added
(not covered here). Linux `.AppImage`/`.deb` artifacts have no such gate.

---

## Add macOS signing + notarization

This makes the macOS build open without the Gatekeeper warning. You need a paid
**Apple Developer Program** membership.

### Apple Developer assets to create

1. A **Developer ID Application** certificate (Apple Developer → Certificates →
   "Developer ID Application"). Download it and export from Keychain as a
   `.p12` with a password.
2. Your **Team ID** (Apple Developer → Membership).
3. An **app-specific password** for notarization (appleid.apple.com → Sign-In &
   Security → App-Specific Passwords).

### Set the GitHub secrets

```sh
# base64-encode the exported .p12 (do NOT commit the .p12 itself)
base64 -i DeveloperIDApplication.p12 | gh secret set APPLE_CERTIFICATE
gh secret set APPLE_CERTIFICATE_PASSWORD   # the .p12 export password
gh secret set APPLE_SIGNING_IDENTITY       # e.g. "Developer ID Application: Your Name (TEAMID)"
gh secret set APPLE_ID                     # your Apple ID email
gh secret set APPLE_PASSWORD               # the app-specific password
gh secret set APPLE_TEAM_ID                # your Apple Team ID
```

The workflow already references all six as optional env vars — once they exist,
the next `app-v*` release is signed + notarized with no workflow changes.

---

## Activate the updater

The Tauri updater plugin is **wired but inert**. Two things keep it off:

- `app/src-tauri/tauri.conf.json` → `plugins.updater.pubkey` is an empty string.
- `app/src/lib/updater.ts` → `UPDATER_ENABLED = false`.

To turn it on:

1. Generate a signing keypair (you will be prompted for a password):

   ```sh
   cd app
   bun tauri signer generate -w ~/.tauri/skillshelf-updater.key
   ```

   This prints a **public key** and writes a **private key** file. **Never
   commit either key.**

2. Paste the **public key** into `app/src-tauri/tauri.conf.json`:

   ```jsonc
   "plugins": {
     "updater": {
       "endpoints": [
         "https://github.com/Wang-Cankun/skillshelf/releases/latest/download/latest.json"
       ],
       "pubkey": "<PASTE PUBLIC KEY HERE>"
     }
   }
   ```

3. Flip the app-side switch in `app/src/lib/updater.ts`:

   ```ts
   const UPDATER_ENABLED = true;
   ```

4. Store the **private key** + its password as GitHub secrets so CI can sign the
   update artifacts:

   ```sh
   gh secret set TAURI_SIGNING_PRIVATE_KEY < ~/.tauri/skillshelf-updater.key
   gh secret set TAURI_SIGNING_PRIVATE_KEY_PASSWORD   # the password you chose
   ```

5. The bundle already sets `createUpdaterArtifacts: true`, so the next `app-v*`
   release emits the per-platform update archives + `latest.json`. Because the
   endpoint points at `releases/latest/download/latest.json`, **publish the
   release** (not just leave it as a draft) for clients to discover updates.

The in-app check runs once on startup (`checkForUpdates()` in `main.tsx`),
no-ops in the browser, and only acts when `UPDATER_ENABLED` is true.

---

## Homebrew cask (macOS distribution)

Distribute the macOS `.dmg` through a Homebrew tap so users can
`brew install --cask skillshelf`. **Do this after signing is enabled** — an
unsigned cask app still triggers Gatekeeper.

1. Create a tap repository named `homebrew-skillshelf`
   (e.g. `github.com/Wang-Cankun/homebrew-skillshelf`). The `homebrew-`
   prefix is required by Homebrew.

2. Add `Casks/skillshelf.rb` pointing at the GitHub Release `.dmg`:

   ```ruby
   cask "skillshelf" do
     version "X.Y.Z"
     sha256 "<sha256 of the .dmg>"

     url "https://github.com/Wang-Cankun/skillshelf/releases/download/app-v#{version}/skillshelf_#{version}_aarch64.dmg"
     name "skillshelf"
     desc "Agent-first skill registry + manager"
     homepage "https://github.com/Wang-Cankun/skillshelf"

     app "skillshelf.app"
   end
   ```

   Get the checksum with `shasum -a 256 skillshelf_X.Y.Z_aarch64.dmg`. For a
   universal/Intel build, add an `on_arch` / second `url` as needed.

3. Users then run:

   ```sh
   brew tap Wang-Cankun/skillshelf
   brew install --cask skillshelf
   ```

Bump `version` + `sha256` in the cask on each desktop release.

---

## Required GitHub secrets (summary)

| Secret                               | Enables                  | Required? |
| ------------------------------------ | ------------------------ | --------- |
| `GITHUB_TOKEN`                       | Release upload           | auto (built-in) |
| `APPLE_CERTIFICATE`                  | macOS signing            | optional  |
| `APPLE_CERTIFICATE_PASSWORD`         | macOS signing            | optional  |
| `APPLE_SIGNING_IDENTITY`             | macOS signing            | optional  |
| `APPLE_ID`                           | macOS notarization       | optional  |
| `APPLE_PASSWORD`                     | macOS notarization       | optional  |
| `APPLE_TEAM_ID`                      | macOS notarization       | optional  |
| `TAURI_SIGNING_PRIVATE_KEY`          | Updater artifact signing | optional  |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | Updater artifact signing | optional  |

With **none** of the optional secrets set, releases build unsigned and the
updater stays inert — the pipeline still produces installers + a GitHub Release.
