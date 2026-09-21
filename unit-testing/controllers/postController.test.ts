jest.mock("../../src/models/postModel", () => {
  const PostModel: any = jest.fn();
  Object.assign(PostModel, {
    find: jest.fn(),
    findById: jest.fn(),
    findByIdAndUpdate: jest.fn(),
    countDocuments: jest.fn(),
  });
  return { PostModel, PostStatus: { LOST: "LOST", FOUND: "FOUND" } };
});
jest.mock("../../src/models/boomarkModel", () => {
  const BookmarkModel: any = jest.fn();
  Object.assign(BookmarkModel, { find: jest.fn(), deleteOne: jest.fn(), deleteMany: jest.fn() });
  return { BookmarkModel };
});
jest.mock("../../src/config/cloudinary", () => ({
  __esModule: true,
  default: { uploader: { upload_stream: jest.fn() } },
}));

import mongoose from "mongoose";
import {
  createPost, getAllPosts, getMyPosts, updatePost, deletePost,
  bookmarkPost, removeBookmark, getBookmarkPosts,
} from "../../src/controller/postController";
import { PostModel } from "../../src/models/postModel";
import { BookmarkModel } from "../../src/models/boomarkModel";
import cloudinary from "../../src/config/cloudinary";
import { mockRequest, mockResponse, mockSession, chainable } from "../helpers/httpMocks";

const Post = PostModel as unknown as jest.Mock & Record<string, jest.Mock>;
const Bookmark = BookmarkModel as unknown as jest.Mock & Record<string, jest.Mock>;
const upload_stream = (cloudinary as any).uploader.upload_stream as jest.Mock;

const mockUploadOk = (url = "https://cdn/p.png") =>
  upload_stream.mockImplementation((_o: any, cb: any) => {
    setImmediate(() => cb(null, { secure_url: url }));
    return { end: jest.fn() };
  });

const body = {
  status: "LOST", petName: "Rex", breed: "Lab", color: "Black",
  lastSeenLocation: "Park", lastSeenDate: "2026-01-01",
  reward: "$50", contactPhone: ["077"], contactEmail: ["a@a.com"],
};
const file = { buffer: Buffer.from("x") };

beforeEach(() => jest.spyOn(console, "log").mockImplementation(() => {}));

