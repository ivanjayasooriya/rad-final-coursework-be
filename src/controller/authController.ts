import { Request, Response } from "express";
import { UserModel, UserRole } from "../models/userModel";
import { signAccessToken, signRefreshToken } from "../service/tokens";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import dotenv from "dotenv";
import { AuthRequest } from "../middleware/auth";
import { verifyOtp } from "../service/otpService";
import { sendWelcomeEmail } from "../service/emailService";

dotenv.config();

// Environment variables
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET as string;

// User registration
export const registerUser = async (req: Request, res: Response) => {
  try {
    const { username, email, password } = req.body;

    // Check if user already exists
    const existingUser = await UserModel.findOne({
      $or: [{ username }, { email }],
    });
    if (existingUser) {
      return res
        .status(400)
        .json({ message: "Username or email already exists" });
    }

    // Hash the password
    const salt = await bcrypt.genSaltSync(10);
    const hashedPassword = await bcrypt.hashSync(password, salt);

    // Create new user
    const newUser = new UserModel({
      username,
      email,
      password: hashedPassword,
      roles: [UserRole.USER], // Default role
      approved: true,
    });

    // Save user to database
    await newUser.save();
    await sendWelcomeEmail(email, username);

    res.status(201).json({ message: "User registered successfully" });
  } catch (error) {
    res.status(500).json({ message: "Error registering user" });
  }
};

// User login
export const loginUser = async (req: Request, res: Response) => {
  try {
    const { username, password } = req.body;

    // Find user by username
    const user = await UserModel.findOne({ username });
    if (!user) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    // Check if the password is correct
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    // Generate access and refresh tokens
    const accessToken = signAccessToken(user);
    const refreshToken = signRefreshToken(user);

    res.status(200).json({
      message: "User logged in successfully",
      data: {
        id: user?._id,
        username: user?.username,
        roles: user?.roles,
        accessToken,
        refreshToken,
      },
    });
  } catch (error) {
    res.status(500).json({ message: "Error logging in user" });
  }
};

// Get my details
export const getMyDetails = async (req: AuthRequest, res: Response) => {
  if (!req.user) {
    return res.status(401).json({ message: "Unauthorized" });
  }
  // Password is not needed
  const user = await UserModel.findById(req.user.sub).select("-password");

  if (!user) {
    return res.status(404).json({ message: "User not found" });
  }

  if (!user.approved) {
    return res.status(403).json({ message: "User not approved" });
  }

  const { username, email, roles, _id, profilePic } = user;

  res.status(200).json({
    message: "ok",
    data: { id: _id, username, email, roles, profilePic },
  });
};

// Refresh token
export const refreshToken = async (req: Request, res: Response) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(400).json({ message: "Refresh token is required" });
    }

    // Verify refresh token
    const payload = jwt.verify(refreshToken, JWT_REFRESH_SECRET);

    // Find user by ID
    const user = await UserModel.findById(payload.sub);
    if (!user) {
      return res.status(400).json({ message: "Invalid refresh token" });
    }

    // Generate new access token
    const newAccessToken = signAccessToken(user);

    res.status(200).json({
      message: "Token refreshed successfully",
      data: {
        accessToken: newAccessToken,
      },
    });
  } catch (error) {
    res.status(500).json({ message: "Error refreshing token" });
  }
};

// Reset password
export const resetPassword = async (req: Request, res: Response) => {
  try {
    // TODO: implement password reset logic
    const { email, otp, newPassword } = req.body;

    if (!email || !otp || !newPassword) {
      return res
        .status(400)
        .json({ message: "Email, OTP, and new password are required" });
    }

    const result = await verifyOtp(
      email.trim().toLowerCase(),
      otp.toString().trim(),
    );

    if (!result.success) {
      return res.status(400).json({ message: result.message });
    }

    const user = await UserModel.findOne({ email: email.trim().toLowerCase() });

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Hash the new password
    const salt = await bcrypt.genSaltSync(10);
    const hashedPassword = await bcrypt.hashSync(newPassword, salt);

    user.password = hashedPassword;
    await user.save();

    res.status(200).json({ message: "Password reset successful" });
  } catch (error) {
    res.status(500).json({ message: "Error resetting password" });
  }
};
