jest.mock("../../src/models/userModel", () => {
  const UserModel: any = jest.fn();
  UserModel.findOne = jest.fn();
  UserModel.findById = jest.fn();
  return {
    UserModel,
    UserRole: { USER: "USER", ADMIN: "ADMIN", MODERATOR: "MODERATOR" },
  };
});
jest.mock("../../src/service/emailService", () => ({
  sendWelcomeEmail: jest.fn(),
}));
jest.mock("../../src/service/otpService", () => ({ verifyOtp: jest.fn() }));

import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import {
  registerUser,
  loginUser,
  getMyDetails,
  refreshToken,
  resetPassword,
} from "../../src/controller/authController";
import { UserModel } from "../../src/models/userModel";
import { sendWelcomeEmail } from "../../src/service/emailService";
import { verifyOtp } from "../../src/service/otpService";
import { mockRequest, mockResponse, chainable } from "../helpers/httpMocks";

const User = UserModel as unknown as jest.Mock & Record<string, jest.Mock>;

describe("authController.registerUser", () => {
  const body = { username: "rex", email: "r@x.com", password: "secret123" };

  it("returns 400 if username or email already exists", async () => {
    User.findOne.mockResolvedValue({ _id: "1" });
    const res = mockResponse();
    await registerUser(mockRequest({ body }), res);
    expect(User.findOne).toHaveBeenCalledWith({
      $or: [{ username: "rex" }, { email: "r@x.com" }],
    });
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it("creates the user with a hashed password, sends welcome email, returns 201", async () => {
    User.findOne.mockResolvedValue(null);
    const save = jest.fn().mockResolvedValue(undefined);
    User.mockImplementation((data: any) => ({ ...data, save }));
    const res = mockResponse();

    await registerUser(mockRequest({ body }), res);

    const created = User.mock.calls[0][0];
    expect(created.password).not.toBe("secret123");
    expect(bcrypt.compareSync("secret123", created.password)).toBe(true);
    expect(created.roles).toEqual(["USER"]);
    expect(save).toHaveBeenCalled();
    expect(sendWelcomeEmail).toHaveBeenCalledWith("r@x.com", "rex");
    expect(res.status).toHaveBeenCalledWith(201);
  });

  it("returns 500 when saving fails", async () => {
    User.findOne.mockResolvedValue(null);
    User.mockImplementation(() => ({ save: jest.fn().mockRejectedValue(new Error("db")) }));
    const res = mockResponse();
    await registerUser(mockRequest({ body }), res);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(sendWelcomeEmail).not.toHaveBeenCalled();
  });
});

describe("authController.loginUser", () => {
  const hash = bcrypt.hashSync("secret123", 4);
  const dbUser = { _id: "id1", username: "rex", roles: ["USER"], password: hash };

  it("returns 401 for an unknown user", async () => {
    User.findOne.mockResolvedValue(null);
    const res = mockResponse();
    await loginUser(mockRequest({ body: { username: "x", password: "y" } }), res);
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it("returns 401 for a wrong password", async () => {
    User.findOne.mockResolvedValue(dbUser);
    const res = mockResponse();
    await loginUser(mockRequest({ body: { username: "rex", password: "bad" } }), res);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ message: "Invalid credentials" });
  });

  it("returns 200 with valid access and refresh tokens", async () => {
    User.findOne.mockResolvedValue(dbUser);
    const res = mockResponse();
    await loginUser(mockRequest({ body: { username: "rex", password: "secret123" } }), res);

    expect(res.status).toHaveBeenCalledWith(200);
    const { data } = res.json.mock.calls[0][0];
    expect(data.username).toBe("rex");
    expect(data.password).toBeUndefined();
    expect((jwt.verify(data.accessToken, process.env.JWT_SECRET!) as any).sub).toBe("id1");
    expect((jwt.verify(data.refreshToken, process.env.JWT_REFRESH_SECRET!) as any).sub).toBe("id1");
  });

  it("returns 500 on unexpected errors", async () => {
    User.findOne.mockRejectedValue(new Error("db"));
    const res = mockResponse();
    await loginUser(mockRequest({ body: { username: "a", password: "b" } }), res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});

describe("authController.getMyDetails", () => {
  it("returns 401 without req.user", async () => {
    const res = mockResponse();
    await getMyDetails(mockRequest(), res);
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it("returns 404 when the user does not exist", async () => {
    User.findById.mockReturnValue(chainable(null));
    const res = mockResponse();
    await getMyDetails(mockRequest({ user: { sub: "1" } }), res);
    expect(res.status).toHaveBeenCalledWith(404);
  });

  it("returns 403 when the user is not approved", async () => {
    User.findById.mockReturnValue(chainable({ approved: false }));
    const res = mockResponse();
    await getMyDetails(mockRequest({ user: { sub: "1" } }), res);
    expect(res.status).toHaveBeenCalledWith(403);
  });

  it("returns 200 with public profile fields only", async () => {
    User.findById.mockReturnValue(
      chainable({
        _id: "1", username: "rex", email: "r@x.com", roles: ["USER"],
        profilePic: "p.png", approved: true, password: "hash",
      }),
    );
    const res = mockResponse();
    await getMyDetails(mockRequest({ user: { sub: "1" } }), res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      message: "ok",
      data: { id: "1", username: "rex", email: "r@x.com", roles: ["USER"], profilePic: "p.png" },
    });
  });
});

describe("authController.refreshToken", () => {
  it("returns 400 when no refresh token is supplied", async () => {
    const res = mockResponse();
    await refreshToken(mockRequest({ body: {} }), res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it("returns 500 for an invalid refresh token", async () => {
    const res = mockResponse();
    await refreshToken(mockRequest({ body: { refreshToken: "junk" } }), res);
    expect(res.status).toHaveBeenCalledWith(500);
  });

  it("returns 400 when the token's user no longer exists", async () => {
    const token = jwt.sign({ sub: "1" }, process.env.JWT_REFRESH_SECRET!);
    User.findById.mockResolvedValue(null);
    const res = mockResponse();
    await refreshToken(mockRequest({ body: { refreshToken: token } }), res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it("issues a new access token for a valid refresh token", async () => {
    const token = jwt.sign({ sub: "1" }, process.env.JWT_REFRESH_SECRET!);
    User.findById.mockResolvedValue({ _id: "1", roles: ["USER"] });
    const res = mockResponse();
    await refreshToken(mockRequest({ body: { refreshToken: token } }), res);
    expect(res.status).toHaveBeenCalledWith(200);
    const { accessToken } = res.json.mock.calls[0][0].data;
    expect((jwt.verify(accessToken, process.env.JWT_SECRET!) as any).sub).toBe("1");
  });
});

describe("authController.resetPassword", () => {
  const body = { email: " R@X.com ", otp: 123456, newPassword: "newPass1" };

  it("returns 400 when any field is missing", async () => {
    const res = mockResponse();
    await resetPassword(mockRequest({ body: { email: "a" } }), res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it("returns 400 with the OTP failure message", async () => {
    (verifyOtp as jest.Mock).mockResolvedValue({ success: false, message: "Incorrect OTP." });
    const res = mockResponse();
    await resetPassword(mockRequest({ body }), res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ message: "Incorrect OTP." });
  });

  it("normalises email/otp before verifying", async () => {
    (verifyOtp as jest.Mock).mockResolvedValue({ success: false, message: "x" });
    await resetPassword(mockRequest({ body }), mockResponse());
    expect(verifyOtp).toHaveBeenCalledWith("r@x.com", "123456");
  });

  it("returns 404 when the user is not found", async () => {
    (verifyOtp as jest.Mock).mockResolvedValue({ success: true });
    User.findOne.mockResolvedValue(null);
    const res = mockResponse();
    await resetPassword(mockRequest({ body }), res);
    expect(res.status).toHaveBeenCalledWith(404);
  });

  it("hashes and saves the new password on success", async () => {
    (verifyOtp as jest.Mock).mockResolvedValue({ success: true });
    const user: any = { password: "old", save: jest.fn().mockResolvedValue(undefined) };
    User.findOne.mockResolvedValue(user);
    const res = mockResponse();
    await resetPassword(mockRequest({ body }), res);
    expect(user.password).not.toBe("old");
    expect(bcrypt.compareSync("newPass1", user.password)).toBe(true);
    expect(user.save).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
  });
});
