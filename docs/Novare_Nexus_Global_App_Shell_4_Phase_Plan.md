# Novare Nexus – Global App Shell Development Plan

## Objective

**Asset update (September 28, 2026):** At the user's request, the sidebar logo placeholder has been replaced with the supplied Novare Nexus PNG (Google Drive file `1Bd_y884skBv0TUHV7kXjzZWZRnTQ6EGU`). The original image bytes are embedded in `Index.html`, so the logo requires no network request. The full logo appears in the expanded sidebar; the compact tablet rail shows its circular brand mark using CSS clipping. The `nexus-logo` key is retained. This overrides the original placeholder-only/no-real-images requirement for the logo; avatar and promotional assets remain placeholders. Embedded bytes and alt text were verified; live browser visual QA remains pending as noted in Phase 4.

Build the reusable **Global App Shell** for **Novare Nexus 2026** using a single `Index.html` file with embedded HTML, CSS, and vanilla JavaScript.

The Global App Shell will provide the shared framework used by all future Nexus pages, including:

- Persistent left sidebar
- Top application header
- Global search
- User controls
- Navigation and hash routing
- Ask Nosca launcher placeholder
- Responsive behavior
- Image placeholders
- Google Apps Script integration hooks

Detailed page content for Home, Overview, Offerings, Opportunities, Programs, Delivery, Governance, Tools & Templates, and Help & Support will be developed separately.

---

# Phase 1 – Foundation, Layout, and Visual System — DONE

**Status: Completed on September 28, 2026.**

Implemented in `Index.html`:

- [x] Single-file HTML, embedded CSS, and vanilla JavaScript with no dependencies.
- [x] All specified Nexus color tokens and Inter/Arial typography stack.
- [x] 235px desktop sidebar, topbar, and flexible full-width workspace.
- [x] Reusable button, icon button, navigation row, card, pill, divider, shadow, and focus styles.
- [x] Gradient image placeholders keyed `nexus-logo`, `user-avatar`, and `sidebar-promo`.
- [x] Responsive foundation with a stacked small-screen layout.

Validation: source checks passed for design-token values, semantic structure, HTML nesting, unique IDs, shared primitives, placeholder keys, and absence of external assets. Embedded JavaScript passed syntax and initialization checks, including the missing-root guard. Browser visual QA has not been performed; the supplied workspace contains no visual reference file.

Scope note: full shell controls remain in Phase 2; routing and interactive tablet/mobile sidebar behavior remain in Phase 3. Shared primitive styles are intentionally available for those later components.

## Goal

Establish the reusable application structure, design tokens, base styling, and overall Nexus layout before implementing detailed navigation and interactions.

## Tasks

### 1. Create the base application structure

Create a single:

```text
Index.html
```

The file should contain:

- HTML
- CSS
- Vanilla JavaScript

Do not use:

- React
- TypeScript
- Tailwind CSS
- Bootstrap
- jQuery
- Node.js dependencies
- ES module imports

Use the following base structure:

```html
<div id="nexus-app">

    <aside id="nexus-sidebar">
    </aside>

    <div id="nexus-workspace">

        <header id="nexus-topbar">
        </header>

        <main id="nexus-content">
        </main>

    </div>

</div>
```

### 2. Implement the Nexus design tokens

Create CSS variables for the primary Nexus visual language.

#### Core navigation colors

```css
--navy-950: #001126;
--navy-900: #01172F;
--navy-850: #031B3D;
```

#### Brand blues

```css
--blue-700: #004ECF;
--blue-600: #0068F5;
--blue-500: #0785FF;
```

#### Cyan accents

```css
--cyan-500: #00CFE8;
--cyan-400: #13E1E1;
--cyan-300: #55E8F2;
```

#### Main surfaces

```css
--page-bg: #F5FAFE;
--surface: #FFFFFF;
--surface-soft: #F3F8FC;
--surface-blue: #EAF6FD;
```

#### Borders

