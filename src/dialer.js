let currentSession;
const sessions = {};
const mutedSessions = {};
let inConference = false;
let streams = [];
let audioContext;
let destination;


function setMainStatus(status) {
  $('#dialer .status').html(status);
}

function getNumber(session) {
  return session.remoteIdentity.uri._normal.user;
}

function getStatus(session) {
  const number = getNumber(session);

  if (session.local_hold) {
    return 'Call with ' + number + ' hold';
  }

  switch (session.status) {
    case 0:
    case 1:
    case 2:
      return 'Calling ' + number + '...';
    case 3:
    case 5:
    case 12:
      return 'On call with : ' + number;
    case 9:
      return 'Call canceled by ' + number;
    default:
      return 'Unknown status: ' + session.status;
  }
}

function initializeWebRtc(sipLine, host) {
  webRtcClient = new window['@wazo/sdk'].WazoWebRTCClient({
    host: host,
    displayName: 'My dialer',
    authorizationUser: sipLine.username,
    password: sipLine.secret,
    uri: sipLine.username + '@' + host,
    media: {
      audio: document.getElementById('audio')
    }
  });

  webRtcClient.on('invite', function (session) {
    bindSessionCallbacks(session);
    openIncomingCallModal(session);
  });
  webRtcClient.on('accepted', onCallAccepted);
  webRtcClient.on('ended', function () {
    resetDialer('Call ended');
  });

  destination = audioContext.createMediaStreamDestination();
}

function onCallAccepted(session) {
  sessions[session.id] = session;
  currentSession = session;

  addDialer(session, 'In call...');
}

function onPhoneCalled(session) {
  sessions[session.id] = session;
  currentSession = session;

  bindSessionCallbacks(session);
}

function onCallTerminated(session) {
  delete sessions[session.id];

  // Current session terminated ?
  if (currentSession && currentSession.id=== session.id) {
    // Remaining session ? take first
    currentSession = Object.keys(sessions).length ? sessions[Object.keys(sessions)[0]] : null;
    if (currentSession) {
      unhold(currentSession);
    }
  }

  updateDialers();
}

function accept(session) {
  // Hold current session if exists
  if (currentSession) {
    hold(currentSession);
  }

  webRtcClient.answer(session);

  onCallAccepted(session);
}

function unhold(session) {
  webRtcClient.unhold(session);

  updateDialers();
}

function hold(session) {
  webRtcClient.hold(session);

  updateDialers();
}

function mute(session) {
  webRtcClient.mute(session);
  mutedSessions[session.id] = true;

  updateDialers();
}

function unmute(session) {
  webRtcClient.unmute(session);
  delete mutedSessions[session.id];

  updateDialers();
}

function startConference() {
  playerMusic();

  if (audioContext.state == 'suspended') {
      audioContext.resume();
  }

  Object.values(sessions).forEach(session => {
    const sdh = session.sessionDescriptionHandler;
    const pc = sdh.peerConnection;

    const localStream = pc.getLocalStreams()[0];
    addStream(localStream, true);

    if (session.local_hold) {
      unhold(session);

      sdh.on('addTrack', (evtrack) => {
        console.log('Adding to the conference :', getNumber(session));
        const remoteStream = evtrack.streams[0];
        addStream(remoteStream);
        pc.removeStream(remoteStream);
      });
    } else {
      console.log('Adding to the conference :', getNumber(session));
      const remoteStream = pc.getRemoteStreams()[0];
      addStream(remoteStream);
      pc.removeStream(remoteStream);
    }

    pc.removeStream(localStream);
    pc.addStream(destination.stream);
    pc.createOffer(webRtcClient._getRtcOptions())
      .then(offer => pc.setLocalDescription(offer))
      .catch(error => console.log(`createOffer failed: ${error}`));
  });

  inConference = true;
  updateDialers();
}

function addStream(mediaStream, isLocal) {
  const id = mediaStream.id;
  const audioSource = audioContext.createMediaStreamSource(mediaStream);
  audioSource.connect(destination);
  if (!isLocal) {
    streams.push({id, audioSource, mediaStream});
  }
}

function removeStream(mediaStream) {
  console.log(mediaStream);
  for (let i = 0; i < streams.length; i++) {
    if (streams[i].id == mediaStream.id) {
      streams[i].audioSource.disconnect(destination);
      streams[i].audioSource = null;
      streams[i] = null;
      streams.splice(i, 1);
    }
  }
}

function getStream() {
  return destination.stream;
}

