jest.mock("../../src/service/emailService", () => ({
  sendOtpEmail: jest.fn(),
}));
jest.mock("../../src/models/otpModel", () => ({
  OtpModel: {
    findOneAndUpdate: jest.fn(),
    findOne: jest.fn(),
    deleteOne: jest.fn(),
    updateOne: jest.fn(),
  },
}));

import {
  createAndSendOtp,
  verifyOtp,
  peekOtp,
} from "../../src/service/otpService";
import { sendOtpEmail } from "../../src/service/emailService";
import { OtpModel } from "../../src/models/otpModel";

const Otp = OtpModel as unknown as Record<string, jest.Mock>;
const future = () => new Date(Date.now() + 60_000);
const past = () => new Date(Date.now() - 60_000);

describe("otpService.createAndSendOtp", () => {
  it("upserts a 6-digit OTP expiring in ~10 min and emails it", async () => {
    const now = Date.now();
    await createAndSendOtp("a@a.com");

    const [filter, update, opts] = Otp.findOneAndUpdate.mock.calls[0];
    expect(filter).toEqual({ email: "a@a.com" });
    expect(update.otp).toMatch(/^\d{6}$/);
    expect(update.attempts).toBe(0);
    const ttl = update.expiresAt.getTime() - now;
    expect(ttl).toBeGreaterThan(9.9 * 60 * 1000);
    expect(ttl).toBeLessThanOrEqual(10 * 60 * 1000 + 1000);
    expect(opts).toEqual(expect.objectContaining({ upsert: true }));
    expect(sendOtpEmail).toHaveBeenCalledWith("a@a.com", update.otp);
  });
});

describe("otpService.verifyOtp", () => {
  it("fails when no record exists", async () => {
    Otp.findOne.mockResolvedValue(null);
    const r = await verifyOtp("a@a.com", "123456");
    expect(r.success).toBe(false);
    expect(r.message).toMatch(/no otp/i);
  });

  it("fails and deletes an expired OTP", async () => {
    Otp.findOne.mockResolvedValue({ otp: "123456", expiresAt: past(), attempts: 0 });
    const r = await verifyOtp("a@a.com", "123456");
    expect(r).toEqual({ success: false, message: expect.stringMatching(/expired/i) });
    expect(Otp.deleteOne).toHaveBeenCalledWith({ email: "a@a.com" });
  });

  it("fails and deletes after too many attempts", async () => {
    Otp.findOne.mockResolvedValue({ otp: "123456", expiresAt: future(), attempts: 5 });
    const r = await verifyOtp("a@a.com", "123456");
    expect(r.success).toBe(false);
    expect(r.message).toMatch(/too many/i);
    expect(Otp.deleteOne).toHaveBeenCalled();
  });

  it("increments attempts on a wrong OTP", async () => {
    Otp.findOne.mockResolvedValue({ otp: "123456", expiresAt: future(), attempts: 1 });
    const r = await verifyOtp("a@a.com", "000000");
    expect(r.success).toBe(false);
    expect(r.message).toMatch(/incorrect/i);
    expect(Otp.updateOne).toHaveBeenCalledWith(
      { email: "a@a.com" },
      { $inc: { attempts: 1 } },
    );
    expect(Otp.deleteOne).not.toHaveBeenCalled();
  });

  it("succeeds and consumes the OTP when correct", async () => {
    Otp.findOne.mockResolvedValue({ otp: "123456", expiresAt: future(), attempts: 0 });
    const r = await verifyOtp("a@a.com", "123456");
    expect(r.success).toBe(true);
    expect(Otp.deleteOne).toHaveBeenCalledWith({ email: "a@a.com" });
  });
});

describe("otpService.peekOtp", () => {
  it("returns false with no record", async () => {
    Otp.findOne.mockResolvedValue(null);
    expect(await peekOtp("a@a.com", "1")).toBe(false);
  });

  it("returns false when expired", async () => {
    Otp.findOne.mockResolvedValue({ otp: "1", expiresAt: past() });
    expect(await peekOtp("a@a.com", "1")).toBe(false);
  });

  it("returns false on mismatch", async () => {
    Otp.findOne.mockResolvedValue({ otp: "1", expiresAt: future() });
    expect(await peekOtp("a@a.com", "2")).toBe(false);
  });

  it("returns true on match and does NOT consume the OTP", async () => {
    Otp.findOne.mockResolvedValue({ otp: "1", expiresAt: future() });
    expect(await peekOtp("a@a.com", "1")).toBe(true);
    expect(Otp.deleteOne).not.toHaveBeenCalled();
  });
});
