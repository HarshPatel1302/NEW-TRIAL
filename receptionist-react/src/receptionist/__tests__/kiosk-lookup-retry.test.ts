import { resolveMembersForDestinationWithRetries } from "../kiosk-lookup-retry";
import { resolveMembersForDestination } from "../member-directory";

jest.mock("../member-directory", () => ({
  resolveMembersForDestination: jest.fn(),
}));

const mockResolve = resolveMembersForDestination as jest.MockedFunction<typeof resolveMembersForDestination>;

describe("resolveMembersForDestinationWithRetries", () => {
  beforeEach(() => {
    mockResolve.mockReset();
  });

  test("returns first hit on first call", async () => {
    const hit = {
      configured: true,
      ok: true,
      query: "x",
      memberIds: [1],
      matchedMembers: [],
      totalCandidates: 1,
    };
    mockResolve.mockResolvedValueOnce(hit);
    const { result, attempts } = await resolveMembersForDestinationWithRetries("Acme", {
      searchMode: "company",
    });
    expect(attempts).toBe(1);
    expect(result).toBe(hit);
    expect(mockResolve).toHaveBeenCalledTimes(1);
  });

  test("retries with collapsed whitespace when first empty", async () => {
    const empty = {
      configured: true,
      ok: true,
      query: "",
      memberIds: [],
      matchedMembers: [],
      totalCandidates: 0,
    };
    const hit = { ...empty, memberIds: [2], matchedMembers: [], ok: true };
    mockResolve.mockResolvedValueOnce(empty);
    mockResolve.mockResolvedValueOnce(hit);
    const { attempts } = await resolveMembersForDestinationWithRetries("Acme    Corp", {
      searchMode: "company",
    });
    expect(attempts).toBe(2);
    expect(mockResolve).toHaveBeenNthCalledWith(
      2,
      "Acme Corp",
      expect.objectContaining({ searchMode: "company" })
    );
  });

  test("swaps secondary query when primary alone yields no hits", async () => {
    const empty = {
      configured: true,
      ok: true,
      query: "",
      memberIds: [],
      matchedMembers: [],
      totalCandidates: 0,
    };
    mockResolve
      .mockResolvedValueOnce(empty)
      .mockResolvedValueOnce({ ...empty, memberIds: [3], matchedMembers: [], ok: true });
    await resolveMembersForDestinationWithRetries("X", {
      secondaryQuery: "Y",
      searchMode: "company",
    });
    expect(mockResolve).toHaveBeenNthCalledWith(2, "Y", expect.objectContaining({ secondaryQuery: "X" }));
  });
});
