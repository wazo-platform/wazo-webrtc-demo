const sessions = {};
let currentSession;
const inConference = false;
let currentAtxfer;
let countDown;
let timerId;

// Custom welcome message
const setGreeter = async () => {
  const user = await Wazo.getApiClient().confd.getUser(
    Wazo.Auth.getSession().uuid,
  );
  const name = user.firstName;

  $('.greeter').html(`Hello ${name} 👋`);
};

// Call status
const setMainStatus = status => {
  $('#status').html(status);
  setTimeout(() => $('#status').html('&nbsp;'), 3000);
};

const getNumber = callSession => callSession.realDisplayName || callSession.displayName || callSession.number;

const getStatus = callSession => {
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

// Phone will be hung up if the app is reloaded
const onReload = () => {
  $(window).on('beforeunload', () => {
    console.log('reloading');
    Object.values(sessions).map(callSession => Wazo.Phone.hangup(callSession));
  });
};

const fakePlaySound = (event, deviceId, audioRingVolume) => {
  if (event === Wazo.Phone.ON_TERMINATE_SOUND) {
    console.info('Stopping sound');
    return;
  }

  console.info(`Playing "${event}" sound ${deviceId ? `on device ID "${deviceId}"` : 'on default device'} with volume set at ${Math.round(audioRingVolume * 100)}%`);
}

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
  Wazo.Phone.on(Wazo.Phone.ON_CALL_RESUMED, onSessionUpdate);
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

  // Sound handling example
  const soundEvents = [
    Wazo.Phone.ON_TERMINATE_SOUND,
    Wazo.Phone.ON_PLAY_RING_SOUND,
    Wazo.Phone.ON_PLAY_INBOUND_CALL_SIGNAL_SOUND,
    Wazo.Phone.ON_PLAY_HANGUP_SOUND,
    Wazo.Phone.ON_PLAY_PROGRESS_SOUND,
  ];
  soundEvents.forEach(event => 
    Wazo.Phone.on(event, (audioRingDeviceId, audioRingVolume) => fakePlaySound(event, audioRingDeviceId, audioRingVolume))
  );

  setGreeter();

  onReload();

  initializeMainDialer();
};

// Phone events

const onCallAccepted = (callSession, withVideo) => {
  sessions[callSession.getId()] = callSession;
  currentSession = callSession;
  $('.buttons').removeClass('buttons-video');
  $('.timer').show();
  $('#dialer').addClass('mini-dialer');
  $('.mini-dialer').show();
  $('.dial-texts').addClass('hidden');
  $('.call-btn').addClass('mini-btns');

  updateScenes();
}

const onCallFailed = callSession => {
  const number = getNumber(callSession);
  setMainStatus(`Call with ${number} failed`);
  onCallTerminated(callSession);
}

const onCallEnded = callSession => {
  const number = getNumber(callSession);
  setMainStatus(`Call with ${number} ended`);
  onCallTerminated(callSession);
}

const onPhoneCalled = callSession => {
  sessions[callSession.getId()] = callSession;
  currentSession = callSession;
  $('.number').val('');
}

const onCallTerminated = callSession => {
  delete sessions[callSession.getId()];

  $('.buttons').removeClass('buttons-video');
  $('#incoming-modal').hide();
  $('#dialer').removeClass('mini-dialer');
  $('.dial-texts').removeClass('hidden');
  $('.call-btn').removeClass('mini-btns');

  if (currentSession && currentSession.getId() === callSession.getId()) {
    currentSession = Object.keys(sessions).length
      ? sessions[Object.keys(sessions)[0]]
      : null;
    if (currentSession) {
      unhold(currentSession);
    }
  }

  currentAtxfer = null;

  const modalElement = document.getElementById('incoming-modal');
  const modal = bootstrap.Modal.getInstance(modalElement);
  if (modal) {
    modal.hide();
  }
  updateScenes(`Call with ${getNumber(callSession)} ended`);
}

const onSessionUpdate = callSession => {
  sessions[callSession.getId()] = callSession;
  updateScenes();
}

// Dialer actions

const accept = (callSession, withVideo) => {
  console.log(`accepting ${getNumber(callSession)} ${withVideo ? 'withVideo' : 'withoutVideo'}`);
  // Hold current session & creates the multiple calls handler if exists 
  if (currentSession && !inConference) {
    hold(currentSession);
    
    const currentNumber = getNumber(currentSession);
    const newNumber = getNumber(callSession);
  }

  Wazo.Phone.accept(callSession, withVideo);
}

const unhold = callSession => {
  console.log(`resuming ${getNumber(callSession)}`);
  Wazo.Phone.resume(callSession);
}

const hold = callSession => {
  console.log(`holding ${getNumber(callSession)}`);
  Wazo.Phone.hold(callSession);
}

const mute = callSession => {
  console.log(`muting ${getNumber(callSession)}`);
  Wazo.Phone.mute(callSession);
}

