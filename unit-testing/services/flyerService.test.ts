jest.mock("axios");

import axios from "axios";
import { PassThrough } from "stream";
import { generatePetFlyer, FlyerData } from "../../src/service/flyerService";

const base: FlyerData = {
  status: "LOST",
  petName: "Rex",
  breed: "Labrador",
  color: "Black",
  lastSeenLocation: "Central Park",
  lastSeenDate: "2026-01-01",
  reward: "$100",
  contactPhone: ["0771234567", "0719876543"],
  contactEmail: "a@a.com, b@b.com",
  imageUrl: "",
};

const collect = (s: PassThrough) =>
  new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];
    s.on("data", (c) => chunks.push(c));
    s.on("end", () => resolve(Buffer.concat(chunks)));
    s.on("error", reject);
  });

describe("service/generatePetFlyer", () => {
  it("returns a stream containing a valid PDF", async () => {
    const pdf = await collect(await generatePetFlyer(base));
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
    expect(pdf.length).toBeGreaterThan(500);
  });

  it("does not download an image when imageUrl is empty", async () => {
    await collect(await generatePetFlyer(base));
    expect(axios.get).not.toHaveBeenCalled();
  });

  it("still produces a PDF when the image download fails", async () => {
    jest.spyOn(console, "warn").mockImplementation(() => {});
    (axios.get as jest.Mock).mockRejectedValue(new Error("timeout"));
    const pdf = await collect(
      await generatePetFlyer({ ...base, imageUrl: "http://bad/img.png" }),
    );
    expect(axios.get).toHaveBeenCalledWith(
      "http://bad/img.png",
      expect.objectContaining({ responseType: "arraybuffer" }),
    );
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
  });

  it("handles FOUND status with no reward or contacts", async () => {
    const pdf = await collect(
      await generatePetFlyer({
        ...base,
        status: "FOUND",
        reward: undefined,
        contactPhone: [],
        contactEmail: "",
      }),
    );
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
  });
});
