# NOVARE NEXUS — clasp File Organization & Maintenance Guide

**Project:** Novare NEXUS (Google Apps Script + Google Sites + Gemini API + Google Sheets/Drive)  
**Purpose:** Organize an already-cloned Apps Script project into maintainable folders in VS Code while preserving existing NEXUS behavior.  
**Audience:** NEXUS developer and any coding assistant helping with migration.  
**Version:** 1.0 · 2026-10-17  
**Status:** Migration playbook — execute only after the project has been cloned locally.

> [!IMPORTANT]
> **Organize, do not rebuild.** The first migration changes file locations and the minimum necessary filename references only. No functional redesign, refactoring, API changes, UI changes, deployment changes, or permission changes are in scope.
>
> **Do not run `clasp push` against production until all checks are passed and the owner explicitly approves the push.** `clasp push` replaces the *entire remote source file set*, not just changed files.

---

## 1. Starting assumptions & expected outcome

This guide begins **after** successfully cloning the existing NEXUS Apps Script project with clasp, opening its folder in VS Code, and seeing the current `.gs` / `.js` / `.html` files, `appsscript.json`, and `.clasp.json`.

If the local clone is not complete, stop: do not reorganize a partial project.

**Expected outcome:**

1. Every existing source file is accounted for, with no accidental deletions.
2. Local backend files are grouped by responsibility; frontend files are grouped by pages and shared components.
3. Apps Script HTML-service filename references resolve after any HTML files are moved.
4. Existing entry points, globals, triggers, integrations, and features work as before.
5. The project can be safely synced to the *same* Apps Script Script ID using clasp.
6. Future additions follow a consistent structure and repeatable review workflow.

**Key behavior to understand:** clasp supports nested *local* directories. On the Apps Script side, these become path-like **file names** such as `frontend/pages/Index`; the online editor is not a true hierarchical folder explorer. Folder moves may therefore change HTML template names and require code updates.

---

## 2. Non-negotiable safeguards

- **Verify the target**: inspect the `scriptId` in `.clasp.json` and match it to **Apps Script → Project Settings → Script ID**. Never confuse it with a deployment ID, spreadsheet ID, or Drive folder ID.
- **Record a baseline**: make a private offline backup of the entire freshly cloned project *before* editing; optionally create a local Git commit if secrets have been removed and the repository is appropriately private.
- **Preserve `appsscript.json`**: do not change OAuth scopes, web-app settings, advanced services, timezone, or runtime unless required by a separately approved task.
- **Preserve Script Properties**: Gemini API credentials and other runtime secrets should remain in Apps Script Script Properties or an approved secrets store. `clasp clone/pull` do **not** export Script Properties; retain a secure inventory of required *property names*, not secret values.
- **Keep existing integrations**: Google Drive IDs, spreadsheet IDs, tab names, triggers, Gemini model configuration, deployments, APIs, and access controls remain untouched.
- **No blind renames**: only change a logical filename when a real naming problem exists; moving files under directories already changes remote path-like names.
- **No automated pushing**: do not use `clasp push --watch` while migrating.
- **Avoid editing remotely and locally at the same time**: choose one source of truth during the migration.
- **Preserve executable logic**: all `doGet`, `doPost`, called functions, triggers, `google.script.run` targets, and HTML inclusion helpers must remain available and behave identically.

---

## 3. Suggested NEXUS folder structure

This is a **target architecture**, not an assertion about which files currently exist. Derive the actual folders and filenames from the clone. Do not create empty or fictitious source files.