const unmute = callSession => {
  console.log(`unmuting ${getNumber(callSession)}`);
  Wazo.Phone.unmute(callSession);
}

const hangup = callSession => {
  console.log(`hanging up ${getNumber(callSession)}`);
  Wazo.Phone.hangup(callSession);
}

const transfer = (callSession, target) => {
  Wazo.Phone.transfer(callSession, target);

  updateScenes();
}

const initializeMainDialer = () => {
  const $dialer = $('#dialer');
  const $numberField = $('.number', $dialer);
  const $videoButton = $('.video-call', $dialer);
  const $indirectTransfer = $('#indirect-transfer');
  
  const $scene = $('#root-scene');
  const $mergeButton = $('.merge', $scene);
  const $unmergeButton = $('.unmerge', $scene);

  $videoButton.show();
  $('.hangup', $scene).hide();
  $unmergeButton.hide();
  $mergeButton.hide();
  $numberField.val('');
  $indirectTransfer.hide();

  const call = async (video = false) => {
    const number = $numberField.val();
    console.log(`Calling ${number}...`);
    const callSession = await Wazo.Phone.call(number, video);

    if (currentSession && !inConference) {
      hold(currentSession);
    }

    onPhoneCalled(callSession);

    updateScenes();
  };

  $dialer.off('submit').on('submit', e => {
    e.preventDefault();

    call(false);
  });

  $videoButton.off('click').on('click', e => {
    e.preventDefault();
    call(true);
  });

  updateScenes();
}

// scene = phone or video call scene
const addScene = (callSession, withVideo) => {
  const label = getNumber(callSession);
  const $newScene = $('#root-scene')
    .clone()
    .attr('data-contact', label)
    .attr('id', `call-${callSession.getId()}`)
    .addClass(withVideo ? 'isVideo' : 'isAudio');
  // const isSessionInMerge = sessionIdsInMerge.indexOf(session.getId()) !== -1;
  const $hangupButton = $('.hangup', $newScene);
  const $unholdButton = $('.unhold', $newScene);
  const $holdButton = $('.hold', $newScene);
  const $muteButton = $('.mute', $newScene);
  const $unmuteButton = $('.unmute', $newScene);
  const $mergeButton = $('.merge', $newScene).html('Add to merge');
  const $unmergeButton = $('.unmerge', $newScene).html('Remove from merge');
  const $atxferButton = $('.atxfer', $newScene);
  const $transferButton = $('.transfer', $newScene);
  const $dialButton = $('.audio-call', $newScene);
  const $videoButton = $('.video-call', $newScene);
  const $reduceVideoButton = $('.reduce', $newScene);
  const $expandVideoButton = $('.expand', $newScene);
  const $contact = $('.contact', $newScene);
  const $timer = $('.timer', $newScene);
  const $ringingDots = $('#ringing', $newScene);

  $('.form-group', $newScene).hide();
  $holdButton.hide();
  $videoButton.hide();
  $unholdButton.hide();
  $muteButton.hide();
  $unmuteButton.hide();
  $mergeButton.hide();
  $unmergeButton.hide();
  $atxferButton.hide();
  $transferButton.hide();
  $reduceVideoButton.hide();
  $expandVideoButton.hide();
  $ringingDots.show();
  $timer.show();

  $contact.html(label);

  // Videos
  const $videoContainer = $('.videos', $newScene);
  if (withVideo) {
    $videoContainer.show();
    $videoContainer.addClass('background-videocall');
    $('.buttons').addClass('buttons-video');
    $expandVideoButton.show();


    // Reduce & Expand Remote video screen
    
    $expandVideoButton.on('click', e => {
      e.preventDefault;
      $('.remote video').addClass('expand-video');
      $expandVideoButton.hide();
      $reduceVideoButton.show();
    })

    $reduceVideoButton.on('click', e => {
      e.preventDefault;
      $('.remote video').removeClass('expand-video');
      $reduceVideoButton.hide();
      $expandVideoButton.show();
    })

    // Local video
    const localStream = Wazo.Phone.getLocalVideoStream(callSession);
    const $localVideo = $('.local video', $newScene)[0];
    $localVideo.srcObject = localStream;
    $localVideo.play();

    // Remote video
    const $remoteVideo = $('.remote video', $newScene);
    const remoteStream = Wazo.Phone.getRemoteStreamForCall(callSession);
    if (remoteStream) {
      $remoteVideo.show();
      const wazoStream = new Wazo.Stream(remoteStream);
      wazoStream.attach($remoteVideo[0]);
    }
  } else {
    $videoContainer.hide();
  }

  if (callSession.paused) {
    $unholdButton.show();
  } else {
    $holdButton.show();
  }

  if (callSession.muted) {
    $unmuteButton.show();
  } else {
    $muteButton.show();
  }

  if (inConference) {
    if (isSessionInMerge) {
      $unmergeButton.show();
    } else {
      $mergeButton.show();
    }
  }

  $dialButton.hide();
  $dialButton.prop('disabled', true);

  $hangupButton.show();
  $hangupButton.off('click').on('click', (e) => {
    e.preventDefault();
    hangup(callSession);
  });

  $unholdButton.off('click').on('click', (e) => {
    e.preventDefault();
    unhold(callSession);
  });

  $holdButton.off('click').on('click', (e) => {
    e.preventDefault();
    hold(callSession);
  });

  $muteButton.off('click').on('click', (e) => {
    e.preventDefault();
    mute(callSession);
  });

  $unmuteButton.off('click').on('click', (e) => {
    e.preventDefault();
    unmute(callSession);
  });

  $atxferButton.show();
  // Indirect transfer
  $atxferButton.off('click').on('click', (e) => {
    e.preventDefault();

    if (currentAtxfer) {
      currentAtxfer.complete();
      currentAtxfer = null;

      updateScenes();
    } else {
      const target = prompt('Indirect transfer : To which extension would you transfer this call ? (you will first talk with this person)');

      if (target != null) {
        currentAtxfer = Wazo.Phone.atxfer(callSession);
        currentAtxfer.init(target);
        $('#indirect-transfer').css('display', 'flex');

        $('#indirect-transfer-cancel').off('click').on('click', e => {
          e.preventDefault();
          currentAtxfer.cancel();
          $('#indirect-transfer').hide();
          currentAtxfer = null;
        });

        $('#indirect-transfer-complete').off('click').on('click', e => {
          e.preventDefault();
          currentAtxfer.complete();
          $('#indirect-transfer').hide();
          //
          
          const targetCallSession = getCallSessionFromNumber(target);

          console.log('completing indirect transfer', { source: callSession.number, target: targetCallSession && targetCallSession.number });

          delete sessions[callSession.getId()];
          if (targetCallSession) {
            delete sessions[targetCallSession.getId()];
          }
          
          currentAtxfer = null;
          updateScenes();
        });
      }
    }
  });

  $transferButton.show();
  // Direct transfer
  $transferButton.off('click').on('click', (e) => {
    e.preventDefault();

    const target = prompt('Transfer : To which extension would you transfer this call ?');
    if (target != null) {
      transfer(callSession, target);
    }
  });

  $newScene.appendTo($('#scenes'));

  return $newScene;
}

