import { Response } from "express";
import { UserModel } from "../models/userModel";
import { AuthRequest } from "../middleware/auth";
import cloudinary from "../config/cloudinary";
import mongoose from "mongoose";
import { PostModel } from "../models/postModel";
import { BookmarkModel } from "../models/boomarkModel";

// Update user
export const updateUser = async (req: AuthRequest, res: Response) => {
  try {
    const { username, email } = req.body;
    const userId = req.user.sub;

    if (!userId || !username || !email) {
      return res.status(400).json({ message: "Missing required fields" });
    }

    const user = await UserModel.findByIdAndUpdate(
      userId,
      { username, email },
      {
        new: true,
      },
    );
    res.status(200).json({ message: "User updated successfully", data: user });
  } catch (error) {
    res.status(500).json({ message: "Error updating user" });
  }
};

// Delete account
export const deleteAccount = async (req: AuthRequest, res: Response) => {
  const session = await mongoose.startSession();

  try {
    const userId = req.user.sub;

    await session.withTransaction(async () => {
      await UserModel.findByIdAndDelete(userId, { session });
      await PostModel.deleteMany({ author: userId }, { session });
      await BookmarkModel.deleteMany({ user: userId }, { session });
      
      res.status(200).json({ message: "Account deleted successfully" });
    });

    // const user = await UserModel.findByIdAndDelete(userId);
  } catch (error) {
    res.status(500).json({ message: "Error deleting account" });
  } finally {
    session.endSession();
  }
};

// Update profile pic
export const updateProfilePic = async (req: AuthRequest, res: Response) => {
  try {
    let imageURL = "";
    if (req.file) {
      const result: any = await new Promise((resolve, reject) => {
        const upload_stream = cloudinary.uploader.upload_stream(
          { folder: "users" },
          (error: any, result: any) => {
            if (error) {
              return reject(error);
            } else {
              resolve(result);
            }
          },
        );
        upload_stream.end(req.file?.buffer);
      });
      imageURL = result.secure_url;
    }

    const user = await UserModel.findByIdAndUpdate(
      req.user.sub,
      { profilePic: imageURL },
      { new: true },
    );
    res.status(200).json({ message: "User updated successfully", data: user });
  } catch (error) {
    res.status(500).json({ message: "Error updating user" });
  }
};