```css
--border-light: #D8E9F5;
--border-blue: #BFDDF4;
```

#### Typography

```css
--text-primary: #071B4B;
--text-secondary: #526987;
--text-muted: #7185A0;
```

#### Supporting accents

```css
--accent-purple: #742CE8;
--accent-orange: #FF861F;
--accent-green: #13BF85;
--accent-red: #F04B4B;
```

### 3. Establish typography

Use:

```css
font-family: "Inter", "Arial", sans-serif;
```

Recommended hierarchy:

- Utility text: 12–13px
- Sidebar navigation: 14–15px
- Search text: 13–14px
- User name: 14px semi-bold
- Section labels: 11px uppercase with letter spacing

### 4. Implement the global page layout

Desktop target:

- Sidebar: approximately 235px
- Workspace: remaining width
- Minimum height: 100vh
- Main background: light cool blue / white
- No horizontal scroll at normal desktop widths

The content area must remain flexible enough to support full-width future page hero sections.

### 5. Create shared design primitives

Implement reusable CSS classes for:

- Buttons
- Icon buttons
- Navigation rows
- Cards
- Pills
- Dividers
- Shadows
- Focus states
- Image placeholders

Recommended border radii:

- Small: 8px
- Standard: 10–12px
- Cards: 12–14px
- Pills: 999px

### 6. Create the image placeholder system

Do not load real images yet.

Create:

```css
.image-placeholder
```

with:

- Light blue gradient
- Dashed light-blue border
- Centered label
- Proper sizing
- Overflow hidden
- Consistent border radius

Prepare these initial shell assets:

```text
nexus-logo
user-avatar
sidebar-promo
```

Use attributes such as:

```html
data-image-key="nexus-logo"
```

### Phase 1 Deliverable

A visually correct application frame with:

- Nexus design system
- Sidebar area
- Topbar area
- Main content area
- Responsive-ready structure
- Image placeholder system

No full navigation behavior or page routing is required yet.

---

# Phase 2 – Sidebar, Topbar, and Shared Shell Components — DONE

**Status: Completed on September 28, 2026.**

Implemented in `Index.html`:

- [x] Navy sidebar with structured NOVARE / NEXUS placeholder branding.
- [x] All 11 navigation items in the required order, inline SVG icons, hover/focus styles, and active Home styling.
- [x] Gradient promotional placeholder with arrow control and PEOPLE / SOLUTIONS / IMPACT footer.
- [x] Ask Nosca launcher with a native placeholder dialog, Close button, Escape dismissal, and focus restoration.
- [x] Rounded global search field, search icon, Ctrl K keycap, and All / Drive / Docs / Sheets / Slides filter previews.
- [x] Help, notifications with red indicator, app grid, user profile, and dropdown chevron in the required order.
- [x] Temporary `currentUser` data renders Davin Zen / SC&A and DZ avatar initials.

Validation: source checks passed for navigation/filter order, active Home, HTML nesting, unique IDs, preserved tokens, all three image keys, and absence of external assets. JavaScript checks with DOM stubs passed for profile rendering, dialog launch, duplicate-open prevention, focus restoration, initialization guards, and missing elements. Native dialog rendering, Escape behavior, and visual layout have not been browser-tested; no visual reference file was supplied.

Scope note at Phase 2 completion: navigation and filter controls were focusable previews marked `aria-disabled`; Phase 3 below enables those controls and replaces the stacked layout with responsive navigation. Search has no backend. Help, notifications, app grid, profile menu, and promo arrow remain nonfunctional placeholders.

## Goal

Build the complete shared Nexus application shell and closely reproduce the recurring navigation/header experience shown in the reference file.

## Tasks

## A. Left Sidebar

### 1. Sidebar styling

Implement:

- Width: approximately 235px
- Full-height dark navy background
- Dark blue gradient
- White/light text
- Cyan and electric blue accents

Suggested background:

```css
linear-gradient(
    180deg,
    #001126 0%,
    #01182F 55%,
    #001126 100%
)
```

