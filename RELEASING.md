# Releasing

Releases are cut by pushing a version tag. The pipeline in `.github/workflows/release.yml` does the rest.

## Cut a release

1. Make sure `main` is green in CI.
2. Set the new version in `package.json` (for example `0.2.0`, or `0.2.0-rc.1` for a pre-release) and commit it.
3. Tag and push:

   ```bash
   git tag v0.2.0
   git push origin v0.2.0
   ```

The tag must equal `v` plus the `package.json` version, or the pipeline stops before it builds anything.

## What the pipeline does

1. **build**: checks the tag against `package.json`, runs `npm run check`, builds the web panel, runs the full test suite, and packs the npm tarball.
2. **github-release**: creates a GitHub Release for the tag with generated notes and attaches the tarball. A version with a `-` in it (such as `0.2.0-rc.1`) is marked as a pre-release.
3. **npm-publish**: publishes that same tarball to npm with provenance. Pre-releases go to the `next` tag, others to `latest`.

## One-time setup for npm publishing

Publishing is off until you set it up, and the first two steps are safe to skip if you only want GitHub releases.

1. Choose a package name that is free on npm and set it as `name` in `package.json`. The name `agy-bridge` is already taken on npm.
2. In the GitHub repository, go to **Settings → Secrets and variables → Actions** and add a secret named `NPM_TOKEN` (an npm automation token that can publish the package).
3. Go to **Settings → Environments**, open the `npm-publish` environment (it is created on first use), and add yourself as a required reviewer. Every publish then waits for your approval, because an npm release can't be undone.

Without `NPM_TOKEN` the `npm-publish` job prints a notice and does nothing.

## If a release fails

- Failed before the GitHub Release: fix the problem, delete the tag (`git push origin :refs/tags/v0.2.0` and `git tag -d v0.2.0`), and tag again.
- Published to npm by mistake: npm does not allow re-publishing a version. Publish a new patch version and deprecate the bad one with `npm deprecate`.
