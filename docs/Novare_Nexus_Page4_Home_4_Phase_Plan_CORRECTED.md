# Novare Nexus 2026 — Home Page (Page 4) Development Plan

## Purpose

This document breaks the **Novare Nexus Home page shown on Page 4 of the reference deck** into four implementation phases.

The Home page will be built **inside the existing Global App Shell**. The following shell elements are assumed to already exist and should **not** be recreated here:

- Left navigation/sidebar
- NOVARE | NEXUS logo area
- Global topbar
- Search field shell
- Help / notification / app-grid controls
- User profile
- Persistent Ask Nosca launcher
- Hash routing
- Responsive sidebar behavior
- Shared design tokens and base CSS

The Home page implementation should render only inside:

```html
<main id="nexus-content">
    <!-- Home page goes here -->
</main>
```

Primary implementation stack:

- HTML
- CSS
- Vanilla JavaScript
- Google Apps Script integration later
- Google Sites embedding later

---

# 1. Reference Page Summary

The Page 4 Home screen is a **dense enterprise knowledge-hub dashboard** composed of five major visual zones:

1. **Hero / Welcome Banner**
2. **Ask Nexus command strip**
3. **Quick Access cards**
4. **Explore by Role cards**
5. **Featured content carousel**
6. **Right-side utility rail**
   - What's New
   - Need Help?

The page sits below the global topbar and beside the persistent dark sidebar.

The visual hierarchy is:

```text
┌──────────────────────────────────────────────────────────────────────┐
│ HERO / WELCOME BANNER                                               │
│ Welcome to Novare Nexus                       People + City Visual   │
├──────────────────────────────────────────────────────────────────────┤
│ ASK NEXUS BAR                     AI ACTION PILLS                   │
├───────────────────────────────────────────────────────┬──────────────┤
│ QUICK ACCESS                                          │ WHAT'S NEW   │
├───────────────────────────────────────────────────────┤              │
│ EXPLORE BY ROLE                                       ├──────────────┤
├───────────────────────────────────────────────────────┤ NEED HELP?   │
│ FEATURED                                              │              │
└───────────────────────────────────────────────────────┴──────────────┘
```

The left/main content area is significantly wider than the right rail.

---

# 2. Home Page Target Layout

## Desktop Target

Primary reference width is approximately **1500px**.

The Global App Shell occupies the full viewport, with the Home page rendered in the workspace area.

Recommended Home content proportions after the sidebar:

```text
Main workspace
├── Main Home column: approximately 78–80%
└── Right utility rail: approximately 20–22%
```

Recommended desktop structure:

```html
<section class="home-page">

    <section class="home-hero">
        ...
    </section>

    <section class="home-ai-command">
        ...
    </section>

    <div class="home-dashboard-grid">

        <div class="home-main-column">

            <section class="home-quick-access">
                ...
            </section>

            <section class="home-role-explorer">
                ...
            </section>

            <section class="home-featured">
                ...
            </section>

        </div>

        <aside class="home-right-rail">

            <section class="home-whats-new">
                ...
            </section>

            <section class="home-help">
                ...
            </section>

        </aside>

    </div>

</section>
```

Recommended page spacing:

```css
.home-page {
    padding: 0 16px 24px;
    width: 100%;
}

.home-dashboard-grid {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 255px;
    gap: 14px;
}
```

Do not force the page into a narrow centered container.

---

# 3. Home Page Visual Palette

Continue using the Global App Shell design tokens.

For Page 4 specifically, emphasize:

## Core Blues

```css
--home-navy: #061C54;
--home-cobalt: #0755E8;
--home-electric-blue: #008BFF;
--home-cyan: #00D4F0;
```

## Surfaces

```css
--home-page-bg: #F4FAFE;
--home-white: #FFFFFF;
--home-soft-blue: #EDF7FD;
--home-border: #D7E8F5;
```

## Utility Accent Colors

Quick Access cards use individual category accents:

```css
--quick-blue: #168BFF;
--quick-orange: #FF8A24;
--quick-purple: #6F35E8;
--quick-green: #13C98A;
```

These should be used lightly for:

- Card icon tiles
- Subtle tinted backgrounds
- Small arrows
- Category cues

The Home page should remain predominantly:

**white + pale blue + dark navy + electric blue/cyan**

---

# 4. Typography

Continue using the Global App Shell font stack:

```css
font-family: "Inter", "Arial", sans-serif;
```

Approximate Page 4 hierarchy:

| Element | Suggested Size |
|---|---:|
| Hero eyebrow: "Welcome to" | 24–28px |
| Hero title: "Novare Nexus" | 42–52px |
| Hero supporting copy | 15–17px |
| Section headings | 16–18px |
| Card title | 13–15px |
| Card supporting text | 11–13px |
| Utility labels / metadata | 9–11px |
| Right rail title | 16–17px |

The hero title should be the strongest typographic element on the page.

---

# Phase 1 — Hero, Ask Nexus, and Home Page Foundation — DONE

**Status: Revised implementation completed on September 28, 2026.**

