const fs = require('fs');
function printFile(filePath) {
  console.log('=== ' + filePath + ' ===');
  if (!fs.existsSync(filePath)) {
    console.log('File does not exist');
    return;
  }
  const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/);
  lines.forEach((line, index) => {
    console.log((index + 1).toString().padStart(4) + ': ' + line);
  });
}
const args = process.argv.slice(2);
args.forEach(printFile);
