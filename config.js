const fs = require('fs');
const os = require('os');
const path = require('path');

const installedAsPackage = __dirname.split(path.sep).includes('node_modules');
// npm installs keep data in ~/.a2a-panel; an existing folder from the old name (agy-bridge) is kept in use.
function packageDataDir() {
  const current = path.join(os.homedir(), '.a2a-panel');
  const legacy = path.join(os.homedir(), '.agy-bridge');
  return !fs.existsSync(current) && fs.existsSync(legacy) ? legacy : current;
}

const DATA_DIR = process.env.A2A_HOME || (installedAsPackage ? packageDataDir() : __dirname);

module.exports = { DATA_DIR };