// Used to switch between calls in the multiple calls handler
const switchCall = event => {
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

/* 
  Displays dots animation when calling & a timer when called
  The timer is not functionnal yet : it works well when you have one call at a time
  but applies to every call when you have at least 2 calls in your handler
*/
const updateTimer = () => {
  if (!currentSession) {
    return;
  }
  const $ringingDots = $('#ringing');
  const formattedTime = currentSession.answered ? formatTime(currentSession.getElapsedTimeInSeconds()) : $ringingDots.show();
  $(`#call-${currentSession.getId()} .timer`).html(formattedTime);
}

const updateScenes = status => {
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
    }
  } else {
    if (!timerId) {
      timerId = setInterval(updateTimer, 1000);
    }
  }

  noActiveSession ? $('#dialer').removeClass('mini-dialer') : $('#dialer').addClass('mini-dialer');
  noActiveSession ? $('.dial-texts').removeClass('hidden') : $('.dial-texts').addClass('hidden');
  noActiveSession ? $('.call-btn').removeClass('mini-btns') : $('.call-btn').addClass('mini-btns');
  
  // multiple calls handler 
  Object.keys(sessions).forEach(sessionId => {
    const callSession = sessions[sessionId];
    const newScene = addScene(callSession, callSession.cameraEnabled);
    const isActive = currentSession.is(callSession);
    const label = getNumber(callSession);

    if (!isActive) {
      newScene.hide();
    }

    const $bouton = $('#calls-handler').append(`<button type="button" data-sessionid="${sessionId}" class="btn switch-btn ${isActive ? 'active' : ''}">${label}</button>`);
    $bouton.click(switchCall);

  })
}

const openIncomingCallModal = (callSession, withVideo) => {
  const number = callSession.realDisplayName
    || callSession.displayName
    || callSession.number;

  const modal = new bootstrap.Modal($('#incoming-modal'), { backdrop: 'static', keyboard: false });
  modal.show();

  $('#dialer').addClass('mini-dialer');
  $('.mini-dialer').hide();
  $('.dial-texts').addClass('hidden');
  $('.call-btn').addClass('mini-btns');
  $('#incoming-modal h5 span').html(number);

  $('#accept-video')[withVideo ? 'show' : 'hide']();

  $('#accept')
    .off('click')
    .on('click', () => {
      modal.hide();
      accept(callSession, false);
    });
  $('#accept-video')
    .off('click')
    .on('click', () => {
      modal.hide();
      accept(callSession, true);
    });
  $('#reject')
    .off('click')
    .on('click', () => {
      Wazo.Phone.reject(callSession);
      modal.hide();
    });
}
