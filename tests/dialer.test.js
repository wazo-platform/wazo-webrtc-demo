import { getNumber, getStatus } from "../src/dialer";
import { CallSession } from '@wazo/sdk';

describe('Wazo', function() {

  describe('getNumber', () => {

    it('should get the user\'s name', () => {
      const number = '8131';
      const callSession = new CallSession({
        displayName: 'Donatien',
        number,
      });
      
      expect(getNumber(callSession)).toEqual('Donatien');
    });
  });

  describe('getStatus', () => {
    it('should display that the call is on hold', () => {
      const number = '1234';
      const callSession = new CallSession({
        paused: true,
        number
      });
      
    it('should display that it\'s calling and which number', () => {
      const number = '8133';
      const callSessionStatus = new CallSession({
        number,
        sipStatus: Wazo.Phone.SessionState.Established
      });
  
      expect(getStatus(callSession)).toEqual(`Call with ${number} on hold`);
    });

    it('should display that the microphone is muted', () => {
      const number = '1234';
      const callSessionStatus = new CallSession({
        muted: true,
        number,
      });

      expect(getStatus(callSessionStatus)).toEqual(`Call with ${number} muted`);
    });

    it('should display which number is called', () => {
      const number = '1234';
      const callSessionStatus = new CallSession({
        number,
        sipStatus: Wazo.Phone.SessionState.Initial
      });
        
      expect(getStatus(callSessionStatus)).toEqual(`Calling ${number}...`);
    });

    
      expect(getStatus(callSessionStatus)).toEqual(`On call with : ${number}`);
    });

    it('should display the call is cancelled', () => {
      const number = '8130';
      const callSessionStatus = new CallSession({
        sipStatus: Wazo.Phone.SessionState.Terminated,
        number
      });

      expect(getStatus(callSessionStatus)).toEqual(`Call canceled by ${number}`)
    });

    it('should return null when there is no call session', () => {

      expect(getStatus()).toEqual(null);
    });

  });
})
