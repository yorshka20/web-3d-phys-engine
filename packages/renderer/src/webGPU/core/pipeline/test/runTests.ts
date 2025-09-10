#!/usr/bin/env node

/**
 * Pipeline Test Runner
 *
 * Command-line tool for running pipeline tests.
 * Usage: npx tsx runTests.ts [--verbose] [--filter=pattern]
 */

import { runAllPipelineTests } from './index';

// Parse command line arguments
const args = process.argv.slice(2);
const verbose = args.includes('--verbose');
const filterArg = args.find((arg) => arg.startsWith('--filter='));
const filter = filterArg ? filterArg.split('=')[1] : null;

// Configure console output
if (!verbose) {
  // Suppress detailed logs in non-verbose mode
  const originalLog = console.log;
  console.log = (...args) => {
    if (args[0] && typeof args[0] === 'string' && args[0].includes('[')) {
      // Suppress detailed test logs
      return;
    }
    originalLog(...args);
  };
}

/**
 * Main test runner function
 */
async function main() {
  console.log('🚀 Starting Pipeline Test Suite...');
  console.log(`📁 Working directory: ${process.cwd()}`);

  if (filter) {
    console.log(`🔍 Filter: ${filter}`);
  }

  if (verbose) {
    console.log('📝 Verbose mode enabled');
  }

  console.log('');

  try {
    const startTime = Date.now();

    await runAllPipelineTests();

    const endTime = Date.now();
    const duration = endTime - startTime;

    console.log('');
    console.log(`⏱️  Tests completed in ${duration}ms`);
    console.log('🎉 All tests passed successfully!');

    process.exit(0);
  } catch (error) {
    console.error('');
    console.error('💥 Test suite failed:');
    console.error(error);

    process.exit(1);
  }
}

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('💥 Uncaught exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('💥 Unhandled rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// Run the tests
main();