```text
novare-nexus/
├── .clasp.json                   # Existing clasp project link; do not change Script ID
├── appsscript.json               # Existing Apps Script manifest; preserve contents
├── .gitignore                    # Optional local Git exclusions
├── README.md                     # Optional high-level project guide
├── docs/
│   ├── FILE_INVENTORY.md         # Generated mapping of old → new source paths
│   └── MIGRATION_LOG.md          # Move history, verification, open issues
├── backend/
│   ├── core/                     # Configuration, web-app routing, shared utilities
│   ├── nosca/                    # Ask NOSCA request handling / Gemini integration
│   ├── knowledge/                # Drive indexing, search, file metadata, sync
│   ├── prompts/                  # AI Prompt Library CRUD and moderation logic
│   ├── admin/                    # Admin roles, settings, link management
│   ├── logging/                  # Site-access logs and usage tracking
│   ├── notifications/            # Notification/support-related code, if present
│   └── integrations/             # External-service adapters, if present
├── frontend/
│   ├── shell/                    # App shell, navbar, sidebar, global layout
│   ├── pages/                    # Home, Overview, Offerings, etc.
│   ├── components/               # Shared modals, widgets, tables, cards
│   └── styles/                   # Existing HTML style fragments, if present
└── tests/                        # Optional local notes/test scripts (see cautions)
```

### 3.1 File placement rules

| Existing file type or responsibility | Recommended destination |
| --- | --- |
| Web-app entrypoint (`doGet`, `doPost`) and route mapping | `backend/core/` |
| Shared `.gs` helpers, configuration/constants | `backend/core/` |
| Gemini API calls and Ask NOSCA handlers | `backend/nosca/` |
| Google Drive full/incremental indexing, document metadata, retrieval | `backend/knowledge/` |
| AI Prompt Library backend | `backend/prompts/` |
| Admin configuration, permissions, managed links | `backend/admin/` |
| Site Access Logs and analytics | `backend/logging/` |
| Help/support notification functions | `backend/notifications/` |
| Global layout HTML | `frontend/shell/` |
| Full page HTML, including `Index.html` if moved in a later phase | `frontend/pages/` |
| Reusable HTML fragments | `frontend/components/` |
| Standalone HTML/CSS fragments already used by HtmlService | `frontend/styles/` |

**Examples (illustrative only):**

```text
Code.gs                         → backend/core/Code.gs
API_NOSCA.gs                    → backend/nosca/API_NOSCA.gs
Drive_Indexer.gs                → backend/knowledge/Drive_Indexer.gs
API_PromptLibrary.gs            → backend/prompts/API_PromptLibrary.gs
Page_AI_Prompt_Library.html     → frontend/pages/Page_AI_Prompt_Library.html
Component_Sidebar.html          → frontend/components/Component_Sidebar.html
```

**Naming standard:** Keep existing recognizable basenames where practical. Use `PascalCase` or the current `Page_` / `Component_` prefixes consistently. Do not duplicate names with different extensions that clasp could interpret as the same remote logical file (for example, `Thing.js` and `Thing.gs` in the same folder).

**Important:** Files named `*.css`, `*.ts`, `*.json` (other than the Apps Script manifest), and front-end bundles may require separate handling/build tools. Do not assume clasp uploads arbitrary file types as Apps Script resources. Store existing CSS/JS fragments in their working supported format until a separate build migration is planned.

---

## 4. Phase 0 — Confirm, inventory and back up

### 4.1 Verify the clone

From the **root of the cloned NEXUS folder**, inspect:

```bash
clasp --version
clasp show-authorized-user
clasp show-file-status
```

Then open `.clasp.json` and confirm the `scriptId`. Preserve `rootDir` if the clone already uses one. If `rootDir` is configured, it determines which files are synchronized; paths inside and outside it must be reviewed accordingly.

> [!CAUTION]
> Do **not** run `clasp pull` after making local changes unless you have first saved/committed those changes. Pulling may overwrite local files. Do **not** push as a verification shortcut.

### 4.2 Preserve a baseline

- Copy the full cloned project to a private location outside the working folder (including `.clasp.json` and `appsscript.json`).
- Store the backup securely: source files may contain company identifiers, service settings, or accidentally hardcoded credentials.
- Record the current version of clasp and the current remote deployment IDs (for reference only).
- Verify the actual file list in the clone is complete compared with the Apps Script editor.
- Record existing triggers and deployment settings using screenshots/notes if needed; not everything is represented by source files.

