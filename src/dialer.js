let currentSession;
const sessions = {};
const mutedSessions = {};
let inConference = false;
let sessionIdsInMerge = [];

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
      audio: true
    }
  });

  webRtcClient.on('invite', function (session) {
    bindSessionCallbacks(session);
    openIncomingCallModal(session);
  });
  webRtcClient.on('accepted', onCallAccepted);
  webRtcClient.on('ended', function () {
    resetMainDialer('Call ended');
  });
}

function onCallAccepted(session) {
  sessions[session.id] = session;
  currentSession = session;

  addDialer(session, 'In call...');
  resetMainDialer();
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

  resetMainDialer('Call with ' + getNumber(session) + ' ended');
}

function accept(session) {
  // Hold current session if exists
  if (currentSession && !inConference) {
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
  webRtcClient.merge(Object.values(sessions));

  inConference = true;
  sessionIdsInMerge = Object.keys(sessions);

  resetMainDialer('Conference started');
}

function endConference() {
  inConference = false;
  const sessionToUnmerge = Object.values(sessions).filter(session => sessionIdsInMerge.indexOf(session.id) !== -1);

  webRtcClient.unmerge(sessionToUnmerge).then(() => {
    resetMainDialer('Conference ended');
  });

  sessionIdsInMerge = [];
}

function addToMerge(session) {
  webRtcClient.addToMerge(session);
  sessionIdsInMerge.push(session.id);

  resetMainDialer(getNumber(session) + ' added to merge');
}

function removeFromMerge(session) {
  webRtcClient.removeFromMerge(session, true);

  const sessionIndex = sessionIdsInMerge.indexOf(session.id);
  sessionIdsInMerge.splice(sessionIndex, 1);

  if (sessionIdsInMerge.length === 1) {
    endConference();
  }

  resetMainDialer(getNumber(session) + ' removed from merge');
}

function resetMainDialer(status) {
  const dialer = $('#dialer');
  const numberField = $('#dialer .number');
  const mergeButton = $('#dialer .merge');
  const unmergeButton = $('#dialer .unmerge');

  dialer.show();
  $('#dialer .hangup').hide();
  unmergeButton.hide();
  mergeButton.hide();
  numberField.val('');
  setMainStatus(status || '');

  dialer.off('submit').on('submit', function (e) {
    e.preventDefault();

    const session = webRtcClient.call(numberField.val());

    if (currentSession && !inConference) {
      hold(currentSession);
    }

    onPhoneCalled(session);

    resetMainDialer('');
    updateDialers();
  });

  if (inConference) {
    unmergeButton.show();
  } else if(Object.keys(sessions).length > 1) {
    mergeButton.show();
  }

  mergeButton.off('click').on('click', function (e) {
    e.preventDefault();
    startConference();
  });

  unmergeButton.off('click').on('click', function (e) {
    e.preventDefault();
    endConference();
  });

  updateDialers();
}

function bindSessionCallbacks(session) {
  const number = getNumber(session);

  session.on('accepted', () => resetMainDialer(''));
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
}

function addDialer(session) {
  const newDialer = $('#dialer').clone().attr('id', 'call-' + session.id);
  const isSessionInMerge = sessionIdsInMerge.indexOf(session.id) !== -1;
  const hangupButton = $('.hangup', newDialer);
  const dialButton = $('.dial', newDialer);
  const unholdButton = $('.unhold', newDialer);
  const holdButton = $('.hold', newDialer);
  const muteButton = $('.mute', newDialer);
  const unmuteButton = $('.unmute', newDialer);
  const mergeButton = $('.merge', newDialer).html('Add to merge');
  const unmergeButton = $('.unmerge', newDialer).html('Remove from merge');

  $('.form-group', newDialer).hide();
  holdButton.hide();
  unholdButton.hide();
  muteButton.hide();
  unmuteButton.hide();
  mergeButton.hide();
  unmergeButton.hide();

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

  if (inConference) {
    if (isSessionInMerge) {
      unmergeButton.show();
    } else {
      mergeButton.show();
    }
  }

  $('.status', newDialer).html(getStatus(session));
  dialButton.hide();
  dialButton.prop('disabled', true);

  hangupButton.show();
  hangupButton.off('click').on('click', function (e) {
    e.preventDefault();
    webRtcClient.hangup(session);

    onCallTerminated(session);
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

  mergeButton.off('click').on('click', function (e) {
    e.preventDefault();
    addToMerge(session);
  });

  unmergeButton.off('click').on('click', function (e) {
    e.preventDefault();
    removeFromMerge(session);
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
