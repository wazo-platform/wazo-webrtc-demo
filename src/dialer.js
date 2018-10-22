let currentSession;
const sessions = {};

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

function clearActiveCalls(token) {
  apiClient.ctidNg.listCalls(token).then((calls) => {
    calls.filter(call => call.status !== 'Down').forEach(call => {
      apiClient.ctidNg.cancelCall(token, call.id);
    })
  });
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
}

function onCallAccepted(session) {
  sessions[getNumber(session)] = session;
  currentSession = session;

  addDialer(session, 'In call...');
}

function onPhoneCalled(session) {
  const number = getNumber(session);
  sessions[number] = session;
  currentSession = session;

  bindSessionCallbacks(session);
}

function onCallTerminated(session) {
  const number = getNumber(session);
  delete sessions[getNumber(session)];

  // Current session terminated ?
  if (currentSession && getNumber(currentSession) === number) {
    // Remaining session ? take first
    currentSession = Object.keys(sessions).length ? sessions[Object.keys(sessions)[0]] : null;
    if (currentSession) {
      unhold(currentSession);
    }
  }

  updateDialers();
}

function accept(session) {
  // Old current session if exists
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

function resetDialer(status) {
  const dialer = $('#dialer');
  const numberField = $('#dialer .number');

  dialer.show();
  $('#dialer .hangup').hide();
  numberField.val('');
  setMainStatus(status);

  dialer.off('submit').on('submit', function (e) {
    e.preventDefault();

    const session = webRtcClient.call(numberField.val());

    onPhoneCalled(session);

    resetDialer('');
    updateDialers();
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
}

function addDialer(session) {
  const number = getNumber(session);
  const newDialer = $('#dialer').clone().attr('id', 'call-' + number);
  const hangupButton = $('.hangup', newDialer);
  const dialButton = $('.dial', newDialer);
  const unholdButton = $('.unhold', newDialer);
  const holdButton = $('.hold', newDialer);
  $('.form-group', newDialer).hide();

  holdButton.hide();
  unholdButton.hide();

  if (session.local_hold) {
    unholdButton.show();
  } else {
    holdButton.show();
  }

  $('.status', newDialer).html(getStatus(session));
  dialButton.hide();
  dialButton.prop('disabled', true);

  hangupButton.show();
  hangupButton.off('click').on('click', function (e) {
    e.preventDefault();
    webRtcClient.hangup(session);
    delete sessions[number];

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

  newDialer.appendTo($('#dialers'));
}

function updateDialers() {
  $('#dialers').html('');

  for (const number of Object.keys(sessions)) {
    addDialer(sessions[number]);
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
