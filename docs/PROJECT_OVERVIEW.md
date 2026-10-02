# Novare Nexus / ONESCA

## Project purpose

Novare Nexus is an internal knowledge and resource portal for Novare's OneSCA community. It gives employees a central place to find organizational information, reusable materials, business resources, and support. The goal is to reduce time spent locating documents and help teams discover and reuse shared knowledge across their work.

The application runs as a Google Apps Script web app and is designed to be embedded in Google Sites. Its interface combines a persistent navigation shell, dedicated resource pages, global search, and an AI-assisted knowledge interface called Ask NOSCA.

## Main capabilities

- **Resource navigation:** Home, Overview, Offerings, Opportunities, Programs, Delivery, Governance, Tools, and Support organize information and links by topic and workflow.
- **Home discovery:** Quick access, role-based resources, featured content, and updates provide starting points for common tasks.
- **Global search:** Client-side site content search and a server-side search service help locate portal content and indexed Google Drive files and folders. Drive search reads the existing NOSCA index rather than scanning Drive on each request.
- **Ask NOSCA:** A conversational interface connects to backend services for document lookup, retrieval, context handling, and Gemini-assisted answers grounded in retrieved content. Supporting modules handle indexing, content extraction, logging, and feedback.
- **Managed resource links:** Google Sheets stores link keys and destination URLs so resource destinations can be maintained centrally.
- **Workspace identity:** The application requests the active Google Workspace user's identity and supports a neutral fallback when the deployment does not expose an email address.

## How the code is organized

| Files | Purpose |
| --- | --- |
| `Code.gs` | Web-app entry point, HTML includes, user identity, and managed-link endpoint. |
| `Index.html` | Application shell and page/component includes. |
| `Component_*.html` | Shared interface components such as navigation and the NOSCA dialog. |
| `Page_*.html` | Individual portal pages. |
| `Styles.html` | Application styling and responsive layouts. |
| `Scripts.html` and `Scripts_*.html` | Routing, browser interactions, search, assistant interface, and page-specific link handling. |
| `Search_Service.gs` and `Search_SiteIndex.html` | Indexed Drive search and the portal's searchable site content. |
| `Nosca_*.gs` | Assistant configuration, Drive indexing, retrieval, content processing, Gemini integration, logging, storage, and tests. |
| `docs/` | Existing application-shell and home-page planning documents. |

## Runtime and current scope

The production application depends on Google Apps Script, Google Drive, Google Sheets, and configured access to Gemini for generated answers. Drive assets and linked resources remain external; their contents are not bundled in this source package. Resource IDs are configured in the code, and secrets such as `GEMINI_API_KEY` belong in Apps Script Script Properties.

The My Workspace and Insights & Analytics pages currently contain placeholders. Other pages contain implemented interfaces, but live data, resource access, search results, and assistant responses depend on the target Google Workspace configuration and populated indexes. Packaging the source does not validate those live integrations.

For an Apps Script handoff, retain the original filenames and include all production `.gs` and `.html` files. The original `Index.html` uses Apps Script include statements and is not a standalone static web page. The web app can be deployed through Apps Script and its `/exec` URL embedded in Google Sites.

`README.txt` is an earlier starter document; some of its descriptions, including the claim that non-home routes are placeholders, no longer reflect the current source. This overview describes the inspected project snapshot.

## ZIP contents and exclusions

`novare-nexus.zip` contains the project source, existing project documentation, and this overview under a `novare-nexus/` folder.

Local deployment/development files are excluded: `dev.py`, `test_dev.py`, `LocalDevShim.html`, `README_LOCAL.md`, and `.local/`. Git history, Python caches, macOS metadata, and ZIP archives are also excluded. The original working files are left in place.
