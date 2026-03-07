import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Form, FormControl, FormField, FormItem, FormLabel } from "@/components/ui/form";
import { useForm } from "react-hook-form";
import { useToast } from "@/hooks/use-toast";
import { Settings as SettingsIcon, Building2, Clock, Save } from "lucide-react";
import { format } from "date-fns";

const INDUSTRIES = [
  "Construction", "Education", "Energy & Utilities", "Financial Services",
  "Food & Beverage", "Healthcare", "Hospitality & Tourism", "IT & Technology",
  "Legal & Professional Services", "Manufacturing", "Media & Communications",
  "Retail", "Transport & Logistics", "Other",
];

const REVENUE_BANDS = [
  "Under £1m", "£1m – £5m", "£5m – £25m", "£25m – £100m", "Over £100m",
];

const COUNTRIES = [
  "United Kingdom", "Ireland", "United States", "Canada", "Australia",
  "New Zealand", "Germany", "France", "Netherlands", "Other",
];

export default function Settings() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [formInitialized, setFormInitialized] = useState(false);

  const { data: authData, isLoading: authLoading } = useQuery<any>({ queryKey: ["/api/auth/me"] });
  const { data: company, isLoading: companyLoading } = useQuery<any>({ queryKey: ["/api/company"] });
  const { data: auditLogs = [], isLoading: logsLoading } = useQuery<any[]>({ queryKey: ["/api/audit-logs"] });

  const companyForm = useForm({
    defaultValues: {
      name: "",
      industry: "",
      country: "",
      employeeCount: "",
      revenueBand: "",
      locations: "1",
    },
  });

  if (company && !formInitialized) {
    companyForm.reset({
      name: company.name || "",
      industry: company.industry || "",
      country: company.country || "",
      employeeCount: String(company.employeeCount || ""),
      revenueBand: company.revenueBand || "",
      locations: String(company.locations || "1"),
    });
    setFormInitialized(true);
  }

  const updateCompanyMutation = useMutation({
    mutationFn: (data: any) => apiRequest("PUT", "/api/company", {
      ...data,
      employeeCount: parseInt(data.employeeCount) || null,
      locations: parseInt(data.locations) || 1,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/company"] });
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      toast({ title: "Company details updated" });
    },
    onError: () => toast({ title: "Update failed", variant: "destructive" }),
  });

  if (authLoading || companyLoading) {
    return <div className="p-6 space-y-4">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-40" />)}</div>;
  }

  const user = authData?.user;

  return (
    <div className="p-6 space-y-6 max-w-3xl mx-auto">
      <div>
        <h1 className="text-xl font-semibold flex items-center gap-2">
          <SettingsIcon className="w-5 h-5 text-primary" />
          Settings
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Manage your company profile and account preferences
        </p>
      </div>

      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="text-sm flex items-center gap-2">
            <Building2 className="w-4 h-4 text-primary" />
            Company Details
          </CardTitle>
          <CardDescription className="text-xs">
            This information is used in your ESG reports
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...companyForm}>
            <form onSubmit={companyForm.handleSubmit(d => updateCompanyMutation.mutate(d))} className="space-y-4">
              <FormField control={companyForm.control} name="name" render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-xs">Company Name</FormLabel>
                  <FormControl><Input {...field} data-testid="input-company-name" /></FormControl>
                </FormItem>
              )} />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FormField control={companyForm.control} name="industry" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs">Industry</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-industry"><SelectValue placeholder="Select industry" /></SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {INDUSTRIES.map(i => <SelectItem key={i} value={i}>{i}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </FormItem>
                )} />
                <FormField control={companyForm.control} name="country" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs">Country</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-country"><SelectValue placeholder="Select country" /></SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {COUNTRIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </FormItem>
                )} />
                <FormField control={companyForm.control} name="employeeCount" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs">Number of Employees</FormLabel>
                    <FormControl><Input type="number" placeholder="e.g. 50" {...field} data-testid="input-employee-count" /></FormControl>
                  </FormItem>
                )} />
                <FormField control={companyForm.control} name="revenueBand" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs">Revenue Band</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-revenue"><SelectValue placeholder="Select range" /></SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {REVENUE_BANDS.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </FormItem>
                )} />
                <FormField control={companyForm.control} name="locations" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs">Number of Locations</FormLabel>
                    <FormControl><Input type="number" min="1" placeholder="1" {...field} data-testid="input-locations" /></FormControl>
                  </FormItem>
                )} />
              </div>
              <div className="flex justify-end pt-2">
                <Button type="submit" size="sm" disabled={updateCompanyMutation.isPending} data-testid="button-save-company">
                  <Save className="w-3.5 h-3.5 mr-1.5" />
                  {updateCompanyMutation.isPending ? "Saving..." : "Save Details"}
                </Button>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="text-sm">Account Information</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between py-2 border-b border-border">
            <div>
              <p className="text-sm font-medium" data-testid="text-username">{user?.username}</p>
              <p className="text-xs text-muted-foreground">{user?.email}</p>
            </div>
            <Badge variant="secondary">{user?.role}</Badge>
          </div>
          <p className="text-xs text-muted-foreground">
            Password changes are coming in a future update.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Clock className="w-4 h-4" />
            Activity Log
          </CardTitle>
          <CardDescription className="text-xs">Recent changes in your ESG platform</CardDescription>
        </CardHeader>
        <CardContent>
          {logsLoading ? (
            <Skeleton className="h-32" />
          ) : auditLogs.length === 0 ? (
            <p className="text-xs text-muted-foreground">No activity recorded yet.</p>
          ) : (
            <div className="space-y-1 max-h-64 overflow-y-auto">
              {auditLogs.map((log: any) => (
                <div key={log.id} className="flex items-start gap-3 py-2 border-b border-border last:border-0 text-xs" data-testid={`log-${log.id}`}>
                  <div className="w-1.5 h-1.5 rounded-full bg-primary mt-1.5 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium">{log.action}</p>
                    {log.entityType && (
                      <p className="text-muted-foreground capitalize">{log.entityType}</p>
                    )}
                  </div>
                  <p className="text-muted-foreground shrink-0">
                    {log.createdAt ? format(new Date(log.createdAt), "dd MMM HH:mm") : ""}
                  </p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
