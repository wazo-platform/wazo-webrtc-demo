const sessions = {};
let currentSession;
let currentAtxfer;
let currentConference = null;

const setFullName = async () => {
  const user = await Wazo.getApiClient().confd.getUser(Wazo.Auth.getSession().uuid);
  const fullName = user.firstName ? `${user.firstName} ${user.lastName}` : user.username;

  $('#user').html(`${fullName} (${user.lines[0].extensions[0].exten})`);
};

const setMainStatus = status => {
  $('#dialer .status').html(status);
};

const getNumber = callSession => callSession.realDisplayName || callSession.displayName || callSession.number;

const getStatus = callSession => {
  const number = getNumber(callSession);

  if (callSession.paused) {
    return 'Call with ' + number + ' on hold';
  }

  if (callSession.muted) {
    return 'Call with ' + number + ' muted';
  }

  switch (callSession.sipStatus) {
    case Wazo.Phone.SessionState.Initial:
    case Wazo.Phone.SessionState.Establishing:
      return 'Calling ' + number + '...';
    case Wazo.Phone.SessionState.Established:
      return 'On call with : ' + number;
    case Wazo.Phone.SessionState.Terminated:
      return 'Call canceled by ' + number;
    default:
      return 'Unknown status: ' + callSession.sipStatus;
  }
};

const initializeWebRtc = () => {
  Wazo.Phone.connect({
    media: {
      audio: true,
      video: true,
    },
    // log: { builtinEnabled: true, logLevel: 'debug' },
  });

  const onSessionUpdate = callSession => {
    sessions[callSession.getId()] = callSession;
    updateDialers();
  }

  Wazo.Phone.on(Wazo.Phone.ON_CALL_INCOMING, (callSession, withVideo) => {
    openIncomingCallModal(callSession, withVideo);
  });
  Wazo.Phone.on(Wazo.Phone.ON_CALL_ACCEPTED, (callSession, withVideo) => {
    onCallAccepted(callSession, withVideo);
  });
  Wazo.Phone.on(Wazo.Phone.ON_CALL_ENDED, callSession => {
    onCallTerminated(callSession);
  });
  Wazo.Phone.on(Wazo.Phone.ON_CALL_HELD, onSessionUpdate);
  Wazo.Phone.on(Wazo.Phone.ON_CALL_UNHELD, onSessionUpdate);
  Wazo.Phone.on(Wazo.Phone.ON_CALL_MUTED, onSessionUpdate);
  Wazo.Phone.on(Wazo.Phone.ON_CALL_UNMUTED, onSessionUpdate);
  Wazo.Phone.on(Wazo.Phone.ON_REINVITE, (session, request, updatedCalleeName) => {
    const sessionId = Wazo.Phone.getSipSessionId(session);
    const callSession = sessions[sessionId];
    if (callSession) {
      currentSession.realDisplayName = updatedCalleeName;

      onSessionUpdate(currentSession);
    }
  });

  Wazo.Phone.on(Wazo.Phone.ON_SIGNAL, payload => {
    if (payload.action === Wazo.Phone.ON_MESSAGE_TRACK_UPDATED) {
      console.log('ON_MESSAGE_TRACK_UPDATED');
      updateDialers();
    }
  });

  setFullName();
  resetMainDialer();

  displayVideoDevices();
};

function displayVideoDevices() {
  const $videoDeviceId = $('#videoDeviceId');

  $videoDeviceId.change(() => {
    Wazo.Phone.phone.changeVideoInputDevice($videoDeviceId.val());
  });

  navigator.mediaDevices.enumerateDevices().then(devices => {
    const videoDevices = devices.filter(device => device.kind === 'videoinput');

    videoDevices.forEach(device => {
      const option = document.createElement('option');
      option.value = device.deviceId;
      option.innerHTML = device.label;
      $videoDeviceId.append(option);
    });
  })
}

function onCallAccepted(callSession, withVideo) {
  sessions[callSession.getId()] = callSession;
  currentSession = callSession;

  addDialer(callSession, withVideo);
  resetMainDialer();
}

function onPhoneCalled(callSession) {
  sessions[callSession.getId()] = callSession;
  currentSession = callSession;
}

const onCallTerminated = callSession => {
  // Current session terminated ?
  if (currentSession && currentSession.is(callSession)) {
    // Remaining session ? take first
    currentSession = Object.keys(sessions).length ? sessions[Object.keys(sessions)[0]] : null;
    if (currentSession) {
      unhold(currentSession);
    }
  }

  currentAtxfer = null;
  delete sessions[callSession.getId()];

  resetMainDialer('Call with ' + getNumber(callSession) + ' ended');
};

