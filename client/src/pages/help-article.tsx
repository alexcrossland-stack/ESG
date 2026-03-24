import { useParams } from "wouter";
import { Link } from "wouter";
import { ChevronRight, ArrowLeft, BookOpen } from "lucide-react";
import { getArticleBySlug, getArticlesByCategory, HELP_ARTICLES } from "@/lib/help-content";
import { HelpSectionRenderer, RelatedGuides } from "@/components/help";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export default function HelpArticlePage() {
  const params = useParams<{ slug: string }>();
  const article = getArticleBySlug(params.slug);

  if (!article) {
    return (
      <div className="p-4 sm:p-6 max-w-3xl mx-auto text-center py-20 space-y-4">
        <BookOpen className="w-10 h-10 text-muted-foreground mx-auto" />
        <h1 className="text-xl font-semibold">Guide not found</h1>
        <p className="text-muted-foreground text-sm">This guide does not exist or may have moved.</p>
        <Link href="/help">
          <Button variant="outline" size="sm">
            <ArrowLeft className="w-4 h-4 mr-1.5" />
            Back to Help Centre
          </Button>
        </Link>
      </div>
    );
  }

  const relatedArticles = HELP_ARTICLES.filter(a => article.relatedArticles.includes(a.slug));
  const categoryArticles = getArticlesByCategory(article.category).filter(a => a.slug !== article.slug);

  return (
    <div className="p-4 sm:p-6 max-w-3xl mx-auto space-y-6 pb-12">
      <nav className="flex items-center gap-1.5 text-xs text-muted-foreground flex-wrap" aria-label="Breadcrumb">
        <Link href="/help" data-testid="link-help-breadcrumb-home">
          <span className="hover:text-foreground transition-colors cursor-pointer">Help Centre</span>
        </Link>
        <ChevronRight className="w-3 h-3 shrink-0" />
        <Link href={`/help?category=${encodeURIComponent(article.category)}`} data-testid="link-help-breadcrumb-category">
          <span className="hover:text-foreground transition-colors cursor-pointer">{article.category}</span>
        </Link>
        <ChevronRight className="w-3 h-3 shrink-0" />
        <span className="text-foreground font-medium truncate max-w-[200px]">{article.title}</span>
      </nav>

      <div className="space-y-2">
        <Badge variant="secondary" className="text-xs font-normal">{article.category}</Badge>
        <h1 className="text-2xl font-bold leading-tight" data-testid="help-article-title">{article.title}</h1>
        <p className="text-muted-foreground text-sm leading-relaxed">{article.summary}</p>
      </div>

      <div className="space-y-6 pt-2">
        {article.sections.map((section, i) => (
          <HelpSectionRenderer key={i} section={section} />
        ))}
      </div>

      <RelatedGuides articles={relatedArticles} />

      {categoryArticles.length > 0 && (
        <div className="pt-6 border-t">
          <h3 className="text-sm font-semibold text-foreground mb-3">More in {article.category}</h3>
          <div className="space-y-1.5">
            {categoryArticles.map(a => (
              <Link key={a.slug} href={`/help/${a.slug}`} data-testid={`link-category-article-${a.slug}`}>
                <div className="flex items-center gap-2 px-3 py-2 rounded-md hover:bg-muted/50 transition-colors cursor-pointer group text-sm">
                  <ChevronRight className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                  <span className="text-muted-foreground group-hover:text-foreground transition-colors">{a.title}</span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      <div className="pt-6 border-t flex items-center justify-between flex-wrap gap-3">
        <Link href="/help">
          <Button variant="outline" size="sm" data-testid="button-back-to-help">
            <ArrowLeft className="w-4 h-4 mr-1.5" />
            Help Centre
          </Button>
        </Link>
        <Link href="/help?contact=1">
          <Button variant="ghost" size="sm" className="text-muted-foreground" data-testid="button-contact-from-article">
            Still need help? Contact support
          </Button>
        </Link>
      </div>
    </div>
  );
}
