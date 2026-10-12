const { execFile } = require('child_process');
const yts = require('yt-search');

const testSongs = [
  'Henrique e Juliano Liberdade Provisoria',
  'Gusttavo Lima Bloqueado',
  'Ed Sheeran Shape of You',
  'Coldplay Viva La Vida'
];

async function run() {
  for (const song of testSongs) {
    const t0 = Date.now();
    const r = await yts(song);
    const video = r.videos?.[0];
    if (!video) continue;
    const tSearch = Date.now() - t0;
    
    await new Promise((resolve) => {
      const t1 = Date.now();
      execFile('./bin/yt-dlp', [
        '-4',
        '-g',
        '-f', 'ba/b/140/251/18',
        '--extractor-args', 'youtube:player_client=tv_embedded,android,web',
        'https://www.youtube.com/watch?v=' + video.videoId
      ], (err, stdout, stderr) => {
        const tDlp = Date.now() - t1;
        if (err) {
          console.log('[FAIL] ' + song + ' (' + video.videoId + ') in ' + tDlp + 'ms: ' + stderr.trim().slice(0, 150));
        } else {
          console.log('[OK] ' + song + ' (' + video.videoId + ') in search=' + tSearch + 'ms dlp=' + tDlp + 'ms');
        }
        resolve();
      });
    });
  }
}
run();
