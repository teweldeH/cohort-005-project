/**
 * An email address as Seats store and compare it: trimmed and lower-cased,
 * so any letter case of the same address matches an Invitation.
 */
export function normaliseEmail(email: string) {
  return email.trim().toLowerCase();
}
