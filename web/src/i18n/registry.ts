/**
 * Languages and translation namespaces of the app – the one list the runtime (./index.ts) and `npm run i18n:check`
 * (scripts/i18n-check.mjs) share. How to translate or add a language: docs/translating.md.
 *
 * German is the source language: the texts in the code are German and double as the message ids (`t('Speichern')`).
 * A catalog maps them to another language (`en/core.ts`: `Speichern: 'Save'`). A text missing from a catalog shows in
 * German – never as a raw key. Each catalog is a chunk of its own, loaded when the language is in use, so German users
 * download no catalog at all.
 */

/** Plural forms of one text (Intl.PluralRules categories, `zero` = an explicit text for 0). `other` is required. */
export interface PluralForms {
  zero?: string;
  one?: string;
  two?: string;
  few?: string;
  many?: string;
  other: string;
}
export type Catalog = Record<string, string | PluralForms>;

/** `intl`: the formatting locale when the browser asks for no regional variant of the language. */
export const LOCALES = {
  de: { name: 'Deutsch', intl: 'de-DE' },
  en: { name: 'English', intl: 'en-GB' },
} as const;
export type Locale = keyof typeof LOCALES;
export const SOURCE_LOCALE = 'de' satisfies Locale;

/**
 * Namespaces: the texts of a group of files (paths relative to web/src). `complete: true` means every text in those files
 * is translated into every language – `npm run i18n:check` fails on a missing one. `server: true` holds messages the
 * server sends (its error texts), which the check finds in server/ instead of web/src.
 * The metadata is read by the check only; the app itself uses CATALOGS below.
 */
