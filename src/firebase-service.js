let firebase;
let uuid;

function getPathNameHint(path) {
  const pathNames = (path || '').split('/');
  return pathNames[pathNames.length - 1];
}

function setupService() {
  const listeningOnRefs = [];
  let userDisconnected = false;
  let db = null;

  const listenOnRefWithQuery = (ref, {orderBy, startAt} = {}) => {
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

          listeningOnRefs.push(ref);
        }
      })
    };
  };

  const service = {
    connect: (options, authKey) => {
      userDisconnected = false;
      return Promise
        .resolve()
        .then(() => firebase.initializeApp(options, uuid()))
        .then(app => app
          .auth()
          .signInWithCustomToken(authKey)
          .then(() => {
            if (!userDisconnected) {
              db = app.database();
            }
          }));
    },
    disconnect: () => {
      listeningOnRefs.forEach(r => r.off());
      listeningOnRefs.length = 0;
      db = null;
      userDisconnected = true;
    },
    terminate: () => service.disconnect(),
    isConnected: () => !!db,
    getFirebaseServerTime: serverTimePath => {
      if (!db) {
        throw new Error(`You must connect before getting server time (path=${getPathNameHint(serverTimePath)})`);
      }

      const ref = db.ref(serverTimePath);
      return ref
        .set(firebase.database.ServerValue.TIMESTAMP)
        .then(() => ref
          .once('value')
          .then(snapshot => snapshot.val())
        );
    },
    getValuesAtPath: ({path}) => {
      if (!db) {
        throw new Error(`You must connect before getting values at path (path=${getPathNameHint(path)})`);
      }

      return db
        .ref(path)
        .once('value')
        .then(snapshot => snapshot.val());
    },
    listenOnRef: (ref, options) => {
      return listenOnRefWithQuery(ref, options);
    },
    listenOnPath: (path, options) => {
      if (!db) {
        throw new Error(`You must connect before trying to listen to firebase paths (path=${getPathNameHint(path)})`);
      }

      const ref = db.ref(path);
      return listenOnRefWithQuery(ref, options);
    },
  };
  return service;
}

class FirebaseService {
  constructor() {
    firebase = require('firebase/app');
    require('firebase/database');
    require('firebase/auth');
    uuid = require('uuid');
    const service = setupService();
    Object.assign(this, service);
  }
}

Object.assign(FirebaseService, setupService());

module.exports = FirebaseService;
