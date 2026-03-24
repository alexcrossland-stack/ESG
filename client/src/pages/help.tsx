import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import {
  Search, HelpCircle, BarChart3, FileText, MessageSquare, CheckCircle,
  Zap, ClipboardList, Shield, Users, ChevronRight, BookOpen, X,
} from "lucide-react";
import { Link, useLocation } from "wouter";
import {
  searchArticles, getFeaturedArticles, getArticlesByCategory,
  HELP_CATEGORIES, HELP_ARTICLES, type HelpCategory, type HelpArticle,
} from "@/lib/help-content";

const CATEGORY_ICONS: Record<HelpCategory, any> = {
  "Getting Started": Zap,
  "Adding Data": ClipboardList,
  "Score and Progress": BarChart3,
  "Reports": FileText,
  "Compliance": Shield,
  "Account and Team": Users,
  "Troubleshooting": HelpCircle,
};

const supportSchema = z.object({
  category: z.string().min(1, "Please select a category"),
  subject: z.string().min(5, "Subject must be at least 5 characters").max(200, "Subject too long"),
  message: z.string().min(20, "Please describe your issue in at least 20 characters").max(5000, "Message too long"),
});

function ArticleCard({ article }: { article: HelpArticle }) {
  return (
    <Link href={`/help/${article.slug}`} data-testid={`link-article-${article.slug}`}>
      <div className="flex items-start gap-2.5 p-3 rounded-lg hover:bg-muted/50 transition-colors cursor-pointer group border border-transparent hover:border-border">
        <BookOpen className="w-3.5 h-3.5 text-muted-foreground shrink-0 mt-0.5" />
        <div className="min-w-0">
          <p className="text-sm font-medium text-foreground group-hover:text-primary transition-colors leading-tight">{article.title}</p>
          <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed line-clamp-2">{article.summary}</p>
        </div>
        <ChevronRight className="w-3.5 h-3.5 text-muted-foreground shrink-0 mt-0.5 ml-auto opacity-0 group-hover:opacity-100 transition-opacity" />
      </div>
    </Link>
  );
}

