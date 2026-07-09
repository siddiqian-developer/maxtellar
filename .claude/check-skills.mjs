#!/usr/bin/env node
/**
 * Timekeeper Skills Audit
 * Checks if skills are up-to-date and suggests updates
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const checks = {
  // Check if dev server info in skills matches current config
  devServer: () => {
    try {
      const vitoConfig = fs.readFileSync(path.join(__dirname, '../apps/web/vite.config.ts'), 'utf8');
      const skillFile = fs.readFileSync(path.join(__dirname, './skills/run-timekeeper/SKILL.md'), 'utf8');

      // Check if localhost:5173 is mentioned in both
      const configHas5173 = vitoConfig.includes('5173');
      const skillHas5173 = skillFile.includes('5173');

      return {
        name: 'run-timekeeper skill',
        ok: skillHas5173,
        message: configHas5173 && !skillHas5173 ? 'Dev server port may have changed' : 'Dev server config up-to-date',
      };
    } catch (e) {
      return { name: 'run-timekeeper skill', ok: false, message: 'Could not verify' };
    }
  },

  // Check if test runner matches current setup
  testRunner: () => {
    try {
      const pkgJson = JSON.parse(fs.readFileSync(path.join(__dirname, '../apps/web/package.json'), 'utf8'));
      const skillFile = fs.readFileSync(path.join(__dirname, './skills/test-timekeeper/SKILL.md'), 'utf8');

      const usesVitest = pkgJson.devDependencies?.vitest;
      const skillMentionsVitest = skillFile.includes('vitest');

      return {
        name: 'test-timekeeper skill',
        ok: usesVitest ? skillMentionsVitest : true,
        message: usesVitest && !skillMentionsVitest ? 'Vitest configured but skill not updated' : 'Test setup up-to-date',
      };
    } catch (e) {
      return { name: 'test-timekeeper skill', ok: false, message: 'Could not verify' };
    }
  },

  // Check if new scripts were added to package.json
  newScripts: () => {
    try {
      const pkgJson = JSON.parse(fs.readFileSync(path.join(__dirname, '../apps/web/package.json'), 'utf8'));
      const scripts = Object.keys(pkgJson.scripts || {});
      const expectedScripts = ['dev', 'build', 'test', 'typecheck', 'preview'];

      const newScripts = scripts.filter(s => !expectedScripts.includes(s));

      return {
        name: 'new scripts detection',
        ok: newScripts.length === 0,
        message: newScripts.length > 0 ? `New scripts found: ${newScripts.join(', ')}` : 'No new scripts',
      };
    } catch (e) {
      return { name: 'new scripts detection', ok: false, message: 'Could not check' };
    }
  },
};

console.log('🔍 Timekeeper Skills Audit\n');

let allOk = true;
for (const [key, check] of Object.entries(checks)) {
  const result = check();
  const icon = result.ok ? '✓' : '⚠';
  console.log(`${icon} ${result.name}: ${result.message}`);
  if (!result.ok) allOk = false;
}

console.log('\n' + (allOk ? '✓ All skills are up-to-date' : '⚠ Some skills may need updating'));

process.exit(allOk ? 0 : 1);