### 2. Nexus logo area

Create a temporary structured brand lockup:

```text
NOVARE | NEXUS
```

Requirements:

- Approximate height: 70–75px
- Horizontal padding: around 20px
- Electric blue NOVARE label
- Blue/cyan NEXUS label
- Thin vertical divider
- Placeholder key: `nexus-logo`

Do not use external logo assets yet.

### 3. Primary navigation

Add navigation items in this exact order:

```text
Home
My Workspace
Insights & Analytics

KNOWLEDGE HUB

H1: Overview
H2: Offerings
H3: Opportunities
H4: Programs
H5: Delivery
H6: Governance

Tools & Templates
Help & Support
```

Each navigation item should contain:

- Inline SVG icon
- Text label
- Hover state
- Active state
- Keyboard focus state

### 4. Navigation icons

Use inline SVG icons only.

Recommended concepts:

- Home → house
- My Workspace → user
- Insights & Analytics → bar chart
- Overview → document/dashboard
- Offerings → grid
- Opportunities → briefcase
- Programs → layers
- Delivery → rocket
- Governance → shield
- Tools & Templates → tools
- Help & Support → question circle

Use approximately:

```text
20px × 20px
```

### 5. Active navigation styling

Implement an active state similar to the reference:

- Electric blue gradient background
- Cyan border
- White text
- Bright icon
- Subtle outer glow

Suggested:

```css
background:
linear-gradient(
    90deg,
    rgba(0, 104, 245, .75),
    rgba(0, 104, 245, .35)
);

border:
1px solid rgba(0, 210, 255, .85);

box-shadow:
0 0 14px rgba(0, 187, 255, .45),
inset 0 0 12px rgba(0, 162, 255, .18);
```

### 6. Sidebar promotional card

Create a temporary promotional card near the lower sidebar.

Text:

```text
Turn
Knowledge
into Impact
```

Requirements:

- Approximately 195px wide
- Approximately 115–125px tall
- Blue/cyan CSS gradient background
- Arrow button
- Placeholder key: `sidebar-promo`

Do not use an external image.

### 7. Sidebar footer

Display:

```text
PEOPLE
SOLUTIONS
IMPACT
```

Use:

- Small uppercase typography
- Letter spacing
- White with reduced opacity

---

## B. Ask Nosca Launcher

Create a persistent button near the bottom-left of the application.

Text:

```text
Ask Nosca
```

Requirements:

- Pill shape
- Approx. 135–150px wide
- Approx. 42–46px tall
- Cyan-to-blue gradient
- Inline robot/chat SVG
- White text
- Soft blue shadow

When clicked, open a temporary modal or drawer with:

```text
Ask Nosca will be implemented in a later phase.
```

Do not build AI functionality yet.

---

## C. Top Application Header

### 1. Topbar styling

Create a shared header with:

- Approx. 68–72px height
- White/translucent background
- Optional backdrop blur
- Light border/shadow
- Compatibility with future page hero banners

Suggested:

```css
background: rgba(255,255,255,.90);
backdrop-filter: blur(12px);
```

### 2. Global search

Create a dominant global search field.

Placeholder:

```text
Search knowledge, templates, playbooks, tools, and more...
```

Requirements:

- Approx. 650–700px maximum width
- Approx. 40–44px height
- White background
- Light-blue border
- Rounded corners
- Search icon on left
- `Ctrl K` keycap on right
- Blue/cyan focus treatment

### 3. Optional search filters

Prepare optional Home-only filter chips:

```text
All
Drive
Docs
Sheets
Slides
```

Default active filter:

```text
All
```

Do not implement real search functionality yet.

### 4. Top-right controls

Add controls in this order:

```text
Help
Notifications
App Grid
User Profile
Dropdown Chevron
```

#### Notification bell

Include:

- Bell SVG
- Small red notification indicator

#### App grid

Use a 3×3 dot or square layout.

Do not make it functional yet.

