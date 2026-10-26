/**
 * Run from the Apps Script editor as the signed-in Novare Nexus account.
 *
 * This identifies the account executing THIS diagnostic and tests Drive API
 * access to two previously returned files. It does NOT establish the identity
 * of a separate, published web-app execution; that requires a diagnostic run
 * in the deployed web-app context.
 *
 * Prerequisite: Advanced Google service "Drive API" (v3) enabled.
 */
function benchmarkNoscaDriveIdentity() {
  var started = Date.now();
  var props = PropertiesService.getScriptProperties();
  var report = {
    test: "NOSCA_DRIVE_IDENTITY",
    context: "APPS_SCRIPT_EDITOR",
    executedAt: new Date().toISOString(),
    effectiveUser: "",
    activeUser: "",
    configuration: {
      searchBackend: props.getProperty("NOSCA_SEARCH_BACKEND") || "(unset)",
      driveScopeStrategy: props.getProperty("NOSCA_DRIVE_SCOPE_STRATEGY") || "(unset)",
      driveCorpus: props.getProperty("NOSCA_DRIVE_CORPUS") || "(unset)",
      v3LookupEnabled: props.getProperty("NOSCA_DOCUMENT_LOOKUP_V3_ENABLED") || "(unset)",
      centralDiscoveryEnabled: props.getProperty("NOSCA_CENTRAL_DISCOVERY_ENABLED") || "(unset)"
    },
    filenameSearch: null,
    directFileChecks: [],
    elapsedMs: 0,
    interpretation: "This tests the editor's executing Google account, not the published website's execution identity."
  };

  try {
    report.effectiveUser = Session.getEffectiveUser().getEmail() || "(not exposed)";
  } catch (error) {
    report.effectiveUser = "(unavailable: " + error.message + ")";
  }
  try {
    report.activeUser = Session.getActiveUser().getEmail() || "(not exposed)";
  } catch (error) {
    report.activeUser = "(unavailable: " + error.message + ")";
  }

  // Fresh metadata query, independent of NOSCA_Index and the NOSCA chat flow.
  try {
    var listStarted = Date.now();
    var listResult = Drive.Files.list({
      q: "trashed = false and name contains 'PJL'",
      corpora: "user",
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
      pageSize: 20,
      fields: "nextPageToken,incompleteSearch,files(id,name,mimeType,driveId)"
    });
    report.filenameSearch = {
      ok: true,
      query: "name contains 'PJL'",
      corpus: "user",
      elapsedMs: Date.now() - listStarted,
      returned: (listResult.files || []).length,
      truncatedOrMorePages: Boolean(listResult.nextPageToken),
      incompleteSearch: Boolean(listResult.incompleteSearch),
      sampleNames: (listResult.files || []).slice(0, 8).map(function (item) {
        return item.name;
      })
    };
  } catch (error) {
    report.filenameSearch = {
      ok: false,
      error: String(error && error.message || error)
    };
  }

  // File IDs come from the user's earlier NOSCA V3 benchmark output.
  var filesToCheck = [
    { label: "PJL renewal roadmap deck", id: "1ynKpK-D2huHtUlCoJiPKYZ1UNdQl80s064OqUuA_YAc" },
    { label: "CashHub 3-year roadmap plan", id: "1yQ58HrFxgNjO6SLakex1QoO8_FZOvl9p" }
  ];

  filesToCheck.forEach(function (expected) {
    var fileCheck = { label: expected.label, fileId: expected.id, accessibleToExecutingAccount: false };
    try {
      var item = Drive.Files.get(expected.id, {
        supportsAllDrives: true,
        fields: "id,name,mimeType,driveId,webViewLink"
      });
      fileCheck.accessibleToExecutingAccount = true;
      fileCheck.name = item.name || "";
      fileCheck.mimeType = item.mimeType || "";
      fileCheck.driveId = item.driveId || "";
    } catch (error) {
      fileCheck.error = String(error && error.message || error);
    }
    report.directFileChecks.push(fileCheck);
  });

  report.elapsedMs = Date.now() - started;
  Logger.log("[NOSCA IDENTITY DIAGNOSTIC]\n" + JSON.stringify(report, null, 2));
  return report;
}
