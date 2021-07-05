const sessions = {};
let currentSession;
const inConference = false;
let currentAtxfer;
let countDown;
let timerId;
// let sessionIdsInMerge = [];

const setGreeter = async () => {
  const user = await Wazo.getApiClient().confd.getUser(
    Wazo.Auth.getSession().uuid,
  );
  const name = user.firstName;

  $('.greeter').html(`Hello ${name} 👋`);
};

const setMainStatus = (status) => {
  $('#status').html(status);
};

const getNumber = (callSession) => callSession.realDisplayName || callSession.displayName || callSession.number;

const getStatus = (callSession) => {
  const number = getNumber(callSession);

  if (callSession.paused) {
    return `Call with ${number} on hold`;
  }

  if (callSession.muted) {
    return `Call with ${number} muted`;
  }

  switch (callSession.sipStatus) {
    case Wazo.Phone.SessionState.Initial:
    case Wazo.Phone.SessionState.Establishing:
      return `Calling ${number}...`;
    case Wazo.Phone.SessionState.Established:
      return `On call with : ${number}`;
    case Wazo.Phone.SessionState.Terminated:
      return `Call canceled by ${number}`;
    default:
      return `Unknown status: ${callSession.sipStatus}`;
  }
};

const initializeWebRtc = () => {
  Wazo.Phone.connect({
    media: {
      audio: true,
      video: true,
    },
  });

  Wazo.Phone.on(Wazo.Phone.ON_CALL_INCOMING, openIncomingCallModal);
  Wazo.Phone.on(Wazo.Phone.ON_CALL_ACCEPTED, onCallAccepted);
  Wazo.Phone.on(Wazo.Phone.ON_CALL_FAILED, onCallFailed);
  Wazo.Phone.on(Wazo.Phone.ON_CALL_ENDED, onCallEnded);
  Wazo.Phone.on(Wazo.Phone.ON_CALL_HELD, onSessionUpdate);
  Wazo.Phone.on(Wazo.Phone.ON_CALL_UNHELD, onSessionUpdate);
  Wazo.Phone.on(Wazo.Phone.ON_CALL_MUTED, onSessionUpdate);
  Wazo.Phone.on(Wazo.Phone.ON_CALL_UNMUTED, onSessionUpdate);
  Wazo.Phone.on(
    Wazo.Phone.ON_REINVITE,
    (session, request, updatedCalleeName) => {
      const callSession = sessions[session.id];
      if (callSession) {
        currentSession.realDisplayName = updatedCalleeName;

        onSessionUpdate(currentSession);
      }
    },
  );

  setGreeter();

  initializeMainDialer();
};

function onCallAccepted(callSession, withVideo) {
  sessions[callSession.getId()] = callSession;
  currentSession = callSession;
  $('#status').addClass('oncall');
  $('.buttons').removeClass('buttons-video');
  $('.timer').show();

  updateScenes();
}

function onCallFailed(callSession) {
  const number = getNumber(callSession);
  onCallTerminated(callSession);
  setMainStatus(`Call with ${number} failed`);
}

function onCallEnded(callSession) {
  const number = getNumber(callSession);
  onCallTerminated(callSession);
  setMainStatus(`Call with ${number} ended`);
}

function onPhoneCalled(callSession) {
  sessions[callSession.getId()] = callSession;
  currentSession = callSession;
  $('#status').addClass('oncall').removeClass('on-videocall');
}

function onCallTerminated(callSession) {
  delete sessions[callSession.getId()];
  $('#status').removeClass('oncall');
  $('#status').removeClass('on-videocall');
  $('.buttons').removeClass('buttons-video');
  $('#dialer').show();

  // Current session terminated ?
  if (currentSession && currentSession.getId() === callSession.getId()) {
    // Remaining session ? take first
    currentSession = Object.keys(sessions).length
      ? sessions[Object.keys(sessions)[0]]
      : null;
    if (currentSession) {
      unhold(currentSession);
    }
  }

  currentAtxfer = null;

  updateScenes(`Call with ${getNumber(callSession)} ended`);
}

