import { Link } from "wouter";

export function AppFooter() {
  return (
    <footer className="border-t bg-background mt-auto py-3 px-4 sm:px-6">
      <div className="max-w-screen-xl mx-auto flex flex-wrap items-center justify-between gap-x-6 gap-y-2 text-xs text-muted-foreground">
        <p>ESG Manager &copy; {new Date().getFullYear()}</p>
        <nav className="flex flex-wrap gap-x-4 gap-y-1 items-center">
          <Link href="/terms" className="hover:underline hover:text-foreground transition-colors">Terms of Service</Link>
          <Link href="/privacy" className="hover:underline hover:text-foreground transition-colors">Privacy Policy</Link>
          <Link href="/cookies" className="hover:underline hover:text-foreground transition-colors">Cookie Policy</Link>
          <Link href="/dpa" className="hover:underline hover:text-foreground transition-colors">DPA</Link>
          <span className="hidden sm:inline text-border">|</span>
          <Link href="/help" className="hover:underline hover:text-foreground transition-colors">Help &amp; Support</Link>
          <a href="mailto:support@esgmanager.com" className="hover:underline hover:text-foreground transition-colors">support@esgmanager.com</a>
          <Link href="/settings?tab=privacy" className="hover:underline hover:text-foreground transition-colors">Privacy &amp; Data Rights</Link>
        </nav>
      </div>
    </footer>
  );
}
