# NEXUS Migration Log

## 2026-10-17 — Local folder organization

Status: local migration complete; not pushed or deployed. Behavior intentionally changed: none.

### Baseline and review

- Read `NOVARE_NEXUS_Clasp_File_Organization_Guide.md` before editing. Its staged approach is appropriate for this clone.
- Confirmed `.clasp.json` matches the Script ID supplied by the owner: `1RwVyL3ewJ3Nadb8w0b7EToR0ozv4wmw3dyGUXT51zHUWeCHVf9Udkc8_`.
- clasp version: 3.4.1; authorized account: `jakerome.openiano@novare.com.ph`.
- Full private baseline backup, including Git metadata and local artifacts: `/Users/jakeromopeniano/.local/share/novare-nexus-backups/20261017-100348/baseline`. Its parent directory has mode 0700 and is outside the repository.
- A fresh clone into the sibling private `remote` directory confirmed all 83 remote sources were present locally and byte-identical. No pull was performed in the working repository.
- Read-only deployment inventory saved privately in `deployments.json` beside the backup. It contains 30 entries, including versions 1–29 and an entry without a version number. The active Google Sites embed/deployment was not inferred from these records.
- The initial clasp upload list unexpectedly included `.local/index.html`, an old generated preview absent from the remote clone. Added `.claspignore` to exclude local artifacts while retaining all 83 actual source files. No source deletion was needed.

### Phase 1 — Backend

Moved each server file into `backend/core`, `backend/admin`, `backend/knowledge`, `backend/nosca`, `backend/prompts` or `backend/logging`. Every move is recorded in [FILE_INVENTORY.md](FILE_INVENTORY.md).

The phase-1 gate compared clasp's planned upload set against the inventory: exactly 83 files, no omissions or duplicates. All server contents were byte-identical at this stage. Existing diagnostic/test functions remain uploaded server sources; they were not moved into excluded local tests.

### Phase 2 — Frontend

Moved HTML into `frontend/pages`, `frontend/shell`, `frontend/components`, `frontend/scripts` and `frontend/styles`. The additional scripts folder preserves the existing client behavior fragments without introducing a build step. No empty architectural placeholder folders were created.

Updated only:

- `backend/core/Code.js`: `createTemplateFromFile('Index')` becomes `createTemplateFromFile('frontend/pages/Index')`.
- `frontend/pages/Index.html`: 58 literal includes now use their destination logical paths, without `.html`.

The inclusion helper, routing, script/CSS order, globals, callback names and integration code remain unchanged. [HTML_DEPENDENCIES.md](HTML_DEPENDENCIES.md) records the loader audit, runtime considerations and Script Properties names.

### Phase 3 — Sync configuration and documentation

- `.clasp.json`, including Script ID, rootDir and filePushOrder, is byte-identical to baseline.
- `appsscript.json` remains at root, byte-identical and valid JSON.
- `.claspignore` admits the manifest and supported JS/GS/HTML sources, then excludes Git, dependencies, generated previews, docs, local tests and secrets. Its actual output was checked with clasp 3.4.1.
- Source basenames remain unchanged, including `Nosca_Index_Scheduler.gs.js`.
- Added README, complete old-to-new inventory, dependency audit and this log.

### Local verification — passed

| Check | Evidence |
|---|---|
| Remote completeness before migration | Fresh clone: 83 sources, no missing files or byte differences |
| Backend-only gate | 83 planned uploads; server bytes unchanged |
| Final upload set | Exact match to all 83 mapped source paths; no duplicate logical filenames |
| Permitted source changes | Every file compared to backup; only the 59 expected filename substitutions in two files |
| Source leftovers | No moved source remains at its old path |
| Manifest and clasp link | Valid manifest; both files byte-identical to baseline |
| Global initialization | All server files evaluated in a fresh local VM in alphabetical destination order |
| Function preservation | 297 server functions retained; all except doGet have identical function text |
| Duplicate declarations | No duplicate top-level function names found |
| Scheduler callbacks | Both configured callback functions still exist |
| HTML resolution | doGet and include executed with local HtmlService stubs; 59 successful file lookups |
| Render equivalence | Expanded HTML matches baseline byte-for-byte: 2,091,203 bytes |
| Client syntax | All 15 nonempty inline scripts parse successfully |
| Diff whitespace | `git diff --check` passed |

The private backup directory contains `nexus-verify.cjs`, baseline/backend/final clasp status snapshots and the mapping JSON. Reproduce the baseline comparison from the repository root:

```sh
node /Users/jakeromopeniano/.local/share/novare-nexus-backups/20261017-100348/nexus-verify.cjs /Users/jakeromopeniano/.local/share/novare-nexus-backups/20261017-100348
clasp show-file-status
git diff --check
```

The verifier uses the saved final upload snapshot; use the separate clasp command to inspect the current upload list after future changes. Local VM checks do not substitute for Apps Script or browser integration tests.

### Outstanding release gates

No test Script ID was supplied. No remote writes, trigger runs, Script Property changes or deployments were performed. Sync is not approved by this log.

Before any production sync:

1. Identify a separate test project and use an isolated copy with that project's Script ID. Segregate its integration data/credentials and disable production-facing scheduled work before invoking application workflows.
2. Review and approve the exact test upload list, then push only to that approved test target.
3. Run the guide's regression matrix in Apps Script: all navigation/layout, NOSCA, knowledge indexing, Prompt Library and admin actions, identity, logs and integrations. These remain **not run**, including writes to Sheets/Drive and Gemini requests.
4. Inspect installed trigger owners/schedules and deployment settings in Apps Script. Source callback preservation is verified; live trigger metadata is not.
5. Confirm the actual production embed/deployment and last-known-good version. Confirm no concurrent remote edits; compare against a fresh isolated snapshot if necessary.
6. Obtain explicit approval for the production target and push. Release a deployment version separately under the approved release process.

### Rollback

No remote rollback is needed because nothing was pushed. To undo locally, compare or restore source files from the private `baseline` into a separate checkout first; preserve any work made after this migration. The complete inventory provides the reverse path mapping. Do not blindly overwrite later changes or assume restoring local files changes a deployment.