### 5. User profile

Use temporary user data:

```javascript
const currentUser = {
    name: "Davin Zen",
    department: "SC&A"
};
```

Display:

```text
Davin Zen
SC&A
```

Avatar:

- 36–40px circle
- Initials: DZ
- Placeholder key: `user-avatar`

### Phase 2 Deliverable

A visually complete shared Nexus shell containing:

- Full left navigation
- Branding area
- Promo card
- Ask Nosca button
- Search
- Top-right controls
- User profile
- Proper Nexus visual styling

---

# Phase 3 – Navigation, Routing, Interaction, and Responsive Behavior — DONE

**Status: Completed on September 28, 2026.**

Implemented in `Index.html`:

- [x] All 11 hash routes, direct-link initialization, hash-change handling for browser history, and Home fallback for empty/unknown routes.
- [x] Route-specific title, eyebrow, active navigation, document title, and Home-only search filters without page reloads.
- [x] Ctrl+K / Cmd+K search focus and exclusive filter selection with `aria-pressed` state.
- [x] Full 235px desktop sidebar, default 76px tablet rail with expand/collapse control, and mobile off-canvas drawer with overlay.
- [x] Mobile drawer close control, Escape/overlay dismissal, focus containment, background inertness, and breakpoint cleanup.
- [x] Named Ask Nosca open/close functions, Close button, Escape dismissal, and focus restoration, including use from the mobile drawer.
- [x] JavaScript organized into the 11 requested sections; Apps Script API hooks are implemented in Phase 4 below.
- [x] Existing page-development placeholder retained with no invented page content.

Validation: JavaScript behavior checks using DOM/window stubs passed for all routes, titles/eyebrows/active states, initial deep links, simulated history hash changes, invalid-route fallback, filters, both search shortcuts, skip-link behavior, duplicate initialization, tablet toggling, mobile overlay/Escape/focus handling, modal controls, and breakpoint cleanup. Source checks passed for saved-file consistency, HTML nesting, unique IDs, ARIA targets, enabled controls, responsive CSS breakpoints, and absence of external dependencies.

Browser rendering, actual browser history, native dialog behavior, and responsive visual QA have not been browser-tested and remain part of Phase 4 validation. No visual reference file was supplied.

## Goal

Make the global shell functional and reusable across all future Nexus page implementations.

## Tasks

## A. Hash Routing

Create the following routes:

```text
#home
#workspace
#analytics
#overview
#offerings
#opportunities
#programs
#delivery
#governance
#tools
#support
```

Create a route configuration similar to:

```javascript
const routes = {
    home: {
        title: "Home",
        eyebrow: "HOME",
        showSearchFilters: true
    },

    workspace: {
        title: "My Workspace",
        eyebrow: "MY WORKSPACE",
        showSearchFilters: false
    },

    analytics: {
        title: "Insights & Analytics",
        eyebrow: "INSIGHTS & ANALYTICS",
        showSearchFilters: false
    },

    overview: {
        title: "Overview",
        eyebrow: "H1: OVERVIEW",
        showSearchFilters: false
    },

    offerings: {
        title: "Offerings",
        eyebrow: "H2: OFFERINGS",
        showSearchFilters: false
    },

    opportunities: {
        title: "Opportunities",
        eyebrow: "H3: OPPORTUNITIES",
        showSearchFilters: false
    },

    programs: {
        title: "Programs",
        eyebrow: "H4: PROGRAMS",
        showSearchFilters: false
    },

    delivery: {
        title: "Delivery",
        eyebrow: "H5: DELIVERY",
        showSearchFilters: false
    },

    governance: {
        title: "Governance",
        eyebrow: "H6: GOVERNANCE",
        showSearchFilters: false
    },

    tools: {
        title: "Tools & Templates",
        eyebrow: "TOOLS & TEMPLATES",
        showSearchFilters: false
    },

    support: {
        title: "Help & Support",
        eyebrow: "HELP & SUPPORT",
        showSearchFilters: false
    }
};
```

