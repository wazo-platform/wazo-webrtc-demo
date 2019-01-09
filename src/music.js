function loadAudio(url) {
  const { audioContext } = webRtcClient;

  return fetch(url).then(function(response) {
    return response.arrayBuffer();
  }).then(function(data) {
    return new Promise(function(resolve, reject) {
      audioContext.decodeAudioData(data, function(buffer) {
        buffer ? resolve(buffer) : reject();
      });
    });
  });
}

function playerMusic() {
  const { audioContext, mergeDestination } = webRtcClient;
  const playerNode = audioContext.createBufferSource();
  const splitterNode = audioContext.createChannelSplitter();
  const mergerNode = audioContext.createChannelMerger(2);
  let connected = false;
  let paused = false;

  playerNode.loop = true;

  loadAudio("https://googlechrome.github.io/samples/audio/techno.wav").then(function(buffer) {
    playerNode.buffer = buffer;
    playerNode.start();
  });

  playerNode.connect(splitterNode);
  splitterNode.connect(mergerNode, 0, 1);
  mergerNode.connect(audioContext.destination);
  mergerNode.connect(mergeDestination);

  document.getElementById('btn-connect').addEventListener('click', function() {
    if (connected) {
      splitterNode.disconnect(mergerNode, 1, 0);
      this.textContent = 'Connect Left Channel';
    } else {
      splitterNode.connect(mergerNode, 1, 0);
      this.textContent = 'Disconnect Left Channel';
    }
    connected = !connected;
  });

  document.getElementById('btn-pause').addEventListener('click', function() {
    if (!paused) {
      playerNode.disconnect(splitterNode);
      this.textContent = 'Play';
    } else {
      playerNode.connect(splitterNode);
      this.textContent = 'Pause';
    }
    paused = !paused;
  });
}
