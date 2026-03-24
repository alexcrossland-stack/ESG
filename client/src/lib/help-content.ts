export type HelpSection =
  | { type: "intro"; content: string }
  | { type: "text"; heading: string; content: string }
  | { type: "list"; heading: string; items: string[] }
  | { type: "steps"; heading: string; items: string[] }
  | { type: "callout"; heading?: string; tone?: "info" | "tip" | "warning"; content: string };

export type HelpCategory =
  | "Getting Started"
  | "Adding Data"
  | "Score and Progress"
  | "Reports"
  | "Compliance"
  | "Account and Team"
  | "Troubleshooting";

export type HelpArticle = {
  slug: string;
  title: string;
  category: HelpCategory;
  summary: string;
  keywords: string[];
  featured: boolean;
  order: number;
  relatedArticles: string[];
  sections: HelpSection[];
};

export const HELP_SYNONYMS: Record<string, string[]> = {
  proof: ["evidence", "upload-supporting-evidence", "why-did-my-upload-fail"],
  document: ["evidence", "upload-supporting-evidence"],
  file: ["evidence", "upload-supporting-evidence", "why-did-my-upload-fail"],
  team: ["invite-a-team-member", "manage-user-roles"],
  staff: ["invite-a-team-member", "manage-user-roles"],
  colleague: ["invite-a-team-member"],
  user: ["invite-a-team-member", "manage-user-roles"],
  score: ["what-your-esg-score-means", "how-your-score-is-calculated", "how-to-improve-your-score"],
  rating: ["what-your-esg-score-means", "how-your-score-is-calculated"],
  report: ["generate-your-first-report", "what-your-report-includes", "download-and-share-a-report", "why-is-my-report-not-ready"],
  pdf: ["generate-your-first-report", "download-and-share-a-report"],
  download: ["download-and-share-a-report"],
  start: ["what-to-do-first-after-signing-in", "creating-your-account"],
  begin: ["what-to-do-first-after-signing-in", "completing-onboarding"],
  login: ["password-and-login-help", "creating-your-account"],
  password: ["password-and-login-help"],
  framework: ["how-framework-selection-works", "choosing-the-right-standards"],
  standard: ["how-framework-selection-works", "choosing-the-right-standards"],
  gri: ["how-framework-selection-works", "choosing-the-right-standards"],
  csrd: ["how-framework-selection-works", "choosing-the-right-standards"],
  tcfd: ["how-framework-selection-works", "choosing-the-right-standards"],
};