### 4.3 Create a source inventory

Create `docs/FILE_INVENTORY.md` with one record per real project source file:

| Original path | Type | Purpose | Dependencies / referenced by | Proposed path | Migration status |
| --- | --- | --- | --- | --- | --- |
| `Index.html` | HTML | Main view | `doGet()` / template helper | `frontend/pages/Index.html` | Not started |
| `API_NOSCA.gs` | Server | NOSCA API | Frontend `google.script.run` callers | `backend/nosca/API_NOSCA.gs` | Not started |

The rows above are **examples**, not a prefilled inventory of actual NEXUS code. For every real file, record its correct consumers and destination.

### 4.4 Scan references *before* moving files

Search the entire clone for strings/functions such as:

```text
HtmlService.createHtmlOutputFromFile
HtmlService.createTemplateFromFile
include(
getRawContent()
google.script.run
doGet
doPost
ScriptApp.newTrigger
```

Also look for route maps, dynamic page-name construction, other custom HTML loaders, hardcoded file names, and references that combine prefixes with page names.

On VS Code, use global search (**Shift+Cmd+F on macOS**, **Ctrl+Shift+F on Windows**) or optional `rg` commands:

```bash
rg -n 'createHtmlOutputFromFile|createTemplateFromFile|include\(' .
rg -n 'google\.script\.run|doGet|doPost|ScriptApp\.newTrigger' .
```

Create a complete dependency map for HTML filenames **before moving any HTML**.

---

## 5. Phase 1 — Move only backend source files

Start with a small batch of `.gs` (or equivalent server-side `.js`) files and leave HTML in its original location at first.

1. Create the required folders under `backend/`.
2. **Move**, do not copy-and-delete later; avoid duplicate source files accidentally being uploaded.
3. Keep function names, behavior, constants, namespaces, execution entry points and integration code unchanged.
4. Check for implicit Apps Script global scope assumptions and initialization order. Apps Script server-side `.gs` files are **not** ordinary Node.js modules; do not add `import`, `export`, or npm runtime dependencies just to organize folders.
5. Recheck for duplicate global declarations and top-level initialization that may depend on source order. If a known issue requires deterministic ordering, document it and use clasp's documented `filePushOrder` only after investigation.
6. Run `clasp show-file-status` and compare its output to the inventory; all intended server-side sources must appear exactly once.
7. Log each moved file in `docs/MIGRATION_LOG.md`.

**Phase-1 acceptance gate:** all backend sources are included in clasp's planned upload, with no unnecessary logic changes; the planned files are complete and collision-free.

---

## 6. Phase 2 — Move HTML pages and components carefully

Moving HTML can break Apps Script lookups because local folders become part of the remote filename.

### 6.1 Example: a moved main page

**Before** (root-level `Index.html`):

```javascript
function doGet() {
  return HtmlService.createTemplateFromFile('Index').evaluate();
}
```

**After** (if relocated to `frontend/pages/Index.html`):

```javascript
function doGet() {
  return HtmlService.createTemplateFromFile('frontend/pages/Index').evaluate();
}
```

Pass the **Apps Script logical filename without `.html`**, using forward slashes. Avoid leading `./`.

### 6.2 Example: shared HTML components

**Before** (illustrative inclusion helper):

```javascript
function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}
```

And in an HTML template:

```html
<?!= include('Component_Sidebar'); ?>
```

**After**, if the component moves to `frontend/components/Component_Sidebar.html`:

```html
<?!= include('frontend/components/Component_Sidebar'); ?>
```

The helper itself usually does not need to change if it already receives the full logical filename. **Only update paths after verifying the actual helper and routing design.**

### 6.3 Required migration checks

