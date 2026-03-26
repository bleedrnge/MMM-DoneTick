/**
 * Node Helper for MMM-DoneTick
 * Handles server-side API requests to fetch chore data.
 */
const NodeHelper = require("node_helper");

module.exports = NodeHelper.create({
  /**
   * Called when the module is loaded.
   */
  start() {
    console.log(`[MMM-DoneTick] Node helper started`);
  },

  /**
   * Receives notifications from the module's frontend (MMM-DoneTick.js).
   * @param {string} notification - The identifier of the notification.
   * @param {Object} payload - Data passed from the frontend (instanceUrl, apiToken).
   */
  socketNotificationReceived(notification, payload) {
    if (notification === "FETCH_CHORES") {
      console.log(`[MMM-DoneTick] Received FETCH_CHORES notification.`);
      this.fetchChores(payload.instanceUrl, payload.apiToken);
    }
  },

  /**
   * Fetches chores from the specified instance URL using the provided API token.
   * @param {string} instanceUrl - The base URL of the chore API instance.
   * @param {string} apiToken - The secret key used for authentication.
   */
  async fetchChores(instanceUrl, apiToken) {
    if (!apiToken) {
      console.error("[MMM-DoneTick] No API token configured — set apiToken in your config.");
      this.sendSocketNotification("CHORES_ERROR", "No API token configured. Please set apiToken in config.");
      return;
    }

    const fullUrl = `${instanceUrl.replace(/\/$/, "")}/eapi/v1/chore`;
    console.log(`[MMM-DoneTick] Fetching chores from: ${fullUrl}`);

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);

      const response = await fetch(fullUrl, {
        method: "GET",
        headers: {
          "secretkey": apiToken,
          "Content-Type": "application/json",
          "Accept": "application/json",
        },
        signal: controller.signal
      });

      clearTimeout(timeoutId);
      console.log(`[MMM-DoneTick] Response status: ${response.status}`);

      if (response.status === 200) {
        const chores = await response.json();
        
        if (!Array.isArray(chores)) {
          throw new Error("Unexpected API response format: Expected an array.");
        }

        console.log(`[MMM-DoneTick] Successfully fetched ${chores.length} chore(s).`);
        this.sendSocketNotification("CHORES_DATA", chores);
      } else if (response.status === 401) {
        throw new Error("Invalid API token (401 Unauthorized).");
      } else if (response.status === 403) {
        throw new Error("Access denied (403 Forbidden).");
      } else {
        throw new Error(`API request failed with status ${response.status}.`);
      }

    } catch (error) {
      let errorMessage = error.message;
      if (error.name === "AbortError") {
        errorMessage = "Request timed out after 10 seconds.";
      }
      
      console.error(`[MMM-DoneTick] Error: ${errorMessage}`);
      this.sendSocketNotification("CHORES_ERROR", errorMessage);
    }
  },
});