export const NAMESPACES = {
  // + the "Aufs Canvas" button of record pages and editors (contact, company, deal pipeline, ticket, workflow), the
  // opened/clicked note of e-mails (contact timeline, inbox, campaigns) and the sortable tiles (sortable/Sortable.tsx)
  core: { complete: true, files: ['ui.tsx', 'api.ts', 'boot.tsx', 'lazy.tsx', 'i18n/LanguageMenu.tsx', 'canvas/pin.tsx', 'pages/MailEngagement.tsx', 'QrCode.tsx', 'qr.ts', 'charts/core.tsx', 'charts/BarChart.tsx', 'charts/LineChart.tsx', 'charts/Shapes.tsx', 'charts/ReportView.tsx', 'referrals.tsx', 'pages/ContentKit.tsx', 'sortable/Sortable.tsx'] },
  errors: { complete: false, server: true, files: [] },
  shell: {
    complete: true,
    // `file#A,B` = only those components of a file (the top-bar buttons of areas that are not translated yet)
    files: ['main.tsx', 'nav.tsx', 'theme/Sidebar.tsx', 'ios/TabBar.tsx', 'ios/tabs.ts', 'ios/MasterDetail.tsx', 'pages/PmGlobal.tsx', 'demo.tsx', 'undo/Undo.tsx', 'agent/Panel.tsx', 'pages/Feedback.tsx'],
  },
  login: { complete: true, files: ['pages/Login.tsx', 'webauthn.ts'] },
  dashboard: { complete: true, files: ['pages/Dashboard.tsx'] },
  contacts: {
    complete: true,
    // the list's filters and badges that live in their areas' files
    files: ['pages/Contacts.tsx', 'pages/ObjectKit.tsx', 'pages/LeadScoring.tsx', 'pages/HealthScore.tsx#HealthBadge,HealthFilter,ContactService', 'pages/Attribution.tsx', 'pages/ContactFollowUp.tsx'],
  },
  deals: { complete: true, files: ['pages/Opportunities.tsx', 'pages/DealBoard.tsx', 'pages/deal-kit.ts', 'pages/DealList.tsx'] },
  inbox: { complete: true, files: ['pages/Conversations.tsx', 'pages/MsgDrafts.tsx', 'pages/TeamInboxKit.tsx', 'pages/MetaInbox.tsx', 'pages/Tickets.tsx#TicketFromConversation'] },
  calendar: { complete: true, files: ['pages/Calendars.tsx', 'pages/OAuthConnect.tsx#CalendarConnectionInfo'] },
  // the calendar view (day/week/month/team/agenda, drawer, booking from a slot, series) and the chat bot's "Termin buchen" settings
  calview: { complete: true, files: ['pages/CalendarView.tsx', 'pages/CalendarGrid.tsx', 'pages/CalendarDrawer.tsx', 'pages/AiBookingSettings.tsx', 'pages/calview-model.ts'] },
  settings: {
    complete: true,
    // Mein Konto's panels from other files (sign-in methods, push, app devices, iPhone app, calendar connections)
    files: ['pages/Settings.tsx', 'pages/SignInMethods.tsx', 'pages/PushSettings.tsx', 'ios/push-flow.ts', 'pages/MobileApp.tsx', 'ios/IosAppCard.tsx', 'ios/install.ts', 'pages/OAuthConnect.tsx'],
  },
  invoices: { complete: true, files: ['pages/Payments.tsx', 'pages/InvoiceLegal.tsx', 'pages/Stripe.tsx'] },
  // Live-Zusammenarbeit überall (top bar, sidebar avatars, banners, the Canvas header's people)
  presence: { complete: true, files: ['presence/Presence.tsx', 'presence/canvas.tsx'] },
  // phase 2 – automations: list, editor (builder, trigger and step settings, action picker, conditions), runs, test run, versions, import, AI builder
  workflows: { complete: true, files: ['pages/Workflows.tsx', 'pages/WorkflowTools.tsx', 'pages/WorkflowRuns.tsx', 'pages/WorkflowAi.tsx', 'pages/WorkflowErrors.tsx'] },
  // the visual workflow canvas (a lazy chunk) and the builder tools both editors share: copy/paste, move, pause, validation
  wfcanvas: { complete: true, files: ['workflow-canvas/WorkflowCanvas.tsx', 'workflow-canvas/WorkflowCanvasParts.tsx', 'workflow-canvas/tools.tsx', 'workflow-canvas/clipboard.ts', 'workflow-canvas/issues.ts', 'workflow-canvas/layout.ts'] },
  // the drag-and-drop email designer (campaigns, templates, the workflow step "E-Mail senden") – a chunk of its own
  email: { complete: true, files: ['pages/EmailBuilder.tsx'] },
  // e-mail marketing: campaigns with A/B tests, reminders, send time and speed, segments, template gallery, templates,
  // deliverability (reputation, warm-up, hygiene, address checks), trigger links
  campaigns: {
    complete: true,
    files: ['pages/Campaigns.tsx', 'pages/CampaignAb.tsx', 'pages/CampaignExtras.tsx', 'pages/CampaignThrottle.tsx', 'campaign-throttle.ts', 'pages/UmzugMailBanner.tsx', 'pages/Segments.tsx', 'pages/EmailGallery.tsx', 'pages/Deliverability.tsx', 'pages/DeliverabilityTools.tsx', 'pages/MarketingKit.tsx'],
  },
  // funnels and websites: list, page builder (structure, blocks, inspector), design, CMS collections, redirects, statistics,
  // accessibility check, template gallery, blog, A/B tests of pages
  sites: {
    complete: true,
    files: ['pages/Funnels.tsx', 'pages/site/Editor.tsx', 'pages/site/Inspector.tsx', 'pages/site/Tree.tsx', 'pages/site/Fields.tsx', 'pages/site/blocks.ts', 'pages/site/model.ts', 'pages/site/Design.tsx', 'pages/site/Cms.tsx', 'pages/site/Redirects.tsx', 'pages/site/A11y.tsx', 'pages/site/Analytics.tsx', 'pages/site/Templates.tsx', 'pages/Blog.tsx', 'pages/AbTests.tsx'],
  },
  // forms & surveys: list, builder (field types, options, jumps, conditions), design & flow, scoring, security, analytics,
  // submissions, template gallery, consent setting
  forms: { complete: true, files: ['pages/Forms.tsx', 'pages/FormFields.tsx', 'pages/FormDesign.tsx', 'pages/FormConsent.tsx'] },
  // a form field into a company, deal or custom-object field (docs/forms.md#field-mapping)
  formmap: { complete: true, files: ['pages/FormMapping.tsx'] },
  // tasks and project planning: my tasks, projects (list, board, calendar, Gantt, workload), task details, settings and
  // automations, the planner's workflow steps, time tracking, budgets and profitability
  pm: {
    complete: true,
    files: ['pages/Tasks.tsx', 'pages/TaskDetail.tsx', 'pages/pm-format.ts', 'pages/Pm.tsx', 'pages/PmKit.tsx', 'pages/PmBoard.tsx', 'pages/PmList.tsx', 'pages/PmCalendar.tsx', 'pages/PmGantt.tsx', 'pages/PmWorkload.tsx', 'pages/PmTask.tsx', 'pages/PmTaskParts.tsx', 'pages/PmSettings.tsx', 'pages/PmWorkflow.tsx', 'pages/PmTime.tsx', 'pages/PmBudget.tsx', 'pages/PmProfit.tsx'],
  },
  // reports: dashboards, the report builder, schedules, and the labels of the report sources and results
  reports: { complete: true, files: ['pages/Reports.tsx', 'pages/ReportBuilder.tsx', 'pages/ReportDashboard.tsx', 'pages/ReportKit.tsx'] },
  // wiki and team chat (and their shared CollabKit: emoji menu, embeds, record picker)
  collab: { complete: true, files: ['pages/Wiki.tsx', 'pages/WikiEditor.tsx', 'pages/WikiDialogs.tsx', 'pages/TeamChat.tsx', 'pages/ChatParts.tsx', 'pages/ChatDialogs.tsx', 'pages/CollabKit.tsx'] },
  // Office: file list, file view (versions, comments, links, AI box) and the editor bridge
  office: { complete: true, files: ['pages/Office.tsx', 'pages/OfficeParts.tsx', 'pages/OfficeFile.tsx', 'pages/OfficeEditor.tsx', 'pages/office-kit.ts'] },
  // courses: list, editor (content, lessons, videos, members, settings), discussion, reviews, cohorts, analytics, learning
  // paths, the members' area settings, the course workflow step and trigger filter, a contact's courses
  courses: { complete: true, files: ['pages/Courses.tsx', 'pages/CourseTabs.tsx', 'pages/CourseVideo.tsx', 'pages/CoursePaths.tsx'] },
  // social planner: calendar, list, composer, statistics, connecting channels
  social: { complete: true, files: ['pages/Social.tsx'] },
  // helpdesk: tickets (list, board, dashboard, workload, detail with timeline and replies), helpdesk settings, the ticket
  // workflow step and trigger filter, tickets from forms and calls (TicketFromConversation belongs to inbox)
  helpdesk: {
    complete: true,
    files: [
      'pages/Tickets.tsx#PRIORITY,KIND_TONE,CHANNELS,PriorityBadge,StatusBadge,useNow,dur,slaInfo,SlaChip,useTicketMeta,ContactPicker,NewTicket,FILTER_KEYS,loadLayout,BulkBar,TicketKanban,TicketList,fmtMin,TrendChart,Bars,HelpdeskDashboard,Workload,Tickets,EVENT_ICON,FACES,eventLine,Timeline,ReplyBox,MergeModal,TicketDetail,TicketFromCall',
      'pages/HelpdeskSettings.tsx',
    ],
  },
  // AI builders: Funnel & Website AI ("Mit KI erstellen", the builder's AI side panel, the draft banner, the AI writer for blog
  // and e-mail text blocks) and "KI-Agent mit KI erstellen"
  siteai: { complete: true, files: ['pages/site/AiCreate.tsx', 'pages/site/AiPanel.tsx', 'pages/site/AiWriter.tsx', 'pages/site/ai-kit.tsx', 'agent/AgentAiCreate.tsx'] },
  // Settings → Custom Values: global placeholders {{custom_values.key}}, folders, form targets, preview
  customvalues: { complete: true, files: ['pages/CustomValues.tsx'] },
  // tag colours and categories (settings card, the shared chip component)
  tags: { complete: true, files: ['pages/TagMeta.tsx', 'tag-chip.tsx', 'color-pick.tsx'] },
  // the shared list-view building block: smart-list tabs, column picker, filter rows, table with selection, bulk bar, pager
  lists: { complete: true, files: ['pages/ListKit.tsx'] },
  // mark as spam and block sender (conversation header)
  spam: { complete: true, files: ['pages/InboxSpam.tsx'] },
  // call scripts: the panel in the browser phone and power dialer, the editor under Anrufe → Leitfäden
  callscripts: { complete: true, files: ['pages/CallScripts.tsx'] },
  // better notes: the contact's notes tab and the fields of the workflow step "Notiz"
  notes: { complete: true, files: ['pages/NotesPlus.tsx'] },
  // built-in templates on the agency's Snapshots tab ("Software- & SaaS-Firma (HQ)" – docs/company-playbook.md)
  templates: { complete: true, files: ['pages/SnapshotTemplates.tsx'] },
  // reviews from other platforms on the Bewertungen page (Trustpilot, Facebook, ProvenExpert, Yelp, Tripadvisor, import)
  reviewsources: { complete: true, files: ['pages/ReviewSources.tsx'] },
  // social comments in the inbox (reply, hide, AI suggestion) and which platforms are read
  socialcomments: { complete: true, files: ['pages/SocialComments.tsx'] },
  aistudio: { complete: true, files: ['pages/AiStudio.tsx', 'pages/AiStudioPublish.tsx'] },
  // several Facebook pages / Instagram accounts under Einstellungen → Kanäle
  metapages: { complete: true, files: ['pages/MetaPages.tsx'] },
  // outbound AI calls under the KI-Telefonagent
  voiceout: { complete: true, files: ['pages/VoiceOutbound.tsx'] },
  // own numbers as caller ID under Einstellungen → Telefonie
  callerids: { complete: true, files: ['pages/CallerIds.tsx'] },
  // the project's stored files on the Projekt-Steckbrief (slot "project.files")
  projectfiles: { complete: true, files: ['pages/ProjectFiles.tsx'] },
  // Einfach-Modus: goal setup and banner, the "Mehr" panel of the adaptive sidebar, area descriptions and quick actions
  simple: { complete: true, files: ['areas/GoalSetup.tsx', 'areas/MorePanel.tsx', 'areas/info.ts', 'areas/QuickMenu.tsx', 'areas/fields.tsx', 'areas/SettingsTabs.tsx', 'areas/SetupChecklist.tsx'] },
  // operations under Agentur → System (health, alerts, off-site backup, status page incidents) and abuse handling under Agentur → Cloud
  ops: { complete: true, files: ['pages/OpsPanel.tsx', 'pages/CloudAbuse.tsx'] },
  // online store (orders, products, collections, shipping), gift cards and the PayPal/Mollie settings (docs/store.md, docs/payment-providers.md)
  store: { complete: true, files: ['pages/Shop.tsx', 'pages/GiftCards.tsx', 'pages/PayProviders.tsx'] },
  // HighLevel parity panels: several signers of a contract (slot "contract.signers"), … (docs/sales.md, docs/booking.md, docs/forms.md, docs/store.md)
  parity: { complete: true, files: ['pages/ContractSigners.tsx', 'pages/ServiceMenus.tsx', 'pages/Loyalty.tsx', 'pages/ShopAbandoned.tsx'] },
  // Fokus-Modus: the entry at the top left, the round menu button, the prompt with voice, the answer and its tiles (docs/living-boards.md#fokus-modus)
  focus: { complete: true, files: ['focus/FocusEnter.tsx', 'focus/FocusPage.tsx', 'focus/FocusPrompt.tsx', 'focus/FocusTiles.tsx'] },
  // …mit Companion: the edge button and check-in card on every page, the settings, the agent's run and the briefing in focus mode, the wake word's messages
  companion: { complete: true, files: ['companion/CompanionLayer.tsx', 'companion/CompanionSettings.tsx', 'companion/AgentRun.tsx', 'companion/Briefing.tsx', 'companion/wake.ts', 'companion/Proactive.tsx', 'companion/Growth.tsx'] },
  // HighLevel-parity gaps (CRM, inbox, automation): tags in bulk, inbox filters & message search, bulk owner, field clean-up
  crmgaps: { complete: true, files: ['pages/TagBulk.tsx', 'pages/InboxFilters.tsx', 'pages/ContactBulkOwner.tsx', 'pages/FieldCleanup.tsx', 'pages/ContactDocuments.tsx', 'pages/WorkflowFolders.tsx', 'pages/DealSmartTags.tsx', 'pages/DealForecast.tsx'] },
  // Smart Lists 2.0 on the contacts page: quick switch, save/rename/share/delete, columns with custom fields, sortable heads
  smartlists: { complete: true, files: ['pages/SmartLists.tsx'] },
  // event tickets with ticket types under Kalender → Events & Tickets (docs/booking.md#ticket-types)
  tickets: { complete: true, files: ['pages/TicketEvents.tsx'] },
  // Kalender → Vermietung: items with a quantity booked by date range (docs/booking.md#rentals)
  rentals: { complete: true, files: ['pages/Rentals.tsx'] },
  // HighLevel parity (wave 10): SEO & access and own fonts of a website, client approval and evergreen categories in the social planner,
  // agency announcements, own roles, video testimonials and prompt tests (docs/sites.md, social-planner.md, saas.md, security.md, …)
  // files in the customer portal: the share toggle on a contact's documents and the upload rules (docs/sales.md)
  portalfiles: { complete: true, files: ['pages/PortalFiles.tsx'] },
  gaps: { complete: true, files: ['pages/SiteSeo.tsx', 'pages/SocialExtras.tsx', 'pages/AgencyBanners.tsx', 'pages/RoleTemplates.tsx', 'pages/VideoTestimonials.tsx', 'pages/PromptLab.tsx', 'pages/GoogleLeads.tsx', 'pages/SystemMails.tsx', 'pages/WordPressPlugin.tsx', 'pages/ReviewBulk.tsx', 'pages/CourseAi.tsx'] },
  // Neso fork: the rest of the app in English (one namespace per area)
  x_tours_a: { complete: true, files: ['tour/content/journey.ts', 'tour/content/sites.ts', 'tour/content/connect.ts', 'tour/content/settings.ts', 'tour/content/crm.ts', 'tour/content/marketing.ts', 'tour/content/agency.ts', 'tour/content/company.ts', 'tour/content/data.ts', 'tour/content/creator.ts'] },
  x_ai: { complete: true, files: ['pages/VideoStudio.tsx', 'werkstatt/Admin.tsx', 'pages/AiTools.tsx', 'pages/AiSubscriptions.tsx', 'agent/AgentsPage.tsx', 'werkstatt/Marktplatz.tsx', 'werkstatt/Plugins.tsx', 'pages/KiStudio.tsx', 'pages/AiAssistant.tsx', 'pages/VideoRecycle.tsx', 'pages/AiConnections.tsx', 'agent/AgentEditor.tsx', 'pages/CogneeSettings.tsx', 'pages/CogneeAgency.tsx', 'werkstatt/Build.tsx', 'werkstatt/Werkstatt.tsx', 'pages/AiGallery.tsx', 'pages/GenMediaKit.tsx', 'werkstatt/badges.tsx', 'pages/AiProvider.tsx', 'werkstatt/ChatCards.tsx', 'pages/AiEffort.tsx', 'agent/WorkflowStep.tsx', 'companion/spoken.ts', 'pages/CogneeKit.tsx', 'werkstatt/scopes.tsx', 'werkstatt/WorkflowStep.tsx', 'werkstatt/PluginFrame.tsx', 'companion/realtime.ts', 'companion/store.ts', 'pages/ai-gallery-filter.ts', 'agent/voice.ts', 'agent/context.ts', 'agent/stream.ts', 'werkstatt/Nav.tsx'] },
  x_finance: { complete: true, files: ['pages/Dunning.tsx', 'pages/Inventory.tsx', 'pages/CalcInputs.tsx', 'pages/AccountingMore.tsx', 'pages/Accounting.tsx', 'pages/Sepa.tsx', 'pages/HrAdmin.tsx', 'pages/SalesSequences.tsx', 'pages/Hr.tsx', 'pages/CalcResults.tsx', 'pages/PaymentPlans.tsx', 'pages/SepaRuns.tsx', 'pages/SalesQuotes.tsx', 'pages/Calc.tsx', 'pages/BooksSync.tsx', 'pages/InvoiceSettings.tsx', 'pages/Properties.tsx', 'pages/QuoteApproval.tsx', 'pages/SalesDupes.tsx', 'pages/SalesQuotas.tsx', 'pages/SalesAccess.tsx', 'pages/Contracts.tsx', 'pages/SalesDeal.tsx', 'pages/CalcCharts.tsx', 'pages/SalesKit.tsx', 'pages/Sales.tsx', 'pages/boCommon.tsx', 'pages/CalcKit.tsx'] },
  x_agency: { complete: true, files: ['pages/Saas.tsx', 'pages/CloudConsole.tsx', 'pages/Agency.tsx', 'pages/LoginSettings.tsx', 'pages/Affiliates.tsx', 'pages/CloudSettings.tsx', 'pages/FeedbackAdmin.tsx', 'pages/Cloud.tsx', 'pages/AgencyPlatform.tsx', 'pages/CloudTeam.tsx', 'pages/PartnerLinks.tsx', 'pages/SaasBilling.tsx', 'pages/SystemHealth.tsx', 'pages/Wishes.tsx', 'pages/CloudData.tsx', 'pages/BuyOffers.tsx', 'pages/Project.tsx', 'pages/Trash.tsx', 'pages/CloudWaitlist.tsx', 'pages/AgencyLists.tsx', 'pages/CloudKit.tsx', 'pages/ContactSales.tsx'] },
  x_integrations: { complete: true, files: ['pages/Composio.tsx', 'pages/AdsWizard.tsx', 'pages/AdsAudiences.tsx', 'pages/McpServers.tsx', 'pages/Objects.tsx', 'pages/TodoistSync.tsx', 'pages/AdsConnect.tsx', 'pages/ConsentLegal.tsx', 'pages/Nango.tsx', 'pages/AdsManager.tsx', 'pages/Ads.tsx', 'pages/ConsentContact.tsx', 'pages/ConsentCmp.tsx', 'pages/Consent.tsx', 'pages/Connectors.tsx', 'pages/InboundWebhook.tsx', 'pages/UmzugZustellung.tsx', 'pages/umzug-format.ts', 'pages/AdsRules.tsx', 'pages/RestHooks.tsx', 'pages/Companies.tsx', 'pages/AdsConversions.tsx', 'pages/UmzugAssistent.tsx', 'pages/UmzugRun.tsx', 'pages/HubSpotImport.tsx', 'pages/ConsentCheckout.tsx', 'pages/UmzugConnect.tsx', 'pages/UmzugMapping.tsx', 'pages/OAuthConsent.tsx', 'pages/Integrations.tsx', 'pages/AdsKit.tsx', 'pages/SupabaseMirror.tsx', 'pages/ConsentKit.tsx', 'pages/UmzugPointer.tsx'] },
  x_community: { complete: true, files: ['pages/Community.tsx', 'pages/CommunityJoin.tsx', 'pages/CommunityEngage.tsx', 'pages/WebinarTabs.tsx', 'pages/CommunityGrowth.tsx', 'pages/CommunityImport.tsx', 'pages/Quizzes.tsx', 'pages/QuizReviews.tsx', 'pages/Certificates.tsx', 'pages/WebinarRoomTab.tsx', 'pages/CommunityMessages.tsx', 'pages/WebinarStats.tsx', 'pages/CommunityStats.tsx', 'pages/KnowledgeBase.tsx', 'pages/Surveys.tsx', 'pages/Webinars.tsx', 'pages/WebinarEditor.tsx', 'pages/CommunityParts.tsx', 'pages/CreatorKit.tsx', 'pages/webinar-format.ts'] },
  x_comms: { complete: true, files: ['pages/TeamCalendarEditor.tsx', 'pages/Mailboxes.tsx', 'pages/CallsNumbers.tsx', 'pages/CommentDm.tsx', 'pages/CallsFlows.tsx', 'pages/Voice.tsx', 'pages/CallsRouting.tsx', 'pages/CallsIntel.tsx', 'pages/CallsDialer.tsx', 'pages/Calls.tsx', 'pages/ChannelSettings.tsx', 'pages/TeamInboxSettings.tsx', 'pages/Phone.tsx', 'pages/MetaChannels.tsx', 'pages/VoiceAi.tsx', 'pages/CallsScorecards.tsx', 'pages/GoogleBusiness.tsx', 'pages/GoogleReviews.tsx', 'pages/BookingExtras.tsx', 'pages/ChannelProviders.tsx', 'pages/PhoneTools.tsx', 'pages/ChannelInbox.tsx', 'pages/ReviewReplies.tsx', 'pages/TeamCalendarKit.tsx', 'pages/CallsNotes.tsx', 'pages/Reviews.tsx', 'pages/CallsKit.tsx'] },
  x_tours_b: { complete: true, files: ['tour/content/revenue.ts', 'tour/content/service.ts', 'tour/content/calls.ts', 'tour/content/backoffice.ts', 'tour/content/sales.ts', 'tour/content/ai.ts', 'tour/content/umzug.ts', 'tour/content/teamtools.ts', 'tour/content/pm.ts', 'tour/handover.tsx', 'werkstatt/tour.ts', 'tour/content/workflow-tools.ts', 'tour/content/start.ts', 'agent/tour.ts', 'pages/collab-tour.ts', 'tour/content/genmedia.ts', 'tour/content/ads.ts', 'tour/content/webinars.ts', 'tour/content/calc.ts', 'tour/content/feedback.ts', 'tour/content/mailbox.ts', 'tour/catalog.ts', 'tour/content/sepa.ts', 'pages/Academy.tsx', 'canvas/tour.ts', 'tour/content/boards.ts', 'tour/content/memory.ts', 'tour/handbook.ts', 'tour/content/undo.ts', 'tour/content/voice.ts', 'tour/content/xr.ts', 'tour/help.tsx', 'pages/Docs.tsx', 'tour/engine.tsx', 'tour/company-course.ts', 'tour/docs.tsx', 'tour/learn.tsx', 'tour/welcome.tsx'] },
  x_misc: { complete: true, files: ['canvas/panels.tsx', 'theme/Appearance.tsx', 'canvas/dialogs-share.tsx', 'theme/BrandingLook.tsx', 'canvas/dialogs-crm.tsx', 'canvas/Editor.tsx', 'canvas/dialogs-insert.tsx', 'boards/BoardView.tsx', 'boards/Templates.tsx', 'theme/themes.ts', 'canvas/CanvasPage.tsx', 'areas/settings-nav.ts', 'canvas/dialogs-help.tsx', 'xr/Workspace.tsx', 'boards/BoardSettings.tsx', 'canvas/ai.tsx', 'xr/SpatialCard.tsx', 'boards/BoardList.tsx', 'boards/Settings.tsx', 'xr/engine/textures.ts', 'boards/PromptBar.tsx', 'boards/History.tsx', 'boards/PatchCard.tsx', 'ios/shortcuts.ts', 'xr/install.ts', 'boards/Picker.tsx', 'boards/TemplateSave.tsx', 'xr/XrViewer.tsx', 'theme/Profiles.tsx', 'ios/InstallSheet.tsx', 'canvas/comments.tsx', 'boards/views.tsx', 'undo/shared.ts', 'xr/engine/board-scene.ts', 'boards/Actions.tsx', 'boards/Grid.tsx', 'sortable/drag.ts', 'boards/EmbedHosts.tsx', 'boards/Shelf.tsx', 'pwa.tsx', 'xr/detect.ts', 'boards/WidgetCard.tsx', 'xr/SpatialSuggest.tsx', 'xr/XrButton.tsx', 'xr/engine/canvas-scene.ts', 'feedback/diagnostics.ts', 'pages/collab-badge.tsx', 'xr/MoveMenu.tsx', 'xr/engine/renderer.ts', 'xr/engine/runtime.ts', 'boards/store.ts', 'canvas/media.ts', 'pages/site/image-prep.ts', 'xr/workspace-layout.ts'] },
} as const satisfies Record<string, { complete: boolean; server?: boolean; files: readonly string[] }>;
export type Namespace = keyof typeof NAMESPACES;

