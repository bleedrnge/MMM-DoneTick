/**
 * Node Helper for MMM-DoneTick
 * Handles server-side API requests to fetch chore data.
 */
const NodeHelper = require("node_helper");
const DoneTickClient = require("./src/api_client");

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
      this.fetchChores(payload.instanceUrl, payload.apiToken);
    }
  },

  /**
   * Fetches chores using the DoneTickClient.
   * @param {string} instanceUrl - The base URL of the chore API instance.
   * @param {string} apiToken - The secret key used for authentication.
   */
  async fetchChores(instanceUrl, apiToken) {
    const client = new DoneTickClient(instanceUrl, apiToken);

    try {
      console.log(`[MMM-DoneTick] Fetching chores from: ${instanceUrl}`);
      const chores = await client.fetchChores();
      console.log(`[MMM-DoneTick] Successfully fetched ${chores.length} chore(s).`);
      this.sendSocketNotification("CHORES_DATA", chores);
    } catch (error) {
      console.error(`[MMM-DoneTick] Error: ${error.message}`);
      this.sendSocketNotification("CHORES_ERROR", error.message);
    }
  },
});
