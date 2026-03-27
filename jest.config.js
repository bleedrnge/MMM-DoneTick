/**
 * Jest configuration for MMM-DoneTick
 */
module.exports = {
  // Use jsdom to simulate the browser environment required by MagicMirror²
  testEnvironment: "jsdom",

  // Automatically clear mock calls, instances, contexts and results before every test
  clearMocks: true,

  // Automatically restore mock state and implementation before every test
  restoreMocks: true,

  // Indicates whether the coverage information should be collected while executing the test
  collectCoverage: true,

  // The directory where Jest should output its coverage files
  coverageDirectory: "coverage",

  // An array of regexp pattern strings used to skip coverage collection
  coveragePathIgnorePatterns: [
    "\\\\node_modules\\\\"
  ],

  // The display name for the test suite in the console
  displayName: "MMM-DoneTick",

  // A list of paths to directories that Jest should use to search for files in
  roots: ["<rootDir>"]
};