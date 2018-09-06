const firebase = require('firebase');
const uuid = require('uuid');

class FirebaseService {
  constructor(name = uuid()) {
    this.name = name;
    this.listeningOnRefs = [];
    this.db = null;
  }

  connect(options, authKey) {
    let connectPromise;

    if (this.db) {
      connectPromise = Promise
        .resolve()
        .then(this.db.goOnline());
    } else {
      connectPromise = Promise
        .resolve()
        .then(() => firebase.initializeApp(options, this.name))
        .then(app => app
          .auth()
          .signInWithCustomToken(authKey)
          .then(() => {
            this.db = app.database();
          }));
    }
    return connectPromise;
  }

  disconnect() {
    if (this.db) {
      this.listeningOnRefs.forEach(r => r.off());
      this.listeningOnRefs.length = 0;
      this.db.goOffline();
    }
  }

  getFirebaseServerTime(serverTimePath) {
    if (!this.db) {
      throw new Error(`You must connect before getting server time (path=${getPathNameHint(serverTimePath)})`);
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
      throw new Error(`You must connect before getting values at path (path=${getPathNameHint(path)})`);
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
      throw new Error(`You must connect before trying to listen to firebase paths (path=${getPathNameHint(path)})`);
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
}

function getPathNameHint(path) {
  const pathNames = (path || '').split('/');
  return pathNames[pathNames.length - 1];
}

module.exports = FirebaseService;