function onSessionUpdate(callSession) {
  sessions[callSession.getId()] = callSession;
  updateScenes();
}

function accept(callSession, withVideo) {
  console.log(`accepting ${getNumber(callSession)} ${withVideo ? 'withVideo' : 'withoutVideo'}`);
  // Hold current session & creates the multiple calls handler if exists 
  if (currentSession && !inConference) {
    hold(currentSession);
    
    const currentNumber = getNumber(currentSession);
    const newNumber = getNumber(callSession);
  }

  Wazo.Phone.accept(callSession, withVideo);
}

function unhold(callSession) {
  console.log(`resuming ${getNumber(callSession)}`);
  Wazo.Phone.resume(callSession);
}

function hold(callSession) {
  console.log(`holding ${getNumber(callSession)}`);
  Wazo.Phone.hold(callSession);
}

function mute(callSession) {
  console.log(`muting ${getNumber(callSession)}`);
  Wazo.Phone.mute(callSession);
}

function unmute(callSession) {
  console.log(`unmuting ${getNumber(callSession)}`);
  Wazo.Phone.unmute(callSession);
}

function hangup(callSession) {
  console.log(`hanging up ${getNumber(callSession)}`);
  Wazo.Phone.hangup(callSession);
}

/*
function startConference() {
  Wazo.Phone.merge(Object.values(sessions));

  inConference = true;
  sessionIdsInMerge = Object.keys(sessions);

  updateScenes('Conference started');
}

function endConference() {
  inConference = false;
  const sessionToUnmerge = Object.values(sessions).filter(session => sessionIdsInMerge.indexOf(session.getId()) !== -1);

  webRtcClient.unmerge(sessionToUnmerge).then(() => {
    updateScenes('Conference ended');
  });

  sessionIdsInMerge = [];
}

function addToMerge(session) {
  webRtcClient.addToMerge(session);
  sessionIdsInMerge.push(session.getId());

  updateScenes(getNumber(session) + ' added to merge');
}

function removeFromMerge(session) {
  webRtcClient.removeFromMerge(session, true);

  const sessionIndex = sessionIdsInMerge.indexOf(session.getId());
  sessionIdsInMerge.splice(sessionIndex, 1);

  if (sessionIdsInMerge.length === 1) {
    endConference();
  }

  updateScenes(getNumber(session) + ' removed from merge');
}
*/

function transfer(callSession, target) {
  Wazo.Phone.transfer(callSession, target);

  updateScenes();
}

function initializeMainDialer() {
  const dialer = $('#dialer');
  const numberField = $('.number', dialer);
  const videoButton = $('.video-call', dialer);
  
  const scene = $('#root-scene');
  const mergeButton = $('.merge', scene);
  const unmergeButton = $('.unmerge', scene);

  videoButton.show();
  $('.hangup', scene).hide();
  unmergeButton.hide();
  mergeButton.hide();
  numberField.val('');

  const call = async (video = false) => {
    const number = numberField.val();
    console.log(`Calling ${number}...`);
    const callSession = await Wazo.Phone.call(number, video);

    if (currentSession && !inConference) {
      hold(currentSession);
    }

    onPhoneCalled(callSession);

    updateScenes();
  };

  dialer.off('submit').on('submit', e => {
    e.preventDefault();

    call(false);
  });

  // if (inConference) {
  //   unmergeButton.show();
  // } else if(Object.keys(sessions).length > 1) {
  //   mergeButton.show();
  // }

  // mergeButton.off('click').on('click', function (e) {
  //   e.preventDefault();
  //   startConference();
  // });
  //
  // unmergeButton.off('click').on('click', function (e) {
  //   e.preventDefault();
  //   endConference();
  // });

  videoButton.off('click').on('click', e => {
    e.preventDefault();
    call(true);
  });

  updateScenes();
}

