export const LEGAL_VERSION = "1.0";
export const LEGAL_LAST_UPDATED = "March 2026";

export const LEGAL_REVIEW_NOTICE = "TEMPLATE — This document contains placeholder legal text. It must be reviewed and approved by a qualified solicitor before use with real customers. Do not rely on this text for legal compliance without professional review.";

export interface LegalSection {
  heading: string;
  content: string;
}

export interface LegalDocument {
  title: string;
  version: string;
  lastUpdated: string;
  intro: string;
  sections: LegalSection[];
}

export const TERMS_OF_SERVICE: LegalDocument = {
  title: "Terms of Service",
  version: LEGAL_VERSION,
  lastUpdated: LEGAL_LAST_UPDATED,
  intro: "Please read these Terms of Service carefully before using ESG Manager. By creating an account, you agree to be bound by these terms.",
  sections: [
    {
      heading: "1. Acceptance of Terms",
      content: "By accessing or using ESG Manager ('the Service'), you agree to be bound by these Terms of Service. If you do not agree, you may not use the Service. These terms apply to all users, including administrators, editors, contributors, and viewers.",
    },
    {
      heading: "2. Description of Service",
      content: "ESG Manager is a software-as-a-service platform that helps small and medium-sized businesses manage, track, and report on environmental, social, and governance (ESG) data. The Service includes data entry tools, report generation, policy management, evidence storage, and AI-assisted features.",
    },
    {
      heading: "3. Account Registration",
      content: "You must register an account to use the Service. You agree to provide accurate, current, and complete information during registration and to keep your account credentials secure. You are responsible for all activity under your account. You must be at least 18 years old to create an account.",
    },
    {
      heading: "4. Acceptable Use",
      content: "You may use the Service only for lawful business purposes. You must not: attempt to gain unauthorised access to the Service or its infrastructure; use the Service to store, transmit, or process unlawful content; resell, sublicense, or otherwise commercially exploit the Service without our written consent; use automated tools to scrape or extract data in bulk without authorisation.",
    },
    {
      heading: "5. Data and Content",
      content: "You retain ownership of all data you input into the Service. By using the Service, you grant us a limited licence to process and store your data for the purpose of providing the Service. You are responsible for ensuring the accuracy of data you enter and for maintaining appropriate backups.",
    },
    {
      heading: "6. AI-Assisted Features",
      content: "The Service includes AI-powered features such as policy generation and questionnaire autofill. AI-generated content is provided as a starting point only and should be reviewed by qualified personnel before use. We do not warrant that AI-generated content is accurate, complete, or appropriate for your specific circumstances.",
    },
    {
      heading: "7. Payment and Subscription",
      content: "[Placeholder — subscription and payment terms to be added when billing is implemented. This section should describe plan types, billing cycles, cancellation, and refund policies.]",
    },
    {
      heading: "8. Limitation of Liability",
      content: "To the maximum extent permitted by applicable law, we shall not be liable for any indirect, incidental, special, or consequential damages arising from your use of the Service. Our total liability to you shall not exceed the amounts paid by you to us in the twelve months preceding the claim.",
    },
    {
      heading: "9. Availability",
      content: "We aim to provide a reliable service but do not guarantee uninterrupted availability. We may perform maintenance, updates, or infrastructure changes that temporarily affect availability. We will endeavour to provide reasonable notice of planned downtime.",
    },
    {
      heading: "10. Termination",
      content: "Either party may terminate this agreement at any time. We may suspend or terminate your account if you breach these terms. On termination, your data will be retained for 30 days to allow export, after which it may be deleted. You may export your data at any time during your subscription.",
    },
    {
      heading: "11. Changes to Terms",
      content: "We may update these Terms of Service from time to time. We will provide reasonable notice of material changes. Continued use of the Service after changes take effect constitutes acceptance of the revised terms.",
    },
    {
      heading: "12. Governing Law",
      content: "[Placeholder — governing law and jurisdiction clause to be finalised by legal counsel. Likely English law for a UK-based service.]",
    },
    {
      heading: "13. Contact",
      content: "For questions about these terms, please contact us at legal@esgmanager.com.",
    },
  ],
};

