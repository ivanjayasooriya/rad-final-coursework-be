import { Response } from "express";
import { AuthRequest } from "../middleware/auth";
import { UserModel, UserRole } from "../models/userModel";
import { PostModel, PostStatus } from "../models/postModel";
import { sendEmailToUser } from "../service/emailService";
import { BookmarkModel } from "../models/boomarkModel";
import mongoose from "mongoose";

// Delete post
export const deletePost = async (req: AuthRequest, res: Response) => {
  const session = await mongoose.startSession();
  
  try {
    const postId = req.params.id;

    await session.withTransaction(async () => {
      await PostModel.findByIdAndDelete(postId, { session });
      await BookmarkModel.deleteMany({ post: postId }, { session });
      
      res.status(200).json({ message: "Post deleted successfully" });
    });

    // const deletedPost = await PostModel.findByIdAndDelete(postId);
  } catch (error) {
    res.status(500).json({ message: "Error deleting post" });
  
  } finally {
    session.endSession();
  }
};

// Get all users
export const allUsers = async (req: AuthRequest, res: Response) => {
  try {
    const users = await UserModel.find({}).select("-password");
    res
      .status(200)
      .json({ message: "Users fetched successfully", data: users });
  } catch (error) {
    res.status(500).json({ message: "Error fetching users" });
  }
};

// Get all users(USER)
export const getAllUsers = async (req: AuthRequest, res: Response) => {
  try {
    const users = await UserModel.find({
      roles: { $in: [UserRole.USER] },
    }).select("-password");
    res
      .status(200)
      .json({ message: "Users fetched successfully", data: users });
  } catch (error) {
    res.status(500).json({ message: "Error fetching users" });
  }
};

// Delete user
export const deleteUser = async (req: AuthRequest, res: Response) => {
  const session = await mongoose.startSession();
  
  try {
    await session.withTransaction(async () => {
      await UserModel.findByIdAndDelete(req.params.id, { session });
      await PostModel.deleteMany({ author: req.params.id }, { session });
      await BookmarkModel.deleteMany({ user: req.params.id }, { session });
      res.status(200).json({ message: "User deleted successfully" });
    });
  } catch (error) {
    res.status(500).json({ message: "Error deleting user" });
  } finally {
    session.endSession();
  }
};

// Ban user
export const banUser = async (req: AuthRequest, res: Response) => {
  try {
    const user = await UserModel.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    // user.banned = true;
    await user.save();
    res.status(200).json({ message: "User banned successfully" });
  } catch (error) {
    res.status(500).json({ message: "Error banning user" });
  }
};

// Unban user
export const unbanUser = async (req: AuthRequest, res: Response) => {
  try {
    const user = await UserModel.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    // user.banned = false;
    await user.save();
    res.status(200).json({ message: "User unbanned successfully" });
  } catch (error) {
    res.status(500).json({ message: "Error unbanning user" });
  }
};

// Change user role
export const changeRole = async (req: AuthRequest, res: Response) => {
  try {
    const user = await UserModel.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const role = req.params.role;

    if (role === "USER") {
      user.roles = [UserRole.USER];
    } else if (role === "MODERATOR") {
      user.roles = [UserRole.MODERATOR];
    } else {
      return res.status(400).json({ message: "Invalid role" });
    }

    await user.save();

    res.status(200).json({ message: "User role changed successfully" });
  } catch (error) {
    res.status(500).json({ message: "Error changing user role" });
  }
};

// Send email
export const sendEmail = async (req: AuthRequest, res: Response) => {
  try {
    const { email, subject, body } = req.body;
    await sendEmailToUser(email, subject, body);

    res.status(200).json({ message: "Email sent successfully" });
  } catch (error) {
    res.status(500).json({ message: "Error sending email" });
  }
};

