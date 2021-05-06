const sessions = {};
let currentSession;
let inConference = false;
let currentAtxfer;
// let sessionIdsInMerge = [];

const setFullName = async () => {
  const user = await Wazo.getApiClient().confd.getUser(
    Wazo.Auth.getSession().uuid
  );
  const fullName = user.firstName
    ? `${user.firstName} ${user.lastName}`
    : user.username;

  $("#user").html(`${fullName} (${user.lines[0].extensions[0].exten})`);
};

const setGreeter = async () => {
  const user = await Wazo.getApiClient().confd.getUser(
    Wazo.Auth.getSession().uuid
  );
  const name = user.firstName;

  $(".greeter").html(`Hello ${name} 👋`);
};

const setMainStatus = (status) => {
  $(".status").html(status);
};

const getNumber = (callSession) =>
  callSession.realDisplayName || callSession.displayName || callSession.number;

const getStatus = (callSession) => {
  const number = getNumber(callSession);

  if (callSession.paused) {
    return "Call with " + number + " on hold";
  }

  if (callSession.muted) {
    return "Call with " + number + " muted";
  }

  switch (callSession.sipStatus) {
    case Wazo.Phone.SessionState.Initial:
    case Wazo.Phone.SessionState.Establishing:
      return "Calling " + number + "...";
    case Wazo.Phone.SessionState.Established:
      return "On call with : " + number;
    case Wazo.Phone.SessionState.Terminated:
      return "Call canceled by " + number;
    default:
      return "Unknown status: " + callSession.sipStatus;
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

  const onSessionUpdate = (callSession) => {
    sessions[callSession.getId()] = callSession;
    updateDialers();
  };

  Wazo.Phone.on(Wazo.Phone.ON_CALL_INCOMING, (callSession, withVideo) => {
    bindSessionCallbacks(callSession);
    openIncomingCallModal(callSession, withVideo);
  });
  Wazo.Phone.on(Wazo.Phone.ON_CALL_ACCEPTED, (callSession, withVideo) => {
    onCallAccepted(callSession, withVideo);
  });
  Wazo.Phone.on(Wazo.Phone.ON_CALL_ENDED, () => {
    resetMainDialer("Call ended");
  });
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
    }
  );

  $(".status-calling").hide();

  setFullName();
  setGreeter();
  resetMainDialer();
};

function onCallAccepted(callSession, withVideo) {
  sessions[callSession.getId()] = callSession;
  currentSession = callSession;
  $(".dialer-form").hide();
  $(".status-calling").show();

  addDialer(callSession, withVideo);
  resetMainDialer();
}

function onPhoneCalled(callSession) {
  sessions[callSession.getId()] = callSession;
  currentSession = callSession;
  $(".dialer-form").hide();
  $(".status-calling").show();

  bindSessionCallbacks(callSession);
}

function onCallTerminated(callSession) {
  delete sessions[callSession.getId()];
  $(".dialer-form").show();
  $(".status-calling").hide();

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

  resetMainDialer("Call with " + getNumber(callSession) + " ended");
}

function accept(callSession, withVideo) {
  // Hold current session if exists
  if (currentSession && !inConference) {
    hold(currentSession);
  }

  Wazo.Phone.accept(callSession, withVideo);

  onCallAccepted(callSession, withVideo);
}

function unhold(callSession) {
  Wazo.Phone.unhold(callSession);
}

function hold(callSession) {
  Wazo.Phone.hold(callSession);
}

function mute(callSession) {
  Wazo.Phone.mute(callSession);
}

function unmute(callSession) {
  Wazo.Phone.unmute(callSession);
}

/*
function startConference() {
  Wazo.Phone.merge(Object.values(sessions));

  inConference = true;
  sessionIdsInMerge = Object.keys(sessions);

  resetMainDialer('Conference started');
}

function endConference() {
  inConference = false;
  const sessionToUnmerge = Object.values(sessions).filter(session => sessionIdsInMerge.indexOf(session.getId()) !== -1);

  webRtcClient.unmerge(sessionToUnmerge).then(() => {
    resetMainDialer('Conference ended');
  });

  sessionIdsInMerge = [];
}

function addToMerge(session) {
  webRtcClient.addToMerge(session);
  sessionIdsInMerge.push(session.getId());

  resetMainDialer(getNumber(session) + ' added to merge');
}

function removeFromMerge(session) {
  webRtcClient.removeFromMerge(session, true);

  const sessionIndex = sessionIdsInMerge.indexOf(session.getId());
  sessionIdsInMerge.splice(sessionIndex, 1);

  if (sessionIdsInMerge.length === 1) {
    endConference();
  }

  resetMainDialer(getNumber(session) + ' removed from merge');
}
*/

function transfer(callSession, target) {
  Wazo.Phone.transfer(callSession, target);

  updateDialers();
}

