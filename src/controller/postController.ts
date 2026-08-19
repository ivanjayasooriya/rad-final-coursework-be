import { Response } from "express";
import cloudinary from "../config/cloudinary";
import { AuthRequest } from "../middleware/auth";
import { PostModel } from "../models/postModel";
import { BookmarkModel } from "../models/boomarkModel";
import { error } from "node:console";
import mongoose from "mongoose";

// Create post
export const createPost = async (req: AuthRequest, res: Response) => {
  const {
    status,
    petName,
    breed,
    color,
    lastSeenLocation,
    lastSeenDate,
    reward,
    contactPhone,
    contactEmail,
  } = req.body;

  try {
    // Upload image
    let imageURL = "";
    if (req.file) {
      const result: any = await new Promise((resolve, reject) => {
        const upload_stream = cloudinary.uploader.upload_stream(
          { folder: "posts" },
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
    } else {
      return res.status(400).json({
        error: "No image provided.",
        reason: "A valid image is required",
      });
    }

    const newPost = new PostModel({
      status,
      petName,
      breed,
      color,
      lastSeenLocation,
      lastSeenDate,
      reward,
      contactPhone,
      contactEmail,
      imageURL,
      author: req.user.sub,
      // author: '642f5c5d5c5d5c5c5c5c5c5c',
    });

    // Save post
    const savedPost = await newPost.save();
    res
      .status(201)
      .json({ message: "Post created successfully", data: savedPost });
  } catch (error) {
    res.status(500).json({ reason: "Error creating post", error });
  }
};

// Get all posts
export const getAllPosts = async (req: AuthRequest, res: Response) => {
  try {
    // Pagination
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const skip = (page - 1) * limit;

    const [posts, totalPosts] = await Promise.all([
      PostModel.find({})
        .skip(skip)
        .limit(limit)
        .populate("author", "username email profilePic"),
      PostModel.countDocuments(),
    ]);

    res.status(200).json({
      success: true,
      message: "Posts fetched successfully",
      data: posts,
      pagination: {
        currentPage: page,
        totalPosts: totalPosts,
        totalPages: Math.ceil(totalPosts / limit),
        limit,
      },
    });
  } catch (error) {
    res.status(500).json({ message: "Error fetching posts" });
  }
};

// Get my posts
export const getMyPosts = async (req: AuthRequest, res: Response) => {
  try {
    // Pagination
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const skip = (page - 1) * limit;

    const userId = req.user?.sub;

    if (!userId) {
      return res.status(400).json({ message: "User ID not found" });
    }

    const query = { author: userId };

    // Fetch posts
    const [posts, totalPosts] = await Promise.all([
      PostModel.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit),
      PostModel.countDocuments(query),
    ]);

    res.status(200).json({
      success: true,
      message: "Posts fetched successfully",
      data: posts,
      pagination: {
        currentPage: page,
        totalPosts: totalPosts,
        totalPages: Math.ceil(totalPosts / limit),
        limit,
      },
    });
  } catch (error) {
    res.status(500).json({ message: "Error fetching posts" });
  }
};

// Update post
export const updatePost = async (req: AuthRequest, res: Response) => {
  const {
    status,
    petName,
    breed,
    color,
    lastSeenLocation,
    lastSeenDate,
    reward,
    contactPhone,
    contactEmail,
  } = req.body;

  try {
    const postId = req.params.id;
    const userId = req.user?.sub;

    const post = await PostModel.findById(postId);
    if (!post) {
      return res.status(404).json({ reason: "Post not found" });
    }

    if (post.author.toString() !== userId) {
      return res.status(401).json({ reason: "Unauthorized access" });
    }

    // Upload image
    let imageURL = "";
    if (req.file) {
      const result: any = await new Promise((resolve, reject) => {
        const upload_stream = cloudinary.uploader.upload_stream(
          { folder: "posts" },
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
    } else {
      imageURL = post.imageURL?.toString();
    }

    const updatedPost = await PostModel.findByIdAndUpdate(
      postId,
      {
        status,
        petName,
        breed,
        color,
        lastSeenLocation,
        lastSeenDate,
        reward,
        contactPhone,
        contactEmail,
        imageURL,
      },
      {
        new: true,
      },
    );
    res
      .status(200)
      .json({ message: "Post updated successfully", data: updatedPost });
  } catch (error) {
    res.status(500).json({ reason: "Error updating post", error: error });
  }
};

// Delete post
export const deletePost = async (req: AuthRequest, res: Response) => {
  const session = await mongoose.startSession();
  
  try {
    const postId = req.params.id;
    const userId = req.user?.sub;

    if (!userId) {
      return res.status(400).json({ message: "User ID not found" });
    }

    const post = await PostModel.findById(postId);
    if (!post) {
      return res.status(404).json({ message: "Post not found" });
    }

    if (post.author.toString() !== userId) {
      return res.status(401).json({ message: "Unauthorized access" });
    }

    await session.withTransaction(async () => {
      await PostModel.find({ _id: postId, author: userId }).deleteOne();
      await BookmarkModel.deleteMany({ post: postId }, { session });
      res.status(200).json({ message: "Post deleted successfully" });
    });
  } catch (error) {
    res.status(500).json({ message: "Error deleting post" });
  } finally {
    session.endSession();
  }
};

// Bookmark post
export const bookmarkPost = async (req: AuthRequest, res: Response) => {
  try {
    const postId = req.params.id;
    const userId = req.user?.sub;

    if (!userId) {
      return res.status(400).json({ message: "User ID not found" });
    }

    // Add userId to post's bookmarks array
    const post = await PostModel.findById(postId);
    if (!post) {
      return res.status(404).json({ message: "Post not found" });
    }

    // Add userId to post's bookmarks array
    post.bookmark?.push(userId);
    await post.save();

    // Add to BookmarkModel
    const bookmark = new BookmarkModel({
      post: postId,
      user: userId,
    });
    await bookmark.save();

    res.status(200).json({ message: "Post bookmarked successfully" });
  } catch (error) {
    res.status(500).json({ message: "Error bookmarking post" });
  }
};

// Remove bookmark
export const removeBookmark = async (req: AuthRequest, res: Response) => {
  try {
    const postId = req.params.id;
    const userId = req.user?.sub;

    if (!userId) {
      return res.status(400).json({ message: "User ID not found" });
    }

    // Remove userId from post's bookmarks array
    const post = await PostModel.findById(postId);
    if (!post) {
      return res.status(404).json({ message: "Post not found" });
    }

    // Remove from BookmarkModel
    await BookmarkModel.deleteOne({ post: postId, user: userId });

    // type ObjectId[]
    post.bookmark = post.bookmark?.filter((id) => id.toString() !== userId);
    await post.save();

    res.status(200).json({ message: "Post bookmark removed successfully" });
  } catch (error) {
    res.status(500).json({ message: "Error removing bookmark" });
  }
};

// Get bookmark posts
export const getBookmarkPosts = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.sub;

    // Pagination
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const skip = (page - 1) * limit;

    const bookmarks = await BookmarkModel.find({ user: userId });

    const [posts, totalPosts] = await Promise.all([
      PostModel.find({
        _id: { $in: bookmarks.map((bookmark) => bookmark.post) },
      })
        .skip(skip)
        .limit(limit)
        .populate("author", "username"),
      PostModel.countDocuments({
        _id: { $in: bookmarks.map((bookmark) => bookmark.post) },
      }),
    ]);

    res.status(200).json({
      success: true,
      message: "Bookmark posts fetched successfully",
      data: posts,
      pagination: {
        currentPage: page,
        totalPosts: totalPosts,
        totalPages: Math.ceil(totalPosts / limit),
        limit,
      },
    });
  } catch (error) {
    res.status(500).json({ message: "Error fetching bookmark posts" });
    console.log(error);
  }
};
