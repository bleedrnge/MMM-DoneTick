const NodeHelper = require("node_helper");
const https = require("https");
const http = require("http");
const url = require("url");

module.exports = NodeHelper.create({
  start() {
    console.log(`[MMM-DoneTick] Node helper started`);
  },

  socketNotificationReceived(notification, payload) {
    if (notification === "FETCH_CHORES") {
      console.log(`[MMM-DoneTick] Received FETCH_CHORES notification.`);
      this.fetchChores(payload.instanceUrl, payload.apiToken);
    }
  },

  fetchChores(instanceUrl, apiToken) {
    if (!apiToken) {
      console.error("[MMM-DoneTick] No API token configured — set apiToken in your config.");
      this.sendSocketNotification("CHORES_ERROR", "No API token configured. Please set apiToken in config.");
      return;
    }

    const fullUrl = `${instanceUrl.replace(/\/$/, "")}/eapi/v1/chore`;
    const parsedUrl = url.parse(fullUrl);
    const transport = parsedUrl.protocol === "https:" ? https : http;

    console.log(`[MMM-DoneTick] Fetching chores from: ${fullUrl}`);
    console.log(`[MMM-DoneTick] Using protocol: ${parsedUrl.protocol}`);
    console.log(`[MMM-DoneTick] Host: ${parsedUrl.hostname}, Port: ${parsedUrl.port || "(default)"}`);

    const options = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || (parsedUrl.protocol === "https:" ? 443 : 80),
      path: parsedUrl.path,
      method: "GET",
      headers: {
        "secretkey": apiToken,
        "Content-Type": "application/json",
        "Accept": "application/json",
      },
    };

    const req = transport.request(options, (res) => {
      let data = "";

      console.log(`[MMM-DoneTick] Response status: ${res.statusCode}`);

      res.on("data", (chunk) => {
        data += chunk;
      });

      res.on("end", () => {
        console.log(`[MMM-DoneTick] Response body length: ${data.length} bytes`);

        if (res.statusCode === 200) {
          try {
            const chores = JSON.parse(data);
            if (!Array.isArray(chores)) {
              console.error(`[MMM-DoneTick] Expected an array but got: ${typeof chores}. Body preview: ${data.slice(0, 200)}`);
              this.sendSocketNotification("CHORES_ERROR", "Unexpected API response format.");
              return;
            }
            console.log(`[MMM-DoneTick] Successfully fetched ${chores.length} chore(s).`);
            this.sendSocketNotification("CHORES_DATA", chores);
          } catch (e) {
            console.error(`[MMM-DoneTick] JSON parse error: ${e.message}`);
            console.error(`[MMM-DoneTick] Raw response preview: ${data.slice(0, 300)}`);
            this.sendSocketNotification("CHORES_ERROR", `Failed to parse API response: ${e.message}`);
          }
        } else if (res.statusCode === 401) {
          console.error("[MMM-DoneTick] 401 Unauthorized — check your apiToken.");
          this.sendSocketNotification("CHORES_ERROR", "Invalid API token (401 Unauthorized).");
        } else if (res.statusCode === 403) {
          console.error("[MMM-DoneTick] 403 Forbidden — token may lack permissions.");
          this.sendSocketNotification("CHORES_ERROR", "Access denied (403 Forbidden).");
        } else {
          console.error(`[MMM-DoneTick] Unexpected status ${res.statusCode}. Body: ${data.slice(0, 200)}`);
          this.sendSocketNotification("CHORES_ERROR", `API request failed with status ${res.statusCode}.`);
        }
      });
    });

    req.on("error", (err) => {
      console.error(`[MMM-DoneTick] Network error: ${err.message}`);
      console.error(`[MMM-DoneTick] Check that instanceUrl is reachable and correct.`);
      this.sendSocketNotification("CHORES_ERROR", `Connection error: ${err.message}`);
    });

    req.setTimeout(10000, () => {
      console.error("[MMM-DoneTick] Request timed out after 10 seconds.");
      req.destroy();
      this.sendSocketNotification("CHORES_ERROR", "Request timed out after 10 seconds.");
    });

    req.end();
  },
});
