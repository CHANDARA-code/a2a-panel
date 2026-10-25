const os = require('os');
const path = require('path');

const installedAsPackage = __dirname.split(path.sep).includes('node_modules');
const DATA_DIR = process.env.A2A_HOME || (installedAsPackage ? path.join(os.homedir(), '.agy-bridge') : __dirname);

module.exports = { DATA_DIR };