This corrected plan supersedes the original Phase 1 placeholder-only asset instructions.

- [x] Existing `renderHomePage()` and `#home` integration retained inside the Global App Shell.
- [x] Real `home-hero` and `hero-handwritten-tagline` images now resolve through the approved `homeAssetRegistry` using Drive thumbnail URLs derived from file IDs.
- [x] Hero artwork blends into the banner with a readability gradient; title, supporting copy, tagline, and right-side messaging remain HTML.
- [x] Handwritten asset appears as a transparent image over the right-side messaging area.
- [x] Hero placeholder and handwritten HTML fallback appear only on missing/failed assets; successful image loads hide their fallbacks.
- [x] Explicit image dimensions, decorative hero alt text, meaningful handwritten-image alt text, and eager hero loading are included. No Home images are embedded as Base64.
- [x] Ask Nexus input, BETA badge, send placeholder behavior, and all four suggestion actions remain functional.

Validation: both approved Drive thumbnail endpoints returned valid PNG images, which were downloaded temporarily and visually inspected. Source and DOM/window-stub checks passed for asset URL resolution, successful/failed/zero-width/recovered image states, duplicate-handler prevention, Home route revisits, input actions, submission feedback, focus/shortcut behavior, HTML nesting, unique IDs, image dimensions/alt text, and absence of Drive viewer URLs in image sources. `git diff --check` passed.

Limitations: final browser rendering/cropping and side-by-side Page 4 comparison have not been verified; the browser-tool access issue and missing reference deck remain. The 2000px hero endpoint currently returns approximately 1.86 MB, so Phase 4 should optimize/replace image delivery to meet the <500 KB hero target. Phase 2/3 assets are registered but not fetched until their sections are implemented.

## Goal

Create the Home page structural foundation and reproduce the top portion of Page 4 as closely as possible.

Estimated effort:

**~0.75 day**

---

## 1.1 Create the Home Page Component

Create a reusable render function such as:

```javascript
function renderHomePage() {
    // render Page 4 content into #nexus-content
}
```

The route:

```text
#home
```

should load this Home page instead of the temporary Global App Shell placeholder.

Do not rebuild the shell.

---

## 1.2 Hero Banner

Create:

```html
<section class="home-hero">
</section>
```

Recommended approximate desktop height:

```text
205–230px
```

The reference hero contains:

### Left Text Content

Use the exact visible copy:

```text
Welcome to
Novare Nexus
```

Supporting line:

```text
Your unified knowledge hub for opportunities,
solutions and lasting impact.
```

Tagline:

```text
Same Expertise. A Bolder Tomorrow.
```

The tagline is preceded by a short cyan/blue horizontal accent line.

### Hero Title Styling

"Novare Nexus" should be large and bold.

Use a blue gradient for the main title:

```css
background: linear-gradient(
    90deg,
    #063DCE,
    #0088F6,
    #00BCD8
);
```

Use `background-clip: text`.

For the "x" / accent area of NEXUS, prepare the HTML structure so an orange accent can later be introduced if needed.

Do not bake this title into the background image.

---

## 1.3 Hero Image Asset

Use the real generated `home-hero` asset in Phase 1.

Asset key:

```text
home-hero
```

Google Drive reference:

```text
https://drive.google.com/file/d/1xAJNZvkEYW8QIb5Mlo42VAK_eTSbaP39/view?usp=sharing
```

Drive file ID:

```text
1xAJNZvkEYW8QIb5Mlo42VAK_eTSbaP39
```

The implementation should load the actual image asset, not a placeholder.

Recommended HTML structure:

```html
<div class="home-hero-media">
    <img
        id="home-hero-image"
        class="home-hero-image"
        data-image-key="home-hero"
        alt=""
    >
</div>
```

Populate the image source from the asset registry.

For browser display during development, derive a renderable Google Drive thumbnail URL from the file ID:

```javascript
function getDriveImageUrl(fileId, width = 2000) {
    return `https://drive.google.com/thumbnail?id=${fileId}&sz=w${width}`;
}
```

Example:

```javascript
document.getElementById("home-hero-image").src =
    getDriveImageUrl(homeAssetRegistry["home-hero"].fileId, 2000);
```

If the image cannot load, show the `.image-placeholder` fallback in the same container.

The image contains:

- Two business professionals
- Tablet devices
- Futuristic blue city skyline
- Sunrise / bright horizon
- Flowing blue/cyan abstract ribbons
- Premium enterprise technology aesthetic

The image should blend into the hero background rather than appear as a rectangular photo.

### Important

Do **not** place any of the following inside the generated image:

- "Welcome to Novare Nexus"
- "People Solutions Impact"
- "Together for what's next"
- Taglines
- UI text

Those should remain HTML text layers so they are responsive and editable.

---

## 1.4 Right Hero Messaging

On the far-right of the hero, reproduce the reference messaging as HTML overlay text.

Use:

```text
PEOPLE
SOLUTIONS
IMPACT
```

Then:

```text
TURN
KNOWLEDGE
INTO OPPORTUNITY
```

Use the real generated `hero-handwritten-tagline` asset for the decorative handwritten message:

```text
Together
for what's
next.
```

Google Drive reference:

```text
https://drive.google.com/file/d/1_UDHDOmycZdBWaWyvTWXw8KYE2RWtSJ8/view?usp=drive_link
```

Drive file ID:

```text
1_UDHDOmycZdBWaWyvTWXw8KYE2RWtSJ8
```

Render it as a transparent image layer over the right side of the hero.

Recommended HTML:

```html
<img
    id="hero-handwritten-tagline"
    class="hero-handwritten-tagline"
    data-image-key="hero-handwritten-tagline"
    alt="Together for what's next."