- Update every affected `createHtmlOutputFromFile(...)`, `createTemplateFromFile(...)`, `include(...)`, and custom loader call.
- Review dynamic page resolution (for example, concatenated `'Page_' + name` strings). Do not change dynamic routes without checking their complete set of values.
- Preserve Apps Script HTML templates, scriptlets, script execution context, and `google.script.run` function targets.
- Check that `Index`, Home, Overview, Offerings, Opportunities, Delivery, Tools & Templates, and AI Prompt Library pages **that actually exist in the clone** still render and route correctly.
- Check global shell pieces (sidebar, navbar, floating Ask NOSCA, admin indicators, notification menu, modals).
- Keep any intentional filenames used by existing route/data mappings consistent, or change **both** the reference and the file name together.

**If uncertain:** keep critical HTML files (especially `Index.html`) at root during this migration and organize only known-safe backend or non-entrypoint files first. Good organization is not worth breaking the live application.

---

## 7. Phase 3 — Review clasp synchronization configuration

### 7.1 `.clasp.json`

Leave the existing project link intact. An uncomplicated clone may have:

```json
{
  "scriptId": "YOUR_EXISTING_SCRIPT_ID"
}
```

`YOUR_EXISTING_SCRIPT_ID` is a placeholder **only**; never replace your real existing Script ID with it. Some projects also have `rootDir`, `scriptExtensions`, or other options. Preserve working settings unless change is necessary.

If you decide later to isolate uploadable code in a dedicated `src/` directory, this is a **separate migration** requiring a correct `rootDir` and careful reassessment of included files. Do not introduce it during initial folder organization.

### 7.2 `.claspignore`

Clasp's current documented default considers `.gs`, `.js`, `.ts`, `.html`, and `appsscript.json` within the configured root, including nested folders. `node_modules` and `.git` are excluded by default.

- **Do not add a custom `.claspignore` merely to enable folders**; it is unnecessary with current default behavior.
- If you add one, check its *full* behavior; a bad exclusion may delete important files from the remote project on the next push because `clasp push` replaces the complete remote source set.
- Markdown docs and local test fixtures should not be uploaded as Apps Script source files. Confirm with `clasp show-file-status`.

### 7.3 `.gitignore` (optional local Git repository)

Suggested starting rules:

```gitignore
node_modules/
.env
.env.*
!.env.example
.clasprc.json
**/.clasprc.json
.DS_Store
*.log
secrets/
```

These rules are for Git, **not** clasp. Add exclusions for any locally discovered sensitive files; review source code before making the first Git commit. `.clasp.json` identifies the target Script ID; decide based on your company policy whether to track it in a private repository. It is not an API key, but it should not be shared thoughtlessly.

---

## 8. Phase 4 — Pre-push verification and testing

**Preferred safe approach:** use a separate Apps Script **test project** to validate folder-driven filename changes and behavior first. Do not point a test checkout at production accidentally. Test credentials and integrations must be appropriately segregated, and test triggers must not modify production data. A separate Script ID is required for a separate test project; keep production `.clasp.json` safe.

### Pre-push checklist

- [ ] The correct target Script ID is confirmed and is the intended **test** or **production** project.
- [ ] A private full baseline backup exists.
- [ ] Inventory contains all original source files and proposed destinations.
- [ ] All files are moved, not accidentally duplicated.
- [ ] No original source file has been omitted from `clasp show-file-status`.
- [ ] `appsscript.json` is preserved and valid.
- [ ] No API keys, passwords, access tokens, or secret values were introduced into source/Git.
- [ ] HTML lookup/include/routing paths are updated and reviewed.
- [ ] No unsanctioned logic changes appear in the diff.
- [ ] No one is making simultaneous untracked remote edits.
- [ ] A rollback copy and known-good deployment/version references are available.
- [ ] The owner has explicitly approved the target and the push.

**Commands to inspect (safe, non-deploying):**

```bash
clasp show-authorized-user
clasp show-file-status
clasp list-deployments
```

If a local Git repository exists, also review:

```bash
git status
git diff --stat
git diff --check
```

**Only after approval:**

