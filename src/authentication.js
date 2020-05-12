let apiClient;

const displayAuthError = (error) => {
  $('#auth-error').html(error);
  $('#submit-login').prop('disabled', false);
};

const authenticate = async (username, password, server) => {
  apiClient = new window['@wazo/sdk'].WazoApiClient({server});

  const session = await apiClient.auth.logIn({username, password}).catch(displayAuthError);
  session.server = server;
  setSessionOnStorage(session);

  return session;
};

const openLoginModal = () => {
  $('#login-modal').modal({backdrop: 'static'});

  $('#login-form').on('submit', async (e) => {
    e.preventDefault();

    $('#submit-login').prop('disabled', true);
    const session = await authenticate(
      $('#username').val(),
      $('#password').val(),
      $('#server').val()
    );
    onLogin(session);
  });
};

const onLogin = (session) => {
  $('#submit-login').prop('disabled', false);
  $('#login-modal').modal('hide');
  $('#user').show();
  $('#logout').show();
  $('#logout').on('click', () => {
    removeSessionOnStorage();
    location.reload();
  });

  apiClient = new window['@wazo/sdk'].WazoApiClient({server: session.server});
  apiClient.setToken(session.token);
  initializeWebRtc(session.server, session);
  setFullName(session.uuid);
  resetMainDialer();
};

const getSessionOnStorage = () => {
  return JSON.parse(localStorage.getItem('session'));
} 

const setSessionOnStorage = (session) => {
  localStorage.setItem('session', JSON.stringify(session));
}

const removeSessionOnStorage = (session) => {
  localStorage.clear();
}

const launchPhone = () => {
  const session = getSessionOnStorage();
  if (!session) {
    openLoginModal();
  } else {
    onLogin(session);
  }
}

$(window).on('load', launchPhone);