>
```

Use the image asset directly in Phase 1. Only fall back to styled HTML text if the asset fails to load.

---

## 1.5 Ask Nexus Command Strip

Immediately below the hero, create the large AI command strip.

Reference structure:

```text
[AI icon]  Ask Nexus  BETA
           Find templates, playbooks, insights or ask a question...

                                           [send button]

[Summarize a document]
[Find a template]
[Compare offerings]
[Create a playbook]
[>]
```

### Left AI Input

Use:

```text
Ask Nexus
```

with a small:

```text
BETA
```

badge.

Supporting placeholder:

```text
Find templates, playbooks, insights or ask a question...
```

Create an AI sparkle icon tile at the far left.

The input area should look functional but does not need real AI integration yet.

### Send Button

Create a circular blue send button at the right of the input.

Use an inline SVG paper-plane/arrow icon.

### Suggested Action Pills

Create four visible actions:

```text
Summarize a document
Find a template
Compare offerings
Create a playbook
```

Use pill-style buttons with:

- White background
- Light blue border
- Blue inline SVG icon
- Dark-blue label
- Subtle hover state

Add a small next-arrow button on the far right.

### Behavior for Phase 1

On click, actions may:

- Set the Ask Nexus input value, or
- Trigger a temporary toast / placeholder state

Do not build actual Ask Nosca/Nexus AI functionality yet.

---

## Phase 1 Acceptance Criteria

- `#home` loads a real Home page component.
- Hero proportions closely resemble Page 4.
- Hero text matches the reference.
- The real `home-hero` image asset is loaded and displayed.
- The real `hero-handwritten-tagline` asset is loaded and displayed.
- Placeholder styling is used only as an image-load fallback.
- Ask Nexus command strip matches the reference composition.
- Four AI action pills are present.
- Real Home assets are loaded from the approved asset registry.
- Page remains inside the existing Global App Shell.

---

# Phase 2 — Quick Access and Explore by Role

## Goal

Build the two main content sections directly below the Ask Nexus command strip.

Estimated effort:

**~0.75 day**

---

# 2.1 Quick Access Section

Section heading:

```text
⚡ Quick Access
```

Do not use an emoji lightning bolt in production.

Use an inline SVG lightning icon styled in orange/yellow.

Create four equal-width cards.

---

## Quick Access Card 1

Title:

```text
Templates & Playbooks
```

Description:

```text
SOWs, proposals,
frameworks and more
```

Visual style:

- Blue icon
- Pale blue card tint
- Document icon
- Blue arrow

---

## Quick Access Card 2

Title:

```text
Deal Tools
```

Description:

```text
Calculators, matrices
and estimators
```

Visual style:

- Orange icon
- Pale peach/orange tint
- Calculator icon
- Orange arrow

---

## Quick Access Card 3

Title:

```text
Guides & Best Practices
```

Description:

```text
From discovery to
deal closure
```

Visual style:

- Purple icon
- Pale lavender tint
- Open-book icon
- Purple arrow

---

## Quick Access Card 4

Title:

```text
Training & Enablement
```

Description:

```text
Build skills and stay
ahead
```

Visual style:

- Green icon
- Pale mint tint
- Graduation-cap icon
- Green arrow

---

## Quick Access Card Dimensions

Aim for:

- 4 cards in one row on desktop
- approximately 80–90px high
- 10–12px radius
- subtle light-blue border
- compact layout

Each card:

```text
[Icon tile] [Title]
            [Description]               [Arrow]
```

Hover:

- Slight translateY(-1px)
- Stronger border
- Very subtle shadow

---

# 2.2 Explore by Role Section

Heading:

```text
Explore by Role
```

Use a blue people/users icon.

Place:

```text
View All →
```

on the far right.

Create five role cards.

---

## Role 1

```text
Execom
```

Description:

```text
Strategy, performance
and key updates
```

Image asset:

```text
role-execom
```

Google Drive reference:

```text
https://drive.google.com/file/d/10YqCyORiRaCKQr5rCPGUe3pa7Tn4J4b0/view?usp=drive_link
```

---

## Role 2

```text
Sales Executives
```

Description:

```text
Go-to-market, deal
resources and enablement
```

Image asset:

```text
role-sales-executives
```

Google Drive reference:

```text
https://drive.google.com/file/d/19H5dCRkUJr15Z7Q0wVVJHSHy_j1UYoyU/view?usp=drive_link
```

