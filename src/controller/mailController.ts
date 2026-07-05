import { Request, Response } from "express";
import { createAndSendOtp, peekOtp } from "../service/otpService";

// OTP Controller
export const sendOtp = async (req: Request, res: Response): Promise<void> => {
  const { email } = req.body;

  if (!email || typeof email !== "string") {
    res.status(400).json({ message: "A valid email address is required." });
    return;
  }

  try {
    await createAndSendOtp(email.trim().toLowerCase());
    res.status(200).json({ message: "OTP sent successfully." });
  } catch (error) {
    console.error("sendOtp error:", error);
    res.status(500).json({ message: "Failed to send OTP. Please try again." });
  }
};

// Verify OTP
export const verifyOtpController = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const { email, otp } = req.body;

  if (!email || !otp) {
    res.status(400).json({ message: "Email and OTP are required." });
    return;
  }

  const result = await peekOtp(
    email.trim().toLowerCase(),
    otp.toString().trim(),
  );

  if (!result) {
    res.status(400).json({ message: "Invalid email or OTP." });
    return;
  }

  res.status(200).json({ message: "OTP verified successfully." });
};