### Routing behavior

When a navigation item is selected:

1. Update `window.location.hash`
2. Update active sidebar item
3. Update page eyebrow
4. Update page title
5. Update route-specific shell configuration
6. Do not reload the browser

Home should be the default route.

---

## B. Temporary Content Placeholder

Until detailed pages are developed, render only:

```html
<div class="page-development-placeholder">
    <span id="page-eyebrow">HOME</span>
    <h1 id="page-title">Home</h1>
    <p>Page content will be implemented separately.</p>
</div>
```

Do not create invented content cards.

---

## C. Search Keyboard Interaction

Implement:

```text
Ctrl + K
Cmd + K
```

to focus the global search input.

Prevent conflicting browser behavior where appropriate.

---

## D. Search Filter Interaction

On Home:

- Show All / Drive / Docs / Sheets / Slides
- Clicking a filter should update its visual active state

No backend search is required yet.

---

## E. Sidebar Interaction

Create:

```javascript
toggleSidebar()
```

The sidebar should support:

- Full desktop mode
- Collapsed tablet mode
- Off-canvas mobile mode

---

## F. Responsive Rules

### Desktop: 1200px and above

- Sidebar: ~235px
- Full labels visible
- Full user profile visible
- Search up to ~680px

### Tablet: 768px–1199px

- Sidebar collapses to approximately 76px
- Hide navigation labels when collapsed
- Keep icons centered
- Hide sidebar promo copy if necessary
- Keep Ask Nosca accessible
- Add expand/collapse control

### Mobile: below 768px

- Sidebar becomes an off-canvas drawer
- Show hamburger menu
- Add page overlay behind drawer
- Narrow search field
- Hide user department if needed
- Main content uses full available width

---

## G. Ask Nosca Interaction

Implement:

```javascript
openNoscaPlaceholder()
closeNoscaPlaceholder()
```

Requirements:

- Open placeholder modal/drawer
- Close by button
- Close with ESC key
- Accessible focus handling where practical

---

## H. Reusable JavaScript Structure

Organize JavaScript into sections:

```text
1. CONFIGURATION
2. ROUTES
3. CURRENT USER
4. DOM REFERENCES
5. ROUTING
6. SIDEBAR
7. SEARCH
8. RESPONSIVE NAVIGATION
9. ASK NOSCA PLACEHOLDER
10. APPS SCRIPT API HOOKS
11. INITIALIZATION
```

Recommended functions:

```javascript
initializeApp()
handleRouteChange()
setActiveNavigation()
renderPagePlaceholder()
toggleSidebar()
focusGlobalSearch()
openNoscaPlaceholder()
closeNoscaPlaceholder()
```

### Phase 3 Deliverable

A fully interactive shell where:

- Navigation changes routes
- Active states update correctly
- Search shortcuts work
- Sidebar responds to viewport size
- Ask Nosca placeholder opens/closes
- The shell is ready to host future Nexus pages

---

# Phase 4 – Google Apps Script Readiness, Accessibility, QA, and Finalization — IMPLEMENTED, BROWSER QA PENDING

**Status as of September 28, 2026: implementation and automated checks complete; live browser/visual acceptance pending.**

Implemented in `Index.html`:

- [x] Private `NexusAPI` adapter with Boolean Apps Script detection, a local current-user fallback, and explicitly unimplemented search/notification results. No nonexistent server methods are called.
- [x] Standalone regular-script execution with no npm, filesystem APIs, module imports, external fonts, or image requests.
- [x] Flexible full-width content and viewport-relative shell sizing. Only the mobile drawer/overlay use fixed positioning. Sidebar navigation scrolls independently so the Ask Nosca launcher remains accessible in short viewports.
- [x] History API fallback for sandboxed embeds that reject `replaceState`; routing stays within the app's own frame.
- [x] Semantic landmarks, named controls, visible focus styles, modal/drawer Escape handling, focus containment/restoration, skip link, and search shortcuts.
- [x] CSS organized into all 12 requested sections; reusable card/shadow styles used by the shell, unused utility classes removed, and no inline styles.
- [x] JavaScript remains scoped; initialization is guarded against duplicate listeners. Fixed missing toggle guard and focus restoration when an invalid route closes a mobile drawer.
- [x] Search shortcuts respect an open dialog and already-handled/composition keyboard events.

