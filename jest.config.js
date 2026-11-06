/** Jest configuration — pure unit tests (no DOM) for the business rules in src/core.js and src/auth.js. */
module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  testMatch: ['**/*.test.js'],
  collectCoverageFrom: ['src/core.js', 'src/auth.js'],
  coverageDirectory: 'coverage',
  verbose: true
};
