# Ask NOSCA — Drive Search Execution Log Diagnostics

## File updated
`backend/knowledge/Nosca_Drive_Search.js`

## What changed
- Both `previewNoscaNativeDriveSearch()` and `logNoscaNativeDriveSearch()` produce a readable `[NOSCA DRIVE SEARCH PREVIEW]` entry in Apps Script **Executions**.
- The original 12-result preview cap is retained to keep the log manageable.
- Includes performance counters alongside the existing results:
  - `elapsedMs`: total Drive discovery/normalization time.
  - `apiCalls`: number of `Drive.Files.list` calls (not all Drive API requests).
  - `scanned`: number of candidate items returned by `files.list`.
  - `scopedMatches`: records inside the configured NEXUS root.
  - `truncated`: whether the bounded search may have omitted matches.
  - `timings.rootLookupMs`: lookup of configured knowledge root.
  - `timings.listElapsedMs`: cumulative `Drive.Files.list` time.
  - `timings.folderLookups`: number of `Drive.Files.get` calls for ancestry checks.
  - `timings.folderLookupMs`: cumulative time spent in those ancestry API calls.
  - `timings.scopeFilterMs`: time validating candidates' folder ancestry, including lookup time.

## Test procedure
1. In your CLASP project, replace `backend/knowledge/Nosca_Drive_Search.js` with the updated file. `appsscript.json` does not need changes.
2. Push and deploy to a **test** deployment first.
3. From the Apps Script function menu run **`logNoscaNativeDriveSearch`**. No arguments are needed; it uses `CashHub proposal`.
4. Open the Apps Script **Executions** panel and inspect the log entry prefixed `[NOSCA DRIVE SEARCH PREVIEW]`.
5. Share the numeric timings and counts for performance analysis. Keep internal filenames and Drive URLs private unless approved.
6. This read-only diagnostic is independent of `NOSCA_SEARCH_BACKEND`. To activate the Drive backend in Ask NOSCA, set Script Property `NOSCA_SEARCH_BACKEND=drive`. To roll back, use `index`.

**Note:** Running `previewNoscaNativeDriveSearch` directly also logs the report now. `logNoscaNativeDriveSearch` is simply a no-argument entry point for Apps Script.

## Delta property clarification
`NOSCA_DELTA_FOLDER_AUTO_LAST_ERROR` is an automatically managed **Script Property** written by `Nosca_Delta_Index.gs`. The continuous folder-map bootstrap clears it when starting; if it fails, its error handler saves a short error message there. It is **not a feature flag**, and it is not required for the Drive search adapter. Leave it unset/blank and do not put a fixed string such as `true`, `false`, or `none` there. Run the existing `logNoscaFolderMapBootstrapStatus()` to view the current `lastError`.

## Rollout safety
- No document files, index rows, or folder-map records are written by this diagnostic.
- Keep `NOSCA_SEARCH_BACKEND=index` until your live result quality and timings are evaluated.
- Drive search uses the current Apps Script user execution identity and filters every result to the configured knowledge root.