function CategoryCard({ category }: { category: typeof HELP_CATEGORIES[0] }) {
  const Icon = CATEGORY_ICONS[category.name];
  const articles = getArticlesByCategory(category.name);
  return (
    <Link href={`/help?category=${encodeURIComponent(category.name)}`} data-testid={`link-category-${category.name.replace(/\s+/g, "-").toLowerCase()}`}>
      <Card className="hover:shadow-sm transition-shadow cursor-pointer hover:border-primary/30 h-full">
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
              <Icon className="w-4 h-4 text-primary" />
            </div>
            <div className="min-w-0">
              <p className="font-semibold text-sm">{category.name}</p>
              <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{category.description}</p>
              <p className="text-xs text-muted-foreground mt-2 font-medium">{articles.length} {articles.length === 1 ? "guide" : "guides"}</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

function SupportForm({ user, company }: { user: any; company: any }) {
  const { toast } = useToast();
  const [location] = useLocation();
  const [refNumber, setRefNumber] = useState<string | null>(null);

  const form = useForm<z.infer<typeof supportSchema>>({
    resolver: zodResolver(supportSchema),
    defaultValues: { category: "", subject: "", message: "" },
  });

  const mutation = useMutation({
    mutationFn: async (data: z.infer<typeof supportSchema>) => {
      const res = await apiRequest("POST", "/api/support-requests", {
        ...data,
        pageContext: location,
        userName: user?.username,
        userEmail: user?.email,
        companyName: company?.name,
      });
      return res.json();
    },
    onSuccess: (data) => {
      setRefNumber(data.refNumber);
      form.reset();
    },
    onError: (e: any) => {
      toast({ title: "Failed to send", description: e.message || "Something went wrong", variant: "destructive" });
    },
  });

  if (refNumber) {
    return (
      <div className="flex flex-col items-center gap-3 py-8 text-center" data-testid="support-success">
        <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
          <CheckCircle className="w-6 h-6 text-primary" />
        </div>
        <div>
          <p className="font-semibold">Support request sent</p>
          <p className="text-sm text-muted-foreground mt-1">
            Your reference number is{" "}
            <span className="font-mono font-semibold text-foreground" data-testid="support-ref-number">{refNumber}</span>
          </p>
          <p className="text-xs text-muted-foreground mt-2">We typically respond within 1–2 business days.</p>
        </div>
        <Button size="sm" variant="outline" onClick={() => setRefNumber(null)} data-testid="button-new-request">
          Send another request
        </Button>
      </div>
    );
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(d => mutation.mutate(d))} className="space-y-4" data-testid="support-form">
        <FormField control={form.control} name="category" render={({ field }) => (
          <FormItem>
            <FormLabel>Category</FormLabel>
            <Select onValueChange={field.onChange} value={field.value}>
              <FormControl>
                <SelectTrigger data-testid="select-support-category">
                  <SelectValue placeholder="Select a category" />
                </SelectTrigger>
              </FormControl>
              <SelectContent>
                <SelectItem value="general">General question</SelectItem>
                <SelectItem value="technical">Technical issue</SelectItem>
                <SelectItem value="billing">Billing</SelectItem>
                <SelectItem value="data">Data or reporting query</SelectItem>
                <SelectItem value="privacy">Privacy or data rights</SelectItem>
                <SelectItem value="feedback">Feedback or feature request</SelectItem>
              </SelectContent>
            </Select>
            <FormMessage />
          </FormItem>
        )} />
        <FormField control={form.control} name="subject" render={({ field }) => (
          <FormItem>
            <FormLabel>Subject</FormLabel>
            <FormControl>
              <Input placeholder="Brief summary of your question" {...field} data-testid="input-support-subject" />
            </FormControl>
            <FormMessage />
          </FormItem>
        )} />
        <FormField control={form.control} name="message" render={({ field }) => (
          <FormItem>
            <FormLabel>Message</FormLabel>
            <FormControl>
              <Textarea
                placeholder="Please describe your question or issue in as much detail as possible..."
                className="min-h-[120px] resize-y"
                {...field}
                data-testid="textarea-support-message"
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        )} />
        <div className="text-xs text-muted-foreground space-y-1">
          <p>Submitting as: <span className="font-medium">{user?.email}</span> ({company?.name})</p>
          <p>Current page: <span className="font-mono">{location}</span></p>
        </div>
        <Button type="submit" disabled={mutation.isPending} className="w-full" data-testid="button-submit-support">
          {mutation.isPending ? "Sending..." : "Send Support Request"}
        </Button>
      </form>
    </Form>
  );
}

export default function HelpPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState<HelpCategory | null>(null);
  const [showContact, setShowContact] = useState(false);
  const [location] = useLocation();

  const { data: authData } = useQuery<{ user: any; company: any }>({ queryKey: ["/api/auth/me"] });
  const user = authData?.user;
  const company = authData?.company;

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const cat = params.get("category") as HelpCategory | null;
    if (cat && HELP_CATEGORIES.some(c => c.name === cat)) setActiveCategory(cat);
    if (params.get("contact") === "1") setShowContact(true);
  }, [location]);

  const searchResults = searchQuery.trim() ? searchArticles(searchQuery) : [];
  const isSearching = searchQuery.trim().length > 0;

  const displayArticles = activeCategory
    ? getArticlesByCategory(activeCategory)
    : null;

  const featured = getFeaturedArticles();

  return (
    <div className="p-4 sm:p-6 max-w-4xl mx-auto space-y-6 pb-12">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold">Help Centre</h1>
        <p className="text-muted-foreground text-sm">{HELP_ARTICLES.length} guides covering every part of ESG Manager</p>
      </div>

      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
          <Input
            placeholder="Search guides — try 'score', 'evidence', 'report'..."
            className="pl-9 pr-9"
            value={searchQuery}
            onChange={e => {
              setSearchQuery(e.target.value);
              if (e.target.value) setActiveCategory(null);
            }}
            data-testid="input-help-search"
          />
          {searchQuery && (
            <button
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              onClick={() => setSearchQuery("")}
              data-testid="button-clear-search"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
        <Button
          variant={showContact ? "default" : "outline"}
          onClick={() => setShowContact(!showContact)}
          data-testid="button-contact-support"
          className="shrink-0"
        >
          <MessageSquare className="w-4 h-4 mr-1.5" />
          Contact Support
        </Button>
      </div>

      {showContact && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Contact Support</CardTitle>
            <CardDescription>
              Our team typically responds within 1–2 business days. For urgent issues, email{" "}
              <a href="mailto:support@esgmanager.com" className="underline">support@esgmanager.com</a> directly.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <SupportForm user={user} company={company} />
          </CardContent>
        </Card>
      )}

      {isSearching && (
        <div className="space-y-3">
          {searchResults.length > 0 ? (
            <>
              <p className="text-sm text-muted-foreground">{searchResults.length} {searchResults.length === 1 ? "guide" : "guides"} found for "{searchQuery}"</p>
              <div className="space-y-1">
                {searchResults.map(article => (
                  <ArticleCard key={article.slug} article={article} />
                ))}
              </div>
            </>
          ) : (
            <div className="text-center py-10 space-y-2">
              <HelpCircle className="w-8 h-8 text-muted-foreground mx-auto" />
              <p className="text-sm text-muted-foreground">No guides found for "{searchQuery}"</p>
              <p className="text-xs text-muted-foreground">Try different words, or contact support below.</p>
              <Button size="sm" variant="outline" onClick={() => setShowContact(true)} data-testid="button-contact-no-results">
                Contact Support
              </Button>
            </div>
          )}
        </div>
      )}

      {!isSearching && activeCategory && (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setActiveCategory(null)}
              className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1"
              data-testid="button-back-to-categories"
            >
              ← All categories
            </button>
            <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
            <span className="text-sm font-medium">{activeCategory}</span>
          </div>
          <div className="space-y-1">
            {(displayArticles ?? []).map(article => (
              <ArticleCard key={article.slug} article={article} />
            ))}
          </div>
        </div>
      )}

      {!isSearching && !activeCategory && (
        <>
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Zap className="w-4 h-4 text-primary" />
              <h2 className="text-sm font-semibold">Start here</h2>
            </div>
            <div className="grid sm:grid-cols-2 gap-2">
              {featured.map(article => (
                <ArticleCard key={article.slug} article={article} />
              ))}
            </div>
          </div>

          <div className="space-y-3">
            <h2 className="text-sm font-semibold">Browse by topic</h2>
            <div className="grid sm:grid-cols-2 gap-3">
              {HELP_CATEGORIES.map(cat => (
                <CategoryCard key={cat.name} category={cat} />
              ))}
            </div>
          </div>
        </>
      )}

      <Card className="bg-muted/40 border-dashed">
        <CardContent className="flex items-center gap-4 py-4">
          <MessageSquare className="w-5 h-5 text-muted-foreground shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium">Still need help?</p>
            <p className="text-xs text-muted-foreground">
              Our support team is here for you at{" "}
              <a href="mailto:support@esgmanager.com" className="underline">support@esgmanager.com</a>
            </p>
          </div>
          <Button size="sm" variant="outline" onClick={() => setShowContact(true)} data-testid="button-contact-bottom">
            Get in touch
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