export const PRIVACY_POLICY: LegalDocument = {
  title: "Privacy Policy",
  version: LEGAL_VERSION,
  lastUpdated: LEGAL_LAST_UPDATED,
  intro: "This Privacy Policy explains how ESG Manager collects, uses, and protects your personal data. We are committed to protecting your privacy and handling your data in an open and transparent manner.",
  sections: [
    {
      heading: "1. Data Controller",
      content: "[Placeholder — insert registered company name, address, and company number here. This is the data controller for GDPR purposes.]",
    },
    {
      heading: "2. What Data We Collect",
      content: "We collect: account information (name, email address, company name) provided during registration; usage data (pages visited, features used, session duration) for service improvement; ESG data you input into the platform; correspondence you send to us including support requests; device and browser information for security purposes.",
    },
    {
      heading: "3. How We Use Your Data",
      content: "We use your data to: provide, maintain, and improve the Service; send you service-related communications; respond to your support requests; generate aggregated, anonymised analytics about platform usage; comply with legal obligations.",
    },
    {
      heading: "4. Legal Basis for Processing",
      content: "We process your personal data on the following legal bases: contract performance (providing the Service you have agreed to); legitimate interests (improving and securing the Service); legal obligation (where required by law); consent (where explicitly obtained, such as marketing communications).",
    },
    {
      heading: "5. Data Sharing",
      content: "We do not sell your personal data. We may share data with: trusted service providers who help us operate the Service (cloud hosting, AI services) under appropriate data processing agreements; legal authorities where required by law; third parties with your explicit consent.",
    },
    {
      heading: "6. AI Processing",
      content: "Some features use third-party AI services (OpenAI) to generate content. Data sent to AI services is processed in accordance with those providers' data processing terms. We do not send personal identification data to AI services beyond what is necessary to fulfil your request.",
    },
    {
      heading: "7. Data Retention",
      content: "We retain your account data for as long as your account is active plus 30 days following account closure. Support request data is retained for 2 years. Audit logs are retained for 3 years for compliance purposes. You may request deletion of your data at any time (subject to legal retention obligations).",
    },
    {
      heading: "8. Your Rights",
      content: "Under applicable data protection law, you have the right to: access the personal data we hold about you; correct inaccurate data; request erasure of your data (right to be forgotten); object to processing; data portability; withdraw consent at any time. To exercise these rights, use the data rights tools in your account settings or contact privacy@esgmanager.com.",
    },
    {
      heading: "9. Security",
      content: "We implement appropriate technical and organisational measures to protect your personal data against unauthorised access, loss, or disclosure. These include encrypted data storage, secure connections (HTTPS), access controls, and regular security reviews.",
    },
    {
      heading: "10. International Transfers",
      content: "[Placeholder — if data is transferred outside the UK/EEA, appropriate safeguards must be documented here.]",
    },
    {
      heading: "11. Cookies",
      content: "We use essential cookies required for the Service to function. Please see our Cookie Policy for details.",
    },
    {
      heading: "12. Changes to This Policy",
      content: "We may update this Privacy Policy from time to time. We will notify you of material changes by email or prominent notice in the Service. The current version date is shown above.",
    },
    {
      heading: "13. Contact",
      content: "For privacy-related enquiries, contact our privacy team at privacy@esgmanager.com. You also have the right to lodge a complaint with the Information Commissioner's Office (ICO) in the UK.",
    },
  ],
};

