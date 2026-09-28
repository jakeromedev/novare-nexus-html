# Novare Nexus / ONESCA local development

The existing Apps Script HTML files remain the source of truth. `dev.py` recursively
expands `Index.html` includes into a disposable `.local/index.html`, inserts the
local shim before application JavaScript, and serves only `.local/`. It preserves
partial contents, including their existing style/script wrappers. Nothing is
merged back into the production templates. Python 3.8+ is the only dependency.

## Launch on macOS

1. Open Terminal.
2. Enter the project folder:

   ```sh
   cd /Users/jakeromopeniano/Documents/codes/novare-nexus
   ```

3. Start development:

   ```sh
   python3 dev.py
   ```

4. Open <http://localhost:8000/#home>.
5. Edit the original `Page_Home.html`, `Styles.html`, `Scripts.html`, or component
   and page files. Save and refresh the browser.
6. Press **Ctrl+C** in Terminal to stop.

If `python3` is unavailable, install Python 3 for macOS first. No pip or Node
packages are needed. The server binds to localhost only.

HTML changes are polled every half second and also checked on each request.
There is no automatic browser reload; refresh after saving. Responses disable
caching. Missing/circular includes print a readable error; during development,
HTTP requests show a build error instead of silently serving an outdated page.
Fix the source and refresh to recover. Other Apps Script scriptlets are rejected
explicitly: this is an include simulator, not a Google Apps Script interpreter.

Optional commands:

```sh
python3 dev.py --port 5500
python3 dev.py --build-only
python3 -m unittest test_dev
```

The alternate URL is <http://localhost:5500>. `.local/` is gitignored and safe to
delete; the next build recreates it. The generated viewport and title reproduce
the metadata supplied by `Code.gs` in production, preserving responsive behavior.
Restart the server after changing `dev.py`.

## Local mock API

Only the generated build includes `LocalDevShim.html`. It sets
`window.NEXUS_ENV = "local"`; the production templates do not set it.
`NexusAPI` continues using its existing `google.script.run` adapter.

```js
google.script.run
  .withSuccessHandler(console.log)
  .withFailureHandler(console.error)
  .getServerStatus();
```

The result contains `ok: true`, `app: "Novare Nexus 2026"`,
`environment: "local"`, and an ISO timestamp. Calls are asynchronous; handlers
are independent per chain. `withUserObject` is also supported. Unknown methods
call the failure handler with a helpful error (or warn if none is registered).

To mock future methods such as `getHomeContent`, `getWhatsNew`,
`getFeaturedContent`, or `getRoleContent`, add functions to the `methods` object
in `LocalDevShim.html`. Functions can return a value or Promise, or throw an error
to exercise failure handling. For temporary console experiments:

```js
window.NexusLocalMocks.getRoleContent = function (role) {
  return { role: role, items: [] };
};
```

Only `getServerStatus` has a built-in mock. Local mode does not execute `Code.gs`,
authenticate with Google, or access Sheets/server-side Drive APIs.

## Images and routes

The existing Drive asset keys and thumbnail URL conversion remain in use.
The sidebar logo uses the supplied `nexus-logo` Drive ID through the same loader;
the old embedded Base64 logo has been removed. Image failures produce a console
warning naming the asset and its Drive viewer URL. Check file sharing, network
access, and browser blocking; an image error alone cannot identify the cause.
Existing Home image fallbacks remain unchanged. No assets are downloaded or
embedded into the source. Internet access is required for Drive images.

The original hash router, sidebar, topbar, and page templates are retained.
Use `#home`, `#workspace`, and all the existing routes normally.

## Deployment flow

```text
LOCAL
  ↓
Apps Script /dev
  ↓
Apps Script /exec
  ↓
Google Sites
```

- **Local:** HTML/CSS/JS development against mocked server calls.
- **Apps Script /dev:** integration testing with real Google Apps Script services
  and the latest saved project code (available to project editors).
- **Apps Script /exec:** production web-app deployment; update the deployment
  version when releasing changes.
- **Google Sites:** embeds the production `/exec` URL.

Copy/deploy only the existing production `.gs` and HTML files to Apps Script.
Do not deploy `LocalDevShim.html`, `.local/`, `dev.py`, `test_dev.py`, or this README.
Keep the include statements in the original `Index.html`; never replace it with
the generated local HTML. `Code.gs`, routing, and the production API adapter do
not require local-development changes.
