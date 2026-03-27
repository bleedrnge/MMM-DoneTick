/**
 * Unit tests for MMM-DoneTick
 */

// Mock MagicMirror globals
global.Log = {
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  log: jest.fn()
};

let moduleDefinition;
global.Module = {
  register: jest.fn((name, def) => {
    moduleDefinition = def;
  })
};

// Mock setInterval
jest.useFakeTimers();

// Load the module and its dependencies
global.ChoreProcessor = require('../src/chore_processor.js');
global.UiRenderer = require('../src/ui_renderer.js');
require('../MMM-DoneTick.js');

describe('MMM-DoneTick', () => {
  let mmm;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.setSystemTime(new Date("2023-10-10T12:00:00Z"));
    
    mmm = Object.assign({}, moduleDefinition);
    mmm.config = Object.assign({}, mmm.defaults);
    
    // Mock MM internal methods
    mmm.sendSocketNotification = jest.fn();
    mmm.updateDom = jest.fn();
    mmm.translate = jest.fn((key) => {
      const translations = {
        "LOADING": "Loading chores...",
        "NO_CHORES": "No upcoming chores 🎉",
        "OVERDUE": "Overdue",
        "TODAY": "Today",
        "TOMORROW": "Tomorrow",
        "TASKS": "tasks",
        "TASK": "task"
      };
      return translations[key] || key;
    });
    
    mmm.chores = [];
    mmm.loaded = false;
    mmm.error = null;
    mmm.collapsedGroups = {};
  });

  describe('Lifecycle & Communication', () => {
    it('should initialize and schedule updates', () => {
      mmm.start();
      expect(mmm.sendSocketNotification).toHaveBeenCalledWith("FETCH_CHORES", expect.anything());
    });

    it('should handle CHORES_DATA notification', () => {
      const mockData = [{ name: 'Test', isActive: true, nextDueDate: "2023-10-10T13:00:00Z" }];
      mmm.socketNotificationReceived('CHORES_DATA', mockData);
      expect(mmm.loaded).toBe(true);
      expect(mmm.chores.length).toBe(1);
      expect(mmm.updateDom).toHaveBeenCalled();
    });
  });

  describe('getDom', () => {
    it('should show loading message when not loaded', () => {
      const dom = mmm.getDom();
      expect(mmm.translate).toHaveBeenCalledWith("LOADING");
      expect(dom.innerHTML).toContain('Loading chores...');
    });

    it('should show "No upcoming chores" when empty', () => {
      mmm.loaded = true;
      mmm.chores = [];
      const dom = mmm.getDom();
      expect(mmm.translate).toHaveBeenCalledWith("NO_CHORES");
      expect(dom.innerHTML).toContain('No upcoming chores');
    });

    it('should delegate to UiRenderer for flat view', () => {
      mmm.loaded = true;
      mmm.config.groupBy = "date";
      mmm.chores = [{ name: 'Chore A', nextDueDate: "2023-10-10T13:00:00Z", isActive: true }];
      
      const spy = jest.spyOn(UiRenderer, 'buildFlatView');
      mmm.getDom();
      expect(spy).toHaveBeenCalled();
      spy.mockRestore();
    });

    it('should delegate to UiRenderer for grouped view', () => {
      mmm.loaded = true;
      mmm.config.groupBy = "assignee";
      mmm.chores = [{ name: 'Chore A', nextDueDate: "2023-10-10T13:00:00Z", isActive: true, assignedTo: 1 }];
      
      const spy = jest.spyOn(UiRenderer, 'buildGroupedView');
      mmm.getDom();
      expect(spy).toHaveBeenCalled();
      spy.mockRestore();
    });
  });
});

describe('ChoreProcessor', () => {
  const config = { daysAhead: 7, showOverdue: true, maxChores: 10, userMap: { "1": "Logan" } };

  beforeEach(() => {
    jest.setSystemTime(new Date("2023-10-10T12:00:00Z"));
  });

  it('should filter and sort chores', () => {
    const chores = [
      { name: 'Future', isActive: true, nextDueDate: "2023-10-12T12:00:00Z" },
      { name: 'Inactive', isActive: false, nextDueDate: "2023-10-10T12:00:00Z" },
      { name: 'Far', isActive: true, nextDueDate: "2023-10-20T12:00:00Z" }
    ];
    const result = ChoreProcessor.filterAndSort(chores, config);
    expect(result.length).toBe(1);
    expect(result[0].name).toBe('Future');
  });

  it('should group chores by assignee', () => {
    const chores = [
      { name: 'C1', assignedTo: 1, nextDueDate: "2023-10-10T13:00:00Z", isActive: true },
      { name: 'C2', assignedTo: 2, nextDueDate: "2023-10-10T13:00:00Z", isActive: true }
    ];
    const groups = ChoreProcessor.groupByAssignee(chores, config);
    expect(groups.length).toBe(2);
    expect(groups.find(g => g.assigneeId === "1").displayName).toBe("Logan");
  });

  it('should identify status', () => {
    const today = { nextDueDate: "2023-10-10T13:00:00Z" };
    const status = ChoreProcessor.getStatus(today);
    expect(status.isToday).toBe(true);
  });
});

describe('UiRenderer', () => {
  const mockTranslate = (key) => key;
  const mockStatus = () => ({ isOverdue: false, isToday: true, isTomorrow: false });

  it('should build a message element', () => {
    const msg = UiRenderer.makeMessage("Test");
    expect(msg.innerHTML).toBe("Test");
    expect(msg.className).toContain("dimmed");
  });

  it('should build a flat view table', () => {
    const chores = [{ name: 'Chore' }];
    const config = { fadePoint: 1, showLabels: false };
    const table = UiRenderer.buildFlatView(chores, config, mockStatus, mockTranslate);
    expect(table.tagName).toBe('TABLE');
    expect(table.innerHTML).toContain('Chore');
  });
});