export const COOKIE_POLICY: LegalDocument = {
  title: "Cookie Policy",
  version: LEGAL_VERSION,
  lastUpdated: LEGAL_LAST_UPDATED,
  intro: "This Cookie Policy explains how ESG Manager uses cookies and similar technologies when you use our platform.",
  sections: [
    {
      heading: "1. What Are Cookies",
      content: "Cookies are small text files stored on your device when you visit a website or use a web application. They help the application remember information about your visit and preferences.",
    },
    {
      heading: "2. Cookies We Use",
      content: "We use the following types of cookies: Session cookies (essential) — required to keep you logged in and maintain your session securely. These are deleted when you close your browser. No third-party advertising, analytics, or tracking cookies are used.",
    },
    {
      heading: "3. Essential Cookies",
      content: "Essential cookies are strictly necessary for the Service to function. They include session identifiers that authenticate your login, security tokens that protect against cross-site attacks, and preference cookies that remember your in-app settings. These cannot be disabled without disrupting the Service.",
    },
    {
      heading: "4. No Third-Party Tracking",
      content: "ESG Manager does not use third-party advertising cookies, social media tracking pixels, or behavioural analytics platforms. We do not share cookie data with advertisers.",
    },
    {
      heading: "5. Managing Cookies",
      content: "You can control cookies through your browser settings. Disabling all cookies may prevent essential platform features from working correctly. Most browsers allow you to delete cookies, block new cookies, or receive a warning before a cookie is stored.",
    },
    {
      heading: "6. Changes to This Policy",
      content: "We may update this Cookie Policy if we introduce new cookies or technologies. Changes will be reflected in the updated version date above.",
    },
    {
      heading: "7. Contact",
      content: "For questions about cookies, contact privacy@esgmanager.com.",
    },
  ],
};

export const DPA: LegalDocument = {
  title: "Data Processing Agreement",
  version: LEGAL_VERSION,
  lastUpdated: LEGAL_LAST_UPDATED,
  intro: "This Data Processing Agreement ('DPA') forms part of the agreement between you (the Data Controller) and ESG Manager (the Data Processor) and governs the processing of personal data in connection with the Service.",
  sections: [
    {
      heading: "1. Definitions",
      content: "'Controller' means the organisation that determines the purposes and means of processing personal data. 'Processor' means ESG Manager, which processes personal data on behalf of the Controller. 'Personal Data', 'Processing', and 'Data Subject' have the meanings given in applicable data protection law (including UK GDPR and the Data Protection Act 2018).",
    },
    {
      heading: "2. Scope and Purpose",
      content: "The Processor will process personal data only for the purpose of providing the ESG Manager service as described in the Terms of Service, and only on documented instructions from the Controller, unless required to do so by applicable law.",
    },
    {
      heading: "3. Data Processor Obligations",
      content: "The Processor agrees to: process personal data only on documented instructions from the Controller; ensure that persons authorised to process personal data are subject to confidentiality obligations; implement appropriate technical and organisational security measures; assist the Controller with data subject rights requests; provide all necessary information to demonstrate compliance.",
    },
    {
      heading: "4. Sub-processors",
      content: "The Processor may engage sub-processors to assist in providing the Service, including cloud hosting providers and AI service providers. The Processor will inform the Controller of any intended changes to sub-processors and provide the opportunity to object. [Placeholder — list of current sub-processors to be added.]",
    },
    {
      heading: "5. Security Measures",
      content: "The Processor implements appropriate technical and organisational measures including: encryption of data in transit and at rest; access controls and authentication; regular security assessments; incident response procedures; employee training on data protection.",
    },
    {
      heading: "6. Data Breach Notification",
      content: "In the event of a personal data breach, the Processor will notify the Controller without undue delay and within 72 hours of becoming aware of the breach, providing sufficient information for the Controller to meet its notification obligations.",
    },
    {
      heading: "7. Data Transfers",
      content: "[Placeholder — details of any international data transfers and applicable safeguards to be added by legal counsel.]",
    },
    {
      heading: "8. Deletion or Return of Data",
      content: "On termination of the Service, the Processor will, at the Controller's choice, delete or return all personal data, and delete existing copies, unless applicable law requires retention.",
    },
    {
      heading: "9. Audit Rights",
      content: "The Controller may, with reasonable notice, conduct audits or inspections of the Processor's data processing activities, or commission a qualified auditor to do so on its behalf. The Processor will cooperate with such audits.",
    },
    {
      heading: "10. Duration",
      content: "This DPA remains in force for as long as the Processor processes personal data on behalf of the Controller, and terminates automatically on deletion of all personal data following account closure.",
    },
    {
      heading: "11. Contact",
      content: "For data processing enquiries, contact privacy@esgmanager.com.",
    },
  ],
};
