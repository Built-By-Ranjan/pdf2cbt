const fs = require('fs');
const path = require('path');
const { createCanvas, Image } = require(path.resolve(__dirname, '../paper2cbt/node_modules/@napi-rs/canvas'));

for (const q of [1, 2, 3, 5]) {
  const p = path.resolve(__dirname, '../paper2cbt/public/exams/challenge_14/Q' + String(q).padStart(3, '0') + '.png');
  if (fs.existsSync(p)) {
    const buf = fs.readFileSync(p);
    const img = new Image();
    img.src = buf;
    console.log('Q' + q, 'width:', img.width, 'height:', img.height, 'size:', buf.length);
  } else {
    console.log('Q' + q, 'NOT FOUND');
  }
}