describe("postController.createPost", () => {
  it("returns 400 when no image is provided", async () => {
    const res = mockResponse();
    await createPost(mockRequest({ body, user: { sub: "u1" } }), res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(Post).not.toHaveBeenCalled();
  });

  it("uploads image to 'posts', saves the post with author = req.user.sub, returns 201", async () => {
    mockUploadOk("https://cdn/new.png");
    const saved = { _id: "p1" };
    const save = jest.fn().mockResolvedValue(saved);
    Post.mockImplementation((d: any) => ({ ...d, save }));
    const res = mockResponse();

    await createPost(mockRequest({ body, file, user: { sub: "u1" } }), res);

    expect(upload_stream.mock.calls[0][0]).toEqual({ folder: "posts" });
    expect(Post).toHaveBeenCalledWith(
      expect.objectContaining({ ...body, imageURL: "https://cdn/new.png", author: "u1" }),
    );
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith({ message: "Post created successfully", data: saved });
  });

  it("returns 500 when saving fails", async () => {
    mockUploadOk();
    Post.mockImplementation(() => ({ save: jest.fn().mockRejectedValue(new Error("db")) }));
    const res = mockResponse();
    await createPost(mockRequest({ body, file, user: { sub: "u1" } }), res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

describe("postController.getAllPosts", () => {
  it("defaults to page 1 / limit 10 and returns pagination info", async () => {
    const q = chainable([{ _id: 1 }]);
    Post.find.mockReturnValue(q);
    Post.countDocuments.mockResolvedValue(25);
    const res = mockResponse();

    await getAllPosts(mockRequest(), res);

    expect(q.skip).toHaveBeenCalledWith(0);
    expect(q.limit).toHaveBeenCalledWith(10);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json.mock.calls[0][0].pagination).toEqual({
      currentPage: 1, totalPosts: 25, totalPages: 3, limit: 10,
    });
  });

  it("honours page and limit query params", async () => {
    const q = chainable([]);
    Post.find.mockReturnValue(q);
    Post.countDocuments.mockResolvedValue(45);
    const res = mockResponse();
    await getAllPosts(mockRequest({ query: { page: "3", limit: "5" } }), res);
    expect(q.skip).toHaveBeenCalledWith(10);
    expect(q.limit).toHaveBeenCalledWith(5);
    expect(res.json.mock.calls[0][0].pagination.totalPages).toBe(9);
  });

  it("returns 500 on DB error", async () => {
    Post.find.mockImplementation(() => { throw new Error("db"); });
    const res = mockResponse();
    await getAllPosts(mockRequest(), res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

describe("postController.getMyPosts", () => {
  it("returns 400 without a user id", async () => {
    const res = mockResponse();
    await getMyPosts(mockRequest(), res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it("filters by author and sorts newest first", async () => {
    const q = chainable([]);
    Post.find.mockReturnValue(q);
    Post.countDocuments.mockResolvedValue(0);
    const res = mockResponse();
    await getMyPosts(mockRequest({ user: { sub: "u1" } }), res);
    expect(Post.find).toHaveBeenCalledWith({ author: "u1" });
    expect(q.sort).toHaveBeenCalledWith({ createdAt: -1 });
    expect(res.status).toHaveBeenCalledWith(200);
  });
});

describe("postController.updatePost", () => {
  const post = { author: { toString: () => "u1" }, imageURL: "old.png" };

  it("returns 404 when post does not exist", async () => {
    Post.findById.mockResolvedValue(null);
    const res = mockResponse();
    await updatePost(mockRequest({ params: { id: "p1" }, user: { sub: "u1" }, body }), res);
    expect(res.status).toHaveBeenCalledWith(404);
  });

  it("returns 401 when the requester is not the author", async () => {
    Post.findById.mockResolvedValue(post);
    const res = mockResponse();
    await updatePost(mockRequest({ params: { id: "p1" }, user: { sub: "other" }, body }), res);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(Post.findByIdAndUpdate).not.toHaveBeenCalled();
  });

  it("keeps the existing image when none is uploaded", async () => {
    Post.findById.mockResolvedValue(post);
    Post.findByIdAndUpdate.mockResolvedValue({ _id: "p1" });
    const res = mockResponse();
    await updatePost(mockRequest({ params: { id: "p1" }, user: { sub: "u1" }, body }), res);
    expect(Post.findByIdAndUpdate).toHaveBeenCalledWith(
      "p1", expect.objectContaining({ imageURL: "old.png", breed: "Lab" }), { new: true },
    );
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it("replaces the image when a new file is uploaded", async () => {
    mockUploadOk("https://cdn/new.png");
    Post.findById.mockResolvedValue(post);
    Post.findByIdAndUpdate.mockResolvedValue({});
    await updatePost(
      mockRequest({ params: { id: "p1" }, user: { sub: "u1" }, body, file }),
      mockResponse(),
    );
    expect(Post.findByIdAndUpdate.mock.calls[0][1].imageURL).toBe("https://cdn/new.png");
  });

  it("returns 500 on error", async () => {
    Post.findById.mockRejectedValue(new Error("db"));
    const res = mockResponse();
    await updatePost(mockRequest({ params: { id: "p1" }, user: { sub: "u1" }, body }), res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

describe("postController.deletePost", () => {
  const post = { author: { toString: () => "u1" } };
  const setup = () => {
    const session = mockSession();
    jest.spyOn(mongoose, "startSession").mockResolvedValue(session as any);
    return session;
  };

  it("returns 400 without a user id", async () => {
    setup();
    const res = mockResponse();
    await deletePost(mockRequest({ params: { id: "p1" } }), res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it("returns 404 when the post is missing", async () => {
    setup();
    Post.findById.mockResolvedValue(null);
    const res = mockResponse();
    await deletePost(mockRequest({ params: { id: "p1" }, user: { sub: "u1" } }), res);
    expect(res.status).toHaveBeenCalledWith(404);
  });

  it("returns 401 for a non-author", async () => {
    setup();
    Post.findById.mockResolvedValue(post);
    const res = mockResponse();
    await deletePost(mockRequest({ params: { id: "p1" }, user: { sub: "x" } }), res);
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it("deletes the post and its bookmarks, then ends the session", async () => {
    const session = setup();
    Post.findById.mockResolvedValue(post);
    const deleteOne = jest.fn();
    Post.find.mockReturnValue({ deleteOne });
    const res = mockResponse();

    await deletePost(mockRequest({ params: { id: "p1" }, user: { sub: "u1" } }), res);

    expect(Post.find).toHaveBeenCalledWith({ _id: "p1", author: "u1" });
    expect(deleteOne).toHaveBeenCalled();
    expect(Bookmark.deleteMany).toHaveBeenCalledWith({ post: "p1" }, { session });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(session.endSession).toHaveBeenCalled();
  });
});

describe("postController.bookmarkPost", () => {
  it("returns 400 without a user id", async () => {
    const res = mockResponse();
    await bookmarkPost(mockRequest({ params: { id: "p1" } }), res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it("returns 404 when the post is missing", async () => {
    Post.findById.mockResolvedValue(null);
    const res = mockResponse();
    await bookmarkPost(mockRequest({ params: { id: "p1" }, user: { sub: "u1" } }), res);
    expect(res.status).toHaveBeenCalledWith(404);
  });

  it("adds the user to post.bookmark and creates a Bookmark document", async () => {
    const post = { bookmark: [] as string[], save: jest.fn().mockResolvedValue(undefined) };
    Post.findById.mockResolvedValue(post);
    const bSave = jest.fn().mockResolvedValue(undefined);
    Bookmark.mockImplementation((d: any) => ({ ...d, save: bSave }));
    const res = mockResponse();

    await bookmarkPost(mockRequest({ params: { id: "p1" }, user: { sub: "u1" } }), res);

    expect(post.bookmark).toEqual(["u1"]);
    expect(post.save).toHaveBeenCalled();
    expect(Bookmark).toHaveBeenCalledWith({ post: "p1", user: "u1" });
    expect(bSave).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
  });
});

describe("postController.removeBookmark", () => {
  it("returns 404 when post is missing", async () => {
    Post.findById.mockResolvedValue(null);
    const res = mockResponse();
    await removeBookmark(mockRequest({ params: { id: "p1" }, user: { sub: "u1" } }), res);
    expect(res.status).toHaveBeenCalledWith(404);
  });

  it("removes the Bookmark doc and filters the user out of post.bookmark", async () => {
    const post: any = {
      bookmark: [{ toString: () => "u1" }, { toString: () => "u2" }],
      save: jest.fn().mockResolvedValue(undefined),
    };
    Post.findById.mockResolvedValue(post);
    const res = mockResponse();

    await removeBookmark(mockRequest({ params: { id: "p1" }, user: { sub: "u1" } }), res);

    expect(Bookmark.deleteOne).toHaveBeenCalledWith({ post: "p1", user: "u1" });
    expect(post.bookmark).toHaveLength(1);
    expect(post.bookmark[0].toString()).toBe("u2");
    expect(post.save).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
  });
});

describe("postController.getBookmarkPosts", () => {
  it("fetches only the posts the user bookmarked", async () => {
    Bookmark.find.mockResolvedValue([{ post: "p1" }, { post: "p2" }]);
    const q = chainable([{ _id: "p1" }, { _id: "p2" }]);
    Post.find.mockReturnValue(q);
    Post.countDocuments.mockResolvedValue(2);
    const res = mockResponse();

    await getBookmarkPosts(mockRequest({ user: { sub: "u1" } }), res);

    expect(Bookmark.find).toHaveBeenCalledWith({ user: "u1" });
    expect(Post.find).toHaveBeenCalledWith({ _id: { $in: ["p1", "p2"] } });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json.mock.calls[0][0].pagination.totalPosts).toBe(2);
  });

  it("returns 500 on error", async () => {
    Bookmark.find.mockRejectedValue(new Error("db"));
    const res = mockResponse();
    await getBookmarkPosts(mockRequest({ user: { sub: "u1" } }), res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});
