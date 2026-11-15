/**
 * What a module's operations return: success with its data, or one named
 * reason it was refused. Operations never throw `data()`; routes turn reasons
 * into messages, status codes and redirects.
 */
export type Result<T extends object, Reason extends string> =
  | ({ ok: true } & T)
  | { ok: false; reason: Reason };

export function refuse<Reason extends string>(reason: Reason) {
  return { ok: false as const, reason };
}
