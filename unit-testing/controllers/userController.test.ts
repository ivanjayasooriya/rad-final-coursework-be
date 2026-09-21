jest.mock("../../src/models/userModel", () => ({
  UserModel: { findByIdAndUpdate: jest.fn(), findByIdAndDelete: jest.fn() },
}));
jest.mock("../../src/models/postModel", () => ({
  PostModel: { deleteMany: jest.fn() },
}));
jest.mock("../../src/models/boomarkModel", () => ({
  BookmarkModel: { deleteMany: jest.fn() },
}));
jest.mock("../../src/config/cloudinary", () => ({
  __esModule: true,
  default: { uploader: { upload_stream: jest.fn() } },
}));

import mongoose from "mongoose";
import {
  updateUser,
  deleteAccount,
  updateProfilePic,
} from "../../src/controller/userController";
import { UserModel } from "../../src/models/userModel";
import { PostModel } from "../../src/models/postModel";
import { BookmarkModel } from "../../src/models/boomarkModel";
import cloudinary from "../../src/config/cloudinary";
import { mockRequest, mockResponse, mockSession } from "../helpers/httpMocks";

const User = UserModel as unknown as Record<string, jest.Mock>;
const Post = PostModel as unknown as Record<string, jest.Mock>;
const Bookmark = BookmarkModel as unknown as Record<string, jest.Mock>;
const upload_stream = (cloudinary as any).uploader.upload_stream as jest.Mock;

describe("userController.updateUser", () => {
  it("returns 400 when username or email is missing", async () => {
    const res = mockResponse();
    await updateUser(mockRequest({ user: { sub: "1" }, body: { username: "a" } }), res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(User.findByIdAndUpdate).not.toHaveBeenCalled();
  });

  it("updates and returns the user", async () => {
    User.findByIdAndUpdate.mockResolvedValue({ username: "a", email: "a@a.com" });
    const res = mockResponse();
    await updateUser(
      mockRequest({ user: { sub: "1" }, body: { username: "a", email: "a@a.com" } }),
      res,
    );
    expect(User.findByIdAndUpdate).toHaveBeenCalledWith(
      "1", { username: "a", email: "a@a.com" }, { new: true },
    );
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it("returns 500 on DB error", async () => {
    User.findByIdAndUpdate.mockRejectedValue(new Error("db"));
    const res = mockResponse();
    await updateUser(
      mockRequest({ user: { sub: "1" }, body: { username: "a", email: "a@a.com" } }),
      res,
    );
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

describe("userController.deleteAccount", () => {
  it("deletes user, posts and bookmarks inside a transaction", async () => {
    const session = mockSession();
    jest.spyOn(mongoose, "startSession").mockResolvedValue(session as any);
    const res = mockResponse();

    await deleteAccount(mockRequest({ user: { sub: "1" } }), res);

    expect(User.findByIdAndDelete).toHaveBeenCalledWith("1", { session });
    expect(Post.deleteMany).toHaveBeenCalledWith({ author: "1" }, { session });
    expect(Bookmark.deleteMany).toHaveBeenCalledWith({ user: "1" }, { session });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(session.endSession).toHaveBeenCalled();
  });

  it("returns 500 and ends the session when the transaction fails", async () => {
    const session = mockSession();
    session.withTransaction.mockRejectedValue(new Error("tx"));
    jest.spyOn(mongoose, "startSession").mockResolvedValue(session as any);
    const res = mockResponse();

    await deleteAccount(mockRequest({ user: { sub: "1" } }), res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(session.endSession).toHaveBeenCalled();
  });
});

describe("userController.updateProfilePic", () => {
  it("uploads to the 'users' folder and stores the secure_url", async () => {
    const end = jest.fn();
    upload_stream.mockImplementation((_opts: any, cb: any) => {
      setImmediate(() => cb(null, { secure_url: "https://cdn/pic.png" }));
      return { end };
    });
    User.findByIdAndUpdate.mockResolvedValue({ profilePic: "https://cdn/pic.png" });
    const res = mockResponse();
    const file = { buffer: Buffer.from("x") };

    await updateProfilePic(mockRequest({ user: { sub: "1" }, file }), res);

    expect(upload_stream.mock.calls[0][0]).toEqual({ folder: "users" });
    expect(end).toHaveBeenCalledWith(file.buffer);
    expect(User.findByIdAndUpdate).toHaveBeenCalledWith(
      "1", { profilePic: "https://cdn/pic.png" }, { new: true },
    );
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it("sets an empty profilePic when no file is sent", async () => {
    User.findByIdAndUpdate.mockResolvedValue({});
    const res = mockResponse();
    await updateProfilePic(mockRequest({ user: { sub: "1" } }), res);
    expect(upload_stream).not.toHaveBeenCalled();
    expect(User.findByIdAndUpdate).toHaveBeenCalledWith(
      "1", { profilePic: "" }, { new: true },
    );
  });

  it("returns 500 when the Cloudinary upload fails", async () => {
    upload_stream.mockImplementation((_o: any, cb: any) => {
      setImmediate(() => cb(new Error("cloud"), null));
      return { end: jest.fn() };
    });
    const res = mockResponse();
    await updateProfilePic(
      mockRequest({ user: { sub: "1" }, file: { buffer: Buffer.from("x") } }),
      res,
    );
    expect(res.status).toHaveBeenCalledWith(500);
  });
});
