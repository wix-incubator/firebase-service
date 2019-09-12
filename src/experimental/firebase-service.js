let firebase;
let uuid;

class FirebaseService {
  atomicServerTime = false;

  constructor(name, {atomicServerTime = false} = {}) {
    uuid = require('uuid');
    name = name || uuid();
    firebase = require('firebase/app');
    require('firebase/database');
    require('firebase/auth');
    this.name = name;
    this.listeningOnRefs = [];
    this.db = null;
    this.terminated = false;
    this._initializationInProgress = Promise.resolve();
    this.atomicServerTime = atomicServerTime;
  }

  async connect(options, authKey) {
    this._assertInstanceAlive();

    await this._initializationInProgress;
    this._initializationInProgress = new Promise(resolve => this._initializationCompleted = resolve);

    return Promise.resolve().then(() => {
      if (this.db) {
        this._initializationCompleted();
        return this.db.goOnline();
      }

      return Promise.resolve()
        .then(() => firebase.initializeApp(options, this.name))
        .then(app => app.auth().signInWithCustomToken(authKey)
          .then(() => {
            this._initializationCompleted();
            if (this.terminated) {
              return app.delete();
            }
            this.db = app.database();
          }));
    })
      .catch(error => {
        this._initializationCompleted();
        throw error;
      });
  }

  disconnect() {
    if (this.db) {
      this.listeningOnRefs.forEach(r => r.off());
      this.listeningOnRefs.length = 0;
      this.db.goOffline();
    }
  }

  terminate() {
    this.terminated = true;
    this.disconnect();

    if (this.db) {
      try {
        return this.db.app.delete();
      } finally {
        this.db = null;
      }
    }
  }

  getFirebaseServerTime(serverTimePath) {
    if (!this.db) {
      throw new Error(`FirebaseService.getFirebaseServerTime: not connected! (path=${getPathNameHint(serverTimePath)})`);
    }

    if (this.atomicServerTime) {
      return this.db.ref('/.info/serverTimeOffset')
        .once('value')
        .then(data => data.val() + Date.now());
    }

    const ref = this.db.ref(serverTimePath);
    return ref
      .set(firebase.database.ServerValue.TIMESTAMP)
      .then(() => ref
        .once('value')
        .then(snapshot => snapshot.val())
      );
  }

  getValuesAtPath({path}) {
    if (!this.db) {
      throw new Error(`FirebaseService.getValuesAsPath: not connected! (path=${getPathNameHint(path)})`);
    }

    return this.db
      .ref(path)
      .once('value')
      .then(snapshot => snapshot.val());
  }

  listenOnRef(ref, options) {
    return this._listenOnRefWithQuery(ref, options);
  }

  listenOnPath(path, options) {
    if (!this.db) {
      throw new Error(`FirebaseService.listenOnPath: not connected! (path=${getPathNameHint(path)})`);
    }

    const ref = this.db.ref(path);
    return this._listenOnRefWithQuery(ref, options);
  }

  _listenOnRefWithQuery(ref, {orderBy, startAt} = {}) {
    if (orderBy) {
      ref = ref.orderByChild(orderBy);
    }

    if (startAt) {
      ref = ref.startAt(startAt);
    }

    return {
      when: event => ({
        call: callback => {
          ref.on(event, snapshot => {
            try {
              const returnValue = callback({
                //these are the fields available in the callback from a listener
                key: snapshot.key,
                value: snapshot.val(),
                ref: snapshot.ref //a ref that can be used in listenOnRef
              });
              if (returnValue && typeof returnValue.catch === 'function') {
                returnValue.catch(console.error);
              }
            } catch (e) {
              console.error(e);
            }
          });

          this.listeningOnRefs.push(ref);
        }
      })
    };
  }

  _assertInstanceAlive() {
    if (this.terminated) {
      throw new Error(`Can't connect a firebase service after termination, please use a different instance (name=${this.name})`);
    }
  }
}

function getPathNameHint(path) {
  const pathNames = (path || '').split('/');
  return pathNames[pathNames.length - 1];
}

module.exports = FirebaseService;
