/**
 * MagicMirror² Module: MMM-DoneTick
 * A module to display upcoming chores from DoneTick (donetick.com).
 */
Module.register("MMM-DoneTick", {
  // Default configuration options
  defaults: {
    instanceUrl: "https://app.donetick.com", // Base URL for the DoneTick instance
    apiToken: "",                             // API Secret Key from DoneTick settings
    maxChores: 10,                            // Maximum number of chores to display
    updateInterval: 10 * 60 * 1000,           // Polling interval (default 10 minutes)
    showOverdue: true,                        // Whether to include chores whose due date has passed
    daysAhead: 7,                             // Only show chores due within this many days
    showLabels: true,                         // Toggle display of chore labels/tags
    title: "Upcoming Chores",                 // Header text for the module
    fadePoint: 0.25,                          // At what point in the list to start fading (0.0 - 1.0)

    // --- Grouping ---
    groupBy: "date",                          // Display mode: "date" (flat list) or "assignee" (grouped)
    userMap: {},                              // Mapping of ID strings to Names: { "1": "Logan" }
    collapsible: false,                       // If true, allows clicking assignee headers to hide chores
  },

  /**
   * Returns the list of CSS files to load.
   * @returns {string[]} List of filenames.
   */
  getStyles() {
    return ["MMM-DoneTick.css"];
  },

  start() {
    Log.info("[MMM-DoneTick] Starting module");
    Log.info(`[MMM-DoneTick] Config: instanceUrl=${this.config.instanceUrl}, groupBy=${this.config.groupBy}, daysAhead=${this.config.daysAhead}, maxChores=${this.config.maxChores}`);
    
    if (!this.config.apiToken) {
      Log.error("[MMM-DoneTick] WARNING: apiToken is empty — module will not be able to fetch chores.");
    }

    // Internal state initialization
    this.chores = [];
    this.loaded = false;
    this.error = null;
    this.collapsedGroups = {}; // Tracks toggle state for assignee groups
    this.scheduleUpdate();
  },

  /**
   * Sets up the initial fetch and the periodic refresh timer.
   */
  scheduleUpdate() {
    Log.info(`[MMM-DoneTick] Scheduling updates every ${this.config.updateInterval / 1000}s`);
    this.fetchChores();
    setInterval(() => this.fetchChores(), this.config.updateInterval);
  },

  /**
   * Requests data from the node_helper.
   */
  fetchChores() {
    this.sendSocketNotification("FETCH_CHORES", {
      instanceUrl: this.config.instanceUrl,
      apiToken: this.config.apiToken,
    });
  },

  socketNotificationReceived(notification, payload) {
    if (notification === "CHORES_DATA") {
      Log.info(`[MMM-DoneTick] Received CHORES_DATA: ${payload.length} total chore(s) from API.`);
      this.loaded = true;
      this.error = null;
      this.chores = this.filterAndSortChores(payload);
      Log.info(`[MMM-DoneTick] After filtering: ${this.chores.length} chore(s) will be displayed.`);
      this.updateDom(1000);
    } else if (notification === "CHORES_ERROR") {
      Log.error(`[MMM-DoneTick] Received CHORES_ERROR: ${payload}`);
      this.loaded = true;
      this.error = payload;
      this.updateDom(1000);
    }
  },

  // ─── Filtering & Sorting ──────────────────────────────────────────────────

  /**
   * Filters chores based on active status, due date window, and max count.
   * @param {Object[]} chores - Raw chore objects from the API.
   * @returns {Object[]} Cleaned and sorted chores.
   */
  filterAndSortChores(chores) {
    const now = new Date();
    const cutoff = new Date();
    cutoff.setDate(now.getDate() + this.config.daysAhead);

    const inWindow = chores.filter(chore => {
      if (!chore.isActive || !chore.nextDueDate) return false;
      const due = new Date(chore.nextDueDate);
      
      const isOverdue = due < now;
      // Drop if overdue and config says no
      if (!this.config.showOverdue && isOverdue) return false;
      
      // Ensure it falls within the future window
      return due <= cutoff || (isOverdue && this.config.showOverdue);
    });

    if (inWindow.length === 0 && chores.length > 0) {
      Log.warn(`[MMM-DoneTick] All chores were filtered out. Check daysAhead (${this.config.daysAhead}) and showOverdue (${this.config.showOverdue}).`);
    }

    return inWindow.sort((a, b) => new Date(a.nextDueDate) - new Date(b.nextDueDate)).slice(0, this.config.maxChores);
  },

  // ─── Grouping helpers ─────────────────────────────────────────────────────

  /**
   * Returns an array of { assigneeId, displayName, chores[], hasOverdue, earliest }
   * Groups are ordered so that assignees with overdue tasks appear at the top.
   * @param {Object[]} chores - Array of chore objects.
   * @returns {Object[]} Grouped data structures.
   */
  groupChoresByAssignee(chores) {
    const now = new Date();
    const groups = {};

    chores.forEach((chore) => {
      const id = String(chore.assignedTo ?? "unassigned");
      if (!groups[id]) groups[id] = [];
      groups[id].push(chore);
    });

    return Object.entries(groups)
      .map(([id, groupChores]) => {
        // Calculate metadata for the group header
        const hasOverdue = groupChores.some((c) => new Date(c.nextDueDate) < now);
        const earliest = Math.min(...groupChores.map((c) => new Date(c.nextDueDate)));
        const displayName =
          this.config.userMap[id] ||
          this.config.userMap[Number(id)] ||
          (id === "unassigned" ? "Unassigned" : `User ${id}`);

        return { assigneeId: id, displayName, chores: groupChores, hasOverdue, earliest };
      })
      .sort((a, b) => {
        // Sort groups: Overdue assignees first, then by soonest task
        if (a.hasOverdue !== b.hasOverdue) return a.hasOverdue ? -1 : 1;
        return a.earliest - b.earliest;
      });
  },

  // ─── DOM Entry Point ──────────────────────────────────────────────────────

  /**
   * Primary MagicMirror method to generate the module's HTML.
   * @returns {HTMLElement} The wrapper element.
   */
  getDom() {
    const wrapper = document.createElement("div");
    wrapper.className = "MMM-DoneTick";

    const title = document.createElement("header");
    title.className = "module-header";
    title.innerHTML = this.config.title;
    wrapper.appendChild(title);

    if (!this.loaded) {
      wrapper.appendChild(this.makeMessage("Loading chores..."));
      return wrapper;
    }
    if (this.error) {
      const el = this.makeMessage(`⚠️ ${this.error}`);
      el.classList.add("donetick-error");
      wrapper.appendChild(el);
      return wrapper;
    }
    if (this.chores.length === 0) {
      wrapper.appendChild(this.makeMessage("No upcoming chores 🎉"));
      return wrapper;
    }

    if (this.config.groupBy === "assignee") {
      wrapper.appendChild(this.buildGroupedView());
    } else {
      wrapper.appendChild(this.buildFlatView());
    }

    return wrapper;
  },

  /**
   * Generates a simple message element for loading/errors.
   * @param {string} text 
   * @returns {HTMLElement}
   */
  makeMessage(text) {
    const el = document.createElement("div");
    el.className = "dimmed light small";
    el.innerHTML = text;
    return el;
  },

  // ─── Flat (by-date) view ──────────────────────────────────────────────────

  /**
   * Builds the standard table view where all chores are listed together by date.
   * @returns {HTMLElement} The table element.
   */
  buildFlatView() {
    const table = document.createElement("table");
    table.className = "small donetick-table";

    this.chores.forEach((chore, index) => {
      const { isOverdue, isToday, isTomorrow } = this.choreStatus(chore);
      const row = this.createChoreRow(chore, { isOverdue, isToday, isTomorrow });
      
      this.applyFade(row, index, this.chores.length);
      table.appendChild(row);
      this.maybeAppendLabels(table, chore, 3);
    });

    return table;
  },

  // ─── Grouped (by-assignee) view ───────────────────────────────────────────

  /**
   * Builds the view where chores are categorized under assignee headers.
   * @returns {HTMLElement} The container element.
   */
  buildGroupedView() {
    const container = document.createElement("div");
    container.className = "donetick-grouped";

    const groups = this.groupChoresByAssignee(this.chores);

    groups.forEach(({ assigneeId, displayName, chores, hasOverdue }) => {
      const section = document.createElement("div");
      section.className = "donetick-group";

      // ── Group header ──
      const header = document.createElement("div");
      header.className = "donetick-group-header";

      header.appendChild(this.createAvatar(displayName));

      const nameSpan = document.createElement("span");
      nameSpan.className = "donetick-group-name bright";
      nameSpan.innerHTML = displayName;
      header.appendChild(nameSpan);

      this.appendGroupBadges(header, chores, hasOverdue);

      // Collapse toggle (only wired up if collapsible: true)
      if (this.config.collapsible) {
        const toggle = document.createElement("span");
        toggle.className = "donetick-toggle";
        toggle.innerHTML = "▾";
        header.appendChild(toggle);

        if (this.collapsedGroups[assigneeId]) {
          section.classList.add("donetick-group-collapsed");
          toggle.style.transform = "rotate(-90deg)";
        }

        header.style.cursor = "pointer";
        // Local interaction for toggling visibility without a full DOM refresh
        header.addEventListener("click", () => {
          this.collapsedGroups[assigneeId] = !this.collapsedGroups[assigneeId];
          section.classList.toggle("donetick-group-collapsed");
          toggle.style.transform = this.collapsedGroups[assigneeId]
            ? "rotate(-90deg)"
            : "rotate(0deg)";
        });
      }

      section.appendChild(header);

      // ── Chores table ──
      const choresContainer = document.createElement("div");
      choresContainer.className = "donetick-group-chores";

      const table = document.createElement("table");
      table.className = "small donetick-table donetick-group-table";

      chores.forEach((chore) => {
        const { isOverdue, isToday, isTomorrow } = this.choreStatus(chore);
        const row = this.createChoreRow(chore, { isOverdue, isToday, isTomorrow }, true);

        table.appendChild(row);
        this.maybeAppendLabels(table, chore, 3, true);
      });

      choresContainer.appendChild(table);
      section.appendChild(choresContainer);
      container.appendChild(section);
    });

    return container;
  },

  // ─── Shared helpers ───────────────────────────────────────────────────────

  /**
   * Creates a single table row for a chore.
   * @param {Object} chore - The chore data.
   * @param {Object} status - Pre-calculated status flags.
   * @param {boolean} isGrouped - Whether this is being rendered inside an assignee group.
   * @returns {HTMLElement} The <tr> element.
   */
  createChoreRow(chore, { isOverdue, isToday, isTomorrow }, isGrouped = false) {
    const row = document.createElement("tr");
    row.className = `donetick-row ${isGrouped ? "donetick-group-row" : ""}`;
    
    if (isOverdue) row.classList.add("donetick-overdue");
    else if (isToday) row.classList.add("donetick-today");

    // Icon or Status Bar
    const iconCell = document.createElement("td");
    // Grouped view uses a vertical color bar; Flat view uses emojis/icons.
    if (isGrouped) {
      iconCell.className = "donetick-status-bar-cell";
      const bar = document.createElement("div");
      bar.className = `donetick-status-bar ${isOverdue ? "donetick-bar-overdue" : isToday ? "donetick-bar-today" : "donetick-bar-normal"}`;
      iconCell.appendChild(bar);
    } else {
      iconCell.className = "donetick-icon";
      iconCell.innerHTML = isOverdue ? "⚠️" : (isToday ? "🔔" : "📋");
    }
    row.appendChild(iconCell);

    // Name
    const nameCell = document.createElement("td");
    nameCell.className = "donetick-name bright";
    nameCell.innerHTML = chore.name;
    row.appendChild(nameCell);

    // Date
    row.appendChild(this.makeDateCell(isOverdue, isToday, isTomorrow, chore));
    
    return row;
  },

  /**
   * Creates a circle with initials for the assignee.
   * @param {string} name 
   * @returns {HTMLElement}
   */
  createAvatar(name) {
    const initials = name.split(" ").map(w => w[0]).slice(0, 2).join("").toUpperCase();
    const avatar = document.createElement("span");
    avatar.className = "donetick-avatar";
    avatar.innerHTML = initials;
    return avatar;
  },

  /**
   * Creates a small badge element.
   * @param {string} text 
   * @param {string} className 
   * @returns {HTMLElement}
   */
  createBadge(text, className) {
    const badge = document.createElement("span");
    badge.className = `donetick-badge ${className}`;
    badge.innerHTML = text;
    return badge;
  },

  /**
   * Adds overdue and total task counts to a group header.
   * @param {HTMLElement} container 
   * @param {Object[]} chores 
   * @param {boolean} hasOverdue 
   */
  appendGroupBadges(container, chores, hasOverdue) {
    if (hasOverdue) {
      const overdueCount = chores.filter(c => new Date(c.nextDueDate) < new Date()).length;
      container.appendChild(this.createBadge(`${overdueCount} overdue`, "donetick-badge-overdue"));
    }
    const taskText = `${chores.length} task${chores.length !== 1 ? "s" : ""}`;
    container.appendChild(this.createBadge(taskText, "donetick-badge-count"));
  },

  /**
   * Determines the relative timing of a chore's due date.
   * @param {Object} chore 
   * @returns {Object} Helper flags for styling.
   */
  choreStatus(chore) {
    const now = new Date();
    const dueDate = new Date(chore.nextDueDate);
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    return {
      dueDate,
      isOverdue: dueDate < now,
      isToday:    dueDate.toDateString() === now.toDateString(),
      isTomorrow: dueDate.toDateString() === tomorrow.toDateString(),
    };
  },

  /**
   * Formats and creates the date cell for a chore row.
   * @returns {HTMLElement}
   */
  makeDateCell(isOverdue, isToday, isTomorrow, chore) {
    const cell = document.createElement("td");
    cell.className = "donetick-date dimmed";
    if (isOverdue) {
      cell.innerHTML = `<span class="donetick-overdue-text">Overdue</span>`;
    } else if (isToday) {
      cell.innerHTML = `<span class="donetick-today-text">Today</span>`;
    } else if (isTomorrow) {
      cell.innerHTML = `<span class="donetick-tomorrow-text">Tomorrow</span>`;
    } else {
      cell.innerHTML = this.formatDate(new Date(chore.nextDueDate));
    }
    return cell;
  },

  /**
   * Creates a secondary row for labels (tags) if they exist.
   * @param {HTMLElement} table 
   * @param {Object} chore 
   * @param {number} colSpan - Number of columns in the parent table.
   * @param {boolean} indented - Whether to shift labels right for alignment.
   */
  maybeAppendLabels(table, chore, colSpan, indented = false) {
    if (!this.config.showLabels) return;
    if (!chore.labelsV2 || chore.labelsV2.length === 0) return;

    const labelRow = document.createElement("tr");
    labelRow.className = "donetick-label-row";
    const labelCell = document.createElement("td");
    labelCell.colSpan = colSpan;
    labelCell.className = "donetick-labels" + (indented ? " donetick-labels-indented" : "");

    chore.labelsV2.forEach((label) => {
      const tag = document.createElement("span");
      tag.className = "donetick-label";
      tag.style.backgroundColor = label.color || "#555";
      tag.innerHTML = label.name;
      labelCell.appendChild(tag);
    });

    labelRow.appendChild(labelCell);
    table.appendChild(labelRow);
  },

  /**
   * Progressively reduces opacity of rows at the end of the list.
   * @param {HTMLElement} row 
   * @param {number} index 
   * @param {number} total 
   */
  applyFade(row, index, total) {
    if (this.config.fadePoint >= 1) return;
    const fadeStart = Math.round(total * (1 - this.config.fadePoint));
    if (index >= fadeStart) {
      const opacity = 1 - ((index - fadeStart + 1) / (total - fadeStart + 1)) * 0.7;
      row.style.opacity = opacity;
    }
  },

  /**
   * Formats the date string.
   * @param {Date} date 
   * @returns {string} Relative or absolute date string.
   */
  formatDate(date) {
    const diffDays = Math.ceil((date - new Date()) / (1000 * 60 * 60 * 24));
    if (diffDays <= 7) {
      return date.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
    }
    return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  },
});
