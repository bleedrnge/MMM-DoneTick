/**
 * UI rendering logic for MMM-DoneTick.
 * Handles creation of DOM elements based on chore data and module configuration.
 */
const UiRenderer = {
  /**
   * Builds the standard table view where all chores are listed together by date.
   * @param {Object[]} chores - Array of chore objects.
   * @param {Object} config - Module configuration.
   * @param {Function} choreStatusFn - Function to get chore status.
   * @param {Function} translateFn - Function to translate strings.
   * @returns {HTMLElement} The table element.
   */
  buildFlatView(chores, config, choreStatusFn, translateFn) {
    const table = document.createElement("table");
    table.className = "small donetick-table";

    chores.forEach((chore, index) => {
      const status = choreStatusFn(chore);
      const row = this.createChoreRow(chore, status, false, translateFn);
      
      this.applyFade(row, index, chores.length, config.fadePoint);
      table.appendChild(row);
      this.maybeAppendLabels(table, chore, 3, false, config.showLabels);
    });

    return table;
  },

  /**
   * Builds the view where chores are categorized under assignee headers.
   * @param {Object[]} chores - Array of chore objects.
   * @param {Object} config - Module configuration.
   * @param {Function} groupChoresByAssigneeFn - Function to group chores.
   * @param {Function} choreStatusFn - Function to get chore status.
   * @param {Object} collapsedGroups - Object tracking collapsed group states.
   * @param {Function} toggleGroupFn - Function to toggle group collapse state.
   * @param {Function} translateFn - Function to translate strings.
   * @returns {HTMLElement} The container element.
   */
  buildGroupedView(chores, config, groupChoresByAssigneeFn, choreStatusFn, collapsedGroups, toggleGroupFn, translateFn) {
    const container = document.createElement("div");
    container.className = "donetick-grouped";

    const groups = groupChoresByAssigneeFn(chores, config);

    groups.forEach(({ assigneeId, displayName, chores: groupChores, hasOverdue }) => {
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

      this.appendGroupBadges(header, groupChores, hasOverdue, translateFn);

      // Collapse toggle (only wired up if collapsible: true)
      if (config.collapsible) {
        const toggle = document.createElement("span");
        toggle.className = "donetick-toggle";
        toggle.innerHTML = "▾";
        header.appendChild(toggle);

        if (collapsedGroups[assigneeId]) {
          section.classList.add("donetick-group-collapsed");
          toggle.style.transform = "rotate(-90deg)";
        }

        header.style.cursor = "pointer";
        header.addEventListener("click", () => {
          toggleGroupFn(assigneeId); // Call the module's toggle function
          section.classList.toggle("donetick-group-collapsed");
          toggle.style.transform = collapsedGroups[assigneeId]
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

      groupChores.forEach((chore) => {
        const status = choreStatusFn(chore);
        const row = this.createChoreRow(chore, status, true, translateFn);

        table.appendChild(row);
        this.maybeAppendLabels(table, chore, 3, true, config.showLabels);
      });

      choresContainer.appendChild(table);
      section.appendChild(choresContainer);
      container.appendChild(section);
    });

    return container;
  },

  /**
   * Creates a single table row for a chore.
   * @param {Object} chore - The chore data.
   * @param {Object} status - Pre-calculated status flags.
   * @param {boolean} isGrouped - Whether this is being rendered inside an assignee group.
   * @param {Function} translateFn - Function to translate strings.
   * @returns {HTMLElement} The <tr> element.
   */
  createChoreRow(chore, { isOverdue, isToday, isTomorrow }, isGrouped = false, translateFn) {
    const row = document.createElement("tr");
    row.className = `donetick-row ${isGrouped ? "donetick-group-row" : ""}`;
    
    if (isOverdue) row.classList.add("donetick-overdue");
    else if (isToday) row.classList.add("donetick-today");

    // Icon or Status Bar
    const iconCell = document.createElement("td");
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
    row.appendChild(this.makeDateCell(isOverdue, isToday, isTomorrow, chore, translateFn));
    
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
   * @param {Function} translateFn - Function to translate strings.
   */
  appendGroupBadges(container, chores, hasOverdue, translateFn) {
    if (hasOverdue) {
      const overdueCount = chores.filter(c => new Date(c.nextDueDate) < new Date()).length;
      container.appendChild(this.createBadge(`${overdueCount} ${translateFn("OVERDUE")}`, "donetick-badge-overdue"));
    }
    const taskText = `${chores.length} ${chores.length !== 1 ? translateFn("TASKS") : translateFn("TASK")}`;
    container.appendChild(this.createBadge(taskText, "donetick-badge-count"));
  },

  /**
   * Formats and creates the date cell for a chore row.
   * @param {boolean} isOverdue
   * @param {boolean} isToday
   * @param {boolean} isTomorrow
   * @param {Object} chore
   * @param {Function} translateFn - Function to translate strings.
   * @returns {HTMLElement}
   */
  makeDateCell(isOverdue, isToday, isTomorrow, chore, translateFn) {
    const cell = document.createElement("td");
    cell.className = "donetick-date dimmed";
    if (isOverdue) {
      cell.innerHTML = `<span class="donetick-overdue-text">${translateFn("OVERDUE")}</span>`;
    } else if (isToday) {
      cell.innerHTML = `<span class="donetick-today-text">${translateFn("TODAY")}</span>`;
    } else if (isTomorrow) {
      cell.innerHTML = `<span class="donetick-tomorrow-text">${translateFn("TOMORROW")}</span>`;
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
   * @param {boolean} showLabelsConfig - Value of config.showLabels.
   */
  maybeAppendLabels(table, chore, colSpan, indented = false, showLabelsConfig) {
    if (!showLabelsConfig) return;
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
   * @param {number} fadePointConfig - Value of config.fadePoint.
   */
  applyFade(row, index, total, fadePointConfig) {
    if (fadePointConfig >= 1) return;
    const fadeStart = Math.round(total * (1 - fadePointConfig));
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
};

if (typeof module !== "undefined") {
  module.exports = UiRenderer;
}