Automated validation passed:

- All 11 routes, direct links, simulated history events, active navigation, titles, eyebrows, Home-only filters, empty/invalid hash fallback, and sandbox History API fallback.
- Every filter, Ctrl+K/Cmd+K, modal Close/cancel handlers, tablet expand/collapse, mobile drawer overlay/Escape, focus trapping/restoration, inert background, breakpoint cleanup, null guards, and duplicate initialization.
- Apps Script absent, null, partially defined, and available; safe local user copies; empty search/notification fallbacks; a sentinel confirmed no backend method access.
- Saved-file consistency, balanced HTML, unique IDs, accessible button names, valid ARIA references, CSS section order, no unused CSS classes, preserved tokens, all three image keys, and no external dependencies.

**Remaining acceptance checks — do not mark Phase 4 DONE until these pass:**

- [ ] Render at desktop (1440/1200px), tablet (1199/768px, collapsed and expanded), and mobile (767/390/320px); check horizontal overflow, navigation scrolling, header spacing, and Ask Nosca visibility.
- [ ] Test real browser Back/Forward, deep links, keyboard traversal, Ctrl+K/Cmd+K, native dialog focus/Escape, and mobile drawer dismissal. Confirm no browser console errors.
- [ ] Test 200% text enlargement, a short viewport, long page content, and rendering inside an iframe; verify vertical growth and absence of clipping or stuck background inertness.
- [ ] Compare against the Nexus visual reference when supplied. The workspace currently contains no reference image/document.

Browser QA blocker: the Computer Use tool failed before opening a browser because it could not read `/Users/jakeromopeniano/.codex/config.toml` (`Permission denied`). DOM/window-stub tests do not replace actual browser or Google Sites iframe validation. Restore browser-tool access or run the checklist manually, then record results here. Live Apps Script/Google Sites deployment and backend implementation are outside this single-file readiness task.

## Goal

Prepare the Global App Shell for Google Apps Script deployment and Google Sites embedding while ensuring maintainability, accessibility, and production-quality behavior.

## Tasks

## A. Google Apps Script compatibility

Ensure the app:

- Uses regular browser JavaScript
- Does not require npm
- Does not depend on Node.js
- Does not use filesystem APIs
- Does not require ES module imports
- Works with normal `<script>` tags
- Can run before Apps Script integration exists

---

## B. Create Apps Script API hooks

Add:

```javascript
const NexusAPI = {

    isAppsScriptAvailable() {
        return typeof google !== "undefined" &&
               google.script &&
               google.script.run;
    },

    getCurrentUser() {
        // future Apps Script implementation
    },

    search(query) {
        // future Apps Script implementation
    },

    getNotifications() {
        // future Apps Script implementation
    }

};
```

Do not call nonexistent Apps Script functions yet.

---

## C. Google Sites iframe readiness

Review layout behavior when embedded.

Requirements:

- Avoid hard-coded page heights
- Use `min-height: 100vh`
- Allow vertical page growth
- Avoid unnecessary fixed positioning
- Avoid horizontal scrolling
- Ensure sidebar and topbar behave correctly inside an iframe
- Ensure future content can extend vertically

---

## D. Accessibility

Implement:

- Semantic `<aside>`
- Semantic `<nav>`
- Semantic `<header>`
- Semantic `<main>`
- Proper `<button>` elements
- `aria-label` for icon-only buttons
- Keyboard-accessible navigation
- Visible focus styles
- ESC closes mobile sidebar
- ESC closes Ask Nosca placeholder
- Ctrl+K / Cmd+K focuses search

