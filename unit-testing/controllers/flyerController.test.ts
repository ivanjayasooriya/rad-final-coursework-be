jest.mock("../../src/models/postModel", () => ({
  PostModel: { findById: jest.fn() },
}));
jest.mock("../../src/service/flyerService", () => ({
  generatePetFlyer: jest.fn(),
}));

import { getFlyerRoute } from "../../src/controller/flyerController";
import { PostModel } from "../../src/models/postModel";
import { generatePetFlyer } from "../../src/service/flyerService";
import { mockRequest, mockResponse } from "../helpers/httpMocks";

const findById = (PostModel as any).findById as jest.Mock;

beforeEach(() => jest.spyOn(console, "log").mockImplementation(() => {}));

describe("flyerController.getFlyerRoute", () => {
  it("returns 404 when the post does not exist", async () => {
    findById.mockResolvedValue(null);
    const res = mockResponse();
    await getFlyerRoute(mockRequest({ params: { id: "p1" } }), res);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(generatePetFlyer).not.toHaveBeenCalled();
  });

  it("maps the post to FlyerData, sets PDF headers and pipes the stream", async () => {
    findById.mockResolvedValue({
      status: "LOST", petName: "Rex", breed: "Lab", color: "Black",
      lastSeenLocation: "Park", lastSeenDate: "2026-01-01", reward: "$5",
      contactPhone: ["077"], contactEmail: ["a@a.com"], imageURL: "http://img",
    });
    const pipe = jest.fn();
    (generatePetFlyer as jest.Mock).mockResolvedValue({ pipe });
    const res = mockResponse();

    await getFlyerRoute(mockRequest({ params: { id: "p1" } }), res);

    expect(generatePetFlyer).toHaveBeenCalledWith(
      expect.objectContaining({ petName: "Rex", imageUrl: "http://img", contactPhone: ["077"] }),
    );
    expect(res.setHeader).toHaveBeenCalledWith("Content-Type", "application/pdf");
    expect(res.setHeader).toHaveBeenCalledWith(
      "Content-Disposition", expect.stringContaining("inline"),
    );
    expect(pipe).toHaveBeenCalledWith(res);
  });

  it("falls back to empty strings for missing optional fields", async () => {
    findById.mockResolvedValue({ status: "FOUND", breed: "Cat", color: "White" });
    (generatePetFlyer as jest.Mock).mockResolvedValue({ pipe: jest.fn() });
    await getFlyerRoute(mockRequest({ params: { id: "p1" } }), mockResponse());
    expect(generatePetFlyer).toHaveBeenCalledWith(
      expect.objectContaining({ petName: "", reward: "", imageUrl: "" }),
    );
  });

  it("returns 500 when PDF generation fails", async () => {
    findById.mockResolvedValue({ status: "LOST" });
    (generatePetFlyer as jest.Mock).mockRejectedValue(new Error("pdf"));
    const res = mockResponse();
    await getFlyerRoute(mockRequest({ params: { id: "p1" } }), res);
    expect(res.status).toHaveBeenCalledWith(500);
  });
});