function addScene(callSession, withVideo) {
  const label = getNumber(callSession);
  const newScene = $('#root-scene')
    .clone()
    .attr('data-contact', label)
    .attr('id', `call-${callSession.getId()}`)
    .addClass(withVideo ? 'isVideo' : 'isAudio');
  // const isSessionInMerge = sessionIdsInMerge.indexOf(session.getId()) !== -1;
  const hangupButton = $('.hangup', newScene);
  const unholdButton = $('.unhold', newScene);
  const holdButton = $('.hold', newScene);
  const muteButton = $('.mute', newScene);
  const unmuteButton = $('.unmute', newScene);
  const mergeButton = $('.merge', newScene).html('Add to merge');
  const unmergeButton = $('.unmerge', newScene).html('Remove from merge');
  const atxferButton = $('.atxfer', newScene);
  const transferButton = $('.transfer', newScene);
  const dialButton = $('.audio-call', newScene);
  const videoButton = $('.video-call', newScene);
  const reduceVideoButton = $('.reduce', newScene);
  const expandVideoButton = $('.expand', newScene);
  const contact = $('.contact', newScene);
  const timer = $('.timer', newScene);

  $('.form-group', newScene).hide();
  holdButton.hide();
  videoButton.hide();
  unholdButton.hide();
  muteButton.hide();
  unmuteButton.hide();
  mergeButton.hide();
  unmergeButton.hide();
  atxferButton.hide();
  transferButton.hide();
  reduceVideoButton.hide();
  expandVideoButton.hide();
  timer.show();

  contact.html(label);

  // Videos
  const videoContainer = $('.videos', newScene);
  if (withVideo) {
    videoContainer.show();
    videoContainer.addClass('background-videocall');
    $('#status').removeClass('oncall').addClass('on-videocall');
    $('.buttons').addClass('buttons-video');
    reduceVideoButton.show();

    // Reduce & Expand video screen
    
    reduceVideoButton.on('click', e => {
      e.preventDefault;
      $('video').addClass('reduce-video');
      reduceVideoButton.hide();
      expandVideoButton.show();
    })

    expandVideoButton.on('click', e => {
      e.preventDefault;
      $('video').removeClass('reduce-video');
      expandVideoButton.hide();
      reduceVideoButton.show();
    })


    // Local video
    const localStream = Wazo.Phone.getLocalVideoStream(callSession);
    const localVideo = $('.local video', newScene)[0];
    localVideo.srcObject = localStream;
    localVideo.play();

    // Remote video
    const $remoteVideo = $('.remote video', newScene);
    const remoteStream = Wazo.Phone.getRemoteStreamForCall(callSession);
    if (remoteStream) {
      $remoteVideo.show();
      const wazoStream = new Wazo.Stream(remoteStream);
      wazoStream.attach($remoteVideo[0]);
    }
  } else {
    videoContainer.hide();
    $('#status').removeClass('on-videocall').addClass('oncall');
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

  if (inConference) {
    // eslint-disable-next-line no-undef
    if (isSessionInMerge) {
      unmergeButton.show();
    } else {
      mergeButton.show();
    }
  }

  dialButton.hide();
  dialButton.prop('disabled', true);

  hangupButton.show();
  hangupButton.off('click').on('click', (e) => {
    e.preventDefault();
    hangup(callSession);
  });

  unholdButton.off('click').on('click', (e) => {
    e.preventDefault();
    unhold(callSession);
  });

  holdButton.off('click').on('click', (e) => {
    e.preventDefault();
    hold(callSession);
  });

  muteButton.off('click').on('click', (e) => {
    e.preventDefault();
    mute(callSession);
  });

  unmuteButton.off('click').on('click', (e) => {
    e.preventDefault();
    unmute(callSession);
  });

  // mergeButton.off('click').on('click', function (e) {
  //   e.preventDefault();
  //   addToMerge(callSession);
  // });
  //
  // unmergeButton.off('click').on('click', function (e) {
  //   e.preventDefault();
  //   removeFromMerge(callSession);
  // });

  atxferButton.show();
  atxferButton.off('click').on('click', (e) => {
    e.preventDefault();

    if (currentAtxfer) {
      currentAtxfer.complete();
      currentAtxfer = null;

      updateScenes();
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
  transferButton.off('click').on('click', (e) => {
    e.preventDefault();

    const target = prompt('Phone number transfer?');
    if (target != null) {
      transfer(callSession, target);
    }
  });

  newScene.appendTo($('#scenes'));

  return newScene;
}

function switchCall(event) {
  event.stopImmediatePropagation();

  const sessionId = $(event.target).attr('data-sessionid');
  const callSession = sessions[sessionId];
  
  if (currentSession.is(callSession)) {
    console.log('active call, no switching');
    return;
  }

  console.log(`attempting to resume callSession "${getNumber(callSession)}"`);
  unhold(callSession);
  currentSession = callSession;
  updateScenes();
}

//TODO : format timer time !

const getElapsedTimeInSeconds = (startTime) => {
  if (!startTime) {
    return 0;
  }
  return Math.trunc((Date.now() - startTime) / 1000);
};

const formatTime = secondsElapsed  => {
  let secNum = parseInt(secondsElapsed, 10);
  let hours = Math.floor(secNum / 3600);
  let minutes = Math.floor((secNum - hours * 3600) / 60);
  let seconds = secNum - hours * 3600 - minutes * 60;

  if (hours < 10) {
    hours = '0' + hours;
  }
  if (minutes < 10) {
    minutes = '0' + minutes;
  }
  if (seconds < 10) {
    seconds = '0' + seconds;
  }
  if (hours > 0) {
    return hours + ':' + minutes + ':' + seconds;
  }

  return minutes + ':' + seconds;
};

function updateTimer() {
  const formattedTime = formatTime(currentSession.getElapsedTimeInSeconds());
  $(`#call-${currentSession.getId()} .timer`).html(formattedTime);
}

function updateScenes(status) {
  const noActiveSession = !Object.keys(sessions).length;

  $('#scenes').html('');
  $('#calls-handler').html('');

  // these status messages are a legacy from resetMainDialer
  if (status) {
    console.log(status);
  }

  // timer management
  if (noActiveSession) {
    if (timerId) {
      clearInterval(timerId);
      timerId = null;
      $(`#call-${currentSession.getId()} .timer`).html('&nbsp;');
    }
  } else {
    if (!timerId) {
      timerId = setInterval(updateTimer, 1000);
    }
  }

  $('#dialer')[noActiveSession ? 'show' : 'hide']();
  
  Object.keys(sessions).forEach(sessionId => {
    const callSession = sessions[sessionId];
    const newScene = addScene(callSession, callSession.cameraEnabled);
    const isActive = currentSession.is(callSession);
    const label = getNumber(callSession)

    if (!isActive) {
      newScene.hide();
    }

    const bouton = $('#calls-handler').append(`<button type="button" data-sessionid="${sessionId}" class="btn btn-primary${isActive ? ' active' : ''}">${label}</button>`);
    bouton.click(switchCall);
  });
}

function openIncomingCallModal(callSession, withVideo) {
  const number = callSession.realDisplayName
    || callSession.displayName
    || callSession.number;

  const modal = new bootstrap.Modal($('#incoming-modal'), { backdrop: 'static', keyboard: false });
  modal.show();

  $('#dialer').hide();
  $('#status').hide();
  $('#incoming-modal h5 span').html(number);

  $('#accept-video')[withVideo ? 'show' : 'hide']();

  $('#accept')
    .off('click')
    .on('click', () => {
      modal.hide();
      $('#status').show();
      accept(callSession, false);
    });
  $('#accept-video')
    .off('click')
    .on('click', () => {
      modal.hide();
      $('#status').show();
      accept(callSession, true);
    });
  $('#reject')
    .off('click')
    .on('click', () => {
      Wazo.Phone.reject(callSession);
      modal.hide();
      $('#status').show();
    });
}