function resetDialer(status) {
  const dialer = $('#dialer');
  const numberField = $('#dialer .number');
  const conferenceButton = $('#dialer .conference');

  dialer.show();
  $('#dialer .hangup').hide();
  numberField.val('');
  setMainStatus(status);

  dialer.off('submit').on('submit', function (e) {
    e.preventDefault();

    const session = webRtcClient.call(numberField.val());

    if (currentSession) {
      hold(currentSession);
    }

    onPhoneCalled(session);

    resetDialer('');
    updateDialers();
  });

  if(Object.keys(sessions).length > 1 && !inConference) {
    conferenceButton.show();
  } else {
    conferenceButton.hide();
  }

  conferenceButton.off('click').on('click', function (e) {
    e.preventDefault();
    startConference();
  });

}

function bindSessionCallbacks(session) {
  const number = getNumber(session);

  session.on('accepted', updateDialers);
  session.on('failed', function () {
    onCallTerminated(session);
    setMainStatus('Call with ' + number + ' failed');
  });
  session.on('rejected', function () {
    onCallTerminated(session);
    setMainStatus('Call with ' + number + ' rejected');
  });
  session.on('terminated', function () {
    onCallTerminated(session);
    setMainStatus('Call with ' + number + ' terminated');
  });
  session.on('cancel', function () {
    onCallTerminated(session);
    setMainStatus('Call with ' + number + ' canceled');
  });
  session.on('SessionDescriptionHandler-created', function (sdh) {
    console.log('Media session:', sdh);
    sdh.on('userMedia', (stream) => {
      console.log('Local');
      console.log(stream);
      const audioTracks = stream.getAudioTracks();
      console.log("Opened audio sources: " + audioTracks.map(function(v){return v.label;}).join());
      console.log(audioTracks[0]);
    });
    sdh.on('addTrack', (evtrack) => {
      console.log('Remote');
      const stream = evtrack.streams[0];
      console.log(stream);
      console.log(evtrack.track);
    });
  });
}

function addDialer(session) {
  const newDialer = $('#dialer').clone().attr('id', 'call-' + session.id);
  const hangupButton = $('.hangup', newDialer);
  const dialButton = $('.dial', newDialer);
  const unholdButton = $('.unhold', newDialer);
  const holdButton = $('.hold', newDialer);
  const muteButton = $('.mute', newDialer);
  const unmuteButton = $('.unmute', newDialer);
  const conferenceButton = $('.conference', newDialer);

  $('.form-group', newDialer).hide();
  holdButton.hide();
  unholdButton.hide();
  muteButton.hide();
  unmuteButton.hide();
  conferenceButton.hide();

  if (session.local_hold) {
    unholdButton.show();
  } else {
    holdButton.show();
  }
  
  if (session.id in mutedSessions) {
    unmuteButton.show();
  } else {
    muteButton.show();
  }

  $('.status', newDialer).html(getStatus(session));
  dialButton.hide();
  dialButton.prop('disabled', true);

  hangupButton.show();
  hangupButton.off('click').on('click', function (e) {
    e.preventDefault();
    webRtcClient.hangup(session);
    delete sessions[session.id];

    console.log(streams);
    const pc = session.sessionDescriptionHandler.peerConnection;
    const localStream = pc.getLocalStreams()[0];
    const remoteStream = pc.getRemoteStreams()[0];
    removeStream(localStream);
    removeStream(remoteStream);

    console.log(streams);

    inConference = false;
    updateDialers();
    resetDialer('');
  });

  unholdButton.off('click').on('click', function (e) {
    e.preventDefault();
    unhold(session);
  });

  holdButton.off('click').on('click', function (e) {
    e.preventDefault();
    hold(session);
  });

  muteButton.off('click').on('click', function (e) {
    e.preventDefault();
    mute(session);
  });

  unmuteButton.off('click').on('click', function (e) {
    e.preventDefault();
    unmute(session);
  });

  newDialer.appendTo($('#dialers'));
}

function updateDialers() {
  $('#dialers').html('');

  for (const session_id of Object.keys(sessions)) {
    addDialer(sessions[session_id]);
  }
}

function openIncomingCallModal(session) {
  const number = session.remoteIdentity.uri._normal.user;

  $('#incoming-modal').modal({backdrop: 'static'});
  $('#incoming-modal h5 span').html(number);

  $('#accept').off('click').on('click', function () {
    $('#incoming-modal').modal('hide');
    accept(session);
  });
  $('#reject').off('click').on('click', function () {
    webRtcClient.reject(session);
    $('#incoming-modal').modal('hide');
  });
}
