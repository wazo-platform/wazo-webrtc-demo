import { getNumber, getStatus } from "../src/dialer";
import { CallSession } from '@wazo/sdk';

describe('Wazo', function() {

  describe('getNumber', () => {
    test('we get the user\'s name', () => {
      const number = '1234';
      const callSession = new CallSession({
        displayName: 'Donatien',
        number,
      });

      const callSessionWithNumberOnly = new CallSession({
        number,
      });
      
      expect(getNumber(callSession)).toEqual('Donatien');
      expect(getNumber()).toEqual(false);
      expect(getNumber(callSessionWithNumberOnly)).toEqual(number);
    });
  })

  describe('getStatus', () => {
    const number = '1234';
    const callSession = new CallSession({
      paused: true,
      number
    });
    const callSessionStatus = new CallSession({
      number,
      sipStatus: Wazo.Phone.SessionState.Initial
    });
    expect(getStatus()).toEqual(null);
    expect(getStatus(callSession)).toEqual(`Call with ${number} on hold`);
    expect(getStatus(callSessionStatus)).toEqual(`Calling ${number}...`);
  });
})
