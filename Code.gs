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
