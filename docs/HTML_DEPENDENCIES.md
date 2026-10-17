# HTML and runtime dependency audit

Audited 2026-10-17 before moving HTML. See FILE_INVENTORY.md for every file and its consumers.

## HTML loading

- `backend/core/Code.js`: `doGet()` loads `frontend/pages/Index` through `HtmlService.createTemplateFromFile`.
- `frontend/pages/Index.html`: 58 literal `include(...)` calls load styles, shell, pages, components and client behavior fragments. Every call now uses its full logical path without `.html`.
- `include(filename)` trims the supplied filename and calls `HtmlService.createHtmlOutputFromFile(sourceName)`. Its implementation and error handling are unchanged.
- No additional HTML-service loaders, `getRawContent` loaders, dynamic `Page_` filename construction or dynamic include callers were found in the source.
- Client-side routing operates on the already included DOM. Route IDs, data mappings, script order, CSS order and `google.script.run` targets are unchanged.
- `Component_Topbar.html` has no direct include caller; retained as `frontend/shell/Component_Topbar.html`. No unreferenced source was deleted.
- The generated `.local/index.html` is not a remote source and is excluded by `.claspignore`.

## Backend and initialization

Server files remain in Apps Script's shared global scope, without module wrappers or imports. All 297 top-level server functions retain their names. Only the template path inside `doGet` changes. No duplicate top-level function declarations were found.

All server files load in a fresh local JavaScript VM in alphabetical destination order without external service calls or initialization errors. Configuration declarations remain intact. No evidence justified changing `filePushOrder`; `.clasp.json` is byte-identical to the baseline. This local check does not emulate the full Apps Script runtime.

Scheduler callback names remain `runNoscaIndexScheduledRefresh` and `continueNoscaIndexScheduledRefresh`; their existence was checked locally. Actual installed trigger schedules/owners require an Apps Script UI audit and were not modified.

## Script Properties inventory (names only)

| Name or prefix | Source / purpose |
|---|---|
| `GEMINI_API_KEY` | `backend/nosca/Nosca_Gemini.js`: runtime Gemini credential |
| `NOSCA_GEMINI_MODEL` | Same file: optional model override |
| `NEXUS_PROMPT_COMMUNITY_WRITES_ENABLED` | `backend/prompts/Prompt_Library_Community.js`: community write gate |
| `NOSCA_INDEX_SCHEDULE_CYCLE_V2` | `backend/knowledge/Nosca_Index_Scheduler.gs.js`: scheduler state |
| `NOSCA_INDEX_SCAN_STATE_` | `backend/knowledge/Nosca_Index.js`: generated scan-state keys and chunks |

Property values were neither fetched nor exported. Existing IDs, sheet names, Gemini settings, scopes, service declarations and manifest settings are unchanged.
