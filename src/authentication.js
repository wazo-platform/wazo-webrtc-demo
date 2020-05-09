let apiClient;

const displayAuthError = (error) => {
  $('#auth-error').html(error);
  $('#submit-login').prop('disabled', false);
}

const authenticate = async (username, password, server) => {
  apiClient = new window['@wazo/sdk'].WazoApiClient({server});

  const session = await apiClient.auth.logIn({username, password}).catch(displayAuthError);
  if (session == undefined) {
    return;
  }

  apiClient.setToken(session.token);
  initializeWebRtc(server, session);
  onLogin(session);
}

const openLoginModal = () => {
  $('#login-modal').modal({backdrop: 'static'});

  $('#login-form').on('submit', function (e) {
    e.preventDefault();

    $('#submit-login').prop('disabled', true);
    authenticate($('#username').val(), $('#password').val(), $('#server').val());
  });
}

const onLogin = (session) => {
  $('#submit-login').prop('disabled', false);
  $('#login-modal').modal('hide');
  $('#user').show();

  setFullName(session.uuid);
  resetMainDialer();
}

$(window).on('load', openLoginModal);
