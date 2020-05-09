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
  const user = await apiClient.confd.getUser(session.uuid);
  const line = user.lines[0];
  const fullName = user.firstName ? `${user.firstName} ${user.lastName}` : username;
  $('#full-name').html(`Hello ${fullName} (${line.extensions[0].exten})`);

  initializeWebRtc(server, session);
  onLogin();
}

const openLoginModal = () => {
  $('#login-modal').modal({backdrop: 'static'});

  $('#login-form').on('submit', function (e) {
    e.preventDefault();

    $('#submit-login').prop('disabled', true);
    authenticate($('#username').val(), $('#password').val(), $('#server').val());
  });
}

const onLogin = () => {
  $('#submit-login').prop('disabled', false);
  $('#login-modal').modal('hide');
  $('#user').show();

  resetMainDialer();
}

$(window).on('load', openLoginModal);