export const HELP_ARTICLES: HelpArticle[] = [
  {
    slug: "creating-your-account",
    title: "Creating your account",
    category: "Getting Started",
    summary: "How to register and set up your ESG Manager account for the first time.",
    keywords: ["account", "register", "sign up", "create", "login", "new user"],
    featured: true,
    order: 1,
    relatedArticles: ["completing-onboarding", "what-to-do-first-after-signing-in", "understanding-your-dashboard"],
    sections: [
      {
        type: "intro",
        content: "Setting up your account takes less than two minutes. Once you have registered, a brief setup wizard helps you configure your company profile so the platform can recommend the right metrics and reports for your business.",
      },
      {
        type: "steps",
        heading: "How to create your account",
        items: [
          "Go to the platform URL and click 'Get started' or 'Sign up'.",
          "Enter your name, work email address, and choose a password.",
          "Accept the Terms of Service and Privacy Policy.",
          "Click 'Create account'. You will be taken directly into the platform.",
          "Complete the setup wizard — this takes around three minutes and sets up your company profile.",
        ],
      },
      {
        type: "callout",
        tone: "tip",
        content: "Use your work email address rather than a personal one. This makes it easier to invite colleagues later and keeps your company data separate from personal accounts.",
      },
      {
        type: "text",
        heading: "Already have an account?",
        content: "Go to the platform URL and click 'Log in'. Enter your email and password. If you have forgotten your password, click 'Forgot password' and follow the steps sent to your email.",
      },
      {
        type: "callout",
        tone: "info",
        content: "If a colleague has already set up an account for your company, ask them to invite you from the Team page instead of creating a new account. This keeps all your company data in one place.",
      },
    ],
  },
  {
    slug: "completing-onboarding",
    title: "Completing the setup wizard",
    category: "Getting Started",
    summary: "A step-by-step walkthrough of the onboarding wizard and what each step means.",
    keywords: ["onboarding", "setup", "wizard", "profile", "industry", "maturity", "topics"],
    featured: true,
    order: 2,
    relatedArticles: ["creating-your-account", "understanding-your-dashboard", "what-to-do-first-after-signing-in"],
    sections: [
      {
        type: "intro",
        content: "When you first log in, a setup wizard walks you through five steps to configure your company's ESG programme. You can go back and change any of these answers later from Settings.",
      },
      {
        type: "steps",
        heading: "The five setup steps",
        items: [
          "Step 1 – Welcome: Review a brief overview of the platform and what it does. Click 'Get started'.",
          "Step 2 – Company profile: Enter your company name, industry, country, employee count, and annual turnover range. This information tailors the metrics and benchmarks shown to you.",
          "Step 3 – ESG maturity: Choose the statement that best describes where you are today — Starter (just beginning), Developing (some processes in place), or Established (structured ESG programme). This is a self-assessment and you can update it at any time.",
          "Step 4 – Focus areas: Choose the ESG topics most relevant to your business. For example, if you are in manufacturing, energy, carbon emissions, and health and safety are likely priorities. Select as many as apply.",
          "Step 5 – Reporting frequency: Choose how often you will collect data — monthly, quarterly, or annually. Click 'Complete setup'.",
        ],
      },
      {
        type: "callout",
        tone: "tip",
        content: "Do not worry about getting every answer perfect. You can update your company profile, topic selection, and reporting frequency from Settings at any time.",
      },
      {
        type: "text",
        heading: "What happens after you complete the wizard",
        content: "Your dashboard loads with a personalised activation checklist. The platform has already selected a set of recommended metrics based on your industry and topic choices. You are ready to start adding data.",
      },
    ],
  },
  {
    slug: "understanding-your-dashboard",
    title: "Understanding your dashboard",
    category: "Getting Started",
    summary: "What the dashboard shows, how to read your ESG score, and what to do first.",
    keywords: ["dashboard", "score", "overview", "esg position", "checklist", "activation", "progress"],
    featured: true,
    order: 3,
    relatedArticles: ["what-your-esg-score-means", "what-to-do-first-after-signing-in", "how-to-improve-your-score"],
    sections: [
      {
        type: "intro",
        content: "Your dashboard gives you a quick view of your ESG performance. It shows your current ESG Position score, a progress checklist, recent alerts, and suggested next actions.",
      },
      {
        type: "list",
        heading: "What each section shows",
        items: [
          "ESG Position score: A number from 0–100 reflecting your overall sustainability performance based on the data you have entered. A higher score means better performance.",
          "Activation checklist: A short list of first steps to get your account fully set up. Tick off each step as you complete it.",
          "Next step banner: A highlighted prompt showing the single most important thing to do next.",
          "Notifications: Alerts for missing data, upcoming deadlines, and expiring evidence files.",
          "Control Centre: A priority-sorted list of all outstanding issues across your ESG programme.",
        ],
      },
      {
        type: "callout",
        tone: "info",
        content: "If your score shows as 0 or your dashboard looks empty, it is because you have not yet added any data. Go to Add Data to enter your first metric value and your score will begin to update.",
      },
      {
        type: "text",
        heading: "The activation checklist",
        content: "When you first join the platform, a checklist appears on the dashboard showing six steps: complete your profile, choose topics, activate metrics, add data, upload evidence, and generate a report. Work through these steps in order. Once all six are done, the checklist disappears and your full dashboard view is shown.",
      },
    ],
  },
  {
    slug: "what-to-do-first-after-signing-in",
    title: "What to do first after signing in",
    category: "Getting Started",
    summary: "A simple action plan for your first session — get set up and add your first data point.",
    keywords: ["first steps", "getting started", "new user", "begin", "start", "first time"],
    featured: true,
    order: 4,
    relatedArticles: ["completing-onboarding", "add-first-esg-data-point", "understanding-your-dashboard"],
    sections: [
      {
        type: "intro",
        content: "Once you have created your account and completed the setup wizard, there are three things to do in your first session. This guide walks you through them.",
      },
      {
        type: "steps",
        heading: "Your first three actions",
        items: [
          "Check the activation checklist on your dashboard. It shows exactly what is still missing to get your account fully set up.",
          "Go to Data & Evidence > Enter Data and add your first data point — for example, your electricity usage for last month. Even a rough figure is fine for now.",
          "Go to Data & Evidence > Evidence and upload one supporting document — for example, a recent utility bill or invoice. This builds your evidence trail from day one.",
        ],
      },
      {
        type: "callout",
        tone: "tip",
        content: "You do not need perfect data on day one. Start with what you have. You can always edit or update data later, and your score will improve as you add more.",
      },
      {
        type: "text",
        heading: "After your first session",
        content: "Once you have added your first data point and uploaded an evidence file, your dashboard score will begin to show. From there, focus on adding data for the rest of your active metrics and generating your first report.",
      },
    ],
  },

  {
    slug: "add-first-esg-data-point",
    title: "How to add your first data point",
    category: "Adding Data",
    summary: "Step-by-step guide to entering your first ESG metric value using the data entry form.",
    keywords: ["data entry", "add data", "metric", "value", "enter", "first data"],
    featured: true,
    order: 5,
    relatedArticles: ["upload-supporting-evidence", "edit-or-update-an-entry", "save-draft-vs-submit"],
    sections: [
      {
        type: "intro",
        content: "Adding data is how you record your ESG performance over time. Each value you enter is linked to a specific metric — for example, your electricity use in kilowatt-hours or your headcount. The platform uses these values to calculate your ESG score and build your reports.",
      },
      {
        type: "steps",
        heading: "How to add a data point",
        items: [
          "Click 'Data & Evidence' in the sidebar, then click 'Enter Data'.",
          "You will see a list of your active metrics grouped by category (Environmental, Social, Governance). Click on any metric to expand it.",
          "Select the reporting period — for example, 'January 2024' for a monthly metric or 'Q1 2024' for a quarterly one.",
          "Type the value in the input field. Check the unit shown — for electricity this is kWh, for employees it is a headcount number.",
          "Add a note if helpful (for example, 'From invoice ref INV-001').",
          "Click 'Save'. The value is saved immediately.",
        ],
      },
      {
        type: "callout",
        tone: "tip",
        content: "Not sure what to enter? Start with electricity use — you can find the figure on your electricity bill, usually labelled 'Total kWh used' or 'Consumption'. Enter the figure for the most recent month you have a bill for.",
      },
      {
        type: "text",
        heading: "What happens after you save",
        content: "Your dashboard score updates to reflect the new data. If your metric has a target set, the value is compared against the target automatically. You can upload a supporting document (such as the bill or invoice) by clicking 'Upload evidence' on the same page.",
      },
      {
        type: "callout",
        tone: "info",
        content: "Some metrics are calculated automatically from other values you enter. For example, Scope 1 Emissions are calculated from your gas and fuel data — you do not enter Scope 1 directly.",
      },
    ],
  },
  {
    slug: "upload-supporting-evidence",
    title: "What counts as supporting evidence?",
    category: "Adding Data",
    summary: "How to upload evidence files and what types of documents are accepted.",
    keywords: ["evidence", "upload", "proof", "document", "file", "attach", "pdf", "invoice", "certificate"],
    featured: false,
    order: 6,
    relatedArticles: ["add-first-esg-data-point", "edit-or-update-an-entry", "why-did-my-upload-fail"],
    sections: [
      {
        type: "intro",
        content: "Supporting evidence links your reported data to the source document that proves it — for example, an electricity bill behind your energy data, or a training register behind your training hours. Evidence makes your ESG data auditable and improves your data quality score.",
      },
      {
        type: "list",
        heading: "What types of evidence can I upload?",
        items: [
          "Utility bills (electricity, gas, water)",
          "Fuel receipts or fleet fuel records",
          "Payroll summaries or headcount reports",
          "Training records or attendance registers",
          "Waste contractor invoices or collection reports",
          "Audit certificates (ISO 14001, ISO 45001, etc.)",
          "Health and safety incident logs",
          "Board meeting minutes",
          "Any other document that supports a reported figure",
        ],
      },
      {
        type: "steps",
        heading: "How to upload an evidence file",
        items: [
          "Go to Data & Evidence > Evidence in the sidebar.",
          "Click 'Upload Evidence'.",
          "Choose the file from your computer. Accepted formats: PDF, Word (DOCX), Excel (XLSX), PNG, JPG. Maximum size: 25 MB.",
          "Add a title and optional description so you can find it easily later.",
          "Link it to one or more metrics by selecting them from the dropdown.",
          "Select the period the document covers (for example, January 2024).",
          "Click 'Upload'. The file is saved and linked to the selected metrics.",
        ],
      },
      {
        type: "callout",
        tone: "tip",
        content: "You can also upload evidence directly from the data entry form. After saving a value, click 'Upload evidence' on that metric to attach a file immediately.",
      },
      {
        type: "text",
        heading: "How evidence affects your score",
        content: "Each metric with an evidence file attached scores higher on data quality than one without. This is visible in your Data Quality report. Aim to upload at least one document per metric per period.",
      },
    ],
  },
  {
    slug: "edit-or-update-an-entry",
    title: "How to edit or update a data entry",
    category: "Adding Data",
    summary: "How to correct or update a metric value you have already saved.",
    keywords: ["edit", "update", "correct", "change", "amend", "entry", "data"],
    featured: false,
    order: 7,
    relatedArticles: ["add-first-esg-data-point", "save-draft-vs-submit", "upload-supporting-evidence"],
    sections: [
      {
        type: "intro",
        content: "You can update any data value you have saved, as long as it has not been approved by an approver. If a value has already been approved, you will need to ask an Admin or Approver to reopen it.",
      },
      {
        type: "steps",
        heading: "How to edit a value",
        items: [
          "Go to Data & Evidence > Enter Data.",
          "Find the metric you want to update and click to expand it.",
          "Select the period that contains the value you want to change.",
          "The current saved value appears in the input field. Type the corrected figure.",
          "Update the note if needed to explain the change.",
          "Click 'Save'. The new value replaces the previous one.",
        ],
      },
      {
        type: "callout",
        tone: "info",
        content: "Editing a value does not delete the history — the platform keeps a log of changes for audit purposes. If you need to see the history of a value, ask an Admin to review the audit log.",
      },
      {
        type: "text",
        heading: "If the field is locked",
        content: "A locked field means the value has been approved. Contact your Admin or Approver and ask them to reopen the entry. Once reopened, you can edit it as normal.",
      },
      {
        type: "callout",
        tone: "tip",
        content: "If you regularly need to correct data, consider checking values before submitting them for approval. Save them as Draft first and review before clicking Submit.",
      },
    ],
  },
  {
    slug: "save-draft-vs-submit",
    title: "Save as draft versus submit — what is the difference?",
    category: "Adding Data",
    summary: "When to save a draft and when to submit data for approval.",
    keywords: ["draft", "submit", "approve", "approval", "save", "status", "workflow"],
    featured: false,
    order: 8,
    relatedArticles: ["add-first-esg-data-point", "edit-or-update-an-entry", "manage-user-roles"],
    sections: [
      {
        type: "intro",
        content: "When you save a data value, you can save it as a draft or mark it as submitted. Draft values are only visible to you and your team — they have not been confirmed for reporting. Submitted values are ready to be reviewed and approved.",
      },
      {
        type: "list",
        heading: "When to use each status",
        items: [
          "Draft: Use this when you are still gathering data or are not confident the figure is final. Drafts are excluded from score calculations until submitted.",
          "Submit: Use this when the figure is confirmed and ready for review. Submitted values are included in score calculations and can be approved by an Approver.",
        ],
      },
      {
        type: "callout",
        tone: "info",
        content: "If your company does not have an Approver role set up, submitted values are treated as approved automatically. Most small businesses start this way.",
      },
      {
        type: "steps",
        heading: "How the approval workflow works",
        items: [
          "A Contributor or Editor saves a value and marks it as Submitted.",
          "An Approver reviews the value and the supporting evidence.",
          "The Approver clicks 'Approve' to confirm the figure, or 'Reject' with a comment if it needs to be corrected.",
          "Approved values are locked and included in all reports.",
        ],
      },
      {
        type: "text",
        heading: "What to do next",
        content: "Once you have submitted your data, notify your Approver that values are ready for review. If you are the only user on the account, submitted values go straight into reports without a separate approval step.",
      },
    ],
  },

  {
    slug: "what-your-esg-score-means",
    title: "What your ESG score means",
    category: "Score and Progress",
    summary: "A plain-English explanation of the ESG Position score and what it tells you.",
    keywords: ["score", "esg score", "esg position", "rating", "meaning", "number", "performance"],
    featured: true,
    order: 9,
    relatedArticles: ["how-your-score-is-calculated", "how-to-improve-your-score", "why-some-sections-are-incomplete"],
    sections: [
      {
        type: "intro",
        content: "Your ESG Position score is a number from 0 to 100 that reflects how well your business is managing its environmental, social, and governance responsibilities. A higher score means better performance. The score is based on the data you have entered and how it compares to best-practice targets.",
      },
      {
        type: "list",
        heading: "How to read your score",
        items: [
          "0–30: Early stage. You are collecting data but performance is below target in most areas. Focus on adding complete data and setting targets.",
          "31–60: Developing. You have data in most areas and some metrics are on track. Focus on improving performance in weaker areas.",
          "61–80: Good. Most metrics are on track. Focus on evidence quality and setting stretch targets.",
          "81–100: Strong. Your ESG programme is well-managed and data-backed. Focus on maintaining performance and exploring advanced reporting frameworks.",
        ],
      },
      {
        type: "callout",
        tone: "info",
        content: "Your score is not public unless you choose to share it. It is designed to help you understand your progress, not to judge your business. Every company starts somewhere.",
      },
      {
        type: "text",
        heading: "The three pillars",
        content: "Your score is made up of three separate scores — one for Environment, one for Social, and one for Governance. You can see each pillar score on the dashboard. If one pillar is low, that tells you where to focus your attention.",
      },
      {
        type: "text",
        heading: "What to do next",
        content: "If your score seems low, read 'How to improve your score' for specific actions you can take. If your score shows as incomplete or you cannot see it yet, read 'Why some sections are incomplete'.",
      },
    ],
  },
  {
    slug: "how-your-score-is-calculated",
    title: "How your ESG score is calculated",
    category: "Score and Progress",
    summary: "The method behind your ESG score — completeness, performance, and maturity.",
    keywords: ["score", "calculation", "how", "method", "formula", "completeness", "performance", "maturity"],
    featured: false,
    order: 10,
    relatedArticles: ["what-your-esg-score-means", "how-to-improve-your-score", "why-some-sections-are-incomplete"],
    sections: [
      {
        type: "intro",
        content: "Your ESG score combines three separate elements: how complete your data is, how your performance compares to targets, and how mature your ESG processes are. Each element contributes to the overall score.",
      },
      {
        type: "list",
        heading: "The three elements of your score",
        items: [
          "Completeness (what percentage of your active metrics have data entered for the current period). A metric with no data does not contribute to performance scoring.",
          "Performance (for metrics that have data, how the values compare to the targets you have set, or to industry benchmarks where no target is set).",
          "Maturity (whether you have policies in place, targets set, data owners assigned, and evidence uploaded).",
        ],
      },
      {
        type: "callout",
        tone: "tip",
        content: "The fastest way to improve your score is to enter data for metrics that currently show no value. Even one data point per metric makes a significant difference to your completeness score.",
      },
      {
        type: "text",
        heading: "Why your score might change between sessions",
        content: "Your score updates in real time as you add data. It can also change if a new reporting period begins and your previous data no longer covers the current period — this is normal. Keep your data up to date each period to maintain a stable score.",
      },
      {
        type: "text",
        heading: "What to do next",
        content: "Review which metrics are missing data by going to the Control Centre. This shows all outstanding data gaps in one place, sorted by priority.",
      },
    ],
  },
  {
    slug: "why-some-sections-are-incomplete",
    title: "Why some sections of my score are incomplete",
    category: "Score and Progress",
    summary: "Common reasons for incomplete score sections and how to fix them.",
    keywords: ["incomplete", "missing", "no data", "score", "empty", "zero", "section", "gap"],
    featured: false,
    order: 11,
    relatedArticles: ["how-your-score-is-calculated", "how-to-improve-your-score", "add-first-esg-data-point"],
    sections: [
      {
        type: "intro",
        content: "Sections of your ESG score can show as incomplete for a few different reasons. This guide explains the most common causes and what to do about each one.",
      },
      {
        type: "list",
        heading: "Common reasons for incomplete sections",
        items: [
          "No data entered yet: You have not added any values for the metrics in that section. Go to Data & Evidence > Enter Data and add values for the missing metrics.",
          "Data is in draft status: Values saved as Draft are not counted in the score. Submit the values to include them.",
          "Metrics are not active: If a metric is turned off, it does not contribute to the score. Go to Data & Evidence > Metrics and turn on the metrics you want to track.",
          "The reporting period has changed: If a new period has begun (for example, a new month or quarter), data from the previous period does not count for the current one. Add data for the new period.",
          "Topics are not selected: Some metrics are only visible if the related ESG topic is selected. Go to ESG Setup > Topics and make sure the relevant topics are turned on.",
        ],
      },
      {
        type: "callout",
        tone: "tip",
        content: "The fastest way to find missing data is the Control Centre. Go to Control Centre in the sidebar — it shows every incomplete metric sorted by urgency.",
      },
      {
        type: "text",
        heading: "What to do next",
        content: "Once you have added data for the missing metrics, your score will update automatically. If the score still shows as incomplete after adding data, check that the values are submitted rather than saved as Draft.",
      },
    ],
  },
  {
    slug: "how-to-improve-your-score",
    title: "How to improve your ESG score",
    category: "Score and Progress",
    summary: "Practical actions you can take right now to raise your ESG score.",
    keywords: ["improve", "increase", "raise", "score", "better", "tips", "actions", "boost"],
    featured: false,
    order: 12,
    relatedArticles: ["what-your-esg-score-means", "how-your-score-is-calculated", "add-first-esg-data-point"],
    sections: [
      {
        type: "intro",
        content: "Your ESG score improves as you add more data, upload evidence, set targets, and put policies in place. Here are the most effective actions to take, roughly in order of impact.",
      },
      {
        type: "steps",
        heading: "The highest-impact actions",
        items: [
          "Add data for metrics that currently show no value. Each metric with a value counts towards your completeness score — this is the biggest driver of improvement.",
          "Upload evidence for the data you have entered. Evidence files increase your data quality score and make your data more credible to auditors.",
          "Set targets for your most important metrics. Go to Data & Evidence > Metrics, open a metric, and add a target value.",
          "Add a policy if you do not have one yet. Go to ESG Setup > Policies and create or upload an ESG policy.",
          "Assign data owners to your metrics. Each metric assigned to a named person contributes to your maturity score.",
          "Review any outstanding actions in Targets & Actions and mark completed ones as done.",
        ],
      },
      {
        type: "callout",
        tone: "info",
        content: "Your score reflects what you have recorded, not just what you do in practice. If your business is performing well but the score is low, it usually means the data has not been entered yet.",
      },
      {
        type: "text",
        heading: "What to do next",
        content: "Go to the Control Centre for a personalised list of the specific actions that will have the most impact on your score today.",
      },
    ],
  },

  {
    slug: "generate-your-first-report",
    title: "How to generate your first report",
    category: "Reports",
    summary: "Step-by-step instructions for creating your first ESG report.",
    keywords: ["report", "generate", "create", "first report", "pdf", "export"],
    featured: true,
    order: 13,
    relatedArticles: ["what-your-report-includes", "download-and-share-a-report", "add-first-esg-data-point"],
    sections: [
      {
        type: "intro",
        content: "ESG reports let you share your performance data with stakeholders — investors, clients, lenders, or your own board. The platform generates a formatted report from the data you have entered. You can download it as a PDF or Word document.",
      },
      {
        type: "callout",
        tone: "info",
        content: "You need at least one data value entered before you can generate a report. If your report is not ready, read 'Why is my report not ready yet'.",
      },
      {
        type: "steps",
        heading: "How to generate a report",
        items: [
          "Click 'Reports' in the sidebar.",
          "Click 'Generate Report'.",
          "Choose a report type. For your first report, 'ESG Metrics Summary' is a good starting point — it gives an overview of all your key metrics.",
          "Select the reporting period (for example, Q1 2024 or Full Year 2023).",
          "Click 'Generate'. The report is usually ready within a minute.",
          "When it is ready, click 'Download' to save it as a PDF.",
        ],
      },
      {
        type: "callout",
        tone: "tip",
        content: "Even if your data is not complete, you can still generate a report. Incomplete metrics will show as 'No data recorded' — this is helpful for identifying gaps you need to fill.",
      },
      {
        type: "text",
        heading: "What to do next",
        content: "Once you have downloaded your report, read 'What your report includes' to understand each section, or 'How to download and share a report' to send it to a stakeholder.",
      },
    ],
  },
  {
    slug: "what-your-report-includes",
    title: "What your ESG report includes",
    category: "Reports",
    summary: "A breakdown of the sections in your ESG report and what each one shows.",
    keywords: ["report", "contents", "sections", "what", "includes", "breakdown", "summary"],
    featured: false,
    order: 14,
    relatedArticles: ["generate-your-first-report", "download-and-share-a-report", "what-your-esg-score-means"],
    sections: [
      {
        type: "intro",
        content: "Your ESG Metrics Summary report is a formatted document that presents your key performance data in a way that is easy for stakeholders to read. Here is what each section contains.",
      },
      {
        type: "list",
        heading: "Report sections explained",
        items: [
          "Company overview: Your company name, industry, reporting period, and a summary of your ESG Position score.",
          "Environmental performance: Your energy use, carbon emissions (Scope 1 and 2), water, and waste data for the period. Each metric shows the value recorded, the unit, and whether it is on track against your target.",
          "Social performance: Your people data including headcount, gender split, turnover rate, training hours, and health and safety figures.",
          "Governance performance: Policy status, board meeting frequency, anti-bribery compliance, and data privacy measures.",
          "Data quality: A summary of how much of your data has supporting evidence attached and what percentage has been formally approved.",
          "Next steps: A short list of actions recommended to improve your score and data completeness.",
        ],
      },
      {
        type: "callout",
        tone: "tip",
        content: "Different report types include different sections. The Framework Readiness report focuses on your alignment to GRI, TCFD, or CSRD. The Board Pack report is formatted as a summary for senior leadership. Choose the report type that matches your audience.",
      },
      {
        type: "text",
        heading: "What to do next",
        content: "Once you understand your report, go to 'How to download and share a report' to learn how to send it to a stakeholder, or 'How to improve your score' to address any gaps highlighted in the report.",
      },
    ],
  },
  {
    slug: "download-and-share-a-report",
    title: "How to download and share a report",
    category: "Reports",
    summary: "How to download a generated report as PDF or Word, and share it with stakeholders.",
    keywords: ["download", "share", "pdf", "word", "export", "report", "send", "stakeholder"],
    featured: false,
    order: 15,
    relatedArticles: ["generate-your-first-report", "what-your-report-includes"],
    sections: [
      {
        type: "intro",
        content: "Once a report has been generated, you can download it in the format you need and share it with whoever needs it. Reports are available as PDF and Word (DOCX) files.",
      },
      {
        type: "steps",
        heading: "How to download a report",
        items: [
          "Click 'Reports' in the sidebar. Your previously generated reports are listed here.",
          "Find the report you want and click 'Download'.",
          "Choose the format: PDF (best for sharing, cannot be edited) or Word (best if you want to add commentary or customise the layout).",
          "The file downloads to your computer. You can then email it, upload it to a shared folder, or print it.",
        ],
      },
      {
        type: "callout",
        tone: "info",
        content: "Reports include a timestamp showing when they were generated. If you need a report that reflects your most recent data, generate a new one rather than sharing an older version.",
      },
      {
        type: "text",
        heading: "Sharing via the public profile",
        content: "If you want to share your ESG data with a supplier or investor without sending a PDF, you can use your Public ESG Profile. This is a live link that shows your current ESG Position score and key data. Go to ESG Setup > ESG Profile to find your shareable link.",
      },
    ],
  },

  {
    slug: "how-framework-selection-works",
    title: "How framework selection works",
    category: "Compliance",
    summary: "What ESG reporting frameworks are, how to choose them, and what happens after selection.",
    keywords: ["framework", "gri", "tcfd", "csrd", "esrs", "issb", "cdp", "select", "compliance", "reporting standard"],
    featured: false,
    order: 16,
    relatedArticles: ["choosing-the-right-standards", "what-your-report-includes"],
    sections: [
      {
        type: "intro",
        content: "ESG reporting frameworks are sets of standards that define what data you should collect and report. Choosing one or more frameworks tells the platform which requirements to track and shows you how close you are to meeting them.",
      },
      {
        type: "text",
        heading: "Why frameworks matter",
        content: "More and more customers, investors, and lenders are asking businesses to report against a recognised framework. Choosing a framework means you can show stakeholders that your ESG data is collected in a structured, credible way — not just a collection of random numbers.",
      },
      {
        type: "steps",
        heading: "How to select a framework",
        items: [
          "Click 'Frameworks' in the sidebar, then click 'Framework Settings'.",
          "Review the frameworks listed. Read the short description to understand who each one is designed for.",
          "Toggle on the frameworks that apply to you. You can select more than one.",
          "Click 'Save'. The platform maps your metrics and policies to the selected framework requirements.",
          "Go to Frameworks > Readiness to see your current alignment score for each framework.",
        ],
      },
      {
        type: "callout",
        tone: "tip",
        content: "If you are not sure which framework to choose, start with GRI (Global Reporting Initiative) — it is the most widely used and accepted framework for businesses of all sizes.",
      },
      {
        type: "text",
        heading: "What the readiness score shows",
        content: "Your framework readiness score shows what percentage of the framework requirements you currently meet based on the data you have entered. The Readiness page also shows which specific requirements are still unmet and what data you need to collect to meet them.",
      },
    ],
  },
  {
    slug: "choosing-the-right-standards",
    title: "Choosing the right reporting standards",
    category: "Compliance",
    summary: "A simple guide to the main ESG frameworks and which ones are most relevant for SMEs.",
    keywords: ["framework", "standard", "gri", "tcfd", "csrd", "esrs", "issb", "cdp", "ungc", "which", "choose", "best"],
    featured: false,
    order: 17,
    relatedArticles: ["how-framework-selection-works"],
    sections: [
      {
        type: "intro",
        content: "There are many ESG reporting frameworks. For most small and medium-sized businesses, you only need one or two. This guide explains the main ones and helps you choose.",
      },
      {
        type: "list",
        heading: "The main frameworks explained",
        items: [
          "GRI (Global Reporting Initiative): The most widely used framework worldwide. Covers all three pillars — Environment, Social, Governance. Good starting point for any business.",
          "TCFD (Task Force on Climate-related Financial Disclosures): Focuses on climate-related risks and how they affect your business financially. Becoming a common requirement from investors and lenders.",
          "CSRD / ESRS (EU Corporate Sustainability Reporting Directive): Required for larger EU companies. Increasingly relevant if you supply to EU businesses, as they may ask their supply chain to report similarly.",
          "ISSB (International Sustainability Standards Board / IFRS S1 and S2): A newer global standard focused on sustainability and climate reporting for investors.",
          "CDP (Carbon Disclosure Project): An annual disclosure process focused on carbon, water, and forests. Commonly requested by large corporate customers.",
          "UNGC (UN Global Compact): A set of ten principles covering human rights, labour, environment, and anti-corruption. Joining the UNGC and reporting progress is voluntary.",
        ],
      },
      {
        type: "callout",
        tone: "tip",
        content: "Start with GRI if you are unsure. It is the most practical framework for SMEs and widely recognised. Add TCFD if an investor or lender has asked you about climate risks.",
      },
      {
        type: "text",
        heading: "How to decide",
        content: "Ask yourself: who is asking for this information? If it is an investor, TCFD is likely most relevant. If it is a large corporate customer, they may specify a particular framework in their supply chain questionnaire. If no one has specified a framework, GRI is a solid default.",
      },
    ],
  },

  {
    slug: "invite-a-team-member",
    title: "How to invite a team member",
    category: "Account and Team",
    summary: "Step-by-step guide to inviting a colleague to join your company account.",
    keywords: ["invite", "team", "member", "colleague", "user", "add user", "staff", "email"],
    featured: false,
    order: 18,
    relatedArticles: ["manage-user-roles", "update-company-details"],
    sections: [
      {
        type: "intro",
        content: "You can invite colleagues to your ESG Manager account so they can enter data, review reports, or manage your ESG programme alongside you. Each person gets their own login and is assigned a role that controls what they can do.",
      },
      {
        type: "callout",
        tone: "info",
        content: "You need to be an Admin to invite team members. If you do not see the Team option in the sidebar, you may not have Admin access. Ask your Admin to send the invitation instead.",
      },
      {
        type: "steps",
        heading: "How to invite someone",
        items: [
          "Click 'ESG Setup' in the sidebar, then click 'Team'.",
          "Click 'Invite member'.",
          "Enter the person's email address.",
          "Choose their role — see the role descriptions below to choose the right one.",
          "Click 'Send invite'.",
          "The person receives an email with a link to set up their account. The link expires after 7 days.",
        ],
      },
      {
        type: "list",
        heading: "Role descriptions",
        items: [
          "Admin: Full access. Can manage settings, billing, team, and all data.",
          "Contributor: Can enter and edit data values. Cannot manage settings or generate reports.",
          "Viewer: Read-only. Can view dashboards, metrics, and reports but cannot edit anything.",
          "Approver: Can review and approve submitted data values.",
        ],
      },
      {
        type: "callout",
        tone: "tip",
        content: "On the Free plan, you can invite up to 3 team members. Upgrade to Pro for unlimited team members.",
      },
    ],
  },
  {
    slug: "manage-user-roles",
    title: "How to manage user roles",
    category: "Account and Team",
    summary: "How to change a team member's role or remove them from your account.",
    keywords: ["roles", "permissions", "user", "team", "change role", "remove", "access"],
    featured: false,
    order: 19,
    relatedArticles: ["invite-a-team-member", "update-company-details"],
    sections: [
      {
        type: "intro",
        content: "Roles control what each team member can see and do in ESG Manager. You can change a person's role at any time, or remove them from the account if they leave the company.",
      },
      {
        type: "steps",
        heading: "How to change someone's role",
        items: [
          "Click 'ESG Setup' in the sidebar, then click 'Team'.",
          "Find the person in the list.",
          "Click the role dropdown next to their name.",
          "Select the new role.",
          "The change takes effect immediately — no need to save separately.",
        ],
      },
      {
        type: "steps",
        heading: "How to remove a team member",
        items: [
          "Click 'ESG Setup' in the sidebar, then click 'Team'.",
          "Find the person in the list.",
          "Click the three-dot menu next to their name.",
          "Click 'Remove from team'.",
          "Confirm the removal. Their account is deactivated and they can no longer log in.",
        ],
      },
      {
        type: "callout",
        tone: "info",
        content: "Removing a team member does not delete their previously entered data. All data they submitted remains in the system under your company account.",
      },
    ],
  },
  {
    slug: "update-company-details",
    title: "How to update your company details",
    category: "Account and Team",
    summary: "How to change your company name, industry, employee count, or other profile information.",
    keywords: ["company", "profile", "settings", "update", "name", "industry", "details", "edit"],
    featured: false,
    order: 20,
    relatedArticles: ["invite-a-team-member", "completing-onboarding"],
    sections: [
      {
        type: "intro",
        content: "Your company details are used to tailor metrics, benchmarks, and reports. Keep them up to date as your business changes — especially employee count and turnover, which affect how your performance is benchmarked.",
      },
      {
        type: "steps",
        heading: "How to update your company details",
        items: [
          "Click 'Settings' in the sidebar.",
          "Click 'General Settings' or 'Company Profile'.",
          "Update any fields you want to change: company name, industry, country, employee count, annual turnover range, or reporting year.",
          "Click 'Save changes'.",
        ],
      },
      {
        type: "callout",
        tone: "tip",
        content: "If your industry changes, review your active metrics after saving. A new industry selection may make different metrics relevant to your business.",
      },
      {
        type: "text",
        heading: "What to do next",
        content: "After updating your company details, check your dashboard to see if your ESG Position score or recommendations have changed. The platform uses your profile to personalise your experience.",
      },
    ],
  },
  {
    slug: "password-and-login-help",
    title: "Password and login help",
    category: "Account and Team",
    summary: "How to reset your password, change your email, or fix login problems.",
    keywords: ["password", "login", "reset", "forgot", "email", "sign in", "account", "locked"],
    featured: false,
    order: 21,
    relatedArticles: ["creating-your-account", "update-company-details"],
    sections: [
      {
        type: "intro",
        content: "If you cannot log in or need to change your password, this guide covers the most common login issues.",
      },
      {
        type: "steps",
        heading: "How to reset a forgotten password",
        items: [
          "Go to the login page and click 'Forgot password'.",
          "Enter the email address you used to register.",
          "Click 'Send reset link'.",
          "Check your email (including your spam folder) for a message from ESG Manager.",
          "Click the link in the email and enter a new password.",
          "Log in with your new password.",
        ],
      },
      {
        type: "text",
        heading: "How to change your password when logged in",
        content: "Go to Settings and look for the Security section. Click 'Change password', enter your current password, then enter and confirm your new password. Click 'Save'.",
      },
      {
        type: "callout",
        tone: "warning",
        content: "Password reset links expire after 24 hours. If your link has expired, go back to the forgot password page and request a new one.",
      },
      {
        type: "text",
        heading: "Still cannot log in?",
        content: "If you have tried resetting your password and still cannot access your account, contact support using the form below. Include your email address and a description of what happens when you try to log in.",
      },
    ],
  },

  {
    slug: "why-cant-i-see-a-score-yet",
    title: "Why can't I see my ESG score yet?",
    category: "Troubleshooting",
    summary: "Common reasons your score is not showing and how to resolve each one.",
    keywords: ["score", "missing", "not showing", "empty", "zero", "why", "no score"],
    featured: false,
    order: 22,
    relatedArticles: ["add-first-esg-data-point", "why-some-sections-are-incomplete", "understanding-your-dashboard"],
    sections: [
      {
        type: "intro",
        content: "If your ESG score is not showing or is showing as 0, there is usually a straightforward explanation. This guide covers the most common causes.",
      },
      {
        type: "list",
        heading: "Common reasons",
        items: [
          "No data has been entered yet: Your score is calculated from data you submit. If no data has been saved, the score cannot be calculated. Go to Enter Data and add your first values.",
          "Data is saved as Draft: Draft values do not count towards your score. Find the data in Enter Data and change the status from Draft to Submitted.",
          "No metrics are active: If all your metrics are turned off, there is nothing to score. Go to Metrics and check that at least some metrics are set to active.",
          "The setup wizard is not complete: Your score only shows after you have completed the setup wizard. Go to the dashboard and complete any remaining steps in the activation checklist.",
        ],
      },
      {
        type: "callout",
        tone: "tip",
        content: "The quickest way to get a score showing is to add data for just one metric. Go to Enter Data, pick any active metric, add a value for the current period, and click Save.",
      },
      {
        type: "text",
        heading: "Still not showing?",
        content: "If you have added data, it is submitted (not draft), metrics are active, and your score is still not showing, use the Contact Support form below to report the issue. Include your email address and a description of what you have tried.",
      },
    ],
  },
  {
    slug: "why-is-my-report-not-ready",
    title: "Why is my report not ready?",
    category: "Troubleshooting",
    summary: "Reasons a report may fail to generate or appear incomplete, and what to do.",
    keywords: ["report", "not ready", "failed", "error", "generate", "missing", "incomplete"],
    featured: false,
    order: 23,
    relatedArticles: ["generate-your-first-report", "add-first-esg-data-point", "why-cant-i-see-a-score-yet"],
    sections: [
      {
        type: "intro",
        content: "If your report is not generating or looks incomplete, one of a few things may be happening. This guide explains the most common causes.",
      },
      {
        type: "list",
        heading: "Common reasons a report may not generate",
        items: [
          "No data for the selected period: If you have selected a reporting period with no data, the report will be blank or fail to generate. Check that you have entered data for the period you selected.",
          "Report type not available on your plan: Some report types (for example, Board Pack or Investor Report) are only available on the Pro plan. The button will be greyed out if this is the case. Upgrade to Pro to access all report types.",
          "You do not have permission: Only users with the Editor role or above can generate reports. If you are a Viewer or Contributor, ask your Admin to generate the report.",
        ],
      },
      {
        type: "steps",
        heading: "What to try",
        items: [
          "Go to Reports and try generating an 'ESG Metrics Summary' — this is the most basic report type and requires the least data.",
          "Check the reporting period you selected. Make sure it matches a period where you have entered data.",
          "Try a different period — for example, if Q1 has no data, try selecting the full previous year.",
        ],
      },
      {
        type: "callout",
        tone: "info",
        content: "Reports do not require complete data. A report will generate with whatever data is available, showing gaps clearly. This is intentional — it helps you identify what to collect next.",
      },
      {
        type: "text",
        heading: "Still not working?",
        content: "If the report fails with an error message, copy the error message and contact support using the form below. Our team will investigate.",
      },
    ],
  },
  {
    slug: "why-did-my-upload-fail",
    title: "Why did my file upload fail?",
    category: "Troubleshooting",
    summary: "Common reasons for failed uploads and how to fix them.",
    keywords: ["upload", "fail", "error", "file", "evidence", "document", "attachment", "rejected"],
    featured: false,
    order: 24,
    relatedArticles: ["upload-supporting-evidence", "add-first-esg-data-point"],
    sections: [
      {
        type: "intro",
        content: "If a file upload fails, it is usually because the file is too large, in an unsupported format, or you have reached your storage limit. Here is how to fix each issue.",
      },
      {
        type: "list",
        heading: "Common upload errors",
        items: [
          "File too large: The maximum file size is 25 MB. If your file is larger, try compressing it. For PDFs, use a PDF compression tool. For images, reduce the resolution before uploading.",
          "Unsupported file type: Only PDF, Word (DOCX), Excel (XLSX), PNG, and JPG files are accepted. Convert the file to one of these formats before uploading.",
          "Storage limit reached: On the Free plan, you can store up to 10 evidence files. If you have reached this limit, you will need to delete an existing file or upgrade to Pro for unlimited storage.",
          "Connection interrupted: If your internet connection dropped during the upload, try again with a stable connection.",
        ],
      },
      {
        type: "steps",
        heading: "How to fix a failed upload",
        items: [
          "Check the error message — it usually tells you the specific reason.",
          "If the file is too large, compress it using a free online PDF or image compression tool.",
          "If the format is wrong, save or export the document as a PDF before uploading.",
          "If you have hit the file limit on the Free plan, go to Evidence, delete an old file that is no longer needed, then try the upload again.",
          "Try the upload again. If it fails a second time, contact support.",
        ],
      },
      {
        type: "callout",
        tone: "tip",
        content: "PDF is the most reliable format for uploads. If you are unsure about a file format, convert it to PDF first.",
      },
    ],
  },
  {
    slug: "common-first-time-user-mistakes",
    title: "Common mistakes when getting started",
    category: "Troubleshooting",
    summary: "The most common first-time issues and how to avoid or fix them.",
    keywords: ["mistakes", "problems", "common", "issues", "first time", "help", "tips", "errors"],
    featured: false,
    order: 25,
    relatedArticles: ["what-to-do-first-after-signing-in", "add-first-esg-data-point", "why-cant-i-see-a-score-yet"],
    sections: [
      {
        type: "intro",
        content: "Most first-time users run into the same handful of issues. Here is a list of the most common ones — and how to avoid or fix them.",
      },
      {
        type: "list",
        heading: "Common first-time issues",
        items: [
          "Saving data as Draft instead of Submitting: Data saved as Draft does not count towards your score. After saving values, make sure to submit them.",
          "Entering data for the wrong period: Check the period selector before saving — if you are entering data for March, make sure March is selected, not a previous month.",
          "Turning on too many metrics at once: Start with the 5–10 metrics most relevant to your business. Adding too many at once makes data entry feel overwhelming.",
          "Not uploading any evidence: Even one document per metric significantly improves your data quality score. Start uploading evidence from day one.",
          "Expecting an instant score: Your score updates after you add data, but if you have only entered one or two values it will still look low. Keep adding data across all metrics.",
          "Not completing the setup wizard: If you skipped or rushed through the wizard, some metrics and features may not be visible. Go to Settings to review and update your company profile.",
          "Inviting team members with the wrong role: A Viewer cannot enter data and a Contributor cannot generate reports. Review the role descriptions in the Team guide before sending invites.",
        ],
      },
      {
        type: "callout",
        tone: "tip",
        content: "The dashboard activation checklist is your best guide for the first few sessions. Work through each step in order and you will avoid most of the issues listed above.",
      },
      {
        type: "text",
        heading: "Still stuck?",
        content: "Use the Contact Support form on this page to reach our team. Include a description of the problem and, if possible, a screenshot — this helps us resolve your issue faster.",
      },
    ],
  },
];

