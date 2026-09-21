const mockSendMail = jest.fn().mockResolvedValue({});
jest.mock("nodemailer", () => ({
  __esModule: true,
  default: { createTransport: jest.fn(() => ({ sendMail: mockSendMail })) },
}));

import {
  sendEmailToUser,
  sendWelcomeEmail,
  sendOtpEmail,
} from "../../src/service/emailService";

describe("service/emailService", () => {
  it("sendEmailToUser sends the given subject/body to the recipient", async () => {
    await sendEmailToUser("to@x.com", "Hi", "<p>Body</p>");
    expect(mockSendMail).toHaveBeenCalledWith(
      expect.objectContaining({ to: "to@x.com", subject: "Hi", html: "<p>Body</p>" }),
    );
  });

  it("sendWelcomeEmail includes the username in the HTML", async () => {
    await sendWelcomeEmail("to@x.com", "rex");
    const arg = mockSendMail.mock.calls[0][0];
    expect(arg.to).toBe("to@x.com");
    expect(arg.subject).toMatch(/WELCOME/);
    expect(arg.html).toContain("@rex");
  });

  it("sendWelcomeEmail falls back to NEW_HERO without a username", async () => {
    await sendWelcomeEmail("to@x.com", "");
    expect(mockSendMail.mock.calls[0][0].html).toContain("NEW_HERO");
  });

  it("sendOtpEmail includes the OTP in the HTML", async () => {
    await sendOtpEmail("to@x.com", "482913");
    const arg = mockSendMail.mock.calls[0][0];
    expect(arg.html).toContain("482913");
    expect(arg.to).toBe("to@x.com");
  });

  it("propagates transport errors", async () => {
    mockSendMail.mockRejectedValueOnce(new Error("smtp down"));
    await expect(sendOtpEmail("to@x.com", "1")).rejects.toThrow("smtp down");
  });
});
