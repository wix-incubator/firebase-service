const firebaseMock = require('../firebase-mock');
const {expect, assert} = require('chai');
const sinon = require('sinon');

let firebase;
let FirebaseService;
let firebaseService;

const callAndCatch = async fn => {
  let error;
  try {
    await fn();
  } catch (err) {
    error = err;
  }
  return error;
};

describe('NEW (experimental) firebase service', () => {
  let sandbox;

  beforeEach(() => {
    firebase = firebaseMock();
    sandbox = sinon.sandbox.create();

    const mocks = {
      'firebase/app': firebase,
      'firebase/auth': {},
      'firebase/database': {}
    };
    FirebaseService = require('proxyquire').noCallThru()('../../src/experimental/firebase-service', mocks);
    firebaseService = new FirebaseService('firebase-service-uut');
  });

  afterEach(() => {
    sandbox.restore();
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

  it('should not re-initialize firebase if firebase app was already initialized', async () => {
    firebaseService = new FirebaseService('firebase-service-uut');

    const options = {
      prop: 'val'
    };
    const authKey = 'authKey';

    await firebaseService.connect(options, authKey);
    expect(firebase.initializeApp).to.have.been.calledWith(options);

    firebase.initializeApp.reset();
    await firebaseService.connect(options, authKey);
    expect(firebase.initializeApp).not.to.have.been.called;
  });

  it('should allow to re-connect for the second time', async () => {
    firebaseService = new FirebaseService();

    const options = {
      prop: 'val'
    };
    const authKey = 'authKey';

    await firebaseService.connect(options, authKey);
    firebaseService.disconnect();
    await firebaseService.connect(options, authKey);
    expect(firebase.spies.databaseSpy.goOnline).to.have.been.calledOnce;
    await firebaseService.connect(options, authKey);
    expect(firebase.spies.databaseSpy.goOnline).to.have.been.calledTwice;
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

  it('should not initialize app more than once (should go-online, instead)', done => {
    firebaseService.connect()
      .then(() => {
        expect(firebase.spies.databaseSpy.goOnline).not.to.have.been.called;
      })
      .then(() => firebaseService.connect()
        .then(() => { // Note: this can only pass if connect() also returns as promise the 2nd time
          expect(firebase.spies.databaseSpy.goOnline).to.have.been.calledOnce;
          expect(firebase.initializeApp).to.have.been.calledOnce;
          done();
        }))
      .catch(err => {
        done(err);
      });
  });

  it('should re-initialize firebase if firebase failed to initialize the previous time', async () => {
    firebaseService = new FirebaseService('firebase-service-uut');

    const expectedError = new Error('init fail mock');
    firebase.initializeApp = sinon.stub().returns(Promise.reject(expectedError));

    await callAndCatch(() => firebaseService.connect());
    expect(firebase.initializeApp).to.have.been.called;

    firebase.initializeApp.reset();

    await callAndCatch(() => firebaseService.connect());
    expect(firebase.initializeApp).to.have.been.called;

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
    expect(fn).to.throw('FirebaseService.listenOnPath: not connected! (path=firebase-path)');
  });

  it('should fail if attempting to listen to a path without waiting for successful connection', async () => {
    firebaseService.connect();
    const fn = () => firebaseService.listenOnPath('some/firebase/111-222-333/path-mock')
      .when('event')
      .call(() => {});
    expect(fn).to.throw('FirebaseService.listenOnPath: not connected! (path=path-mock)');
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

    firebaseService.listenOnPath('whatever').when('event').call(fn);

    await firebase.fireMockEvent('whatever', 'event', firebase.createMockFirebaseSnapshot());
    expect(fn).to.have.been.calledOnce;
    firebaseService.disconnect();

    //this event should not call the callback again'
    fn.reset();
    await firebase.fireMockEvent('whatever', 'event', firebase.createMockFirebaseSnapshot());
    expect(fn).not.to.have.been.called;
  });

  it('should disconnect upon termination', async () => {
    await firebaseService.connect();
    const fn = sinon.spy();

    firebaseService.listenOnPath('whatever').when('event').call(fn);

    await firebase.fireMockEvent('whatever', 'event', firebase.createMockFirebaseSnapshot());
    expect(fn).to.have.been.calledOnce;
    firebaseService.terminate();

    fn.reset();
    await firebase.fireMockEvent('whatever', 'event', firebase.createMockFirebaseSnapshot());
    expect(fn).not.to.have.been.called;
  });

  it('should close the database connection upon disconnect', async () => {
    await firebaseService.connect();
    await firebaseService.disconnect();

    expect(firebase.spies.databaseSpy.goOffline).to.have.been.calledOnce;
  });

  it('should kill the firebase app upon termination', async () => {
    firebase.delete.returns(Promise.resolve('mock-resolved-value'));

    await firebaseService.connect();
    const returnedValue = await firebaseService.terminate();

    expect(firebase.delete).to.have.been.calledOnce;
    expect(returnedValue).to.equal('mock-resolved-value');
  });

  it('should not kill the app if wasn\'t initialized', async () => {
    const expectedError = new Error('init fail mock');
    firebase.initializeApp = sinon.stub().returns(Promise.reject(expectedError));

    const error = await callAndCatch(() => firebaseService.connect());
    expect(error).to.equal(expectedError);

    await firebaseService.terminate();
    expect(firebase.delete).not.to.have.been.called;
  });

  it('should not reconnect after termination', async () => {
    await firebaseService.connect();
    await firebaseService.terminate();

    const error = await callAndCatch(() => firebaseService.connect());

    expect(error.message).to.equal('Can\'t connect a firebase service after termination, please use a different instance (name=firebase-service-uut)');
    expect(firebase.initializeApp).to.have.been.calledOnce;
  });

  it('should not complete connection after termination, even if terminated while waiting for auth completion', async () => {
    let resolveProxy = null;
    firebase.signInWithCustomToken = sinon.stub().returns(new Promise(resolve => {
      resolveProxy = resolve;
    }));

    const connectPromise = firebaseService.connect();
    await firebaseService.terminate();
    resolveProxy(firebase); // unblock signInWithCustomToken so connect() could complete

    await connectPromise;
    expect(firebase.database).not.to.have.been.called;
    expect(firebase.delete).to.have.been.calledOnce;
  });

  it('should not complete 2nd connection after termination even if was already connected beforehand', async () => {
    await firebaseService.connect();

    const connectPromise = firebaseService.connect();
    await firebaseService.terminate();
    await connectPromise;

    expect(firebase.database).to.have.been.calledOnce;
    expect(firebase.spies.databaseSpy.goOnline).not.to.have.been.called;
  });

  it('should not complete 2nd connection after termination, even if was already connected beforehand and terminated WHILE waiting for db.goOnline()', async () => {
    await firebaseService.connect();

    firebase.spies.databaseSpy.goOnline.callsFake(() => new Promise(resolve => {
      firebaseService.terminate();
      resolve();
    }));
    await firebaseService.connect();
  });

  it('shouldnt delete a deleted app upon termination', async () => {
    await firebaseService.connect();
    await firebaseService.terminate();
    await firebaseService.terminate();

    expect(firebase.delete).to.have.been.calledOnce;
  });

  describe('Server Time', () => {
    const now = Date.now();
    const serverTime = now - (1000 * 60 * 3);

    beforeEach(() => {
      sandbox.stub(Date, 'now').returns(now);
    });

    it('should support getting server time the set&get way by default', async () => {
      await firebaseService.connect();
      firebase.mockServerTime(serverTime);
      const actual = await firebaseService.getFirebaseServerTime('/timestamp'); //TODO the firebaseMock shouldn't hardcode the timestamp path
      expect(actual).to.equal(serverTime);
      expect(firebase.spies.serverTimeSpy).to.have.been.calledOnce;
    });

    it('should support getting server time atomically via a flag', async () => {
      firebaseService = new FirebaseService(undefined, {atomicServerTime: true});
      await firebaseService.connect();
      firebase.mockServerTime(serverTime);
      const actual = await firebaseService.getFirebaseServerTime();
      expect(actual).to.equal(serverTime);
      expect(firebase.spies.serverTimeSpy).to.not.have.been.called;
    });

    it('should throw an error for getting the server time if havent previously connected', async () => {
      const now = new Date();
      firebase.mockServerTime(now);

      await firebaseService.disconnect();

      const errFn = () => firebaseService.getFirebaseServerTime('/path/timestamp-mock');
      expect(errFn).to.throw('FirebaseService.getFirebaseServerTime: not connected! (path=timestamp-mock)');
    });
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
    expect(errFn).to.throw('FirebaseService.getValuesAsPath: not connected! (path=some-path-with-values)');
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
