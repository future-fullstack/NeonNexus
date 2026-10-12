## Development

When starting the dev server, use background mode:

```
astro dev --background
```

Manage the background server with `astro dev stop`, `astro dev status`, and `astro dev logs`.

## Documentation

Full documentation: https://docs.astro.build

Consult these guides before working on related tasks:

- [Adding pages, dynamic routes, or middleware](https://docs.astro.build/en/guides/routing/)
- [Working with Astro components](https://docs.astro.build/en/basics/astro-components/)
- [Using React, Vue, Svelte, or other framework components](https://docs.astro.build/en/guides/framework-components/)
- [Adding or managing content](https://docs.astro.build/en/guides/content-collections/)
- [Adding styles or using Tailwind](https://docs.astro.build/en/guides/styling/)
- [Supporting multiple languages](https://docs.astro.build/en/guides/internationalization/)

## Git and delivery

This project already has a Git repository and the GitHub remote `future-fullstack/NeonNexus`; reuse it rather than initializing another repository.

- For new features or substantial functional changes, use a focused `codex/<feature-name>` branch. Small documentation-only updates may stay on the current branch.
- Before delivery, review the diff and run checks appropriate to the change. Commit the code and relevant documentation, then push the branch to GitHub. Do not report a successful push until it has actually succeeded; report network or authentication failures honestly.
- Keep passwords, access tokens, private environment files, databases, visitor messages, anonymous retrieval secrets, private drafts and backups out of Git, including temporary files and commit history. Check staged files before committing.
- Normal article writing and publishing happen in the website's private editor and content database; they do not require Git commits, GitHub uploads or rebuilding the frontend.
- Do not change global Git, system proxy or Clash settings to work around a Git connection issue. Prefer a command-scoped proxy setting and retain TLS certificate verification.