const accept = (callSession, withVideo) => {
  // Hold current session if exists
  if (currentSession && !currentConference) {
    hold(currentSession);
  }

  Wazo.Phone.accept(callSession, withVideo);

  onCallAccepted(callSession, withVideo);
};

const unhold = async callSession => {
  await Wazo.Phone.resume(callSession);
  setTimeout(updateDialers, 3000);
};

const hold = async callSession => {
  await Wazo.Phone.hold(callSession);
  setTimeout(updateDialers, 1000);
};

const mute = callSession => Wazo.Phone.mute(callSession);

const unmute = callSession => Wazo.Phone.unmute(callSession);

const startConference = async () => {
  const otherCalls = Object.values(sessions).filter(session => !session.is(currentSession));
  currentConference = await Wazo.Phone.startConference(currentSession, otherCalls);

  resetMainDialer('Conference started');
}

const addToConference = async callSession => {
  currentConference = await currentConference.addParticipant(callSession);

  resetMainDialer(getNumber(session) + ' added to merge');
}

const removeFromConference = async callSession => {
  currentConference = await currentConference.removeParticipant(callSession);

  if (currentConference.participants.length === 1) {
    await endConference();
  }

  resetMainDialer(getNumber(callSession) + ' removed from merge');
}

const endConference = async () => {
  await currentConference.hangup();
  currentConference = null;
}

const transfer = (callSession, target) => {
  Wazo.Phone.transfer(callSession, target);

  updateDialers();
};

const reinvite = async (callSession, enableVideo) => {
  await Wazo.Phone.reinvite(callSession, { audio: true, video: enableVideo }, false);
  callSession.cameraEnabled = enableVideo;
  sessions[callSession.getId()] = callSession;

  // Let some times to track to be retrieved
  setTimeout(updateDialers, 1000);
};

const addScreenTrack = async (callSession) => {
  const session = Wazo.Phone.phone.currentSipSession;
  const newStream = await navigator.mediaDevices.getDisplayMedia({ video: { cursor: 'always' }, audio: false });
  const videoTracks = newStream.getVideoTracks();
  const localStream = session.sessionDescriptionHandler.localMediaStream;
  const pc = session.sessionDescriptionHandler.peerConnection;

  localStream.addTrack(videoTracks[0]);
  pc.addTrack(videoTracks[0], newStream);

  await Wazo.Phone.reinvite(callSession, { audio: true, video: true }, false);
  // session.sessionDescriptionHandler.peerConnection.getSenders()[1].replaceTrack(videoTracks[0]);
};

function resetMainDialer(status) {
  const dialer = $('#dialer');
  const numberField = $('#dialer .number');
  const mergeButton = $('#dialer .merge');
  const unmergeButton = $('#dialer .unmerge');
  const videoButton = $('#dialer .video-call');

  dialer.show();
  videoButton.show();
  $('#dialer .hangup').hide();
  unmergeButton.hide();
  mergeButton.hide();
  numberField.val('');
  setMainStatus(status || '');

  const call = async (video = false) => {
    const number = numberField.val();
    const isConference = false;
    const callSession = await Wazo.Phone.call(number, video, null, false, isConference);

    if (currentSession && !currentConference) {
      hold(currentSession);
    }

    onPhoneCalled(callSession);

    resetMainDialer('');
    updateDialers();
  }

  dialer.off('submit').on('submit', e => {
    e.preventDefault();

    call(false);
  });

  if (currentConference) {
    unmergeButton.show();
  } else if(Object.keys(sessions).length > 1) {
    mergeButton.show();
  }

  mergeButton.off('click').on('click', e => {
    e.preventDefault();
    startConference();
  });

  unmergeButton.off('click').on('click', e => {
    e.preventDefault();
    endConference();
  });

  videoButton.off('click').on('click', e => {
    e.preventDefault();
    call(true);
  });

  updateDialers();
}

