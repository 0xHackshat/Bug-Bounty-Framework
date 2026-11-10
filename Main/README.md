# Mind Palace Firefox Extension

This project builds the existing React Flow editor as a self-contained Firefox WebExtension. The extension opens the full editor in its own tab from the Firefox toolbar button. The production build bundles the app locally and does not need a web server. Internet access is only needed if optional GitHub sync is configured.

## Build

Install dependencies and build/package the extension:

```sh
npm install
npm run build:extension
```

The command creates `mind-palace.xpi` and a ready-to-load `dist/` extension directory. Vite bundles the app, then the package script copies the Firefox manifest, background script, icon assets, and bundled view defaults before creating the XPI archive.

## Install in Firefox

Firefox release builds generally require distributed extensions to be signed. For regular installation, submit the XPI to [addons.mozilla.org](https://addons.mozilla.org/developers/) for signing, then install the signed file.

For local testing, open `about:debugging#/runtime/this-firefox`, choose **Load Temporary Add-on…**, and select `dist/manifest.json`. The extension toolbar button opens the editor in a dedicated tab. Temporary add-ons are removed when Firefox closes.

## Views and stored data

The navbar switches between **Mind Palace** and **Bug Bounty Mind Map**. Their bundled defaults are `src/data/mind_palace.json` and `src/data/bug_bounty_mind_map.json`; the package also includes them at `dist/views/`. User changes are stored independently in Firefox `browser.storage.local` under `mind_palace_state` and `bug_bounty_mind_map_state`. Firefox keeps this data in the extension's profile storage across browser restarts. An earlier single-diagram `diagram` value is migrated into the Bug Bounty view when no view-specific save exists. The standalone web development mode uses separate localStorage keys as a fallback.

Import and Export operate on the active view. Export uses the active view filename (`mind_palace.json` or `bug_bounty_mind_map.json`). Import expects a JSON object with `nodes` and `edges` arrays in the format produced by the editor's Export command. Nodes include IDs, positions, and `data` fields (`title`, `note`, `kind`, and `color`); edges include IDs and source/target node IDs. Import validates references and preserves the smooth blue arrow edge styling.

## Optional GitHub sync

Use the **GitHub Sync** toolbar button to connect a private repository. Create a fine-grained personal access token limited to that repository with **Contents: read and write** permission, then enter the token and repository details in the dialog on each device. The token is stored in that browser profile's extension storage and is not included in the project source; anyone who can access that browser profile may be able to access it. Do not use a token with access to unrelated repositories.

Click **Save** to save locally and upload the active view to `Main/sync-data/mind_palace.json` or `Main/sync-data/bug_bounty_mind_map.json`. When the extension opens or you switch views, it checks GitHub for newer data. If both this device and GitHub changed since the last sync, the extension keeps the local diagram and asks whether to load the GitHub version or overwrite it with the local version. GitHub sync requires an internet connection and does not run while the extension is closed.
