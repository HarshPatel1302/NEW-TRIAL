import {
  resolveMembersForDestination,
  type MemberLookupResult,
  type MemberSearchMode,
} from "./member-directory";

export type ResolveWithRetriesOptions = {
  secondaryQuery?: string;
  maxResults?: number;
  searchMode?: MemberSearchMode;
};

/**
 * Capped retries for directory/company search: normalized spacing and swapped primary/secondary query.
 */
export async function resolveMembersForDestinationWithRetries(
  primaryQuery: string,
  options: ResolveWithRetriesOptions = {}
): Promise<{ result: MemberLookupResult; attempts: number }> {
  const primary = String(primaryQuery || "").trim();
  const secondary = String(options.secondaryQuery || "").trim();

  let attempts = 0;
  const run = async (p: string, sec: string) => {
    attempts += 1;
    return resolveMembersForDestination(p, {
      ...options,
      secondaryQuery: sec,
    });
  };

  let last = await run(primary, secondary);
  if (last.ok && last.matchedMembers.length > 0) {
    return { result: last, attempts };
  }

  const collapsed = primary.replace(/\s+/g, " ").trim();
  if (collapsed && collapsed !== primary) {
    last = await run(collapsed, secondary);
    if (last.ok && last.matchedMembers.length > 0) {
      return { result: last, attempts };
    }
  }

  if (secondary && secondary !== primary && secondary !== collapsed) {
    last = await run(secondary, primary);
    if (last.ok && last.matchedMembers.length > 0) {
      return { result: last, attempts };
    }
  }

  return { result: last, attempts };
}
