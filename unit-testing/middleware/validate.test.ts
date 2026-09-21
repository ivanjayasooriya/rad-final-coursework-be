jest.mock("../../src/service/petValidator", () => ({
  validatePetImage: jest.fn(),
}));

import { validateImage } from "../../src/middleware/validate";
import { validatePetImage } from "../../src/service/petValidator";
import { mockRequest, mockResponse } from "../helpers/httpMocks";

const mockedValidate = validatePetImage as jest.Mock;
const file = { buffer: Buffer.from("img"), mimetype: "image/png" };

describe("middleware/validateImage", () => {
  const next = jest.fn();

  it("skips validation and calls next when no file is uploaded", async () => {
    await validateImage(mockRequest(), mockResponse(), next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(mockedValidate).not.toHaveBeenCalled();
  });

  it("blocks offensive images with 400", async () => {
    mockedValidate.mockResolvedValue({
      isRealAnimal: true,
      isOffensiveOrInappropriate: true,
    });
    const res = mockResponse();
    await validateImage(mockRequest({ file }), res, next);
    expect(mockedValidate).toHaveBeenCalledWith(file.buffer, file.mimetype);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ reason: expect.stringMatching(/inappropriate/i) }),
    );
    expect(next).not.toHaveBeenCalled();
  });

  it("blocks images without a real animal with 400", async () => {
    mockedValidate.mockResolvedValue({
      isRealAnimal: false,
      isOffensiveOrInappropriate: false,
    });
    const res = mockResponse();
    await validateImage(mockRequest({ file }), res, next);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ reason: expect.stringMatching(/animal/i) }),
    );
    expect(next).not.toHaveBeenCalled();
  });

  it("calls next for a safe animal image", async () => {
    mockedValidate.mockResolvedValue({
      isRealAnimal: true,
      isOffensiveOrInappropriate: false,
    });
    const res = mockResponse();
    await validateImage(mockRequest({ file }), res, next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
  });

  it("returns 500 when the validator throws", async () => {
    mockedValidate.mockRejectedValue(new Error("boom"));
    const res = mockResponse();
    await validateImage(mockRequest({ file }), res, next);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(next).not.toHaveBeenCalled();
  });
});
