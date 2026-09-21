import jwt from "jsonwebtoken";
import { authenticate } from "../../src/middleware/auth";
import { mockRequest, mockResponse } from "../helpers/httpMocks";

describe("middleware/authenticate", () => {
  const next = jest.fn();

  it("returns 401 when Authorization header is missing", () => {
    const res = mockResponse();
    authenticate(mockRequest(), res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ message: "Unauthorized" });
    expect(next).not.toHaveBeenCalled();
  });

  it("returns 401 when the token is malformed", () => {
    const res = mockResponse();
    const req = mockRequest({ headers: { authorization: "Bearer not-a-jwt" } });
    authenticate(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it("returns 401 when the token is signed with the wrong secret", () => {
    const token = jwt.sign({ sub: "1" }, "other-secret");
    const res = mockResponse();
    authenticate(
      mockRequest({ headers: { authorization: `Bearer ${token}` } }),
      res,
      next,
    );
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it("returns 401 when the token is expired", () => {
    const token = jwt.sign({ sub: "1" }, process.env.JWT_SECRET!, {
      expiresIn: -10,
    });
    const res = mockResponse();
    authenticate(
      mockRequest({ headers: { authorization: `Bearer ${token}` } }),
      res,
      next,
    );
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it("attaches the payload to req.user and calls next for a valid token", () => {
    const token = jwt.sign({ sub: "user1", roles: ["USER"] }, process.env.JWT_SECRET!);
    const req = mockRequest({ headers: { authorization: `Bearer ${token}` } });
    const res = mockResponse();
    authenticate(req, res, next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(req.user.sub).toBe("user1");
    expect(req.user.roles).toEqual(["USER"]);
    expect(res.status).not.toHaveBeenCalled();
  });
});
