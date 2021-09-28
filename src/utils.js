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

const getCallSessionFromNumber = number => {
  if (!number) return null;
  const targetCallSessionId = Object.keys(sessions).find(callSessionId => sessions[callSessionId].number === number);
  return targetCallSessionId && sessions[targetCallSessionId];
}

const checkJson = item => {
  try {
    const message = JSON.parse(item)
    return message.reason || item;
  } catch(_) {
    return item;
  }
}