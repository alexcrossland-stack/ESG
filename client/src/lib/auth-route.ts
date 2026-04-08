export type AuthView =
  | "tabs"
  | "forgot"
  | "reset"
  | "forgot-sent"
  | "reset-done"
  | "invite"
  | "invite-invalid"
  | "mfa-verify"
  | "mfa-setup";

export function getResetTokenFromSearch(search: string): string | null {
  return new URLSearchParams(search).get("reset");
}

export function getInvitationTokenFromSearch(search: string): string | null {
  const params = new URLSearchParams(search);
  return params.get("token") ?? params.get("invitation");
}

export function getInitialAuthView(search: string): AuthView {
  if (getInvitationTokenFromSearch(search)) return "invite";
  if (getResetTokenFromSearch(search)) return "reset";
  return "tabs";
}
