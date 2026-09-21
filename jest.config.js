/** @type {import('jest').Config} */
module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  roots: ["<rootDir>/unit-testing"],
  testMatch: ["**/*.test.ts"],
  setupFiles: ["<rootDir>/unit-testing/setupEnv.ts"],
  transform: {
    "^.+\\.ts$": [
      "ts-jest",
      { tsconfig: "<rootDir>/unit-testing/tsconfig.json", diagnostics: false },
    ],
  },
  clearMocks: true,
  restoreMocks: true,
  collectCoverageFrom: [
    "src/**/*.ts",
    "!src/index.ts",
    "!src/service/otpService.ts",
  ],
  coverageDirectory: "coverage",
};
