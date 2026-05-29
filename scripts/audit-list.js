// List programs to audit
const fs = require('fs');
const path = require('path');

const data = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'src', 'data', 'requirements-filtered.json'), 'utf8'));

const programs = [];
for (const [pid, entry] of Object.entries(data)) {
  if (pid === 'core-bmath' || pid === 'core-bmath-mathstudies') continue;
  if (entry.isMathFaculty === true || entry.isMinor === true) {
    programs.push({ pid, name: entry.name, isMath: entry.isMathFaculty, isMinor: entry.isMinor });
  }
}

console.log('Total programs to check:', programs.length);
console.log(JSON.stringify(programs, null, 2));
