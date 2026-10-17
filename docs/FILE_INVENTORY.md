# NEXUS Source File Inventory

83 sources verified byte-for-byte against a fresh remote clone on 2026-10-17. `.local/index.html` is a generated preview, retained locally but excluded from clasp. All basenames are preserved.

Consumers are static symbol references, including diagnostic callers, not proof of runtime execution. Server files share global scope. Public functions without callers may be manual or trigger entrypoints.

| Original path | Type | Responsibility | Referenced by | New path | Status |
|---|---|---|---|---|---|
| `Code.js` | Server | Web entrypoint, identity and links | `frontend/pages/Index.html`, `backend/admin/Nexus_Admins.js`, `backend/core/Nosca_Config.js`, `backend/nosca/Nosca_Context.js`, `backend/knowledge/Nosca_Retrieval.js`, `backend/nosca/Nosca_Service.js`, `frontend/shell/Scripts.html`, `frontend/scripts/Scripts_ManagedLinks.html`, `frontend/scripts/Scripts_OfferingsLinks.html`, `frontend/scripts/Scripts_Overview.html`, `backend/knowledge/Search_Service.js` | `backend/core/Code.js` | Preserved / locally verified |
| `Component_NavHeader.html` | HTML | Application shell: Component_NavHeader | `frontend/pages/Index.html` | `frontend/shell/Component_NavHeader.html` | Preserved / locally verified |
| `Component_NoscaDialog.html` | HTML | Shared dialog or search data: Component_NoscaDialog | `frontend/pages/Index.html` | `frontend/components/Component_NoscaDialog.html` | Preserved / locally verified |
| `Component_Sidebar.html` | HTML | Application shell: Component_Sidebar | `frontend/pages/Index.html` | `frontend/shell/Component_Sidebar.html` | Preserved / locally verified |
| `Component_Topbar.html` | HTML | Application shell: Component_Topbar | No direct loader reference found; retained | `frontend/shell/Component_Topbar.html` | Preserved / locally verified |
| `Index.html` | HTML | Main HTML template | `backend/core/Code.js` | `frontend/pages/Index.html` | Preserved / locally verified |
| `Nexus_Admins.js` | Server | Admin identity and access | `backend/core/Code.js`, `backend/prompts/Prompt_Library.js`, `frontend/shell/Scripts.html`, `backend/logging/Site_Access_Logs.js` | `backend/admin/Nexus_Admins.js` | Preserved / locally verified |
| `Nosca_Config.js` | Server | Shared NOSCA configuration | `backend/admin/Nexus_Admins.js`, `backend/knowledge/Nosca_Content.js`, `backend/nosca/Nosca_Context.js`, `backend/knowledge/Nosca_Drive.js`, `backend/nosca/Nosca_Gemini.js`, `backend/knowledge/Nosca_Index.js`, `backend/logging/Nosca_Logging.js`, `backend/knowledge/Nosca_Retrieval.js`, `backend/nosca/Nosca_Service.js`, `backend/knowledge/Nosca_Sheet.js`, `backend/nosca/Nosca_Tests.js`, `backend/knowledge/Search_Diagnostics.js`, `backend/knowledge/Search_Service.js` | `backend/core/Nosca_Config.js` | Preserved / locally verified |
| `Nosca_Content.js` | Server | Knowledge extraction, indexing, retrieval, persistence or search: Nosca_Content | `backend/nosca/Nosca_Diagnostics.js`, `backend/knowledge/Nosca_Retrieval.js` | `backend/knowledge/Nosca_Content.js` | Preserved / locally verified |
| `Nosca_Context.js` | Server | NOSCA requests, Gemini or diagnostics: Nosca_Context | `backend/nosca/Nosca_Service.js` | `backend/nosca/Nosca_Context.js` | Preserved / locally verified |
| `Nosca_Diagnostics.js` | Server | NOSCA requests, Gemini or diagnostics: Nosca_Diagnostics | Editor/manual or trigger entrypoints; shared server scope | `backend/nosca/Nosca_Diagnostics.js` | Preserved / locally verified |
| `Nosca_Drive.js` | Server | Knowledge extraction, indexing, retrieval, persistence or search: Nosca_Drive | `backend/knowledge/Nosca_Content.js`, `backend/nosca/Nosca_Gemini.js`, `backend/knowledge/Nosca_Index.js`, `backend/logging/Nosca_Logging.js`, `backend/knowledge/Nosca_Retrieval.js`, `backend/nosca/Nosca_Service.js`, `backend/knowledge/Nosca_Sheet.js`, `backend/nosca/Nosca_Tests.js` | `backend/knowledge/Nosca_Drive.js` | Preserved / locally verified |
| `Nosca_Gemini.js` | Server | NOSCA requests, Gemini or diagnostics: Nosca_Gemini | `backend/nosca/Nosca_Service.js` | `backend/nosca/Nosca_Gemini.js` | Preserved / locally verified |
| `Nosca_Index.js` | Server | Knowledge extraction, indexing, retrieval, persistence or search: Nosca_Index | `backend/core/Nosca_Config.js`, `backend/knowledge/Nosca_Content.js`, `backend/nosca/Nosca_Diagnostics.js`, `backend/knowledge/Nosca_Index_Scheduler.gs.js`, `backend/knowledge/Nosca_Retrieval.js`, `backend/knowledge/Nosca_Sheet.js`, `backend/nosca/Nosca_Tests.js` | `backend/knowledge/Nosca_Index.js` | Preserved / locally verified |
| `Nosca_Index_Scheduler.gs.js` | Server | Knowledge extraction, indexing, retrieval, persistence or search: Nosca_Index_Scheduler.gs | Editor/manual or trigger entrypoints; shared server scope | `backend/knowledge/Nosca_Index_Scheduler.gs.js` | Preserved / locally verified |
| `Nosca_Logging.js` | Server | Usage and access logging: Nosca_Logging | `backend/nosca/Nosca_Service.js`, `frontend/scripts/Scripts_Nosca.html` | `backend/logging/Nosca_Logging.js` | Preserved / locally verified |
| `Nosca_Retrieval.js` | Server | Knowledge extraction, indexing, retrieval, persistence or search: Nosca_Retrieval | `backend/nosca/Nosca_Context.js`, `backend/nosca/Nosca_Diagnostics.js`, `backend/nosca/Nosca_Gemini.js`, `backend/nosca/Nosca_Service.js`, `backend/nosca/Nosca_Tests.js` | `backend/knowledge/Nosca_Retrieval.js` | Preserved / locally verified |
| `Nosca_Service.js` | Server | NOSCA requests, Gemini or diagnostics: Nosca_Service | `frontend/scripts/Scripts_Nosca.html` | `backend/nosca/Nosca_Service.js` | Preserved / locally verified |
| `Nosca_Sheet.js` | Server | Knowledge extraction, indexing, retrieval, persistence or search: Nosca_Sheet | `backend/knowledge/Nosca_Content.js`, `backend/knowledge/Nosca_Index.js`, `backend/knowledge/Nosca_Retrieval.js`, `backend/nosca/Nosca_Tests.js`, `backend/knowledge/Search_Diagnostics.js`, `backend/knowledge/Search_Service.js` | `backend/knowledge/Nosca_Sheet.js` | Preserved / locally verified |
| `Nosca_Tests.js` | Server | NOSCA requests, Gemini or diagnostics: Nosca_Tests | Editor/manual or trigger entrypoints; shared server scope | `backend/nosca/Nosca_Tests.js` | Preserved / locally verified |
| `Page_AI_Prompt_Library.html` | HTML | Page markup: AI_Prompt_Library | `frontend/pages/Index.html` | `frontend/pages/Page_AI_Prompt_Library.html` | Preserved / locally verified |
| `Page_Analytics.html` | HTML | Page markup: Analytics | `frontend/pages/Index.html` | `frontend/pages/Page_Analytics.html` | Preserved / locally verified |
| `Page_Delivery.html` | HTML | Page markup: Delivery | `frontend/pages/Index.html` | `frontend/pages/Page_Delivery.html` | Preserved / locally verified |
| `Page_Governance.html` | HTML | Page markup: Governance | `frontend/pages/Index.html` | `frontend/pages/Page_Governance.html` | Preserved / locally verified |
| `Page_Home.html` | HTML | Page markup: Home | `frontend/pages/Index.html` | `frontend/pages/Page_Home.html` | Preserved / locally verified |
| `Page_Offerings.html` | HTML | Page markup: Offerings | `frontend/pages/Index.html` | `frontend/pages/Page_Offerings.html` | Preserved / locally verified |
| `Page_Opportunities.html` | HTML | Page markup: Opportunities | `frontend/pages/Index.html` | `frontend/pages/Page_Opportunities.html` | Preserved / locally verified |
| `Page_Overview.html` | HTML | Page markup: Overview | `frontend/pages/Index.html` | `frontend/pages/Page_Overview.html` | Preserved / locally verified |
| `Page_Programs.html` | HTML | Page markup: Programs | `frontend/pages/Index.html` | `frontend/pages/Page_Programs.html` | Preserved / locally verified |
| `Page_Search.html` | HTML | Page markup: Search | `frontend/pages/Index.html` | `frontend/pages/Page_Search.html` | Preserved / locally verified |
| `Page_Support.html` | HTML | Page markup: Support | `frontend/pages/Index.html` | `frontend/pages/Page_Support.html` | Preserved / locally verified |
| `Page_Tools.html` | HTML | Page markup: Tools | `frontend/pages/Index.html` | `frontend/pages/Page_Tools.html` | Preserved / locally verified |
| `Page_Workspace.html` | HTML | Page markup: Workspace | `frontend/pages/Index.html` | `frontend/pages/Page_Workspace.html` | Preserved / locally verified |
| `Prompt_Library.js` | Server | Prompt Library API: Prompt_Library | `backend/prompts/Prompt_Library_Community.js`, `backend/prompts/Prompt_Library_Phase2.js`, `backend/prompts/Prompt_Library_Phase3.js`, `frontend/scripts/Scripts_AIPromptLibrary.html` | `backend/prompts/Prompt_Library.js` | Preserved / locally verified |
| `Prompt_Library_Community.js` | Server | Prompt Library API: Prompt_Library_Community | `backend/prompts/Prompt_Library.js`, `backend/prompts/Prompt_Library_Phase2.js`, `backend/prompts/Prompt_Library_Phase3.js`, `frontend/scripts/Scripts_AIPromptLibrary.html` | `backend/prompts/Prompt_Library_Community.js` | Preserved / locally verified |
| `Prompt_Library_Phase2.js` | Server | Prompt Library API: Prompt_Library_Phase2 | `backend/prompts/Prompt_Library.js`, `backend/prompts/Prompt_Library_Community.js`, `backend/prompts/Prompt_Library_Phase3.js`, `frontend/scripts/Scripts_AIPromptLibrary.html` | `backend/prompts/Prompt_Library_Phase2.js` | Preserved / locally verified |
| `Prompt_Library_Phase3.js` | Server | Prompt Library API: Prompt_Library_Phase3 | `frontend/scripts/Scripts_AIPromptLibrary.html` | `backend/prompts/Prompt_Library_Phase3.js` | Preserved / locally verified |
| `Scripts.html` | HTML | Application shell: Scripts | `frontend/pages/Index.html` | `frontend/shell/Scripts.html` | Preserved / locally verified |
| `Scripts_AIPromptLibrary.html` | HTML | Client behavior fragment: AIPromptLibrary | `frontend/pages/Index.html` | `frontend/scripts/Scripts_AIPromptLibrary.html` | Preserved / locally verified |
| `Scripts_DeliveryLinks.html` | HTML | Client behavior fragment: DeliveryLinks | `frontend/pages/Index.html` | `frontend/scripts/Scripts_DeliveryLinks.html` | Preserved / locally verified |
| `Scripts_GovernanceLinks.html` | HTML | Client behavior fragment: GovernanceLinks | `frontend/pages/Index.html` | `frontend/scripts/Scripts_GovernanceLinks.html` | Preserved / locally verified |
| `Scripts_HomeLinks.html` | HTML | Client behavior fragment: HomeLinks | `frontend/pages/Index.html` | `frontend/scripts/Scripts_HomeLinks.html` | Preserved / locally verified |
| `Scripts_ManagedLinks.html` | HTML | Client behavior fragment: ManagedLinks | `frontend/pages/Index.html` | `frontend/scripts/Scripts_ManagedLinks.html` | Preserved / locally verified |
| `Scripts_Nosca.html` | HTML | Client behavior fragment: Nosca | `frontend/pages/Index.html` | `frontend/scripts/Scripts_Nosca.html` | Preserved / locally verified |
| `Scripts_OfferingsLinks.html` | HTML | Client behavior fragment: OfferingsLinks | `frontend/pages/Index.html` | `frontend/scripts/Scripts_OfferingsLinks.html` | Preserved / locally verified |
| `Scripts_OpportunitiesLinks.html` | HTML | Client behavior fragment: OpportunitiesLinks | `frontend/pages/Index.html` | `frontend/scripts/Scripts_OpportunitiesLinks.html` | Preserved / locally verified |
| `Scripts_Overview.html` | HTML | Client behavior fragment: Overview | `frontend/pages/Index.html` | `frontend/scripts/Scripts_Overview.html` | Preserved / locally verified |
| `Scripts_ProgramsLinks.html` | HTML | Client behavior fragment: ProgramsLinks | `frontend/pages/Index.html` | `frontend/scripts/Scripts_ProgramsLinks.html` | Preserved / locally verified |
| `Scripts_Search.html` | HTML | Client behavior fragment: Search | `frontend/pages/Index.html` | `frontend/scripts/Scripts_Search.html` | Preserved / locally verified |
| `Scripts_SupportLinks.html` | HTML | Client behavior fragment: SupportLinks | `frontend/pages/Index.html` | `frontend/scripts/Scripts_SupportLinks.html` | Preserved / locally verified |
| `Scripts_ToolsLinks.html` | HTML | Client behavior fragment: ToolsLinks | `frontend/pages/Index.html` | `frontend/scripts/Scripts_ToolsLinks.html` | Preserved / locally verified |
| `Search_Diagnostics.js` | Server | Knowledge extraction, indexing, retrieval, persistence or search: Search_Diagnostics | Editor/manual or trigger entrypoints; shared server scope | `backend/knowledge/Search_Diagnostics.js` | Preserved / locally verified |
| `Search_Service.js` | Server | Knowledge extraction, indexing, retrieval, persistence or search: Search_Service | `frontend/scripts/Scripts_Search.html`, `backend/knowledge/Search_Diagnostics.js` | `backend/knowledge/Search_Service.js` | Preserved / locally verified |
| `Search_SiteIndex.html` | HTML | Shared dialog or search data: Search_SiteIndex | `frontend/pages/Index.html` | `frontend/components/Search_SiteIndex.html` | Preserved / locally verified |
| `Site_Access_Logs.js` | Server | Usage and access logging: Site_Access_Logs | `frontend/shell/Scripts.html` | `backend/logging/Site_Access_Logs.js` | Preserved / locally verified |
| `Styles_AIPromptLibrary.html` | HTML | Style fragment: AIPromptLibrary | `frontend/pages/Index.html` | `frontend/styles/Styles_AIPromptLibrary.html` | Preserved / locally verified |
| `Styles_Core.html` | HTML | Style fragment: Core | `frontend/pages/Index.html` | `frontend/styles/Styles_Core.html` | Preserved / locally verified |
| `Styles_Delivery.html` | HTML | Style fragment: Delivery | `frontend/pages/Index.html` | `frontend/styles/Styles_Delivery.html` | Preserved / locally verified |
| `Styles_Governance.html` | HTML | Style fragment: Governance | `frontend/pages/Index.html` | `frontend/styles/Styles_Governance.html` | Preserved / locally verified |
| `Styles_HeroTypography.html` | HTML | Style fragment: HeroTypography | `frontend/pages/Index.html` | `frontend/styles/Styles_HeroTypography.html` | Preserved / locally verified |
| `Styles_Home.html` | HTML | Style fragment: Home | `frontend/pages/Index.html` | `frontend/styles/Styles_Home.html` | Preserved / locally verified |
| `Styles_Home_Enhancements.html` | HTML | Style fragment: Home_Enhancements | `frontend/pages/Index.html` | `frontend/styles/Styles_Home_Enhancements.html` | Preserved / locally verified |
| `Styles_Layout.html` | HTML | Style fragment: Layout | `frontend/pages/Index.html` | `frontend/styles/Styles_Layout.html` | Preserved / locally verified |
| `Styles_Loading.html` | HTML | Style fragment: Loading | `frontend/pages/Index.html` | `frontend/styles/Styles_Loading.html` | Preserved / locally verified |
| `Styles_ManagedLinks.html` | HTML | Style fragment: ManagedLinks | `frontend/pages/Index.html` | `frontend/styles/Styles_ManagedLinks.html` | Preserved / locally verified |
| `Styles_Nosca.html` | HTML | Style fragment: Nosca | `frontend/pages/Index.html` | `frontend/styles/Styles_Nosca.html` | Preserved / locally verified |
| `Styles_Nosca_Floating.html` | HTML | Style fragment: Nosca_Floating | `frontend/pages/Index.html` | `frontend/styles/Styles_Nosca_Floating.html` | Preserved / locally verified |
| `Styles_Offerings.html` | HTML | Style fragment: Offerings | `frontend/pages/Index.html` | `frontend/styles/Styles_Offerings.html` | Preserved / locally verified |
| `Styles_Offerings_Refinements.html` | HTML | Style fragment: Offerings_Refinements | `frontend/pages/Index.html` | `frontend/styles/Styles_Offerings_Refinements.html` | Preserved / locally verified |
| `Styles_Opportunities.html` | HTML | Style fragment: Opportunities | `frontend/pages/Index.html` | `frontend/styles/Styles_Opportunities.html` | Preserved / locally verified |
| `Styles_Opportunities_Enhancements.html` | HTML | Style fragment: Opportunities_Enhancements | `frontend/pages/Index.html` | `frontend/styles/Styles_Opportunities_Enhancements.html` | Preserved / locally verified |
| `Styles_Opportunities_Refinements.html` | HTML | Style fragment: Opportunities_Refinements | `frontend/pages/Index.html` | `frontend/styles/Styles_Opportunities_Refinements.html` | Preserved / locally verified |
| `Styles_Overview.html` | HTML | Style fragment: Overview | `frontend/pages/Index.html` | `frontend/styles/Styles_Overview.html` | Preserved / locally verified |
| `Styles_Overview_Enhancements.html` | HTML | Style fragment: Overview_Enhancements | `frontend/pages/Index.html` | `frontend/styles/Styles_Overview_Enhancements.html` | Preserved / locally verified |
| `Styles_Overview_Refinements.html` | HTML | Style fragment: Overview_Refinements | `frontend/pages/Index.html` | `frontend/styles/Styles_Overview_Refinements.html` | Preserved / locally verified |
| `Styles_Programs.html` | HTML | Style fragment: Programs | `frontend/pages/Index.html` | `frontend/styles/Styles_Programs.html` | Preserved / locally verified |
| `Styles_Responsive.html` | HTML | Style fragment: Responsive | `frontend/pages/Index.html` | `frontend/styles/Styles_Responsive.html` | Preserved / locally verified |
| `Styles_Runtime.html` | HTML | Style fragment: Runtime | `frontend/pages/Index.html` | `frontend/styles/Styles_Runtime.html` | Preserved / locally verified |
| `Styles_Search.html` | HTML | Style fragment: Search | `frontend/pages/Index.html` | `frontend/styles/Styles_Search.html` | Preserved / locally verified |
| `Styles_SidebarTooltips.html` | HTML | Style fragment: SidebarTooltips | `frontend/pages/Index.html` | `frontend/styles/Styles_SidebarTooltips.html` | Preserved / locally verified |
| `Styles_Support.html` | HTML | Style fragment: Support | `frontend/pages/Index.html` | `frontend/styles/Styles_Support.html` | Preserved / locally verified |
| `Styles_Tools.html` | HTML | Style fragment: Tools | `frontend/pages/Index.html` | `frontend/styles/Styles_Tools.html` | Preserved / locally verified |
| `appsscript.json` | Manifest | Runtime, scopes and services | Apps Script runtime / clasp | `appsscript.json` | Preserved / locally verified |
