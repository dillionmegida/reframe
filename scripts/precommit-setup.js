#!/usr/bin/env node

const { existsSync } = require('fs');
const { execSync } = require('child_process');
const path = require('path');

function run(command, message) {
  if (message) {
    console.log(message);
  }
  execSync(command, { stdio: 'inherit' });
}

try {
  const repoRoot = process.cwd();
  const gitDir = path.join(repoRoot, '.git');

  if (!existsSync(gitDir)) {
    console.error('Error: .git directory not found. Run this script from the repository root.');
    process.exit(1);
  }

  const nodeModulesDir = path.join(repoRoot, 'node_modules');
  const vitestDir = path.join(nodeModulesDir, 'vitest');

  if (!existsSync(nodeModulesDir) || !existsSync(vitestDir)) {
    run('npm install', 'Installing dependencies (npm install)...');
  } else {
    console.log('Dependencies already installed; skipping npm install.');
  }

  run('bash setup-pre-commit.sh', 'Installing git pre-commit hook...');
  console.log('\nPre-commit hook ready. It runs tests when relevant files are staged.');
} catch (error) {
  console.error('\nPre-commit setup failed:');
  console.error(error.message || error);
  process.exit(1);
}
