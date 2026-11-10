#!/usr/bin/env node
import process from 'node:process';
import { main } from '../src/cli.js';

main(process.argv.slice(2))
  .then(function (code) { process.exitCode = code || 0; })
  .catch(function (err) {
    process.stderr.write('whygit: ' + (err && err.message ? err.message : String(err)) + '\n');
    if (process.env.WHYGIT_DEBUG) console.error(err);
    process.exitCode = 1;
  });
