/**
 * Unit tests for MMM-DoneTick Node Helper
 */

// Mock the MagicMirror node_helper module
jest.mock("node_helper", () => ({
  create: (obj) => ({
    ...obj,
    sendSocketNotification: jest.fn()
  })
}), { virtual: true });

const helper = require("../node_helper.js");

describe("node_helper", () => {
  const mockUrl = "http://localhost:8080";
  const mockToken = "secret-123";

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Assign mock to global fetch (Node 18+)
    global.fetch = jest.fn();
    
    // Mock console to keep test output clean
    jest.spyOn(console, "log").mockImplementation(() => {});
    jest.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe("start", () => {
    it("should log start message", () => {
      helper.start();
      expect(console.log).toHaveBeenCalledWith(expect.stringContaining("Node helper started"));
    });
  });

  describe("socketNotificationReceived", () => {
    it("should call fetchChores when FETCH_CHORES notification is received", async () => {
      // Use a spy that still allows the original to be restored via restoreMocks: true
      const fetchSpy = jest.spyOn(helper, "fetchChores").mockImplementation(async () => {});
      
      await helper.socketNotificationReceived("FETCH_CHORES", {
        instanceUrl: mockUrl,
        apiToken: mockToken
      });

      expect(fetchSpy).toHaveBeenCalledWith(mockUrl, mockToken);
    });

    it("should do nothing for unknown notifications", () => {
      const fetchSpy = jest.spyOn(helper, "fetchChores");
      helper.socketNotificationReceived("UNKNOWN_ACTION", {});
      expect(fetchSpy).not.toHaveBeenCalled();
    });
  });

  describe("fetchChores", () => {
    it("should send CHORES_ERROR if apiToken is missing", async () => {
      await helper.fetchChores(mockUrl, null);
      
      expect(helper.sendSocketNotification).toHaveBeenCalledWith(
        "CHORES_ERROR",
        expect.stringContaining("No API token")
      );
    });

    it("should normalize the instance URL by removing trailing slashes", async () => {
      global.fetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: jest.fn().mockResolvedValue([])
      });

      await helper.fetchChores("http://localhost:8080/", mockToken);
      expect(global.fetch).toHaveBeenCalledWith("http://localhost:8080/eapi/v1/chore", expect.anything());
    });

    it("should fetch chores and send CHORES_DATA on success", async () => {
      const mockChores = [{ id: 1, name: "Test Chore" }];
      
      global.fetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: jest.fn().mockResolvedValue(mockChores)
      });

      await helper.fetchChores(mockUrl, mockToken);

      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining("/eapi/v1/chore"),
        expect.objectContaining({
          headers: expect.objectContaining({
            "secretkey": mockToken
          })
        })
      );
      expect(helper.sendSocketNotification).toHaveBeenCalledWith("CHORES_DATA", mockChores);
    });

    it("should handle 401 Unauthorized error", async () => {
      global.fetch.mockResolvedValue({ 
        ok: false, 
        status: 401,
        json: jest.fn().mockResolvedValue({ error: "Unauthorized" })
      });

      await helper.fetchChores(mockUrl, mockToken);

      expect(helper.sendSocketNotification).toHaveBeenCalledWith(
        "CHORES_ERROR",
        "Invalid API token (401 Unauthorized)."
      );
    });

    it("should handle 403 Forbidden error", async () => {
      global.fetch.mockResolvedValue({ 
        ok: false, 
        status: 403,
        json: jest.fn().mockResolvedValue({ error: "Forbidden" })
      });

      await helper.fetchChores(mockUrl, mockToken);

      expect(helper.sendSocketNotification).toHaveBeenCalledWith(
        "CHORES_ERROR",
        "Access denied (403 Forbidden)."
      );
    });

    it("should handle other non-200 status codes", async () => {
      global.fetch.mockResolvedValue({ 
        ok: false, 
        status: 500,
        json: jest.fn().mockResolvedValue({ error: "Internal Server Error" })
      });

      await helper.fetchChores(mockUrl, mockToken);

      expect(helper.sendSocketNotification).toHaveBeenCalledWith(
        "CHORES_ERROR",
        "API request failed with status 500."
      );
    });

    it("should handle unexpected response formats", async () => {
      global.fetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: jest.fn().mockResolvedValue({ not: "an array" })
      });

      await helper.fetchChores(mockUrl, mockToken);

      expect(helper.sendSocketNotification).toHaveBeenCalledWith(
        "CHORES_ERROR",
        "Unexpected API response format: Expected an array."
      );
    });

    it("should handle generic network errors", async () => {
      global.fetch.mockRejectedValue(new Error("Network Failure"));

      await helper.fetchChores(mockUrl, mockToken);

      expect(helper.sendSocketNotification).toHaveBeenCalledWith(
        "CHORES_ERROR",
        "Network Failure"
      );
    });

    it("should handle request timeouts", async () => {
      const abortError = new Error("The user aborted a request.");
      abortError.name = "AbortError";
      
      global.fetch.mockRejectedValue(abortError);

      await helper.fetchChores(mockUrl, mockToken);

      expect(helper.sendSocketNotification).toHaveBeenCalledWith(
        "CHORES_ERROR",
        "Request timed out after 10 seconds."
      );
    });
  });
});