function resetMainDialer(status) {
  const dialer = $("#dialer");
  const numberField = $("#dialer .number");
  const mergeButton = $("#dialer .merge");
  const unmergeButton = $("#dialer .unmerge");
  const videoButton = $("#dialer .video-call");

  dialer.show();
  videoButton.show();
  $("#dialer .hangup").hide();
  unmergeButton.hide();
  mergeButton.hide();
  numberField.val("");
  setMainStatus(status || "");

  const call = async (video = false) => {
    const callSession = await Wazo.Phone.call(numberField.val(), video);

    if (currentSession && !inConference) {
      hold(currentSession);
    }

    onPhoneCalled(callSession);

    resetMainDialer("");
    updateDialers();
  };

  dialer.off("submit").on("submit", function (e) {
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

  videoButton.off("click").on("click", function (e) {
    e.preventDefault();
    call(true);
  });

  updateDialers();
}

function bindSessionCallbacks(callSession) {
  const number = getNumber(callSession);

  Wazo.Phone.on(Wazo.Phone.ON_CALL_ACCEPTED, () => resetMainDialer(""));
  Wazo.Phone.on(Wazo.Phone.ON_CALL_FAILED, function () {
    onCallTerminated(callSession);
    setMainStatus("Call with " + number + " failed");
  });
  Wazo.Phone.on(Wazo.Phone.ON_CALL_ENDED, function () {
    onCallTerminated(callSession);
    setMainStatus("Call with " + number + " ended");
  });
}

function addDialer(callSession, withVideo) {
  const newDialer = $("#dialer")
    .clone()
    .attr("id", "call-" + callSession.getId());
  // const isSessionInMerge = sessionIdsInMerge.indexOf(session.getId()) !== -1;
  const hangupButton = $(".hangup", newDialer);
  const dialButton = $(".dial", newDialer);
  const unholdButton = $(".unhold", newDialer);
  const holdButton = $(".hold", newDialer);
  const muteButton = $(".mute", newDialer);
  const unmuteButton = $(".unmute", newDialer);
  const mergeButton = $(".merge", newDialer).html("Add to merge");
  const unmergeButton = $(".unmerge", newDialer).html("Remove from merge");
  const atxferButton = $(".atxfer", newDialer);
  const transferButton = $(".transfer", newDialer);
  const videoButton = $(".video-call", newDialer);

  $(".form-group", newDialer).hide();
  holdButton.hide();
  videoButton.hide();
  unholdButton.hide();
  muteButton.hide();
  unmuteButton.hide();
  mergeButton.hide();
  unmergeButton.hide();
  atxferButton.hide();
  transferButton.hide();

  // Videos
  const videoContainer = $(".videos", newDialer);
  if (withVideo) {
    videoContainer.show();

    // Local video
    const localStream = Wazo.Phone.getLocalVideoStream(callSession);
    const localVideo = $("video.local", newDialer)[0];
    localVideo.srcObject = localStream;
    localVideo.play();

    // Remote video
    const $remoteVideo = $("video.remote", newDialer);
    const remoteStream = Wazo.Phone.getRemoteStreamForCall(callSession);
    if (remoteStream) {
      $remoteVideo.show();
      const wazoStream = new Wazo.Stream(remoteStream);
      wazoStream.attach($remoteVideo[0]);
    }
  } else {
    videoContainer.hide();
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
    if (isSessionInMerge) {
      unmergeButton.show();
    } else {
      mergeButton.show();
    }
  }

  $(".status", newDialer).html(getStatus(callSession));
  dialButton.hide();
  dialButton.prop("disabled", true);

  hangupButton.show();
  hangupButton.off("click").on("click", function (e) {
    e.preventDefault();
    Wazo.Phone.hangup(callSession);

    onCallTerminated(callSession);
  });

  unholdButton.off("click").on("click", function (e) {
    e.preventDefault();
    unhold(callSession);
  });

  holdButton.off("click").on("click", function (e) {
    e.preventDefault();
    hold(callSession);
  });

  muteButton.off("click").on("click", function (e) {
    e.preventDefault();
    mute(callSession);
  });

  unmuteButton.off("click").on("click", function (e) {
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
  atxferButton.off("click").on("click", function (e) {
    e.preventDefault();

    if (currentAtxfer) {
      currentAtxfer.complete();
      currentAtxfer = null;

      updateDialers();
    } else {
      const target = prompt("Phone number atxfer?");
      if (target != null) {
        currentAtxfer = Wazo.Phone.atxfer(callSession);
        currentAtxfer.init(target);
        atxferButton.html("Complete");
      }
    }
  });

  transferButton.show();
  transferButton.off("click").on("click", function (e) {
    e.preventDefault();

    const target = prompt("Phone number transfer?");
    if (target != null) {
      transfer(callSession, target);
    }
  });

  newDialer.appendTo($("#dialers"));
}

function updateDialers() {
  $("#dialers").html("");

  for (const sessionId of Object.keys(sessions)) {
    const callSession = sessions[sessionId];
    addDialer(callSession, callSession.cameraEnabled);
  }
}

function openIncomingCallModal(callSession, withVideo) {
  const number =
    callSession.realDisplayName ||
    callSession.displayName ||
    callSession.number;

  $("#incoming-modal").modal({ backdrop: "static" });
  $("#incoming-modal h5 span").html(number);

  $("#accept-video")[withVideo ? "show" : "hide"]();

  $("#accept")
    .off("click")
    .on("click", function () {
      $("#incoming-modal").modal("hide");
      accept(callSession, false);
    });
  $("#accept-video")
    .off("click")
    .on("click", function () {
      $("#incoming-modal").modal("hide");
      accept(callSession, true);
    });
  $("#reject")
    .off("click")
    .on("click", function () {
      Wazo.Phone.reject(callSession);
      $("#incoming-modal").modal("hide");
    });
}