```bash
clasp push
```

Do **not** use `clasp push --force` as a workaround for unexpected warnings until the reason is understood.

### Behavior/regression matrix

Test every applicable NEXUS workflow; record pass/fail and evidence:

| Area | Minimum regression check |
| --- | --- |
| Main entrypoint | `doGet` serves the expected page and loads required HTML templates |
| Navigation | Home and all current NEXUS pages route and render correctly |
| Layout | Sidebar, header, search bar, responsive behaviors, floating Ask NOSCA |
| Ask NOSCA | Query reaches backend, retrieves intended sources, produces valid response/error states |
| Knowledge index | Existing Drive index functions run without unexpected duplicate activity |
| Prompt Library | Category listing, search, user views, prompt modal/copy; admin add/edit/delete |
| Admin | View-as mode, managed links, access controls, settings visibility |
| Logs | Site access and prompt usage logs write to the intended sheet |
| Authentication | User/admin identity logic behaves as before |
| Triggers | Scheduled Drive indexing and any other triggers still point to existing functions |
| Integrations | Sheets, Drive, Gemini API, and notification code work with existing property names |
| Deployment | Test/dev URL and current production `/exec` URL behave as expected |

> [!NOTE]
> Pushing code updates the **project's HEAD**. Existing **versioned** production web-app deployments normally remain on their selected version until intentionally updated; editor/test deployments may reflect HEAD. Never equate a successful push with a successfully tested production release. Audit the deployment/version before release.

---

## 9. Phase 5 — Deployment and rollback discipline

### Recommended sequence

1. Approve and sync to a separate test Apps Script project.
2. Run the regression matrix, fix only migration-related issues, and log results.
3. Obtain approval to sync the validated code to the original production Script ID.
4. Double-check **current target**, `clasp show-file-status`, and approved diff before production push.
5. Push source changes, validate them, then deliberately create/update the correct deployment version using your approved release process.
6. Keep the last-known-good deployment ID, version reference, and source backup for recovery.

### Rollback principles

- **If no push occurred:** restore your baseline local folder; the online project was not changed.
- **If a test push occurred:** restore the baseline code to the test project, recheck `show-file-status`, then push only after review.
- **If a production push occurred:** review the current deployment/version and restore known-good source from a verified backup or version-controlled commit as needed; double-check target, manifest and source completeness before a corrective push.
- **If a production deployment was updated:** restore or redeploy the appropriate known-good version using the actual deployment settings/ID. Restoring only local files does not automatically change an already-published deployment.

Do not delete Apps Script triggers, Script Properties, or deployments as part of an ordinary file move.

---

## 10. Maintenance conventions after migration

### 10.1 Adding files

1. Select the folder by responsibility, not by file extension alone.
2. Use a descriptive, unique basename consistent with existing conventions.
3. For new HTML fragments/pages, use the full remote logical file path in includes and route lookups.
4. Document new entrypoints, triggers, Script Properties **names**, and external integrations.
5. Recheck the file list before pushing.

### 10.2 Changing files

1. Start from the verified latest source state; avoid editing the online editor and VS Code in parallel.
2. Keep changes scoped to one feature or fix.
3. Review dependent functions, UI pages and APIs.
4. Test the change; inspect `clasp show-file-status`.
5. Push to the intended project only after approval, then release deliberately.

### 10.3 Renaming / moving files

1. Search all references to the original name/path.
2. Update every affected HTML/template reference.
3. Move the file once; avoid duplicate remnants.
4. Check no execution entrypoint was renamed by accident.
5. Update `docs/FILE_INVENTORY.md` and `docs/MIGRATION_LOG.md`.
6. Validate with the regression matrix.

### 10.4 Deleting files

Delete only after confirming the file is unused, the responsible feature owner approves, and the rollback mechanism is available. A deleted local file may be deleted from the remote Apps Script source set on the next `clasp push`.

### 10.5 Regular upkeep

