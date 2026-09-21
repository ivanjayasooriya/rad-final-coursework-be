jest.mock("../../src/service/otpService", () => ({
  createAndSendOtp: jest.fn(),
  peekOtp: jest.fn(),
}));

import { sendOtp, verifyOtpController } from "../../src/controller/mailController";
import { createAndSendOtp, peekOtp } from "../../src/service/otpService";
import { mockRequest, mockResponse } from "../helpers/httpMocks";

describe("mailController.sendOtp", () => {
  beforeEach(() => jest.spyOn(console, "error").mockImplementation(() => {}));

  it.each([undefined, "", 123])("returns 400 for invalid email %p", async (email) => {
    const res = mockResponse();
    await sendOtp(mockRequest({ body: { email } }), res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(createAndSendOtp).not.toHaveBeenCalled();
  });

  it("trims/lower-cases the email and returns 200", async () => {
    const res = mockResponse();
    await sendOtp(mockRequest({ body: { email: "  User@X.COM " } }), res);
    expect(createAndSendOtp).toHaveBeenCalledWith("user@x.com");
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it("returns 500 when sending fails", async () => {
    (createAndSendOtp as jest.Mock).mockRejectedValue(new Error("smtp"));
    const res = mockResponse();
    await sendOtp(mockRequest({ body: { email: "a@a.com" } }), res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

describe("mailController.verifyOtpController", () => {
  it("returns 400 if email or otp is missing", async () => {
    const res = mockResponse();
    await verifyOtpController(mockRequest({ body: { email: "a@a.com" } }), res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(peekOtp).not.toHaveBeenCalled();
  });

  it("returns 400 when the OTP does not match", async () => {
    (peekOtp as jest.Mock).mockResolvedValue(false);
    const res = mockResponse();
    await verifyOtpController(mockRequest({ body: { email: "a@a.com", otp: "1" } }), res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it("normalises input and returns 200 for a matching OTP", async () => {
    (peekOtp as jest.Mock).mockResolvedValue(true);
    const res = mockResponse();
    await verifyOtpController(
      mockRequest({ body: { email: " A@A.com ", otp: 123456 } }), res,
    );
    expect(peekOtp).toHaveBeenCalledWith("a@a.com", "123456");
    expect(res.status).toHaveBeenCalledWith(200);
  });
});
