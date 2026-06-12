# Security Policy

## Reporting a vulnerability

Please report security vulnerabilities **privately** rather than opening a
public issue.

Use GitHub's private vulnerability reporting:

1. Go to the repository's **Security** tab.
2. Click **Report a vulnerability** to open a private security advisory.

We aim to acknowledge reports promptly and will coordinate a fix and
disclosure timeline with you. Please give us a reasonable opportunity to
address the issue before any public disclosure.

## Supported versions

skillshelf is pre-1.0 and under active development. Security fixes are applied
to the latest released version on the default branch.

## Security model & notes

skillshelf is a local command-line tool. A few behaviours are worth keeping in
mind when assessing risk:

- **It shells out to `git` and `gh`.** Fetching and updating third-party skills
  invokes the local `git` (and optionally GitHub `gh`) binaries. It operates
  with the privileges of the user running it and trusts the local toolchain.
- **It reads skill content from remote sources.** Imported skills are arbitrary
  Markdown/files from upstream repositories. Review third-party skills before
  trusting their content, the same way you would review any downloaded code or
  prompt.
- **It may read optional environment / config files** (e.g. a local
  `~/.skillshelf/config.json` and environment variables such as
  `SKILLSHELF_LIBRARY`). It does not transmit them anywhere.

## Handling secrets

- **Never commit API keys, tokens, or other secrets** to this repository or to
  any skill content.
- Keep credentials in environment variables or untracked local files, and make
  sure such files are covered by `.gitignore`.
- If you believe a secret has been committed, treat it as compromised, rotate
  it immediately, and report it via the private advisory process above.
