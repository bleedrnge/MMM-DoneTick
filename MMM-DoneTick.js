Module.register("MMM-DoneTick", {
  defaults: {
    instanceUrl: "https://app.donetick.com", // or your self-hosted URL
    apiToken: "",                             // your DoneTick API token (secretkey)
    maxChores: 10,                            // max number of chores to show
    updateInterval: 10 * 60 * 1000,          // refresh every 10 minutes
    showOverdue: true,                        // show overdue chores
    daysAhead: 7,                             // show chores due within X days
    showLabels: true,                         // show chore labels
    title: "Upcoming Chores",
    fadePoint: 0.25,                          // fraction of list to start fading (0–1); flat view only

    // --- Grouping ---
    groupBy: "date",                          // "date" or "assignee"
    userMap: {},                              // map DoneTick user IDs to display names: { 1: "Alex", 2: "Jordan" }
    collapsible: false,                       // allow assignee sections to be collapsed (click header)
    // Groups are ordered: assignees with overdue chores appear first, then by earliest due date.
  },

  getStyles() {
    return ["MMM-DoneTick.css"];
  },

  start() {
    Log.info("[MMM-DoneTick] Starting module");
    Log.info(`[MMM-DoneTick] Config: instanceUrl=${this.config.instanceUrl}, groupBy=${this.config.groupBy}, daysAhead=${this.config.daysAhead}, maxChores=${this.config.maxChores}`);
    if (!this.config.apiToken) {
      Log.error("[MMM-DoneTick] WARNING: apiToken is empty — module will not be able to fetch chores.");
    }
    this.chores = [];
    this.loaded = false;
    this.error = null;
    this.collapsedGroups = {};
    this.scheduleUpdate();
  },

  scheduleUpdate() {
    Log.info(`[MMM-DoneTick] Scheduling updates every ${this.config.updateInterval / 1000}s`);
    this.fetchChores();
    setInterval(() => this.fetchChores(), this.config.updateInterval);
  },

  fetchChores() {
    Log.info("[MMM-DoneTick] Sending FETCH_CHORES to node_helper...");
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

  filterAndSortChores(chores) {
    const now = new Date();
    const cutoff = new Date(now.getTime() + this.config.daysAhead * 24 * 60 * 60 * 1000);

    const active    = chores.filter(c => c.isActive);
    const hasDue    = active.filter(c => c.nextDueDate);
    const inWindow  = hasDue.filter(c => {
      const due = new Date(c.nextDueDate);
      if (!this.config.showOverdue && due < now) return false;
      if (due > cutoff) return false;
      return true;
    });

    Log.info(`[MMM-DoneTick] Filter breakdown — total: ${chores.length}, active: ${active.length}, has due date: ${hasDue.length}, in window: ${inWindow.length}`);

    if (inWindow.length === 0 && chores.length > 0) {
      Log.warn(`[MMM-DoneTick] All chores were filtered out. Check daysAhead (${this.config.daysAhead}) and showOverdue (${this.config.showOverdue}).`);
    }

    return inWindow
      .sort((a, b) => new Date(a.nextDueDate) - new Date(b.nextDueDate))
      .slice(0, this.config.maxChores);
  },

  // ─── Grouping helpers ─────────────────────────────────────────────────────

  /**
   * Returns an array of { assigneeId, displayName, chores[], hasOverdue, earliest }
   * ordered so that groups with overdue chores come first, then by earliest due date.
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
        const hasOverdue = groupChores.some((c) => new Date(c.nextDueDate) < now);
        const earliest = Math.min(...groupChores.map((c) => new Date(c.nextDueDate)));
        const displayName =
          this.config.userMap[id] ||
          this.config.userMap[Number(id)] ||
          (id === "unassigned" ? "Unassigned" : `User ${id}`);
        return { assigneeId: id, displayName, chores: groupChores, hasOverdue, earliest };
      })
      .sort((a, b) => {
        if (a.hasOverdue !== b.hasOverdue) return a.hasOverdue ? -1 : 1;
        return a.earliest - b.earliest;
      });
  },

  // ─── DOM Entry Point ──────────────────────────────────────────────────────

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

  makeMessage(text) {
    const el = document.createElement("div");
    el.className = "dimmed light small";
    el.innerHTML = text;
    return el;
  },

  // ─── Flat (by-date) view ──────────────────────────────────────────────────

  buildFlatView() {
    const table = document.createElement("table");
    table.className = "small donetick-table";

    this.chores.forEach((chore, index) => {
      const { isOverdue, isToday, isTomorrow } = this.choreStatus(chore);

      const row = document.createElement("tr");
      row.className = "donetick-row";
      this.applyFade(row, index, this.chores.length);

      // Icon
      const iconCell = document.createElement("td");
      iconCell.className = "donetick-icon";
      if (isOverdue) { iconCell.innerHTML = "⚠️"; row.classList.add("donetick-overdue"); }
      else if (isToday) { iconCell.innerHTML = "🔔"; row.classList.add("donetick-today"); }
      else { iconCell.innerHTML = "📋"; }
      row.appendChild(iconCell);

      // Name
      const nameCell = document.createElement("td");
      nameCell.className = "donetick-name bright";
      nameCell.innerHTML = chore.name;
      row.appendChild(nameCell);

      // Date
      row.appendChild(this.makeDateCell(isOverdue, isToday, isTomorrow, chore));

      table.appendChild(row);
      this.maybeAppendLabels(table, chore, 3);
    });

    return table;
  },

  // ─── Grouped (by-assignee) view ───────────────────────────────────────────

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

      const initials = displayName
        .split(" ")
        .map((w) => w[0].toUpperCase())
        .slice(0, 2)
        .join("");

      const avatar = document.createElement("span");
      avatar.className = "donetick-avatar";
      avatar.innerHTML = initials;
      header.appendChild(avatar);

      const nameSpan = document.createElement("span");
      nameSpan.className = "donetick-group-name bright";
      nameSpan.innerHTML = displayName;
      header.appendChild(nameSpan);

      if (hasOverdue) {
        const overdueBadge = document.createElement("span");
        overdueBadge.className = "donetick-badge donetick-badge-overdue";
        const overdueCount = chores.filter(
          (c) => new Date(c.nextDueDate) < new Date()
        ).length;
        overdueBadge.innerHTML = `${overdueCount} overdue`;
        header.appendChild(overdueBadge);
      }

      const countBadge = document.createElement("span");
      countBadge.className = "donetick-badge donetick-badge-count";
      countBadge.innerHTML = `${chores.length} task${chores.length !== 1 ? "s" : ""}`;
      header.appendChild(countBadge);

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

        const row = document.createElement("tr");
        row.className = "donetick-row donetick-group-row";
        if (isOverdue) row.classList.add("donetick-overdue");
        else if (isToday) row.classList.add("donetick-today");

        // Colored left-bar replaces icon in grouped view
        const barCell = document.createElement("td");
        barCell.className = "donetick-status-bar-cell";
        const bar = document.createElement("div");
        bar.className = "donetick-status-bar " + (
          isOverdue ? "donetick-bar-overdue" :
          isToday   ? "donetick-bar-today"   :
                      "donetick-bar-normal"
        );
        barCell.appendChild(bar);
        row.appendChild(barCell);

        // Name
        const nameCell = document.createElement("td");
        nameCell.className = "donetick-name bright";
        nameCell.innerHTML = chore.name;
        row.appendChild(nameCell);

        // Date
        row.appendChild(this.makeDateCell(isOverdue, isToday, isTomorrow, chore));

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

  applyFade(row, index, total) {
    if (this.config.fadePoint >= 1) return;
    const fadeStart = Math.round(total * (1 - this.config.fadePoint));
    if (index >= fadeStart) {
      const opacity = 1 - ((index - fadeStart + 1) / (total - fadeStart + 1)) * 0.7;
      row.style.opacity = opacity;
    }
  },

  formatDate(date) {
    const diffDays = Math.ceil((date - new Date()) / (1000 * 60 * 60 * 24));
    if (diffDays <= 7) {
      return date.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
    }
    return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  },
});
