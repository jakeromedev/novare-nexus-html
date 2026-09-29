/**
 * ONESCA / Novare Nexus web-app entry point.
 * Deploy this Apps Script project as a Web App, then embed the /exec URL in Google Sites.
 */
function doGet() {
  const template = HtmlService.createTemplateFromFile('Index');

  return template
    .evaluate()
    .setTitle('Novare Nexus 2026')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/**
 * Includes another Apps Script HTML file into Index.html.
 * Use only with trusted project files.
 */
function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

/**
 * Initial server hook for proving client/server communication.
 * We can extend this later for Sheets, Drive, document generation, search, etc.
 */
function getServerStatus() {
  return {
    ok: true,
    app: 'Novare Nexus 2026',
    timestamp: new Date().toISOString()
  };
}

/**
 * Returns the identity of the Google Workspace user currently accessing ONESCA.
 *
 * Important:
 * - This intentionally uses Session.getActiveUser(), not getEffectiveUser(), so
 *   ONESCA never shows the deployer's identity as if it belonged to the visitor.
 * - Depending on the Apps Script deployment/domain policy, email can be blank.
 *   The client handles that case with a neutral fallback.
 * - This Stage 1 implementation does not require the People API or a change to
 *   the existing web-app execution identity.
 */
function getCurrentUser() {
  const email = String(Session.getActiveUser().getEmail() || '').trim();

  return {
    name: getDisplayNameFromEmail_(email),
    email: email,
    department: 'OneSCA'
  };
}

/**
 * Converts a corporate email local-part into a readable display name.
 * Example: jakerome.openiano@novare.com.ph -> Jakerome Openiano
 */
function getDisplayNameFromEmail_(email) {
  if (!email) return '';

  const localPart = String(email)
    .split('@')[0]
    .split('+')[0]
    .trim();

  if (!localPart) return '';

  return localPart
    .split(/[._-]+/)
    .filter(Boolean)
    .map(function (part) {
      return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
    })
    .join(' ');
}

