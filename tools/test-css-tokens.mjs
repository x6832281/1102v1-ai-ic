import fs from 'node:fs';

const css = fs.readFileSync('public/pixel-tavern/style.css', 'utf8');

// 1. 验证括号严格平衡
let open = 0;
for (let i = 0; i < css.length; i++) {
    if (css[i] === '{') open++;
    else if (css[i] === '}') open--;
    if (open < 0) {
        console.error('Brace balance error at index', i);
        process.exit(1);
    }
}
if (open !== 0) {
    console.error('Unbalanced braces, diff:', open);
    process.exit(1);
}

// 2. 验证新 Glassmorphism 2.0 设计令牌
const requiredTokens = [
    '--panel-glass',
    '--panel-glass-deep',
    '--panel-border',
    '--panel-border-hover',
    '--shadow-card',
    '--shadow-card-hover',
    '--glass-blur',
];

const missing = [];
for (const token of requiredTokens) {
    if (!css.includes(token)) {
        missing.push(token);
    }
}

if (missing.length > 0) {
    console.error('FAIL: Missing Glassmorphism 2.0 tokens:', missing);
    process.exit(1);
}

console.log('PASS: All Glassmorphism 2.0 tokens exist and CSS braces balanced.');
