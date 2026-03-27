/**
 * Logic for filtering, sorting, and grouping chores.
 * Pure functions for easier testing.
 */
const ChoreProcessor = {
  /**
   * Filters chores based on active status, due date window, and max count.
   */
  filterAndSort(chores, config) {
    const now = new Date();
    const cutoff = new Date();
    cutoff.setDate(now.getDate() + config.daysAhead);

    const inWindow = chores.filter(chore => {
      if (!chore.isActive || !chore.nextDueDate) return false;
      const due = new Date(chore.nextDueDate);
      const isOverdue = due < now;
      
      if (!config.showOverdue && isOverdue) return false;
      return due <= cutoff || (isOverdue && config.showOverdue);
    });

    return inWindow
      .sort((a, b) => new Date(a.nextDueDate) - new Date(b.nextDueDate))
      .slice(0, config.maxChores);
  },

  /**
   * Groups chores by assignee.
   */
  groupByAssignee(chores, config) {
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
          config.userMap[id] ||
          config.userMap[Number(id)] ||
          (id === "unassigned" ? "Unassigned" : `User ${id}`);

        return { assigneeId: id, displayName, chores: groupChores, hasOverdue, earliest };
      })
      .sort((a, b) => {
        if (a.hasOverdue !== b.hasOverdue) return a.hasOverdue ? -1 : 1;
        return a.earliest - b.earliest;
      });
  },

  /**
   * Determines relative timing of a chore's due date.
   */
  getStatus(chore) {
    const now = new Date();
    const dueDate = new Date(chore.nextDueDate);
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    return {
      dueDate,
      isOverdue: dueDate < now,
      isToday: dueDate.toDateString() === now.toDateString(),
      isTomorrow: dueDate.toDateString() === tomorrow.toDateString(),
    };
  }
};

if (typeof module !== "undefined") {
  module.exports = ChoreProcessor;
}
