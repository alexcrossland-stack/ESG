import { useRoute } from "wouter";
import { TERMS_OF_SERVICE, PRIVACY_POLICY, COOKIE_POLICY, DPA, LEGAL_REVIEW_NOTICE, type LegalDocument } from "@/lib/legal-content";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertTriangle, ArrowLeft } from "lucide-react";
import { Link } from "wouter";

function LegalPage({ doc }: { doc: LegalDocument }) {
  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-3xl mx-auto px-4 py-10 space-y-6">
        <Link href="/auth">
          <button className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-2">
            <ArrowLeft className="w-4 h-4" /> Back
          </button>
        </Link>

        <Alert variant="destructive" className="border-amber-400 bg-amber-50 dark:bg-amber-950/20 text-amber-900 dark:text-amber-200">
          <AlertTriangle className="w-4 h-4 text-amber-600" />
          <AlertDescription className="text-xs leading-relaxed">
            <strong>Legal Review Required:</strong> {LEGAL_REVIEW_NOTICE}
          </AlertDescription>
        </Alert>

        <div>
          <h1 className="text-2xl font-bold">{doc.title}</h1>
          <p className="text-sm text-muted-foreground mt-1">Version {doc.version} — Last updated: {doc.lastUpdated}</p>
        </div>

        <p className="text-sm text-muted-foreground leading-relaxed">{doc.intro}</p>

        <div className="space-y-6">
          {doc.sections.map((section, i) => (
            <div key={i} className="space-y-2">
              <h2 className="text-base font-semibold">{section.heading}</h2>
              <p className="text-sm text-muted-foreground leading-relaxed">{section.content}</p>
            </div>
          ))}
        </div>

        <div className="border-t pt-6 text-xs text-muted-foreground space-y-1">
          <p>ESG Manager — Version {doc.version} — {doc.lastUpdated}</p>
          <p>For legal enquiries: <a href="mailto:legal@esgmanager.com" className="underline">legal@esgmanager.com</a></p>
          <p>For privacy enquiries: <a href="mailto:privacy@esgmanager.com" className="underline">privacy@esgmanager.com</a></p>
        </div>
      </div>
    </div>
  );
}

export function TermsPage() { return <LegalPage doc={TERMS_OF_SERVICE} />; }
export function PrivacyPage() { return <LegalPage doc={PRIVACY_POLICY} />; }
export function CookiesPage() { return <LegalPage doc={COOKIE_POLICY} />; }
export function DpaPage() { return <LegalPage doc={DPA} />; }
