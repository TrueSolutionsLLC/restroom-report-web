export const WELCOME_GUIDE_VERSION = 1;
export const WELCOME_GUIDE_STORAGE_KEY = "rr-welcome-guide";

type CompletionStorage = Pick<Storage, "getItem" | "setItem">;

function browserStorage(): CompletionStorage | undefined {
  try { return typeof window === "undefined" ? undefined : window.localStorage; }
  catch { return undefined; }
}

/** Call after mount so the initial server/client rendering remains identical. */
export function hasCompletedWelcomeGuide(storage: CompletionStorage | undefined = browserStorage()): boolean {
  if (!storage) return false;
  try {
    const raw = storage.getItem(WELCOME_GUIDE_STORAGE_KEY);
    if (!raw) return false;
    const record = JSON.parse(raw) as { version?: unknown; completedAt?: unknown } | null;
    return record?.version === WELCOME_GUIDE_VERSION
      && typeof record.completedAt === "string" && Number.isFinite(Date.parse(record.completedAt));
  } catch { return false; }
}

/** A denied write never prevents the traveler from continuing for this session. */
export function completeWelcomeGuide(storage: CompletionStorage | undefined = browserStorage(), now = Date.now()): boolean {
  if (!storage || !Number.isFinite(now)) return false;
  try {
    storage.setItem(WELCOME_GUIDE_STORAGE_KEY, JSON.stringify({ version: WELCOME_GUIDE_VERSION, completedAt: new Date(now).toISOString() }));
    return true;
  } catch { return false; }
}
