import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Shield } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";

export function StepUpDialog({ open, onClose, onSuccess, actionLabel }: {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  actionLabel?: string;
}) {
  const { toast } = useToast();
  const [password, setPassword] = useState("");
  const [totpToken, setTotpToken] = useState("");
  const [backupCode, setBackupCode] = useState("");
  const [useTotpOrBackup, setUseTotpOrBackup] = useState<"totp" | "backup">("totp");

  const { data: mfaStatus } = useQuery<any>({ queryKey: ["/api/auth/mfa/status"] });
  const requiresMfa = mfaStatus?.mfaEnabled;

  const stepUpMutation = useMutation({
    mutationFn: async () => {
      const body: any = { password };
      if (requiresMfa) {
        if (useTotpOrBackup === "totp") body.totpToken = totpToken;
        else body.backupCode = backupCode;
      }
      const res = await apiRequest("POST", "/api/auth/step-up", body);
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Re-authentication failed");
      }
      return res.json();
    },
    onSuccess: () => {
      setPassword("");
      setTotpToken("");
      setBackupCode("");
      onSuccess();
    },
    onError: (e: any) => toast({ title: "Authentication failed", description: e.message, variant: "destructive" }),
  });

  if (!open) return null;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Shield className="w-4 h-4 text-primary" />
            Confirm Your Identity
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            {actionLabel
              ? `For your security, please verify your identity before ${actionLabel}.`
              : "This action requires re-authentication. Please verify your identity to continue."}
          </p>
          <div className="space-y-2">
            <Label className="text-xs">Password</Label>
            <Input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="Your current password"
              data-testid="input-stepup-password"
            />
          </div>
          {requiresMfa && (
            <div className="space-y-2">
              <div className="flex gap-2">
                <Button size="sm" variant={useTotpOrBackup === "totp" ? "default" : "outline"} onClick={() => setUseTotpOrBackup("totp")} className="text-xs">Authenticator</Button>
                <Button size="sm" variant={useTotpOrBackup === "backup" ? "default" : "outline"} onClick={() => setUseTotpOrBackup("backup")} className="text-xs">Backup Code</Button>
              </div>
              {useTotpOrBackup === "totp" ? (
                <Input value={totpToken} onChange={e => setTotpToken(e.target.value)} placeholder="6-digit code" maxLength={6} data-testid="input-stepup-totp" />
              ) : (
                <Input value={backupCode} onChange={e => setBackupCode(e.target.value)} placeholder="Backup code" data-testid="input-stepup-backup" />
              )}
            </div>
          )}
          <div className="flex gap-2 justify-end pt-1">
            <Button size="sm" variant="outline" onClick={onClose}>Cancel</Button>
            <Button
              size="sm"
              onClick={() => stepUpMutation.mutate()}
              disabled={stepUpMutation.isPending || !password || (requiresMfa && !totpToken && !backupCode)}
              data-testid="button-stepup-confirm"
            >
              {stepUpMutation.isPending ? "Verifying..." : "Confirm"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
