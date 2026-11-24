const fs = require('fs');
const path = require('path');
const { Image } = require(path.resolve(__dirname, '../paper2cbt/node_modules/@napi-rs/canvas'));

const userImages = [
  'C:/Users/sriya/.gemini/antigravity/brain/f7e23353-1a46-4e4b-96d2-5574fcbd2f3e/.user_uploaded/media_1795527846918_06acda42.png',
  'C:/Users/sriya/.gemini/antigravity/brain/f7e23353-1a46-4e4b-96d2-5574fcbd2f3e/.user_uploaded/media_1795527831966_f09d2d96.jpg',
  'C:/Users/sriya/.gemini/antigravity/brain/f7e23353-1a46-4e4b-96d2-5574fcbd2f3e/.user_uploaded/media_1795527820002_aeec2ecc.png'
];

for (const p of userImages) {
  if (fs.existsSync(p)) {
    const buf = fs.readFileSync(p);
    const img = new Image();
    img.src = buf;
    console.log(path.basename(p), 'dimensions:', img.width, 'x', img.height);
  }
}