type Loader = () => Promise<{ default: Catalog }>;

/** The catalog chunks per language (the source language has none). A namespace without a catalog falls back to German. */
export const CATALOGS: { [L in Exclude<Locale, typeof SOURCE_LOCALE>]: Partial<Record<Namespace, Loader>> } = {
  en: {
    core: () => import('./en/core'),
    errors: () => import('./en/errors'),
    shell: () => import('./en/shell'),
    login: () => import('./en/login'),
    dashboard: () => import('./en/dashboard'),
    contacts: () => import('./en/contacts'),
    deals: () => import('./en/deals'),
    inbox: () => import('./en/inbox'),
    calendar: () => import('./en/calendar'),
    calview: () => import('./en/calview'),
    settings: () => import('./en/settings'),
    invoices: () => import('./en/invoices'),
    presence: () => import('./en/presence'),
    workflows: () => import('./en/workflows'),
    wfcanvas: () => import('./en/wfcanvas'),
    email: () => import('./en/email'),
    campaigns: () => import('./en/campaigns'),
    sites: () => import('./en/sites'),
    forms: () => import('./en/forms'),
    formmap: () => import('./en/formmap'),
    pm: () => import('./en/pm'),
    reports: () => import('./en/reports'),
    helpdesk: () => import('./en/helpdesk'),
    social: () => import('./en/social'),
    collab: () => import('./en/collab'),
    courses: () => import('./en/courses'),
    office: () => import('./en/office'),
    customvalues: () => import('./en/customvalues'),
    siteai: () => import('./en/siteai'),
    tags: () => import('./en/tags'),
    lists: () => import('./en/lists'),
    spam: () => import('./en/spam'),
    callscripts: () => import('./en/callscripts'),
    notes: () => import('./en/notes'),
    templates: () => import('./en/templates'),
    reviewsources: () => import('./en/reviewsources'),
    socialcomments: () => import('./en/socialcomments'),
    aistudio: () => import('./en/aistudio'),
    metapages: () => import('./en/metapages'),
    voiceout: () => import('./en/voiceout'),
    callerids: () => import('./en/callerids'),
    projectfiles: () => import('./en/projectfiles'),
    simple: () => import('./en/simple'),
    ops: () => import('./en/ops'),
    store: () => import('./en/store'),
    parity: () => import('./en/parity'),
    focus: () => import('./en/focus'),
    companion: () => import('./en/companion'),
    crmgaps: () => import('./en/crmgaps'),
    smartlists: () => import('./en/smartlists'),
    tickets: () => import('./en/tickets'),
    rentals: () => import('./en/rentals'),
    gaps: () => import('./en/gaps'),
    portalfiles: () => import('./en/portalfiles'),
    x_tours_a: () => import('./en/x_tours_a'),
    x_ai: () => import('./en/x_ai'),
    x_finance: () => import('./en/x_finance'),
    x_agency: () => import('./en/x_agency'),
    x_integrations: () => import('./en/x_integrations'),
    x_community: () => import('./en/x_community'),
    x_comms: () => import('./en/x_comms'),
    x_tours_b: () => import('./en/x_tours_b'),
    x_misc: () => import('./en/x_misc'),
  },
};
