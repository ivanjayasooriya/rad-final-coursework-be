import mongoose from "mongoose";
import { UserModel, UserRole } from "../../src/models/userModel";
import { PostModel, PostStatus } from "../../src/models/postModel";
import { BookmarkModel } from "../../src/models/boomarkModel";
import { OtpModel } from "../../src/models/otpModel";

const oid = () => new mongoose.Types.ObjectId();

describe("UserModel", () => {
  it("applies defaults (USER role, not approved)", () => {
    const u = new UserModel({ username: "a", email: "a@a.com", password: "x" });
    expect(u.roles).toEqual([UserRole.USER]);
    expect(u.approved).toBe(false);
    expect(u.validateSync()).toBeUndefined();
  });

  it("requires username, email and password", () => {
    const err = new UserModel({}).validateSync();
    expect(Object.keys(err!.errors)).toEqual(
      expect.arrayContaining(["username", "email", "password"]),
    );
  });

  it("rejects an unknown role", () => {
    const err = new UserModel({
      username: "a", email: "a@a.com", password: "x", roles: ["SUPERUSER"],
    }).validateSync();
    expect(err).toBeDefined();
  });
});

describe("PostModel", () => {
  const valid = () => ({
    status: PostStatus.LOST,
    breed: "Lab",
    color: "Black",
    lastSeenLocation: "Park",
    lastSeenDate: "2026-01-01",
    contactPhone: ["0771234567"],
    imageURL: "http://img",
    author: oid(),
  });

  it("accepts a valid post", () => {
    expect(new PostModel(valid()).validateSync()).toBeUndefined();
  });

  it("requires mandatory fields", () => {
    const err = new PostModel({}).validateSync();
    expect(Object.keys(err!.errors)).toEqual(
      expect.arrayContaining([
        "status", "breed", "color", "lastSeenLocation",
        "lastSeenDate", "imageURL", "author",
      ]),
    );
  });

  it("rejects an invalid status", () => {
    const err = new PostModel({ ...valid(), status: "MISSING" }).validateSync();
    expect(err!.errors.status).toBeDefined();
  });

  it("treats petName, reward and contactEmail as optional", () => {
    const p = new PostModel(valid());
    expect(p.petName).toBeUndefined();
    expect(p.reward).toBeUndefined();
  });
});

describe("BookmarkModel", () => {
  it("requires post and user", () => {
    const err = new BookmarkModel({}).validateSync();
    expect(Object.keys(err!.errors)).toEqual(
      expect.arrayContaining(["post", "user"]),
    );
  });

  it("accepts valid ids", () => {
    expect(
      new BookmarkModel({ post: oid(), user: oid() }).validateSync(),
    ).toBeUndefined();
  });
});

describe("OtpModel", () => {
  it("defaults attempts to 0", () => {
    const o = new OtpModel({ email: "a@a.com", otp: "123456", expiresAt: new Date() });
    expect(o.attempts).toBe(0);
    expect(o.validateSync()).toBeUndefined();
  });

  it("requires email, otp and expiresAt", () => {
    const err = new OtpModel({}).validateSync();
    expect(Object.keys(err!.errors)).toEqual(
      expect.arrayContaining(["email", "otp", "expiresAt"]),
    );
  });
});
