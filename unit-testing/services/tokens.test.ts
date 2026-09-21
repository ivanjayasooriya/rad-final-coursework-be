import jwt from "jsonwebtoken";
import { signAccessToken, signRefreshToken } from "../../src/service/tokens";

const user: any = { _id: { toString: () => "abc123" }, roles: ["USER"] };

describe("service/tokens", () => {
  it("signAccessToken embeds sub + roles and expires in 15m", () => {
    const payload: any = jwt.verify(signAccessToken(user), process.env.JWT_SECRET!);
    expect(payload.sub).toBe("abc123");
    expect(payload.roles).toEqual(["USER"]);
    expect(payload.exp - payload.iat).toBe(15 * 60);
  });

  it("signRefreshToken embeds only sub and expires in 7d", () => {
    const payload: any = jwt.verify(
      signRefreshToken(user),
      process.env.JWT_REFRESH_SECRET!,
    );
    expect(payload.sub).toBe("abc123");
    expect(payload.roles).toBeUndefined();
    expect(payload.exp - payload.iat).toBe(7 * 24 * 60 * 60);
  });

  it("access and refresh tokens use different secrets", () => {
    expect(() =>
      jwt.verify(signRefreshToken(user), process.env.JWT_SECRET!),
    ).toThrow();
    expect(() =>
      jwt.verify(signAccessToken(user), process.env.JWT_REFRESH_SECRET!),
    ).toThrow();
  });
});
