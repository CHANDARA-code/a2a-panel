const fs = require('fs');

const args = process.argv.slice(2);
if (args[0] === 'root' && args[1] === '-g') {
  console.log(process.env.FAKE_NPM_ROOT || '');
  process.exit(0);
}
if (process.env.FAKE_NPM_LOG) {
  fs.appendFileSync(process.env.FAKE_NPM_LOG, `ARGV: ${args.join(' ')}\n`);
}
if (args[0] === 'install') {
  console.log('added 1 package in 1s');
  process.exit(Number(process.env.FAKE_NPM_EXIT || 0));
}
process.exit(0);
