// import crypto from "crypto";
// import { sendOtpEmail } from "./emailService";

// // Interface for OTP record
// interface OtpRecord {
//   otp: string;
//   expiresAt: number; // unix ms
//   attempts: number;
// }

// // In-memory store: keyed by email
// const otpStore = new Map<string, OtpRecord>();

// const OTP_TTL_MS = 10 * 60 * 1000; // 10 minutes
// const MAX_ATTEMPTS = 5;

// // Generate a random 6-digit OTP
// const generateOtp = (): string => crypto.randomInt(100000, 999999).toString();

// // Function to create and send an OTP
// export const createAndSendOtp = async (email: string): Promise<void> => {
//   const otp = generateOtp();

//   otpStore.set(email, {
//     otp,
//     expiresAt: Date.now() + OTP_TTL_MS,
//     attempts: 0,
//   });

//   await sendOtpEmail(email, otp);
// };

// // Function to verify an OTP
// export const verifyOtp = (
//   email: string,
//   submittedOtp: string,
// ): { success: boolean; message: string } => {
//   const record = otpStore.get(email);

//   if (!record) {
//     return {
//       success: false,
//       message: "No OTP found for this email. Please request a new one.",
//     };
//   }

//   // Check if the OTP has expired
//   if (Date.now() > record.expiresAt) {
//     otpStore.delete(email);
//     return {
//       success: false,
//       message: "OTP has expired. Please request a new one.",
//     };
//   }

//   // Check if the OTP has been used too many times
//   if (record.attempts >= MAX_ATTEMPTS) {
//     otpStore.delete(email);
//     return {
//       success: false,
//       message: "Too many incorrect attempts. Please request a new OTP.",
//     };
//   }

//   // Check if the OTP is correct
//   if (record.otp !== submittedOtp) {
//     record.attempts += 1;
//     return { success: false, message: "Incorrect OTP. Please try again." };
//   }

//   // Valid — consume it so it can't be reused
//   otpStore.delete(email);
//   return { success: true, message: "OTP verified successfully." };
// };

// // Function to peek at an OTP
// export const peekOtp = (email: string, submittedOtp: string): boolean => {
//   const record = otpStore.get(email);
//   if (!record) return false;
//   if (Date.now() > record.expiresAt) return false;
//   return record.otp === submittedOtp;
// };

import crypto from "crypto";
import { sendOtpEmail } from "./emailService";
import { OtpModel } from "../models/otpModel";

const OTP_TTL_MS = 10 * 60 * 1000; // 10 minutes
const MAX_ATTEMPTS = 5;

// Generate a random 6-digit OTP
const generateOtp = (): string => crypto.randomInt(100000, 999999).toString();

// Function to create and send an OTP
export const createAndSendOtp = async (email: string): Promise<void> => {
  const otp = generateOtp();
  const expiresAt = new Date(Date.now() + OTP_TTL_MS);

  // upsert: true handles updating an existing OTP if they request a new one
  await OtpModel.findOneAndUpdate(
    { email },
    {
      otp,
      expiresAt,
      attempts: 0,
    },
    { upsert: true, new: true },
  );

  await sendOtpEmail(email, otp);
};

// Function to verify an OTP
export const verifyOtp = async (
  email: string,
  submittedOtp: string,
): Promise<{ success: boolean; message: string }> => {
  const record = await OtpModel.findOne({ email });

  if (!record) {
    return {
      success: false,
      message: "No OTP found or it has expired. Please request a new one.",
    };
  }

  // Double check expiration manually in case MongoDB's background TTL cleaner hasn't run yet
  if (new Date() > record.expiresAt) {
    await OtpModel.deleteOne({ email });
    return {
      success: false,
      message: "OTP has expired. Please request a new one.",
    };
  }

  // Check if the OTP has been tried too many times
  if (record.attempts >= MAX_ATTEMPTS) {
    await OtpModel.deleteOne({ email });
    return {
      success: false,
      message: "Too many incorrect attempts. Please request a new OTP.",
    };
  }

  // Check if the OTP is incorrect
  if (record.otp !== submittedOtp) {
    // Increment wrong attempts in the database
    await OtpModel.updateOne({ email }, { $inc: { attempts: 1 } });
    return { success: false, message: "Incorrect OTP. Please try again." };
  }

  // Valid — consume it so it can't be reused
  await OtpModel.deleteOne({ email });
  return { success: true, message: "OTP verified successfully." };
};

// Function to peek at an OTP
export const peekOtp = async (
  email: string,
  submittedOtp: string,
): Promise<boolean> => {
  const record = await OtpModel.findOne({ email });
  if (!record) return false;
  if (new Date() > record.expiresAt) return false;
  return record.otp === submittedOtp;
};