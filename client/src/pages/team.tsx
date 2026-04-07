import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useBillingStatus, UpgradeLimitBanner } from "@/components/upgrade-prompt";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { Users } from "lucide-react";
import { usePermissions } from "@/lib/permissions";
import { Redirect } from "wouter";

const ROLES = [
  { value: "admin", label: "Admin", desc: "Full access to all features and settings" },
  { value: "contributor", label: "Contributor", desc: "Can enter data, edit policies, answer questionnaires" },
  { value: "approver", label: "Approver", desc: "Can review submissions and generate reports" },
  { value: "viewer", label: "Viewer", desc: "Read-only access across the platform" },
];

export default function TeamPage() {
  const { isAdmin } = usePermissions();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { isPro } = useBillingStatus();
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("contributor");
  const [selectedCompanyId, setSelectedCompanyId] = useState("");

  const { data: authData } = useQuery<any>({
    queryKey: ["/api/auth/me"],
  });
  const user = authData?.user;
  const isPlatformSuperAdmin = user?.role === "super_admin";

  const { data: users, isLoading } = useQuery<any[]>({
    queryKey: ["/api/users"],
  });
  const { data: companiesData } = useQuery<any>({
    queryKey: ["/api/companies"],
    enabled: isPlatformSuperAdmin,
  });
  const companies = useMemo(() => {
    if (Array.isArray(companiesData)) return companiesData;
    if (Array.isArray(companiesData?.companies)) return companiesData.companies;
    return [];
  }, [companiesData]);
  const selectedCompanyName = companies.find((company: any) => company.id === selectedCompanyId)?.name;

  const updateRoleMutation = useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: string }) => {
      await apiRequest("PUT", `/api/users/${userId}/role`, { role });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      queryClient.invalidateQueries({ queryKey: ["/api/audit-logs"] });
      toast({ title: "Role updated", description: "User role has been changed successfully." });
    },
    onError: (e: any) => {
      toast({ title: "Failed to update role", description: e.message || "Something went wrong", variant: "destructive" });
    },
  });
  const inviteUserMutation = useMutation({
    mutationFn: async () => {
      const body: Record<string, string> = {
        email: inviteEmail.trim(),
        role: inviteRole,
      };

      if (isPlatformSuperAdmin) {
        body.companyId = selectedCompanyId;
        const companyName = selectedCompanyName || "Unknown company";
        console.log("[team] Inviting user into company:", companyName);
        toast({
          title: "Preparing invite",
          description: `Target company: ${companyName}`,
        });
      }

      await apiRequest("POST", "/api/users/invite", body);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      queryClient.invalidateQueries({ queryKey: ["/api/audit-logs"] });
      toast({ title: "Invitation sent", description: `An invite has been sent to ${inviteEmail.trim()}.` });
      setInviteEmail("");
      setInviteRole("contributor");
      setSelectedCompanyId("");
    },
    onError: (e: any) => {
      toast({ title: "Failed to send invite", description: e.message || "Something went wrong", variant: "destructive" });
    },
  });

  if (!isAdmin) {
    return <Redirect to="/" />;
  }

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-semibold" data-testid="heading-team">Team</h1>
        <p className="text-sm text-muted-foreground mt-1">Manage your team members and their roles</p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {ROLES.map(r => (
          <div key={r.value} className="border border-border rounded-md p-2">
            <p className="text-xs font-medium capitalize">{r.label}</p>
            <p className="text-[10px] text-muted-foreground">{r.desc}</p>
          </div>
        ))}
      </div>

      {!isPro && users && (
        <UpgradeLimitBanner
          current={users.length}
          limit={3}
          noun="Team seats"
          feature="team-seats"
          valueMessage="Invite your full team on Pro — assign roles, share responsibilities, and collaborate on your ESG programme."
          data-testid="banner-seat-limit"
        />
      )}

      <Card data-testid="card-team-invite">
        <CardHeader className="pb-4">
          <CardTitle className="text-sm flex items-center gap-2">
            <Users className="w-4 h-4" />
            Invite Team Member
          </CardTitle>
          <CardDescription className="text-xs">
            {isPlatformSuperAdmin
              ? "Send an invite into any company and assign the initial role."
              : "Invite a teammate into your current company and assign the initial role."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {isPlatformSuperAdmin && (
            <div className="space-y-1">
              <Label htmlFor="invite-company">Target company</Label>
              <Select value={selectedCompanyId} onValueChange={setSelectedCompanyId}>
                <SelectTrigger id="invite-company" data-testid="select-invite-company">
                  <SelectValue placeholder="Select company" />
                </SelectTrigger>
                <SelectContent>
                  {companies.map((company: any) => (
                    <SelectItem key={company.id} value={company.id} data-testid={`option-invite-company-${company.id}`}>
                      {company.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="grid gap-3 sm:grid-cols-[1fr_180px_auto] sm:items-end">
            <div className="space-y-1">
              <Label htmlFor="invite-email">Email address</Label>
              <Input
                id="invite-email"
                type="email"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                placeholder="name@company.com"
                data-testid="input-invite-email"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="invite-role">Role</Label>
              <Select value={inviteRole} onValueChange={setInviteRole}>
                <SelectTrigger id="invite-role" data-testid="select-invite-role">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ROLES.map((r) => (
                    <SelectItem key={r.value} value={r.value} data-testid={`option-invite-role-${r.value}`}>
                      {r.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              onClick={() => inviteUserMutation.mutate()}
              disabled={!inviteEmail.trim() || inviteUserMutation.isPending || (isPlatformSuperAdmin && !selectedCompanyId)}
              data-testid="button-send-invite"
            >
              Send invite
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card data-testid="card-team-users">
        <CardHeader className="pb-4">
          <CardTitle className="text-sm flex items-center gap-2">
            <Users className="w-4 h-4" />
            User &amp; Role Management
          </CardTitle>
          <CardDescription className="text-xs">
            Assign roles to control what each team member can access
            {!isPro && <span className="ml-1 text-amber-600 dark:text-amber-400 font-medium">· Free plan: 3 seats max</span>}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {isLoading ? (
            <Skeleton className="h-24" />
          ) : !users || users.length === 0 ? (
            <p className="text-xs text-muted-foreground">No users found.</p>
          ) : (
            users.map((u: any) => (
              <div
                key={u.id}
                className="flex items-center justify-between py-2 px-3 border border-border rounded-md"
                data-testid={`user-row-${u.id}`}
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate" data-testid={`text-user-name-${u.id}`}>{u.username}</p>
                  <p className="text-xs text-muted-foreground truncate">{u.email}</p>
                </div>
                <Select
                  value={u.role}
                  onValueChange={(role) => updateRoleMutation.mutate({ userId: u.id, role })}
                  disabled={updateRoleMutation.isPending}
                >
                  <SelectTrigger className="w-[140px] h-8 text-xs" data-testid={`select-role-${u.id}`}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ROLES.map((r) => (
                      <SelectItem key={r.value} value={r.value} data-testid={`option-role-${r.value}`}>
                        {r.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
