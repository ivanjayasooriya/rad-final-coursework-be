jest.mock("../../src/models/userModel", () => ({
  UserModel: {
    find: jest.fn(), findById: jest.fn(), findByIdAndDelete: jest.fn(),
    countDocuments: jest.fn(),
  },
  UserRole: { USER: "USER", ADMIN: "ADMIN", MODERATOR: "MODERATOR" },
}));
jest.mock("../../src/models/postModel", () => ({
  PostModel: {
    findByIdAndDelete: jest.fn(), deleteMany: jest.fn(),
    countDocuments: jest.fn(), aggregate: jest.fn(),
  },
  PostStatus: { LOST: "LOST", FOUND: "FOUND" },
}));
jest.mock("../../src/models/boomarkModel", () => ({
  BookmarkModel: { deleteMany: jest.fn(), countDocuments: jest.fn() },
}));
jest.mock("../../src/service/emailService", () => ({ sendEmailToUser: jest.fn() }));

import mongoose from "mongoose";
import * as admin from "../../src/controller/adminController";
import { UserModel } from "../../src/models/userModel";
import { PostModel } from "../../src/models/postModel";
import { BookmarkModel } from "../../src/models/boomarkModel";
import { sendEmailToUser } from "../../src/service/emailService";
import { mockRequest, mockResponse, mockSession, chainable } from "../helpers/httpMocks";

const User = UserModel as unknown as Record<string, jest.Mock>;
const Post = PostModel as unknown as Record<string, jest.Mock>;
const Bookmark = BookmarkModel as unknown as Record<string, jest.Mock>;

const withSession = () => {
  const s = mockSession();
  jest.spyOn(mongoose, "startSession").mockResolvedValue(s as any);
  return s;
};

describe("adminController.deletePost", () => {
  it("deletes post + bookmarks in a transaction", async () => {
    const s = withSession();
    const res = mockResponse();
    await admin.deletePost(mockRequest({ params: { id: "p1" } }), res);
    expect(Post.findByIdAndDelete).toHaveBeenCalledWith("p1", { session: s });
    expect(Bookmark.deleteMany).toHaveBeenCalledWith({ post: "p1" }, { session: s });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(s.endSession).toHaveBeenCalled();
  });

  it("returns 500 when the transaction fails", async () => {
    const s = withSession();
    s.withTransaction.mockRejectedValue(new Error("tx"));
    const res = mockResponse();
    await admin.deletePost(mockRequest({ params: { id: "p1" } }), res);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(s.endSession).toHaveBeenCalled();
  });
});

