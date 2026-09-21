import { requireRole } from "../../src/middleware/role";
import { UserRole } from "../../src/models/userModel";
import { mockRequest, mockResponse } from "../helpers/httpMocks";

describe("middleware/requireRole", () => {
  const next = jest.fn();

  it("returns 401 when there is no authenticated user", () => {
    const res = mockResponse();
    requireRole([UserRole.USER])(mockRequest(), res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it("returns 403 when the user lacks every required role", () => {
    const res = mockResponse();
    const req = mockRequest({ user: { roles: [UserRole.USER] } });
    requireRole([UserRole.ADMIN])(req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ message: "Forbidden" });
    expect(next).not.toHaveBeenCalled();
  });

  it("returns 403 when user has no roles array", () => {
    const res = mockResponse();
    requireRole([UserRole.USER])(mockRequest({ user: {} }), res, next);
    expect(res.status).toHaveBeenCalledWith(403);
  });

  it("calls next when the user has one of the allowed roles", () => {
    const res = mockResponse();
    const req = mockRequest({ user: { roles: [UserRole.MODERATOR] } });
    requireRole([UserRole.USER, UserRole.MODERATOR])(req, res, next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
  });
});
