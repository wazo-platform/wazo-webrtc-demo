let apiClient;

function displayAuthError(error) {
  $('#auth-error').html(error);

  $('#submit-login').prop('disabled', false);
}

function authenticate(username, password, server) {
  apiClient = new window['@wazo/sdk'].WazoApiClient({server});

  apiClient.auth.logIn({username, password}).then(function (data) {
    const userToken = data.token;

    apiClient.confd.getUser(userToken, data.uuid).then(function (user) {
      const line = user.lines[0];
      const fullName = user.firstName ? user.firstName + ' ' + user.lastName : username;
      $('#full-name').html('Hello ' + fullName + ' (' + line.extensions[0].exten +')');

      apiClient.confd.getUserLineSip(data.token, data.uuid, line.id).then(function (sipLine) {
        clearActiveCalls(userToken);

        initializeWebRtc(sipLine, server);

        onLogin();
      }).catch(displayAuthError);
    }).catch(displayAuthError);
  }).catch(displayAuthError);
}

function openLoginModal() {
  $('#login-modal').modal({backdrop: 'static'});

  $('#login-form').on('submit', function (e) {
    e.preventDefault();

    $('#submit-login').prop('disabled', true);
    authenticate($('#username').val(), $('#password').val(), $('#server').val());
  });
}

function onLogin() {
  $('#submit-login').prop('disabled', false);
  $('#login-modal').modal('hide');
  $('#user').show();

  resetDialer();
}

$(window).on('load', openLoginModal);
