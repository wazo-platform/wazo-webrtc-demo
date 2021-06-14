import getNumber from "../src/dialer";

describe('Get user informations', function() {

  test('we get the user\'s name', () => {
    const number = '8131';

    expect((callSession.displayName).toBe('Donatien'));
  });

})

