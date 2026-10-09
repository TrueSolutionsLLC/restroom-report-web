type AuthIdentity = {
  isAnonymous: boolean;
  displayName: string | null;
  email: string | null;
  photoURL: string | null;
  providerData: { providerId: string }[];
};

export function assertSameAccountSession(expectedUid: string | null, currentUid: string | null) {
  if (expectedUid === currentUid) return;
  const error = new Error("Your account changed while signing in. Please try again from the current account.");
  Object.assign(error, { code: "auth/session-changed" });
  throw error;
}

/** Only identity metadata is patched. Counters and reputation belong to their own write paths. */
export function profileIdentityPatch(user: AuthIdentity, existing: Record<string, unknown> | undefined, suppliedName?: string) {
  const existingName = typeof existing?.displayName === "string" ? existing.displayName.trim() : "";
  const providerName = user.displayName?.trim() || "";
  const storedName = !user.isAnonymous && existingName === "Guest Traveler" && providerName ? providerName : existingName;
  const displayName = suppliedName?.trim() || storedName || providerName || (user.isAnonymous ? "Guest Traveler" : "Traveler");
  const provider = user.isAnonymous ? "guest"
    : user.providerData.some(item => item.providerId === "apple.com") ? "apple"
      : user.providerData.some(item => item.providerId === "google.com") ? "google" : "firebase";
  return {
    displayName,
    authProvider: provider,
    isGuest: user.isAnonymous,
    ...(user.email ? { email: user.email } : {}),
    ...(user.photoURL ? { photoURL: user.photoURL } : {}),
  };
}

/** Prevent late network responses from leaking a previous account's count into the active account. */
export function latestAsyncRequest<T>(load: () => Promise<T>, onValue: (value: T) => void, onError: (error: Error) => void) {
  let disposed = false;
  let generation = 0;
  return {
    async refresh() {
      const request = ++generation;
      try {
        const value = await load();
        if (!disposed && request === generation) onValue(value);
      } catch (error) {
        if (!disposed && request === generation) onError(error instanceof Error ? error : new Error("Account data could not be loaded."));
      }
    },
    dispose() { disposed = true; generation += 1; },
  };
}