// Get dashboard summary
export const getDashboardSummary = async (
  req: AuthRequest,
  res: Response,
): Promise<void> => {
  try {
    // Running aggregate counts in parallel for optimal response speed
    const [totalUsers, totalPosts, totalBookmarks, pendingApprovals] =
      await Promise.all([
        UserModel.countDocuments(),
        PostModel.countDocuments(),
        BookmarkModel.countDocuments(),
        UserModel.countDocuments({ approved: false }),
      ]);

    res.status(200).json({
      totalUsers,
      totalPosts,
      totalBookmarks,
      pendingApprovals,
    });
  } catch (error) {
    console.error("Error in getDashboardSummary controller:", error);
    res
      .status(500)
      .json({ message: "Internal server error summarizing system metrics." });
  }
};

// Get post velocity metrics
export const getPostVelocityMetrics = async (
  req: AuthRequest,
  res: Response,
): Promise<void> => {
  try {
    // Dynamically calculate timestamp for 5 months ago
    const fiveMonthsAgo = new Date();
    fiveMonthsAgo.setMonth(fiveMonthsAgo.getMonth() - 4);
    fiveMonthsAgo.setDate(1);
    fiveMonthsAgo.setHours(0, 0, 0, 0);

    // MongoDB Aggregation Pipeline to group posts by month
    const velocityData = await PostModel.aggregate([
      {
        $match: {
          createdAt: { $gte: fiveMonthsAgo },
        },
      },
      {
        $group: {
          _id: {
            year: { $year: "$createdAt" },
            month: { $month: "$createdAt" },
          },
          count: { $sum: 1 },
        },
      },
      {
        $sort: { "_id.year": 1, "_id.month": 1 },
      },
    ]);

    // Format array month tags mapping (e.g., Month 1 -> 'Jan')
    const monthNames = [
      "Jan",
      "Feb",
      "Mar",
      "Apr",
      "May",
      "Jun",
      "Jul",
      "Aug",
      "Sep",
      "Oct",
      "Nov",
      "Dec",
    ];

    // Find highest monthly post count to establish a proper CSS percentage ceiling
    const counts = velocityData.map((d) => d.count);
    const maxCount = counts.length > 0 ? Math.max(...counts) : 1;

    // Generate clean baseline tracking layout for the 5-month frame
    const result = [];
    for (let i = 4; i >= 0; i--) {
      const d = new Date();
      d.setMonth(d.getMonth() - i);
      const targetMonth = d.getMonth() + 1;
      const targetYear = d.getFullYear();

      const matchedMonth = velocityData.find(
        (v) => v._id.month === targetMonth && v._id.year === targetYear,
      );

      const count = matchedMonth ? matchedMonth.count : 0;
      // Calculate layout percentage height string for Tailwind UI consumption
      const percentageHeight = `${Math.round((count / maxCount) * 100)}%`;

      result.push({
        month: monthNames[targetMonth - 1],
        percentageHeight: count === 0 ? "4%" : percentageHeight, // Baseline visible block fallback
      });
    }

    res.status(200).json(result);
  } catch (error) {
    console.error("Error in getPostVelocityMetrics controller:", error);
    res.status(500).json({
      message: "Internal server error parsing velocity analytics pipelines.",
    });
  }
};

// Get case allocations
export const getCaseAllocations = async (
  req: AuthRequest,
  res: Response,
): Promise<void> => {
  try {
    const [lostCount, foundCount] = await Promise.all([
      PostModel.countDocuments({ status: PostStatus.LOST }),
      PostModel.countDocuments({ status: PostStatus.FOUND }),
    ]);

    const total = lostCount + foundCount;

    if (total === 0) {
      return void res
        .status(200)
        .json({ lostPetPercentage: 50, foundPetPercentage: 50 });
    }

    res.status(200).json({
      lostPetPercentage: Math.round((lostCount / total) * 100),
      foundPetPercentage: Math.round((foundCount / total) * 100),
    });
  } catch (error) {
    console.error("Error in getCaseAllocations controller:", error);
    res.status(500).json({
      message: "Internal server error compiling percentage allocations.",
    });
  }
};
