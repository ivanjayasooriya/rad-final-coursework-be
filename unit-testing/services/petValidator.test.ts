const mockGenerateContent = jest.fn();
jest.mock("@google/genai", () => ({
  GoogleGenAI: jest.fn().mockImplementation(() => ({
    models: { generateContent: mockGenerateContent },
  })),
  Type: { OBJECT: "OBJECT", BOOLEAN: "BOOLEAN", NUMBER: "NUMBER", STRING: "STRING" },
}));

import { validatePetImage } from "../../src/service/petValidator";

const buf = Buffer.from("fake-image");

describe("service/validatePetImage", () => {
  beforeEach(() => jest.spyOn(console, "error").mockImplementation(() => {}));

  it("parses and returns the Gemini JSON result", async () => {
    const result = {
      isRealAnimal: true,
      isOffensiveOrInappropriate: false,
      confidenceScore: 0.95,
      reasoning: "A dog.",
    };
    mockGenerateContent.mockResolvedValue({ text: JSON.stringify(result) });

    await expect(validatePetImage(buf, "image/png")).resolves.toEqual(result);
  });

  it("sends base64 inline data and JSON config to Gemini", async () => {
    mockGenerateContent.mockResolvedValue({
      text: JSON.stringify({ isRealAnimal: true, isOffensiveOrInappropriate: false }),
    });
    await validatePetImage(buf, "image/jpeg");

    const arg = mockGenerateContent.mock.calls[0][0];
    expect(arg.contents[1]).toEqual({
      inlineData: { data: buf.toString("base64"), mimeType: "image/jpeg" },
    });
    expect(arg.config.responseMimeType).toBe("application/json");
  });

  it("fails closed (rejects image) when the API throws", async () => {
    mockGenerateContent.mockRejectedValue(new Error("network"));
    const r = await validatePetImage(buf, "image/png");
    expect(r.isRealAnimal).toBe(false);
    expect(r.isOffensiveOrInappropriate).toBe(true);
    expect(r.confidenceScore).toBe(0);
  });

  it("fails closed when the response text is empty", async () => {
    mockGenerateContent.mockResolvedValue({ text: "" });
    const r = await validatePetImage(buf, "image/png");
    expect(r.isOffensiveOrInappropriate).toBe(true);
  });

  it("fails closed when the response is not valid JSON", async () => {
    mockGenerateContent.mockResolvedValue({ text: "not json" });
    const r = await validatePetImage(buf, "image/png");
    expect(r.isRealAnimal).toBe(false);
  });
});