function addDialer(callSession) {
  const newDialer = $('#dialer').clone().attr('id', 'call-' + callSession.getId());
  // const isSessionInMerge = sessionIdsInMerge.indexOf(session.getId()) !== -1;
  const hangupButton = $('.hangup', newDialer);
  const dialButton = $('.dial', newDialer);
  const unholdButton = $('.unhold', newDialer);
  const holdButton = $('.hold', newDialer);
  const muteButton = $('.mute', newDialer);
  const unmuteButton = $('.unmute', newDialer);
  const mergeButton = $('.merge', newDialer).html('Add to merge');
  const unmergeButton = $('.unmerge', newDialer).html('Remove from merge');
  const atxferButton = $('.atxfer', newDialer);
  const transferButton = $('.transfer', newDialer);
  const videoButton = $('.video-call', newDialer);
  const upgradeVideoButton = $('.upgrade-video', newDialer);
  const downgradeVideoButton = $('.downgrade-audio', newDialer);
  const remoteVideoStream = Wazo.Phone.getRemoteVideoStream(callSession);
  const localVideoStream = Wazo.Phone.getLocalVideoStream(callSession);
  const hasLocalVideo = Wazo.Phone.phone.hasLocalVideo(callSession);

  $('.form-group', newDialer).hide();
  holdButton.hide();
  videoButton.hide();
  unholdButton.hide();
  muteButton.hide();
  unmuteButton.hide();
  mergeButton.hide();
  unmergeButton.hide();
  atxferButton.hide();
  transferButton.hide();
  upgradeVideoButton.hide();
  downgradeVideoButton.hide();

  // Videos
  const videoContainer = $('.videos', newDialer);
  if (remoteVideoStream) {
    videoContainer.show();

    // Remote videos
    const $remoteVideo = $('video.remote', newDialer);
    $remoteVideo.show();
    const wazoStream = new Wazo.Stream(remoteVideoStream);
    wazoStream.attach($remoteVideo[0]);
  } else {
    videoContainer.hide();
  }

  const $localVideo = $('video.local');
  console.log('hasLocalVideo', hasLocalVideo);
  if (hasLocalVideo) {
    $localVideo.show();

    const wazoStream = new Wazo.Stream(localVideoStream);
    wazoStream.attach($localVideo[0]);
  } else {
    $localVideo.hide();
  }

  // Upgrade / Downgrade
  if (hasLocalVideo) {
    downgradeVideoButton.show();
    downgradeVideoButton.off('click').on('click', async e => {
      e.preventDefault();
      reinvite(callSession, false);
    });
  } else {
    upgradeVideoButton.show();
    upgradeVideoButton.off('click').on('click', async e => {
      e.preventDefault();
      reinvite(callSession, true);
    });
  }

  if (callSession.paused) {
    unholdButton.show();
  } else {
    holdButton.show();
  }

  if (callSession.muted) {
    unmuteButton.show();
  } else {
    muteButton.show();
  }

  if (currentConference) {
    if (isSessionInMerge) {
      unmergeButton.show();
    } else {
      mergeButton.show();
    }
  }

  $('.status', newDialer).html(getStatus(callSession));
  dialButton.hide();
  dialButton.prop('disabled', true);

  hangupButton.show();
  hangupButton.off('click').on('click', e => {
    e.preventDefault();
    Wazo.Phone.hangup(callSession);

    onCallTerminated(callSession);
  });

  unholdButton.off('click').on('click', e => {
    e.preventDefault();
    unhold(callSession);
  });

  holdButton.off('click').on('click', e => {
    e.preventDefault();
    hold(callSession);
  });

  muteButton.off('click').on('click', e => {
    e.preventDefault();
    mute(callSession);
  });

  unmuteButton.off('click').on('click', e => {
    e.preventDefault();
    unmute(callSession);
  });

  mergeButton.off('click').on('click', e => {
    e.preventDefault();
    addToConference(callSession);
  });

  unmergeButton.off('click').on('click', e => {
    e.preventDefault();
    removeFromConference(callSession);
  });

  atxferButton.show();
  atxferButton.off('click').on('click', e => {
    e.preventDefault();

    if (currentAtxfer) {
      currentAtxfer.complete();
      currentAtxfer = null;

      updateDialers();
    } else {
      const target = prompt('Phone number atxfer?');
      if (target != null) {
        currentAtxfer = Wazo.Phone.atxfer(callSession);
        currentAtxfer.init(target);
        atxferButton.html('Complete');
      }
    }
  });

  transferButton.show();
  transferButton.off('click').on('click', e => {
    e.preventDefault();

    const target = prompt("Phone number transfer?");
    if (target != null) {
      transfer(callSession, target);
    }
  });

  newDialer.appendTo($('#dialers'));
}

function updateDialers() {
  $('#dialers').html('');

  for (const sessionId of Object.keys(sessions)) {
    const callSession = sessions[sessionId];
    addDialer(callSession, callSession.cameraEnabled);
  }
}

function openIncomingCallModal(callSession, withVideo) {
  const number = callSession.realDisplayName || callSession.displayName || callSession.number;

  $('#incoming-modal').modal({backdrop: 'static'});
  $('#incoming-modal h5 span').html(number);

  $('#accept-video')[withVideo ? 'show' : 'hide']();

  $('#accept').off('click').on('click', () => {
    $('#incoming-modal').modal('hide');
    accept(callSession, false);
  });
  $('#accept-video').off('click').on('click', () => {
    $('#incoming-modal').modal('hide');
    accept(callSession, true);
  });
  $('#reject').off('click').on('click', () => {
    Wazo.Phone.reject(callSession);
    $('#incoming-modal').modal('hide');
  });
}
