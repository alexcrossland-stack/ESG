import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Leaf } from "lucide-react";

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="max-w-md w-full text-center space-y-6">
        <div className="flex items-center justify-center">
          <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center">
            <Leaf className="w-7 h-7 text-primary" />
          </div>
        </div>
        <div>
          <p className="text-7xl font-bold text-primary/20 select-none">404</p>
          <h1 className="text-2xl font-bold mt-2">Page not found</h1>
          <p className="text-muted-foreground mt-2 text-sm">
            The page you're looking for doesn't exist or may have been moved.
          </p>
        </div>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link href="/">
            <Button data-testid="button-go-home">Go to dashboard</Button>
          </Link>
          <Link href="/help">
            <Button variant="outline" data-testid="button-get-help">Get help</Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
