# Novare NEXUS

Google Apps Script source managed with clasp. Run clasp commands from this repository root, where `.clasp.json` and `appsscript.json` remain.

```text
backend/
  core/          Web entrypoint, identity, links and shared configuration
  admin/         Admin access
  knowledge/     Extraction, indexing, scheduling, retrieval and search
  nosca/         Conversation, Gemini, service and existing diagnostics
  prompts/       AI Prompt Library APIs
  logging/       Usage and site-access logging
frontend/
  pages/         Index template and page markup
  shell/         Sidebar, header, topbar and main client runtime
  components/    NOSCA dialog and site-search data
  scripts/       Existing client behavior HTML fragments
  styles/        Existing CSS HTML fragments
docs/            Inventory, dependency audit and migration evidence
```

Keep HTML fragments in their existing `.html` format. Includes and HTML-service lookups use the full logical path, without the extension, for example `include('frontend/styles/Styles_Core')`. Server functions share Apps Script global scope regardless of their folders.

Before syncing, inspect the complete planned source set:

```sh
clasp show-authorized-user
clasp show-file-status
git diff --check
```

`.claspignore` excludes generated previews, local tests, docs, dependencies and secrets. Check its effect whenever adding source folders. `.gitignore` is separate and does not control uploads.

The folder migration has only been verified locally. See [migration evidence and outstanding checks](docs/MIGRATION_LOG.md), [all old-to-new paths](docs/FILE_INVENTORY.md), and [HTML/runtime dependencies](docs/HTML_DEPENDENCIES.md). Follow the [organization guide](docs/NOVARE_NEXUS_Clasp_File_Organization_Guide.md) for approved test-project validation and production sync. A push replaces the remote source set; it does not release a new version of an existing versioned deployment.
