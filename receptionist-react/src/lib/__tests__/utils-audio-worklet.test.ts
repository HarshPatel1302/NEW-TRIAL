import { isAudioWorkletAvailable } from "../utils";

describe("isAudioWorkletAvailable", () => {
  it("is false when audioWorklet is missing", () => {
    const ctx = { audioWorklet: undefined } as unknown as AudioContext;
    expect(isAudioWorkletAvailable(ctx)).toBe(false);
  });

  it("is true when addModule is a function", () => {
    const ctx = {
      audioWorklet: { addModule: async () => undefined },
    } as unknown as AudioContext;
    expect(isAudioWorkletAvailable(ctx)).toBe(true);
  });
});