- Periodically review overly large files and unclear responsibilities.
- Treat new feature modules (for example, Contact Support) as additions to the existing organization, not grounds for a full restructure.
- Keep docs current and preserve test evidence for meaningful changes.
- Avoid introducing complicated toolchains until the project requires them.

---

## 11. Documents to maintain

### `docs/FILE_INVENTORY.md`

```markdown
# NEXUS Source File Inventory

| Original file/path | New path | Responsibility | Referenced by | Status |
|---|---|---|---|---|
| ... | ... | ... | ... | Planned / Moved / Tested |
```

### `docs/MIGRATION_LOG.md`

```markdown
# NEXUS Migration Log

## YYYY-MM-DD — Batch name
- Files moved:
- Filename references updated:
- Behavior intentionally changed: None
- Validation performed:
- Outstanding risks:
- Approved for sync by:
```

These docs provide a reproducible audit trail when NEXUS grows or changes ownership.

---

## 12. Copy-and-paste instructions for an AI coding assistant

> Use the following prompt with an AI coding assistant **after it can inspect the full locally cloned NEXUS project**.

```text
You are assisting with the FILE-ORGANIZATION-ONLY migration of Novare NEXUS,
a live Google Apps Script application managed locally through clasp.

FIRST inspect the complete repository and read
NOVARE_NEXUS_Clasp_File_Organization_Guide.md.

GOALS:
1. Inventory every real Apps Script source file and record its purpose, references,
   and proposed destination in docs/FILE_INVENTORY.md.
2. Identify HtmlService.createTemplateFromFile/createHtmlOutputFromFile,
   include(), routing, and dynamically constructed filename dependencies.
3. Propose a folder organization using backend/core, backend/nosca,
   backend/knowledge, backend/prompts, backend/admin, backend/logging,
   frontend/pages, frontend/components, and other folders only if justified.
4. Execute changes in small, reviewable stages. First move backend files;
   then move HTML only after mapping and updating its lookup references.
5. Preserve application behavior, source code, global function names,
   triggers, property names, OAuth scopes, deployment settings, Gemini,
   Drive, Sheets, and other external integrations.
6. Maintain docs/MIGRATION_LOG.md and verify every expected source appears
   exactly once in clasp show-file-status.
7. Report an old-to-new file mapping, changed references, test results,
   warnings, and anything that still needs human verification.

NON-NEGOTIABLE CONSTRAINTS:
- Do not recreate the app or change its overall architecture.
- Do not change business logic, page design, APIs, permissions, credentials,
  spreadsheet/folder IDs, or existing integrations.
- Do not rename doGet/doPost, trigger callbacks or google.script.run functions.
- Do not add ES-module imports/exports into Apps Script server files.
- Do not disclose or write secrets into Git/source files.
- Do not delete, overwrite, or exclude any source file unintentionally.
- Do not change .clasp.json's scriptId or appsscript.json configuration.
- DO NOT run clasp push, clasp push --watch, clasp pull, or deployment commands
  without explicit approval; work only in the local cloned files at first.
- If a path or dynamic dependency is uncertain, leave the relevant HTML
  file at its original location and explain the blocker.

DELIVERABLES:
A. Repository inventory and dependency audit
B. Final proposed folder tree
C. Original-path → new-path mapping
D. Local-only file moves and minimal lookup path corrections
E. Validation checklist and actual checks performed
F. Summary of remaining risks and instructions for safe test deployment

Start with the inventory and a plan before changing files.
```

---

## 13. Authoritative references

- Google clasp repository and current CLI usage: https://github.com/google/clasp
- Apps Script HTML templates: https://developers.google.com/apps-script/guides/html/templates
- Apps Script HTML-service reference: https://developers.google.com/apps-script/reference/html/html-service
- Apps Script deployment documentation: https://developers.google.com/apps-script/concepts/deployments

**Reminder:** This document defines the migration process. The cloned source remains the authority on the project's actual files, functions, dependencies and deployment configuration.
