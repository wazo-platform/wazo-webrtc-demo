const { Wazo } = window['@wazo/sdk'];

let ready = false;
let session = null;

Wazo.Auth.init('wazo-webrtc-demo');

const displayAuthError = (error) => {
  $('.auth-error').html('');
  $('.serv-error').html('');
  $('.login').removeClass('onalert');
  $('label').removeClass('onerror');

  const message = checkJson(error.message);

  if (message[0].includes('Authentication')) {
    $('.auth-error').html('Authentication failed, please verify you typed your authentication details right');
    $('#password').addClass('onalert');
    $('#email').addClass('onalert');
    $('.auth-lab').addClass('onerror');
  } else {
    $('.serv-error').html('Couldn\'t reach server, please verify its name and your internet connection');
    $('#server').addClass('onalert');
    $('.serv-lab').addClass('onerror');
  }
  
  $('#submit-login').prop('disabled', false);
  $('.login-txt').html('login');
}

const testReadiness = () => {
  if (ready) {
    onLogin(session);
  } else {
    ready = true;
  }
}

const authenticate = async (username, password, server) => {
  try {
    Wazo.Auth.setHost(server);

    session = await Wazo.Auth.logIn(username, password).catch();
    // Useful to retrieve the server from localstorage
    session.server = server;
    setSessionOnStorage(session);

    onLogin(session);
  } catch (e) {
    displayAuthError(e);
  }
};

const openLogin = () => {
  $('#authentication').show();
  $('#loader').hide();
  $('#login-form').on('submit', async e => {
    e.preventDefault();

    $('.login-txt').html('loading...');
    $('#submit-login').prop('disabled', true);

    authenticate($('#email').val(), $('#password').val(), $('#server').val());
  });
};

const onLogin = () => {
  $('#submit-login').prop('disabled', false);
  $('#authentication').hide();
  $('#phone').show();
  $('#loader').hide();
  $('#logout').on('click', () => {
    removeSessionOnStorage();
    window.location.reload(false);
  });

  ready = false;
  session = null;

  // eslint-disable-next-line no-undef
  initializeWebRtc();
};

const getSessionOnStorage = () => JSON.parse(localStorage.getItem('session'));

const setSessionOnStorage = session => {
  localStorage.setItem('session', JSON.stringify(session));
};

const removeSessionOnStorage = () => {
  localStorage.clear();
};

const launchPhone = async () => {
  $('.alert').html('');
  $('.login').removeClass('onalert');
  $('label').removeClass('onerror');

  const rawSession = getSessionOnStorage();
  if (!rawSession) {
    return openLogin();
  }

  setTimeout(testReadiness, 1500);

  try {
    Wazo.Auth.setHost(rawSession.server);
    session = await Wazo.Auth.validateToken(rawSession.token, rawSession.refreshToken);
    if (session) {
      testReadiness();
      return;
    }
  } catch (e) {
    displayAuthError(e);
  }

  return openLogin();
};

$(window).on('load', launchPhone);
