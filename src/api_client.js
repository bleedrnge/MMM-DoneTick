/**
 * API client for DoneTick.
 * Handles HTTP requests to the DoneTick API.
 */
class DoneTickClient {
  /**
   * @param {string} instanceUrl - Base URL of the DoneTick instance.
   * @param {string} apiToken - Secret key for authentication.
   */
  constructor(instanceUrl, apiToken) {
    this.baseUrl = instanceUrl.replace(/\/$/, "");
    this.apiToken = apiToken;
    this.timeout = 10000; // 10 seconds
  }

  /**
   * Fetches chores from the API.
   * @returns {Promise<Object[]>} Array of chore objects.
   * @throws {Error} If the request fails or returns an error status.
   */
  async fetchChores() {
    if (!this.apiToken) {
      throw new Error("No API token configured.");
    }

    const url = `${this.baseUrl}/eapi/v1/chore`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(url, {
        method: "GET",
        headers: {
          "secretkey": this.apiToken,
          "Content-Type": "application/json",
          "Accept": "application/json",
        },
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (response.status === 200) {
        const chores = await response.json();
        if (!Array.isArray(chores)) {
          throw new Error("Unexpected API response format: Expected an array.");
        }
        return chores;
      }

      if (response.status === 401) {
        throw new Error("Invalid API token (401 Unauthorized).");
      }

      if (response.status === 403) {
        throw new Error("Access denied (403 Forbidden).");
      }

      throw new Error(`API request failed with status ${response.status}.`);
    } catch (error) {
      if (error.name === "AbortError") {
        throw new Error(`Request timed out after ${this.timeout / 1000} seconds.`);
      }
      throw error;
    }
  }
}

module.exports = DoneTickClient;
