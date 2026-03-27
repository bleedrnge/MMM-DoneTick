/**
 * MagicMirror² Module: MMM-DoneTick
 * A module to display upcoming chores from DoneTick (donetick.com).
 */
Module.register("MMM-DoneTick", {
  // Default configuration options
  defaults: {
    instanceUrl: "https://app.donetick.com",
    apiToken: "",
    maxChores: 10,
    updateInterval: 10 * 60 * 1000,
    showOverdue: true,
    daysAhead: 7,
    showLabels: true,
    title: "Upcoming Chores",
    fadePoint: 0.25,

    // --- Grouping ---
    groupBy: "date", // "date" or "assignee"
    userMap: {},
    collapsible: false,
  },

  /**
   * Returns the list of CSS and JS files to load.
   */
  getStyles() {
    return ["MMM-DoneTick.css"];
  },

  getScripts() {
    return ["src/chore_processor.js", "src/ui_renderer.js"];
  },

  getTranslations() {
    return {
      en: "translations/en.json",
      de: "translations/de.json",
      es: "translations/es.json",
      fr: "translations/fr.json",
      it: "translations/it.json",
      nl: "translations/nl.json",
      pt: "translations/pt.json",
    };
  },

  start() {
    Log.info(`[MMM-DoneTick] Starting module`);
    
    if (!this.config.apiToken) {
      Log.error("[MMM-DoneTick] apiToken is missing from config.");
    }

    this.chores = [];
    this.loaded = false;
    this.error = null;
    this.collapsedGroups = {};
    this.scheduleUpdate();
  },

  scheduleUpdate() {
    this.fetchChores();
    setInterval(() => this.fetchChores(), this.config.updateInterval);
  },

  fetchChores() {
    this.sendSocketNotification("FETCH_CHORES", {
      instanceUrl: this.config.instanceUrl,
      apiToken: this.config.apiToken,
    });
  },

  socketNotificationReceived(notification, payload) {
    if (notification === "CHORES_DATA") {
      this.loaded = true;
      this.error = null;
      this.chores = ChoreProcessor.filterAndSort(payload, this.config);
      this.updateDom(1000);
    } else if (notification === "CHORES_ERROR") {
      this.loaded = true;
      this.error = payload;
      this.updateDom(1000);
    }
  },

  getDom() {
    const wrapper = document.createElement("div");
    wrapper.className = "MMM-DoneTick";

    const title = document.createElement("header");
    title.className = "module-header";
    title.innerHTML = this.config.title;
    wrapper.appendChild(title);

    if (!this.loaded) {
      wrapper.appendChild(UiRenderer.makeMessage(this.translate("LOADING")));
      return wrapper;
    }
    if (this.error) {
      const el = UiRenderer.makeMessage(`⚠️ ${this.error}`);
      el.classList.add("donetick-error");
      wrapper.appendChild(el);
      return wrapper;
    }
    if (this.chores.length === 0) {
      wrapper.appendChild(UiRenderer.makeMessage(this.translate("NO_CHORES")));
      return wrapper;
    }

    if (this.config.groupBy === "assignee") {
      wrapper.appendChild(
        UiRenderer.buildGroupedView(
          this.chores,
          this.config,
          ChoreProcessor.groupByAssignee,
          ChoreProcessor.getStatus,
          this.collapsedGroups,
          (id) => (this.collapsedGroups[id] = !this.collapsedGroups[id]),
          (key) => this.translate(key)
        )
      );
    } else {
      wrapper.appendChild(
        UiRenderer.buildFlatView(
          this.chores,
          this.config,
          ChoreProcessor.getStatus,
          (key) => this.translate(key)
        )
      );
    }

    return wrapper;
  },
});
