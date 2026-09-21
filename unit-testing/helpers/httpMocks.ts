import { Response } from "express";
import { AuthRequest } from "../../src/middleware/auth";

/** Chainable fake of express' Response. */
export const mockResponse = () => {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  res.setHeader = jest.fn().mockReturnValue(res);
  return res as Response & {
    status: jest.Mock;
    json: jest.Mock;
    setHeader: jest.Mock;
  };
};

/** Fake request; override any field per test. */
export const mockRequest = (overrides: Record<string, any> = {}): AuthRequest =>
  ({
    body: {},
    params: {},
    query: {},
    headers: {},
    user: undefined,
    file: undefined,
    ...overrides,
  }) as unknown as AuthRequest;

/** Fake mongoose session: withTransaction just runs the callback. */
export const mockSession = () => ({
  withTransaction: jest.fn(async (fn: () => Promise<void>) => fn()),
  endSession: jest.fn(),
});

/**
 * Chainable query mock (.skip().limit().populate().sort().select())
 * that resolves to `result` when awaited.
 */
export const chainable = (result: any) => {
  const q: any = {};
  ["skip", "limit", "populate", "sort", "select"].forEach((m) => {
    q[m] = jest.fn().mockReturnValue(q);
  });
  q.then = (resolve: any, reject: any) =>
    Promise.resolve(result).then(resolve, reject);
  return q;
};
