import type { Config } from "jest";

const config: Config = {
  preset: "ts-jest",
  testEnvironment: "jsdom",
  roots: ["<rootDir>/src", "<rootDir>/tests"],
  testMatch: ["**/__tests__/**/*.ts", "**/?(*.)+(spec|test).ts"],
  transform: {
    "^.+\\.ts$": "ts-jest",
  },
  collectCoverageFrom: [
    "src/**/*.ts",
    "!src/**/*.d.ts",
    "!src/**/*.test.ts",
    "!src/**/*.spec.ts",
  ],
  coverageDirectory: "coverage",
  coverageReporters: ["text", "lcov", "html"],
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/src/$1",
    "^@math/(.*)$": "<rootDir>/src/math/$1",
    "^@renderer/(.*)$": "<rootDir>/src/renderer/$1",
    "^@physics/(.*)$": "<rootDir>/src/physics/$1",
    "^@shaders/(.*)$": "<rootDir>/src/shaders/$1",
    "^@scene/(.*)$": "<rootDir>/src/scene/$1",
    "^@utils/(.*)$": "<rootDir>/src/utils/$1",
  },
  setupFilesAfterEnv: ["<rootDir>/tests/setup.ts"],
  testTimeout: 10000,
  verbose: true,
};

export default config;
