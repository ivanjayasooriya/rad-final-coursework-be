import { Document, model, Schema } from "mongoose";

export interface IOtp extends Document {
  email: string;
  otp: string;
  expiresAt: Date; // Required for MongoDB TTL indexing
  attempts: number;
}

const otpSchema = new Schema<IOtp>(
  {
    email: { type: String, required: true, unique: true },
    otp: { type: String, required: true },
    attempts: { type: Number, required: true, default: 0 },
    // MongoDB will automatically delete this document at the specified Date
    expiresAt: { type: Date, required: true, index: { expires: 0 } },
  },
  { timestamps: true },
);

export const OtpModel = model<IOtp>("Otp", otpSchema);
