const firebaseMock = require('./firebase-mock');
const {expect, assert} = require('chai');
const sinon = require('sinon');

let firebaseService,
  firebase;

describe('firebase service', () => {

  beforeEach(() => {
    firebase = firebaseMock();
    firebaseService = require('proxyquire').noCallThru()('../src/firebase-service', {
      firebase
    });
  });


  it('should be able to connect and listen on a path', async () => {
    const callback = sinon.spy();
    const path = 'whatever';
    const event = 'event';

    await firebaseService
      .connect()
      .then(() => {
        firebaseService.listenOnPath(path)
          .when(event)
          .call(callback);
      });

    const value = 'a-firebase-value';
    const key = 'a-firebase-key';
    await firebase.fireMockEvent(path, event, firebase.createMockFirebaseSnapshot(value, key));
    expect(callback).to.have.been.called.once;
    expect(callback).to.have.been.calledWithMatch({
      key,
      value
    });

  });

  it('should support listening on a ref', async () => {
    const path = 'whatever';
    const event = 'event';
    const value = 'a-firebase-value';
    const key = 'a-firebase-key';
    const callback = sinon.spy();

    const listenOnRef = ref => {
      firebaseService.listenOnRef(ref)
        .when(event)
        .call(callback);
    };

    const getRefFromListenOnPath = () => {
      firebaseService.listenOnPath(path)
        .when(event)
        .call(({ref}) => listenOnRef(ref));
    };

    await firebaseService
      .connect()
      .then(getRefFromListenOnPath);

    //the first call hits the listenOnPath callback, which sets up the listenOnRef listener
    //the second hits the listenOnRef callback
    await firebase.fireMockEvent(path, event, firebase.createMockFirebaseSnapshot(value, key, path));
    await firebase.fireMockEvent(path, event, firebase.createMockFirebaseSnapshot(value, key, path));
    expect(callback).to.have.been.called.once;
    expect(callback).to.have.been.calledWithMatch({
      key,
      value
    });

  });

  it('should fail if attempting to listen to a path without connecting first', async () => {
    const fn = () => firebaseService.listenOnPath('path')
      .when('event')
      .call(() => {});
    expect(fn).to.throw('You must connect before trying to listen to firebase paths');
  });

  it('should fail if attempting to listen to a path without waiting for successful connection', async () => {
    firebaseService.connect();
    const fn = () => firebaseService.listenOnPath('path')
      .when('event')
      .call(() => {});
    expect(fn).to.throw('You must connect before trying to listen to firebase paths');
  });

  it('should wrap all callbacks in try/catch', async () => {
    const errorFn = stubConsoleError();
    const errorMessage = 'An error occurred';
    const fn = () => {
      throw new Error(errorMessage);
    };
    await firebaseService.connect();
    firebaseService.listenOnPath('whatever')
      .when('event')
      .call(fn);
    firebase.fireMockEvent('whatever', 'event', firebase.createMockFirebaseSnapshot());
    const message = errorFn.errorMessageOfFirstCall();
    assert.equal(message, errorMessage);
    errorFn.restore();
  });

  it('should handle errors if the callback returns a promise and rejects', async () => {
    const errorFn = stubConsoleError();
    const errorMessage = 'An error occurred';
    const fn = () => Promise.reject(errorMessage);
    await firebaseService.connect();
    firebaseService.listenOnPath('whatever')
      .when('event')
      .call(fn);
    await firebase.fireMockEvent('whatever', 'event', firebase.createMockFirebaseSnapshot());
    const message = errorFn.errorMessageOfFirstCall();
    expect(message).to.equal(errorMessage);
    errorFn.restore();
  });

  it('should support disconnecting', async () => {
    await firebaseService.connect();
    const fn = sinon.spy();
    firebaseService.listenOnPath('whatever')
      .when('event')
      .call(fn);
    await firebase.fireMockEvent('whatever', 'event', firebase.createMockFirebaseSnapshot());
    expect(fn).to.have.been.calledOnce;
    firebaseService.disconnect();
    //this event should not call the callback again'
    fn.reset();
    await firebase.fireMockEvent('whatever', 'event', firebase.createMockFirebaseSnapshot());
    expect(fn).not.to.have.been.called;
  });

  it('should support getting whether or not the connection is alive', async () => {
    await firebaseService.connect();
    expect(firebaseService.isConnected()).to.equal(true);
    await firebaseService.disconnect();
    expect(firebaseService.isConnected()).to.equal(false);
  });

  it('should support getting server time', async () => {
    const now = new Date();
    await firebaseService.connect();
    firebase.mockServerTime(now);
    const serverTime = await firebaseService.getFirebaseServerTime('/timestamp'); //TODO the firebaseMock shouldn't hardcode the timestamp path
    expect(serverTime).to.equal(now);
  });

  it('should get values at a path', async () => {
    await firebaseService.connect();
    const data = {
      prop: 'value'
    };
    const path = '/some-path-with-values';
    firebase.setDataAtPath(path, data);
    const values = await firebaseService.getValuesAtPath({path});
    expect(values).to.equal(data);
  });

  it('should support options when listening on a path', async () => {
    await firebaseService.connect();
    const fn = sinon.spy();
    const options = {
      orderBy: 'rank',
      startAt: 1
    };
    const path = 'whatever';
    const event = 'event';
    firebaseService.listenOnPath(path, options)
      .when(event)
      .call(fn);
    await firebase.fireMockEvent(path, event, firebase.createMockFirebaseSnapshot({rank: 2}));
    await firebase.fireMockEvent(path, event, firebase.createMockFirebaseSnapshot({rank: 1}));
    await firebase.fireMockEvent(path, event, firebase.createMockFirebaseSnapshot({rank: 0}));
    await firebase.fireMockEvent(path, event, firebase.createMockFirebaseSnapshot({rank: null}));
    expect(fn).to.have.been.calledTwice;
  });

});

const stubConsoleError = () => {
  const stub = sinon.stub(console, 'error').callsFake(() => {});
  stub.errorMessageOfFirstCall = () => {
    const error = stub.getCall(0).args[0];
    return error.message || error; //it could be an error object, or simply a message. Either way is fine.
  };
  return stub;
};