---

## Role 3

```text
Product Managers
```

Description:

```text
Product strategy,
roadmaps and collaterals
```

Image asset:

```text
role-product-managers
```

Google Drive reference:

```text
https://drive.google.com/file/d/1E4i3IK6B-O-VqMVKpSmtrs0qFroo1Uvk/view?usp=drive_link
```

---

## Role 4

```text
Solutions Consultants
```

Description:

```text
Architectures, solutioning
and technical assets
```

Image asset:

```text
role-solutions-consultants
```

Google Drive reference:

```text
https://drive.google.com/file/d/1W-eADrnR6RwZf8e2AZHIC8E2Y331NG5A/view?usp=drive_link
```

---

## Role 5

```text
Delivery, Risk & Finance
```

Description:

```text
Execution, risk, compliance
and financial resources
```

Image asset:

```text
role-delivery-risk-finance
```

Google Drive reference:

```text
https://drive.google.com/file/d/15B-4VMLDEJ9rd_eHkHrp383ZPB0fCGD2/view?usp=drive_link
```

---

# 2.3 Role Card Visual Design

Each role card should contain:

```text
┌───────────────────────────────┐
│        portrait image         │
│                               │
├───────────────────────────────┤
│ Role Name                     │
│ short supporting description  │
│                            >  │
└───────────────────────────────┘
```

Reference characteristics:

- Portrait occupies upper ~55–60% of card.
- Portrait uses a soft abstract pastel backdrop.
- Bottom is white.
- Role title is dark blue and bold.
- Supporting copy is muted blue-gray.
- Small chevron appears near lower-right.

Use approximately five equal cards across the desktop row.

---

## 2.4 Role Image Treatment

Use the real generated role portrait assets during Phase 2.

Each role card should render an `<img>` tied to its stable asset key.

Example:

```html
<div class="role-image-frame">
    <img
        class="role-image"
        data-image-key="role-sales-executives"
        alt="Sales Executives"
    >
</div>
```

The JavaScript renderer should resolve the asset URL from `homeAssetRegistry`.

If a role image fails to load, replace only that image area with the `.image-placeholder` fallback.

Do not reuse the same portrait across roles.

---

## Phase 2 Acceptance Criteria

- Quick Access contains exactly four cards.
- Copy and category colors match the reference.
- Explore by Role contains exactly five cards.
- Role labels match Page 4.
- All five role cards load their real generated portrait assets.
- Named placeholders are used only as load-error fallbacks.
- `View All` is aligned to the right of the section heading.
- Cards remain visually compact.
- Layout does not overflow at standard desktop widths.

---

# Phase 3 — Featured Content and Right Utility Rail

## Goal

Complete the lower dashboard area by implementing Featured content, What's New, and Need Help.

Estimated effort:

**~0.75 day**

---

# 3.1 Featured Section

Heading:

```text
Featured
```

Use a solid blue star icon.

Place:

```text
View All →
```

on the right.

Create a horizontally scrollable/carousel-ready content area.

Page 4 shows four cards visible at once.

---

## Featured Card 1

Category:

```text
PLAYBOOK
```

Title:

```text
Novare Next
Go-to-Market Guide
```

Description:

```text
Strategy, messaging and
enablement resources
```

CTA:

```text
View →
```

Placeholder key:

```text
featured-go-to-market
```

---

## Featured Card 2

Category:

```text
TEMPLATE
```

Title:

```text
Solution Blueprint
Template
```

Description:

```text
Build compelling and
consistent solutions
```

CTA:

```text
View →
```

Placeholder key:

```text
featured-solution-blueprint
```

---

## Featured Card 3

Category:

```text
GUIDE
```

Title:

```text
Customer Engagement
Lifecycle
```

Description:

```text
From discovery to
long-term value
```

CTA:

```text
View →
```

Image asset:

```text
featured-customer-engagement
```

Google Drive reference:

```text
https://drive.google.com/file/d/1tjTiPzeA1Iyl9IE2lKtiHWcNp97t_BzQ/view?usp=drive_link
```

Use the actual generated image in Phase 3.

---

## Featured Card 4

Category:

```text
TOOL
```

Title:

```text
Deal Calculator
```

Description:

```text
Estimate effort, value
and resourcing
```

CTA:

```text
View →
```

Placeholder key:

```text
featured-deal-calculator
```

---

# 3.2 Featured Carousel Controls

Reference includes:

- Left circular previous arrow
- Right circular next arrow
- Pagination dots centered near the bottom

Implement the UI controls even if the initial dataset contains only four items.

Recommended behavior:

- Buttons scroll the Featured track.
- Pagination dot changes according to visible group.
- Cards support keyboard focus.
- Do not auto-scroll.

---

# 3.3 What's New Panel

Right rail top panel.

Heading:

```text
What's New
```

Use a blue megaphone icon.

Right-side action:

```text
View All →
```

Create four compact rows.

---

## What's New Item 1

Type:

```text
GUIDELINE
```

Title:

```text
Updated Governance Guidelines
```

Date:

```text
Sep 4, 2026
```

Orange icon tile.

---

## What's New Item 2

Type:

```text
TEMPLATE
```

Title:

```text
New SOW Template (FY27)
```

Date:

```text
Sep 6, 2026
```

Blue icon tile.

---

## What's New Item 3

Type:

```text
TOOL
```

Title:

```text
Deal Calculator v2.0
```

Date:

```text
Sep 7, 2026
```

Orange icon tile.

---

## What's New Item 4

Type:

```text
PLAYBOOK
```

Title:

```text
Novare Next Go-to-Market Guide
```

Date:

```text
Sep 9, 2026
```

Purple icon tile.

---

## What's New Row Layout

```text
[icon] TYPE
       Title
       Date                         >
```

Use thin dividers or spacing between entries.

Do not make rows overly tall.

---

# 3.4 Need Help? Panel

Right rail lower panel.

Heading:

```text
Need Help?
```

Use a blue question-mark-circle icon.

Create three rows.

---

## Help Item 1

Title:

```text
Ask Nexus (AI Assistant)
```

Description:

```text
Get quick answers, find resources,
and discover content
```

Icon:

AI sparkle icon in blue.

---

## Help Item 2

Title:

```text
Submit a Request
```

Description:

```text
Content, access, or technical support
```

Icon:

Green support/request icon.

---

## Help Item 3

Title:

```text
Nexus User Guide
```

Description:

```text
Learn how to make the most of Nexus
```

Icon:

Blue document icon.

---

# 3.5 Right Rail Styling

Right rail width:

```text
approximately 250–270px
```

Each panel:

- White background
- Light-blue border
- 10–12px radius
- Compact inner padding
- Dark navy heading
- Light-blue / gray metadata
- Small blue chevrons

The right rail must not visually dominate the Home page.

---

## Phase 3 Acceptance Criteria

- Featured section contains four reference cards.
- Carousel controls visually match the reference.
- What's New contains four items with correct titles/dates.
- Need Help contains three items.
- Right rail width and density resemble Page 4.
- `featured-customer-engagement` loads the real generated image asset.
- `featured-go-to-market`, `featured-solution-blueprint`, and `featured-deal-calculator` may remain placeholders until approved internal thumbnails are supplied.
- No actual content integrations are required yet.

---

# Phase 4 — Interaction, Responsive Behavior, Data Model, and QA

## Goal

Turn the completed visual Home page into a reusable, maintainable component ready for Apps Script data integration.

Estimated effort:

**~0.75 day**

Total planning estimate for the Home page:

```text
~3 working days
```

This aligns with the previously established Home page planning estimate.

---

# 4.1 Convert Static Content into Data Objects

Do not leave every card hard-coded individually.

Create configuration objects.

Example:

```javascript
const quickAccessItems = [
    {
        id: "templates",
        title: "Templates & Playbooks",
        description: "SOWs, proposals, frameworks and more",
        theme: "blue"
    },
    {
        id: "deal-tools",
        title: "Deal Tools",
        description: "Calculators, matrices and estimators",
        theme: "orange"
    }
];
```

Do the same for:

```text
roleItems
featuredItems
whatsNewItems
helpItems
aiQuickActions
```

Create rendering functions such as:

```javascript
renderQuickAccess()
renderRoleExplorer()
renderFeatured()
renderWhatsNew()
renderHelpPanel()
```

---

# 4.2 Prepare Google Apps Script Hooks

Do not require live backend functions yet.

Prepare methods such as:

```javascript
NexusAPI.getHomeContent = function() {
    // Future Apps Script implementation
};

NexusAPI.getWhatsNew = function() {
    // Future Apps Script implementation
};

NexusAPI.getFeaturedContent = function() {
    // Future Apps Script implementation
};

NexusAPI.getRoleContent = function(roleId) {
    // Future Apps Script implementation
};
```

Static fallback data should keep the page functional locally.

---

# 4.3 Placeholder Navigation Behavior

Until destination modules are built:

- Card clicks may update hash routes where a known destination exists.
- Otherwise use a lightweight placeholder message.
- Do not link to fake URLs.
- Do not allow dead `href="#"` behavior that jumps the page.

Examples:

```text
Templates & Playbooks → #tools
Guides & Best Practices → #tools
Ask Nexus → open Ask Nosca placeholder
```

Other actions may show:

```text
This destination will be implemented in a later phase.
```

---

# 4.4 Responsive Design

## Desktop ≥ 1200px

Match reference closely:

- Four Quick Access cards
- Five Role cards
- Four Featured cards visible
- Right utility rail visible
- Hero approximately one horizontal banner

---

## Tablet 768px–1199px

Recommended changes:

- Right rail moves below main content or uses a 2-column utility row.
- Quick Access becomes 2×2.
- Explore by Role becomes horizontally scrollable or 2–3 cards per row.
- Featured becomes horizontally scrollable.
- Hero text remains over left side with image fading toward right.
- Ask Nexus suggested actions may horizontally scroll.

---

## Mobile < 768px

Recommended order:

```text
Hero
Ask Nexus
Quick Access
Explore by Role
Featured
What's New
Need Help
```

Requirements:

- One-column content flow
- Quick Access: 1–2 columns depending width
- Role cards horizontally scrollable or one column
- Featured horizontally scrollable
- Hero image moves below or becomes a background with strong readability overlay
- Hero right-side slogan may be hidden to reduce crowding
- AI action pills horizontally scroll

---

# 4.5 Accessibility

Implement:

- Semantic `<section>` elements
- `aria-labelledby` for sections
- Buttons for actions
- Anchors only for actual navigation
- Alt text when real images are added
- Visible keyboard focus states
- Carousel controls with `aria-label`
- No information conveyed by color alone
- Decorative imagery marked appropriately

---

# 4.6 Performance

When image assets are eventually added:

- Use WebP where practical.
- Use optimized PNG only when transparency is necessary.
- Avoid multi-megabyte hero assets.
- Add explicit `width` and `height`.
- Lazy-load below-the-fold images.
- Do not lazy-load the main hero asset.
- Avoid embedding images as Base64 inside `Index.html`.

Recommended initial size targets:

| Asset Type | Target File Size |
|---|---:|
| Hero | < 500 KB |
| Role portrait | < 120 KB each |
| Featured thumbnail | < 150 KB each |
| Decorative handwriting | < 80 KB |

---

# 4.7 Visual QA Checklist

Compare the implementation side-by-side with Page 4.

Verify:

## Hero

- Correct overall height
- Welcome copy positioned left
- Hero visual occupies center/right
- Blue flowing visual language
- Right-side PEOPLE / SOLUTIONS / IMPACT area
- Tagline alignment

## Ask Nexus

- Input block visually dominant
- BETA badge present
- Circular send button
- Four quick-action pills
- Overall rounded white strip

## Quick Access

- Four equal cards
- Correct category colors
- Correct icon types
- Compact proportions

## Explore by Role

- Five equal cards
- Portrait image region
- Correct titles/descriptions
- `View All` alignment

## Featured

- Four visible content cards
- Thumbnail region
- Blue CTA buttons
- Left/right carousel buttons
- Pagination dots

## Right Rail

- What's New above Need Help
- Correct item counts
- Correct hierarchy
- Compact panel spacing

---

# 4.8 Phase 4 Acceptance Criteria

The Home page is considered complete when:

1. `#home` renders Page 4 Home content.
2. Global App Shell remains unchanged and reusable.
3. Hero closely follows Page 4 composition.
4. All generated Home page imagery is loaded from the asset registry; placeholders are only fallbacks or are used for internal assets not yet supplied.
5. Ask Nexus command strip is present.
6. Four Quick Access cards are present.
7. Five Explore by Role cards are present.
8. Four Featured cards are present.
9. What's New contains four entries.
10. Need Help contains three entries.
11. Content is rendered from JavaScript data objects where practical.
12. Desktop layout matches the reference hierarchy.
13. Tablet and mobile layouts remain usable.
14. Google Apps Script hooks are prepared but optional.
15. No broken links or console errors are present.
16. No remote placeholder-image service is used.
17. Image containers have stable dimensions to prevent layout shifts.
18. The page works locally before Apps Script deployment.

---

# 4.9 Phase-to-Asset Mapping

The generated image assets must be applied during the phase where their corresponding section is implemented.

| Phase | Assets to Apply |
|---|---|
| **Phase 1** | `home-hero`, `hero-handwritten-tagline` |
| **Phase 2** | `role-execom`, `role-sales-executives`, `role-product-managers`, `role-solutions-consultants`, `role-delivery-risk-finance` |
| **Phase 3** | `featured-customer-engagement` |
| **Phase 4** | Validate all asset loading, cropping, responsiveness, performance, and fallback behavior |

**Important rule:** generated assets should not remain as placeholders after their phase is completed. A placeholder should appear only when an asset has not yet been supplied or when the real asset fails to load.

---

# 5. Image Asset Manifest

The following Home page image assets are already available and should be applied in the phase where their corresponding section is built. Placeholders are no longer the default for these generated assets.

## A. Generated Assets — Use During Implementation

These assets have already been generated and uploaded. They should be used immediately in the relevant implementation phase.