---

## E. CSS cleanup

Organize CSS in this order:

```text
1. DESIGN TOKENS
2. RESET / BASE
3. APP LAYOUT
4. SIDEBAR
5. NAVIGATION
6. TOPBAR
7. SEARCH
8. USER CONTROLS
9. PAGE CONTAINER
10. ASK NOSCA
11. PLACEHOLDERS
12. RESPONSIVE
```

Remove:

- Duplicate rules
- Dead styles
- Unused classes
- Inline styles where unnecessary

---

## F. JavaScript cleanup

Check for:

- Duplicate event listeners
- Unused variables
- Global namespace pollution
- Console errors
- Missing null checks
- Broken hash routes
- Incorrect active states
- Unhandled ESC behavior
- Search shortcut conflicts

---

## G. Visual QA

Compare the shell against the Nexus reference.

Verify:

### Sidebar

- Dark navy background
- Correct width
- Navigation order
- Active blue/cyan glow
- Correct spacing
- Promo card placement
- Footer copy
- Ask Nosca placement

### Topbar

- Correct height
- Long rounded search
- Proper control spacing
- Notification indicator
- App grid
- User profile layout

### Workspace

- Light blue/white background
- Correct content spacing
- Full-width future page support
- No unnecessary centered narrow container

### Image placeholders

Verify presence of:

```text
nexus-logo
user-avatar
sidebar-promo
```

---

## H. Acceptance Criteria

The Global App Shell is complete when:

1. The sidebar is approximately 235px wide on desktop.
2. Home is active by default.
3. The sidebar resembles the dark navy Nexus navigation rail.
4. Active navigation uses blue/cyan highlighting.
5. All required navigation items exist.
6. Global search is clearly visible.
7. Ctrl+K and Cmd+K focus search.
8. Help, notifications, app grid, and user controls appear in the correct order.
9. Notification bell has a red indicator.
10. User profile shows Davin Zen / SC&A.
11. Ask Nosca is visible and opens its placeholder.
12. Hash navigation works without page reload.
13. Route title and eyebrow update correctly.
14. The shell works at desktop, tablet, and mobile widths.
15. The sidebar becomes off-canvas on mobile.
16. No external images are loaded.
17. All image locations use placeholders.
18. The main content area can support large hero sections later.
19. The app works without Apps Script.
20. The code contains future Apps Script integration hooks.
21. There are no console errors.
22. The result remains visually recognizable as Novare Nexus.

---

# Phase Summary

| Phase | Focus | Primary Output |
|---|---|---|
| **Phase 1 — DONE** | Foundation & Visual System | Base HTML structure, CSS tokens, layout, placeholders in `Index.html` |
| **Phase 2 — DONE** | Shared Shell Components | Sidebar, topbar, user controls, Ask Nosca launcher and placeholder dialog in `Index.html` |
| **Phase 3 — DONE** | Interaction & Responsive Behavior | Hash routing, search shortcuts/filters, responsive sidebar, and accessible dialog behavior in `Index.html` |
| **Phase 4 — IMPLEMENTED; QA PENDING** | Integration Readiness & QA | API hooks, embed/accessibility hardening, CSS/JS cleanup, automated checks passed; browser/visual acceptance pending |

---

# Out of Scope for This 4-Phase Global App Shell Build

The following should be developed after the Global App Shell is complete:

- Home page content
- H1 Overview page content
- H2 Offerings page content
- H3 Opportunities page content
- H4 Programs page content
- H5 Delivery page content
- H6 Governance page content
- Tools & Templates page content
- Help & Support page content
- SOFA 2.0 detail page
- RAFA detail page
- Managed Cloud detail page
- MSOC detail page
- Managed Services detail page
- Real global search
- Real user authentication/profile retrieval
- Real notifications
- Actual image assets
- Ask Nosca AI functionality
- Google Drive content retrieval
- Gemini/LLM integration
- Full Apps Script backend
