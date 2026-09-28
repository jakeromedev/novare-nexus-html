ONESCA / Novare Nexus — Apps Script Starter

Create a new standalone Google Apps Script project and add files with these exact names.
Apps Script automatically adds .html in the editor for HTML files; Code.gs is the server file.

Recommended first test:
1. Copy Code.gs and all .html files into the Apps Script project.
2. Save.
3. Deploy > New deployment > Web app.
4. Open the /exec URL directly and verify Home/sidebar navigation.
5. Only after that, embed the /exec URL in Google Sites.

Architecture:
- Index.html: application shell only
- Component_Sidebar.html: persistent sidebar
- Component_Topbar.html: persistent topbar/search
- Component_NoscaDialog.html: global modal
- Page_*.html: route/page fragments
- Styles.html: global CSS
- Scripts.html: SPA routing and client interactions
- Code.gs: server entry point and future backend functions

Notes:
- The sidebar logo remains embedded as base64 from the supplied reference file.
- Home hero/tagline images still load from the existing Google Drive file IDs in Scripts.html.
- Non-home routes remain placeholders because the supplied reference file also marks them as not yet implemented.
- Route pages are lazily created and then kept in the DOM, so page state can survive sidebar navigation.