| Asset Key | Purpose | Recommended Ratio | Drive Asset | Notes |
|---|---|---:|---|---|
| `home-hero` | Main Page 4 hero artwork | ~2.3:1 | [Open asset](https://drive.google.com/file/d/1xAJNZvkEYW8QIb5Mlo42VAK_eTSbaP39/view?usp=sharing) | Two professionals, tablets, futuristic city, blue/cyan ribbons, bright horizon. No baked-in text. |
| `role-execom` | Execom role card portrait | ~1.7:1 | [Open asset](https://drive.google.com/file/d/10YqCyORiRaCKQr5rCPGUe3pa7Tn4J4b0/view?usp=drive_link) | Professional executive portrait with soft pale-blue abstract background. |
| `role-sales-executives` | Sales Executives role portrait | ~1.7:1 | [Open asset](https://drive.google.com/file/d/19H5dCRkUJr15Z7Q0wVVJHSHy_j1UYoyU/view?usp=drive_link) | Professional business portrait with soft peach/light-orange abstract background. |
| `role-product-managers` | Product Managers role portrait | ~1.7:1 | [Open asset](https://drive.google.com/file/d/1E4i3IK6B-O-VqMVKpSmtrs0qFroo1Uvk/view?usp=drive_link) | Professional business portrait with soft lavender abstract background. |
| `role-solutions-consultants` | Solutions Consultants role portrait | ~1.7:1 | [Open asset](https://drive.google.com/file/d/1W-eADrnR6RwZf8e2AZHIC8E2Y331NG5A/view?usp=drive_link) | Professional business portrait with soft aqua/cyan abstract background. |
| `role-delivery-risk-finance` | Delivery, Risk & Finance portrait | ~1.7:1 | [Open asset](https://drive.google.com/file/d/15B-4VMLDEJ9rd_eHkHrp383ZPB0fCGD2/view?usp=drive_link) | Professional business portrait with soft mint/green abstract background. |
| `featured-customer-engagement` | Customer Engagement Lifecycle thumbnail | ~1:1.15 | [Open asset](https://drive.google.com/file/d/1tjTiPzeA1Iyl9IE2lKtiHWcNp97t_BzQ/view?usp=drive_link) | Abstract premium blue/cyan flowing technology artwork. |
| `hero-handwritten-tagline` | Optional decorative "Together for what's next." artwork | ~1:1 | [Open asset](https://drive.google.com/file/d/1_UDHDOmycZdBWaWyvTWXw8KYE2RWtSJ8/view?usp=drive_link) | Transparent background; only needed if CSS/web typography cannot reproduce the reference feel. |

### AI Generation Guidance

For all generated people:

- Use fictional professionals.
- Do not attempt to reproduce identifiable people from the reference.
- Maintain consistent corporate photography treatment.
- Use polished Novare blue/cyan lighting.
- Keep backgrounds uncluttered.
- Avoid embedded text or logos.

---

## B. Assets Better Created from Real Nexus/Internal Content

The following should ideally **not** be AI-generated because they represent actual internal content or tools.

| Asset Key | Reference Content | Recommended Source |
|---|---|---|
| `featured-go-to-market` | Novare Next Go-to-Market Guide cover | Actual approved guide/playbook cover |
| `featured-solution-blueprint` | Solution Blueprint Template | Actual template screenshot/thumbnail |
| `featured-deal-calculator` | Deal Calculator | Actual calculator screenshot/thumbnail |

Until approved content is available, use generic image placeholders.

This prevents the Home page from displaying a fabricated document/tool preview that users could mistake for the real internal asset.

---

## C. Assets Already Belonging to the Global App Shell

Do not recreate these as part of the Home page build if they have already been implemented:

```text
nexus-logo
user-avatar
sidebar-promo
```

These are Global App Shell assets, not Home-specific assets.

---

# 6. Image Placeholder Keys

The Home page should include these exact `data-image-key` values so the images can be replaced later without modifying layout logic:

```text
home-hero

role-execom
role-sales-executives
role-product-managers
role-solutions-consultants
role-delivery-risk-finance

featured-go-to-market
featured-solution-blueprint
featured-customer-engagement
featured-deal-calculator

hero-handwritten-tagline
```

Example:

```html
<div
    class="image-placeholder"
    data-image-key="home-hero">
    <span>Home Hero</span>
</div>
```

## Drive Asset Registry

Use this registry as the single source of truth for generated Home page assets.

```javascript
const homeAssetRegistry = {
    "home-hero": {
        fileId: "1xAJNZvkEYW8QIb5Mlo42VAK_eTSbaP39",
        viewerUrl: "https://drive.google.com/file/d/1xAJNZvkEYW8QIb5Mlo42VAK_eTSbaP39/view?usp=sharing",
        phase: 1
    },

    "hero-handwritten-tagline": {
        fileId: "1_UDHDOmycZdBWaWyvTWXw8KYE2RWtSJ8",
        viewerUrl: "https://drive.google.com/file/d/1_UDHDOmycZdBWaWyvTWXw8KYE2RWtSJ8/view?usp=drive_link",
        phase: 1
    },

    "role-execom": {
        fileId: "10YqCyORiRaCKQr5rCPGUe3pa7Tn4J4b0",
        viewerUrl: "https://drive.google.com/file/d/10YqCyORiRaCKQr5rCPGUe3pa7Tn4J4b0/view?usp=drive_link",
        phase: 2
    },

    "role-sales-executives": {
        fileId: "19H5dCRkUJr15Z7Q0wVVJHSHy_j1UYoyU",
        viewerUrl: "https://drive.google.com/file/d/19H5dCRkUJr15Z7Q0wVVJHSHy_j1UYoyU/view?usp=drive_link",
        phase: 2
    },

    "role-product-managers": {
        fileId: "1E4i3IK6B-O-VqMVKpSmtrs0qFroo1Uvk",
        viewerUrl: "https://drive.google.com/file/d/1E4i3IK6B-O-VqMVKpSmtrs0qFroo1Uvk/view?usp=drive_link",
        phase: 2
    },

    "role-solutions-consultants": {
        fileId: "1W-eADrnR6RwZf8e2AZHIC8E2Y331NG5A",
        viewerUrl: "https://drive.google.com/file/d/1W-eADrnR6RwZf8e2AZHIC8E2Y331NG5A/view?usp=drive_link",
        phase: 2
    },

    "role-delivery-risk-finance": {
        fileId: "15B-4VMLDEJ9rd_eHkHrp383ZPB0fCGD2",
        viewerUrl: "https://drive.google.com/file/d/15B-4VMLDEJ9rd_eHkHrp383ZPB0fCGD2/view?usp=drive_link",
        phase: 2
    },

    "featured-customer-engagement": {
        fileId: "1tjTiPzeA1Iyl9IE2lKtiHWcNp97t_BzQ",
        viewerUrl: "https://drive.google.com/file/d/1tjTiPzeA1Iyl9IE2lKtiHWcNp97t_BzQ/view?usp=drive_link",
        phase: 3
    }
};
```

Use a helper to convert Drive file IDs into browser-renderable image URLs during development:

```javascript
function getDriveImageUrl(fileId, width = 1600) {
    return `https://drive.google.com/thumbnail?id=${fileId}&sz=w${width}`;
}
```

Example:

```javascript
const hero = homeAssetRegistry["home-hero"];

document.getElementById("home-hero-image").src =
    getDriveImageUrl(hero.fileId, 2000);
```

Do not assign the Google Drive `/view` URL directly to `<img src>`.

The `/view` URL is for human reference. The stable `fileId` is what the implementation should use to derive the actual image source.

For production, this asset-delivery approach can later be replaced with an Apps Script image-serving strategy without changing the asset keys used throughout the UI.

---

# 7. Recommended Asset Folder Structure

When real image assets are ready:

```text
/assets
│
├── home
│   ├── hero
│   │   ├── home-hero.webp
│   │   └── hero-handwritten-tagline.png
│   │
│   ├── roles
│   │   ├── role-execom.webp
│   │   ├── role-sales-executives.webp
│   │   ├── role-product-managers.webp
│   │   ├── role-solutions-consultants.webp
│   │   └── role-delivery-risk-finance.webp
│   │
│   └── featured
│       ├── featured-go-to-market.webp
│       ├── featured-solution-blueprint.webp
│       ├── featured-customer-engagement.webp
│       └── featured-deal-calculator.webp
```

If Google Drive is used as the asset repository later, preserve the same logical naming convention in metadata or the asset registry.

---

# 8. Suggested Home Page JavaScript Data Model

Prepare the Home page so content can later come from Google Sheets / Apps Script rather than requiring HTML edits.

Example:

```javascript
const homePageData = {

    hero: {
        eyebrow: "Welcome to",
        title: "Novare Nexus",
        description:
            "Your unified knowledge hub for opportunities, solutions and lasting impact.",
        tagline: "Same Expertise. A Bolder Tomorrow.",
        imageKey: "home-hero"
    },

    aiActions: [
        "Summarize a document",
        "Find a template",
        "Compare offerings",
        "Create a playbook"
    ],

    quickAccess: [],

    roles: [],

    featured: [],

    whatsNew: [],

    help: []
};
```

This structure will simplify later Apps Script integration.

---

# 9. Four-Phase Summary

| Phase | Scope | Estimated Effort |
|---|---|---:|
| **Phase 1 — DONE** | Home foundation, hero with real approved assets, Ask Nexus command strip | ~0.75 day |
| **Phase 2** | Quick Access + Explore by Role | ~0.75 day |
| **Phase 3** | Featured + What's New + Need Help | ~0.75 day |
| **Phase 4** | Interaction, responsive behavior, data model, Apps Script readiness, QA | ~0.75 day |
| **Total** | Page 4 Home implementation | **~3 working days** |

---

# 10. Out of Scope for the Home Page Build

Do not implement these as part of this Page 4 work:

- Real Ask Nosca / Ask Nexus AI backend
- Gemini integration
- Document RAG
- Google Drive search
- Real global search
- Real notifications
- Authentication
- User directory integration
- Admin CMS
- Detailed H1–H6 pages
- Offering detail pages
- Real document previews unless source files are available
- Production analytics

The Home page should be fully usable as a visual and interaction prototype without those backend capabilities.

---

# 11. Final Implementation Principle

The Page 4 Home screen should **not** become a collection of one-off hard-coded HTML blocks.

Build it as a reusable dashboard composition:

```text
Home
├── Hero
├── Ask Nexus
├── Main Dashboard
│   ├── Quick Access
│   ├── Explore by Role
│   └── Featured
└── Utility Rail
    ├── What's New
    └── Need Help
```

The visual implementation should closely follow the provided Page 4 reference, while the underlying code remains modular enough for later Google Apps Script-driven content.
