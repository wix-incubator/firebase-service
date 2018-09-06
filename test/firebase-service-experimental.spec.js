const firebaseMock = require('./firebase-mock');
const {expect, assert} = require('chai');
const sinon = require('sinon');

let firebase;
let FirebaseService;
let firebaseService;

describe('NEW firebase service', () => {

  beforeEach(() => {
    firebase = firebaseMock();

    const mocks = {
      firebase
    };
    FirebaseService = require('proxyquire').noCallThru()('../src/firebase-service-experimental', mocks).FirebaseService;
    firebaseService = new FirebaseService();
  });

  it('should be able to connect to firebase', async () => {
    const options = {
      prop: 'val'
    };
    const authKey = 'authKey';

    await firebaseService.connect(options, authKey);

    expect(firebase.initializeApp).to.have.been.calledWith(options);
    expect(firebase.signInWithCustomToken).to.have.been.calledWith(authKey);
  });

  it('should allow multiple consumers simultaneously', async () => {
    const callback1 = sinon.spy();
    const callback2 = sinon.spy();
    const path1 = 'path1';
    const event1 = 'event1';
    const path2 = 'path2';
    const event2 = 'event2';

    const service1 = new FirebaseService();
    const service2 = new FirebaseService();

    await service1
      .connect()
      .then(() => {
        service1.listenOnPath(path1)
          .when(event1)
          .call(callback1);
      });

    await service2
      .connect()
      .then(() => {
        service2.listenOnPath(path2)
          .when(event2)
          .call(callback2);
      });

    await firebase.fireMockEvent(path1, event1, firebase.createMockFirebaseSnapshot());
    expect(callback1).to.have.been.called.once;

    //this is important - even though we disconnect from one of the services, the other is still alive
    //because they are independent of one another
    service1.disconnect();

    await firebase.fireMockEvent(path2, event2, firebase.createMockFirebaseSnapshot());
    expect(callback2).to.have.been.called.once;
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

  it('should not initialize app more than once (should go-online, instead)', async () => {
    firebase.spies.databaseSpy.goOnline.returns(Promise.resolve('some-mock-value'));

    await firebaseService.connect();
    expect(firebase.spies.databaseSpy.goOnline).not.to.have.been.called;

    const connected = await firebaseService.connect();
    expect(firebase.spies.databaseSpy.goOnline).to.have.been.calledOnce;
    expect(connected).to.equal('some-mock-value');

    expect(firebase.initializeApp).to.have.been.calledOnce;
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
    const fn = () => firebaseService.listenOnPath('some/firebase-path')
      .when('event')
      .call(() => {});
    expect(fn).to.throw('You must connect before trying to listen to firebase paths (path=firebase-path)');
  });

  it('should fail if attempting to listen to a path without waiting for successful connection', async () => {
    firebaseService.connect();
    const fn = () => firebaseService.listenOnPath('some/firebase/111-222-333/path-mock')
      .when('event')
      .call(() => {});
    expect(fn).to.throw('You must connect before trying to listen to firebase paths (path=path-mock)');
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

  it('should close the database connection upon disconnect', async () => {
    await firebaseService.connect();
    await firebaseService.disconnect();

    expect(firebase.spies.databaseSpy.goOffline).to.have.been.calledOnce;
  });

  it('should support getting server time', async () => {
    const now = new Date();
    await firebaseService.connect();
    firebase.mockServerTime(now);
    const serverTime = await firebaseService.getFirebaseServerTime('/timestamp'); //TODO the firebaseMock shouldn't hardcode the timestamp path
    expect(serverTime).to.equal(now);
  });

  it('should throw an error for getting the server time if havent previously connected', async () => {
    const now = new Date();
    firebase.mockServerTime(now);

    await firebaseService.disconnect();

    const errFn = () => firebaseService.getFirebaseServerTime('/path/timestamp-mock');
    expect(errFn).to.throw('You must connect before getting server time (path=timestamp-mock)');
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

  it('should throw an error for getting values if havent previously connected', async () => {
    const data = {
      prop: 'value'
    };
    const path = '/some-path-with-values';
    firebase.setDataAtPath(path, data);

    await firebaseService.disconnect();

    const errFn = () => firebaseService.getValuesAtPath({path});
    expect(errFn).to.throw('You must connect before getting values at path (path=some-path-with-values)');
  });

  it('should be able to work offline', async () => {
    const data = {
      prop: 'value'
    };
    const path = '/some-path-with-values';
    firebase.setDataAtPath(path, data);

    await firebaseService.connect();
    await firebaseService.disconnect();

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
