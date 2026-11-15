import crypto from "crypto";

/**
 * A fresh, unguessable Seat code. Every Seat gets one when bought, and a new
 * one whenever an Invitation is made or withdrawn, so older links stop working.
 */
export function newSeatCode() {
  return crypto.randomBytes(12).toString("base64url");
}