describe("adminController user listings", () => {
  it("allUsers returns every user without passwords", async () => {
    const q = chainable([{ username: "a" }]);
    User.find.mockReturnValue(q);
    const res = mockResponse();
    await admin.allUsers(mockRequest(), res);
    expect(User.find).toHaveBeenCalledWith({});
    expect(q.select).toHaveBeenCalledWith("-password");
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it("getAllUsers returns only users with the USER role", async () => {
    const q = chainable([]);
    User.find.mockReturnValue(q);
    await admin.getAllUsers(mockRequest(), mockResponse());
    expect(User.find).toHaveBeenCalledWith({ roles: { $in: ["USER"] } });
    expect(q.select).toHaveBeenCalledWith("-password");
  });

  it("allUsers returns 500 on error", async () => {
    User.find.mockImplementation(() => { throw new Error("db"); });
    const res = mockResponse();
    await admin.allUsers(mockRequest(), res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

describe("adminController.deleteUser", () => {
  it("removes user, their posts and their bookmarks", async () => {
    const s = withSession();
    const res = mockResponse();
    await admin.deleteUser(mockRequest({ params: { id: "u1" } }), res);
    expect(User.findByIdAndDelete).toHaveBeenCalledWith("u1", { session: s });
    expect(Post.deleteMany).toHaveBeenCalledWith({ author: "u1" }, { session: s });
    expect(Bookmark.deleteMany).toHaveBeenCalledWith({ user: "u1" }, { session: s });
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it("returns 500 on transaction failure", async () => {
    const s = withSession();
    s.withTransaction.mockRejectedValue(new Error("tx"));
    const res = mockResponse();
    await admin.deleteUser(mockRequest({ params: { id: "u1" } }), res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

describe.each([
  ["banUser", admin.banUser, /banned/],
  ["unbanUser", admin.unbanUser, /unbanned/],
] as const)("adminController.%s", (_n, fn, msg) => {
  it("returns 404 if the user is missing", async () => {
    User.findById.mockResolvedValue(null);
    const res = mockResponse();
    await fn(mockRequest({ params: { id: "u1" } }), res);
    expect(res.status).toHaveBeenCalledWith(404);
  });

  it("saves the user and returns 200", async () => {
    const user = { save: jest.fn().mockResolvedValue(undefined) };
    User.findById.mockResolvedValue(user);
    const res = mockResponse();
    await fn(mockRequest({ params: { id: "u1" } }), res);
    expect(user.save).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json.mock.calls[0][0].message).toMatch(msg);
  });
});

describe("adminController.changeRole", () => {
  const run = async (role: string, user: any) => {
    User.findById.mockResolvedValue(user);
    const res = mockResponse();
    await admin.changeRole(mockRequest({ params: { id: "u1", role } }), res);
    return res;
  };

  it("returns 404 if the user is missing", async () => {
    expect((await run("USER", null)).status).toHaveBeenCalledWith(404);
  });

  it("sets MODERATOR role", async () => {
    const user: any = { roles: ["USER"], save: jest.fn() };
    const res = await run("MODERATOR", user);
    expect(user.roles).toEqual(["MODERATOR"]);
    expect(user.save).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it("sets USER role", async () => {
    const user: any = { roles: ["MODERATOR"], save: jest.fn() };
    await run("USER", user);
    expect(user.roles).toEqual(["USER"]);
  });

  it("rejects ADMIN and other unknown roles (no privilege escalation)", async () => {
    const user: any = { roles: ["USER"], save: jest.fn() };
    const res = await run("ADMIN", user);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(user.roles).toEqual(["USER"]);
    expect(user.save).not.toHaveBeenCalled();
  });
});

describe("adminController.sendEmail", () => {
  it("sends the email and returns 200", async () => {
    const res = mockResponse();
    await admin.sendEmail(
      mockRequest({ body: { email: "a@a.com", subject: "S", body: "B" } }), res,
    );
    expect(sendEmailToUser).toHaveBeenCalledWith("a@a.com", "S", "B");
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it("returns 500 when sending fails", async () => {
    (sendEmailToUser as jest.Mock).mockRejectedValue(new Error("smtp"));
    const res = mockResponse();
    await admin.sendEmail(mockRequest({ body: {} }), res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

describe("adminController.getDashboardSummary", () => {
  beforeEach(() => jest.spyOn(console, "error").mockImplementation(() => {}));

  it("returns aggregate counts", async () => {
    User.countDocuments.mockResolvedValueOnce(10).mockResolvedValueOnce(3);
    Post.countDocuments.mockResolvedValue(20);
    Bookmark.countDocuments.mockResolvedValue(7);
    const res = mockResponse();
    await admin.getDashboardSummary(mockRequest(), res);
    expect(User.countDocuments).toHaveBeenLastCalledWith({ approved: false });
    expect(res.json).toHaveBeenCalledWith({
      totalUsers: 10, totalPosts: 20, totalBookmarks: 7, pendingApprovals: 3,
    });
  });

  it("returns 500 on failure", async () => {
    User.countDocuments.mockRejectedValue(new Error("db"));
    Post.countDocuments.mockResolvedValue(0);
    Bookmark.countDocuments.mockResolvedValue(0);
    const res = mockResponse();
    await admin.getDashboardSummary(mockRequest(), res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

describe("adminController.getPostVelocityMetrics", () => {
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date(2026, 8, 15)); // 15 Sep 2026
    jest.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => jest.useRealTimers());

  it("returns the last 5 months with heights relative to the busiest month", async () => {
    Post.aggregate.mockResolvedValue([
      { _id: { year: 2026, month: 7 }, count: 10 },
      { _id: { year: 2026, month: 9 }, count: 5 },
    ]);
    const res = mockResponse();
    await admin.getPostVelocityMetrics(mockRequest(), res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith([
      { month: "May", percentageHeight: "4%" },
      { month: "Jun", percentageHeight: "4%" },
      { month: "Jul", percentageHeight: "100%" },
      { month: "Aug", percentageHeight: "4%" },
      { month: "Sep", percentageHeight: "50%" },
    ]);
  });

  it("uses a 5-month $match window starting on the 1st", async () => {
    Post.aggregate.mockResolvedValue([]);
    await admin.getPostVelocityMetrics(mockRequest(), mockResponse());
    const from: Date = Post.aggregate.mock.calls[0][0][0].$match.createdAt.$gte;
    expect(from.getMonth()).toBe(4); // May
    expect(from.getDate()).toBe(1);
  });

  it("returns 500 when aggregation fails", async () => {
    Post.aggregate.mockRejectedValue(new Error("db"));
    const res = mockResponse();
    await admin.getPostVelocityMetrics(mockRequest(), res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

describe("adminController.getCaseAllocations", () => {
  beforeEach(() => jest.spyOn(console, "error").mockImplementation(() => {}));

  it("returns 50/50 when there are no posts", async () => {
    Post.countDocuments.mockResolvedValue(0);
    const res = mockResponse();
    await admin.getCaseAllocations(mockRequest(), res);
    expect(res.json).toHaveBeenCalledWith({ lostPetPercentage: 50, foundPetPercentage: 50 });
  });

  it("computes rounded percentages", async () => {
    Post.countDocuments.mockResolvedValueOnce(1).mockResolvedValueOnce(2);
    const res = mockResponse();
    await admin.getCaseAllocations(mockRequest(), res);
    expect(Post.countDocuments).toHaveBeenNthCalledWith(1, { status: "LOST" });
    expect(Post.countDocuments).toHaveBeenNthCalledWith(2, { status: "FOUND" });
    expect(res.json).toHaveBeenCalledWith({ lostPetPercentage: 33, foundPetPercentage: 67 });
  });

  it("returns 500 on error", async () => {
    Post.countDocuments.mockRejectedValue(new Error("db"));
    const res = mockResponse();
    await admin.getCaseAllocations(mockRequest(), res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});
