const fs = require('fs');
const content = fs.readFileSync('src/App.tsx', 'utf8');
let stack = [];
let i = 0;
while (i < content.length) {
  const c = content[i];
  if (c === '/' && content[i+1] === '/') {
    while (i < content.length && content[i] !== '\n') i++;
    continue;
  }
  if (c === '/' && content[i+1] === '*') {
    i += 2;
    while (i < content.length && !(content[i] === '*' && content[i+1] === '/')) i++;
    i += 2;
    continue;
  }
  if (c === '"' || c === "'" || c === '`') {
    const q = c;
    i++;
    while (i < content.length) {
      if (content[i] === '\\') i += 2;
      else if (content[i] === q) break;
      else i++;
    }
  } else if (c === '(' || c === '{' || c === '[') {
    stack.push({ char: c, line: content.substring(0, i).split('\n').length });
  } else if (c === ')' || c === '}' || c === ']') {
    const last = stack.pop();
    if (!last) {
      console.log(`Extra closing ${c} at line ${content.substring(0, i).split('\n').length}`);
      process.exit(1);
    }
  }
  i++;
}
if (stack.length > 0) {
  console.log("Unclosed: ", stack.slice(-5));
} else {
  console.log("Balanced (JS)!");
}