export function searchArticles(query: string): HelpArticle[] {
  const q = query.toLowerCase().trim();
  if (!q) return [];

  const synonymExpansion = new Set<string>();
  Object.entries(HELP_SYNONYMS).forEach(([synonym, slugs]) => {
    if (q.includes(synonym)) slugs.forEach(s => synonymExpansion.add(s));
  });

  return HELP_ARTICLES.filter(article => {
    if (synonymExpansion.has(article.slug)) return true;
    if (article.title.toLowerCase().includes(q)) return true;
    if (article.summary.toLowerCase().includes(q)) return true;
    if (article.keywords.some(k => k.toLowerCase().includes(q))) return true;
    if (article.category.toLowerCase().includes(q)) return true;
    const sectionMatch = article.sections.some(s => {
      if ("content" in s && s.content.toLowerCase().includes(q)) return true;
      if ("heading" in s && s.heading && s.heading.toLowerCase().includes(q)) return true;
      if ("items" in s && s.items.some((i: string) => i.toLowerCase().includes(q))) return true;
      return false;
    });
    return sectionMatch;
  });
}

export function getArticleBySlug(slug: string): HelpArticle | undefined {
  return HELP_ARTICLES.find(a => a.slug === slug);
}

export function getArticlesByCategory(category: HelpCategory): HelpArticle[] {
  return HELP_ARTICLES.filter(a => a.category === category).sort((a, b) => a.order - b.order);
}

export function getFeaturedArticles(): HelpArticle[] {
  return HELP_ARTICLES.filter(a => a.featured).sort((a, b) => a.order - b.order);
}

export const HELP_CATEGORIES: { name: HelpCategory; description: string; icon: string }[] = [
  { name: "Getting Started", description: "Set up your account and complete your first steps", icon: "Zap" },
  { name: "Adding Data", description: "Enter metric values and upload supporting evidence", icon: "ClipboardList" },
  { name: "Score and Progress", description: "Understand your ESG score and how to improve it", icon: "BarChart3" },
  { name: "Reports", description: "Generate and share ESG reports for stakeholders", icon: "FileText" },
  { name: "Compliance", description: "Reporting frameworks and regulatory standards", icon: "Shield" },
  { name: "Account and Team", description: "Manage users, roles, and company settings", icon: "Users" },
  { name: "Troubleshooting", description: "Fix common issues and get unstuck", icon: "HelpCircle" },
];
