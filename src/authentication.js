let apiClient;

function displayAuthError(error) {
  $('#auth-error').html(error);

  $('#submit-login').prop('disabled', false);
}

function authenticate(username, password, server) {
  apiClient = new window['@wazo/sdk'].WazoApiClient({server});

  apiClient.auth.logIn({username, password}).then(function (session) {
    initializeWebRtc(server, session);

    onLogin();
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

  resetMainDialer();
}

$(window).on('load', openLoginModal);
